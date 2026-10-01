// 月間勤務予定表PDFのパーサー
// 元PDFはテキストベース（OCR不要）。日付列のx座標が固定なので、座標の近さで
// 各セルをその日の列に割り当てる。AI/OCRを使わないため誤読の心配がない。
//
// PDFレイアウトのクセ:
//   ・氏名の行と勤務記号の行は視覚的には同じ「行」だが、PDF内部のy座標は
//     0.4〜0.9pt程度ズレている（フォントのベースライン差）。
//     そのため単純に同じyでグルーピングすると氏名行と記号行が分離しすぎたり
//     逆に隣の行と衝突したりする。
//   → 社員コード（19/20始まり8桁）を含むyを行の基準にし、その±1.5pt以内に
//     ある全アイテムを「その1行分」とみなしてx座標で氏名部分／記号部分に振り分ける
//     （社員行同士は17〜18pt離れているので±1.5ptの窓が隣の行に届く心配はない）。
import { getDocumentProxy } from 'unpdf';

export type ParsedCrewShiftMember = {
  emp_code: string;
  name: string;
  car_no: string | null;
  division: string;
  team: number;
  // 個人別勤務予定表PDF（1人1ページ形式）でのみ設定。原本の2カラムレイアウトを
  // 画面・印刷で再現するための「左カラムの日数」。班一覧形式PDFではnull。
  sheet_left_days?: number | null;
};

export type ParsedCrewShiftCell = {
  emp_code: string;
  date: string;
  code: string;
};

export type ParsedCrewShiftPdf = {
  startDate: string;
  endDate: string;
  members: ParsedCrewShiftMember[];
  shifts: ParsedCrewShiftCell[];
  teams: number[];
  division: string;
  warnings: string[];
};

const toHalfWidth = (s: string) => s.replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));

type Item = { str: string; transform: number[] };

export async function parseCrewShiftPdf(bytes: Uint8Array): Promise<ParsedCrewShiftPdf> {
  const pdf = await getDocumentProxy(bytes);
  const members: ParsedCrewShiftMember[] = [];
  const shifts: ParsedCrewShiftCell[] = [];
  const warnings: string[] = [];
  const seenEmpCodes = new Set<string>();
  const teams = new Set<number>();
  let division = '';
  let periodStart = '';
  let periodEnd = '';

  for (let p = 1; p <= pdf.numPages; p++) {
    let items: Item[];
    try {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      items = (content.items as Item[]).filter(i => 'str' in i && i.str.trim() !== '');
    } catch (err) {
      warnings.push(`${p}ページ目: 破損したデータのため読み取れませんでした。このページはスキップします（${err instanceof Error ? err.message : String(err)}）`);
      continue;
    }
    if (items.length === 0) continue;

    const sorted = [...items].sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]);
    const allText = sorted.map(i => i.str).join('').replace(/\s+/g, '');

    const mTeam = allText.match(/《(.+?)([0-9０-９])課([0-9０-９])班》/);
    const mPeriod = allText.match(/(\d{4})\/(\d{2})\/(\d{2})～(\d{4})\/(\d{2})\/(\d{2})/);
    if (!mTeam || !mPeriod) {
      warnings.push(`${p}ページ目: ヘッダー（班・期間）を認識できませんでした。スキップします`);
      continue;
    }
    const pageDivision = mTeam[1] + toHalfWidth(mTeam[2]) + '課';
    const team = parseInt(toHalfWidth(mTeam[3]));
    const startDate = `${mPeriod[1]}-${mPeriod[2]}-${mPeriod[3]}`;
    const endDate = `${mPeriod[4]}-${mPeriod[5]}-${mPeriod[6]}`;
    if (!division) division = pageDivision;
    if (!periodStart) { periodStart = startDate; periodEnd = endDate; }
    teams.add(team);

    // 曜日ヘッダー行（1文字の曜日セルが28個以上並ぶ行）からx座標アンカーを取得
    const byY = new Map<number, Item[]>();
    for (const it of items) {
      const y = Math.round(it.transform[5] * 4) / 4;
      const arr = byY.get(y);
      if (arr) arr.push(it); else byY.set(y, [it]);
    }
    let anchors: number[] = [];
    for (const cells of byY.values()) {
      if (cells.length >= 28 && cells.every(c => '土日月火水木金祝'.includes(c.str))) {
        anchors = cells.map(c => c.transform[4]).sort((a, b) => a - b);
        break;
      }
    }
    if (!anchors.length) {
      warnings.push(`${p}ページ目: 日付列を認識できませんでした。スキップします`);
      continue;
    }
    const dates: string[] = [];
    const cur = new Date(startDate + 'T00:00:00Z');
    for (let i = 0; i < anchors.length; i++) {
      dates.push(cur.toISOString().slice(0, 10));
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    const nearestAnchorIdx = (x: number): number => {
      let best = -1, bestD = Infinity;
      for (let i = 0; i < anchors.length; i++) {
        const d = Math.abs(anchors[i] - x);
        if (d < bestD) { bestD = d; best = i; }
      }
      return bestD <= 6 ? best : -1;
    };
    const nameColMaxX = anchors[0] - 15;

    // 社員コード（19/20始まり8桁）を含むyを「社員行」の基準として拾う
    const empYs: number[] = [];
    for (const [y, cells] of byY) {
      if (cells.some(c => /^(19|20)\d{6}/.test(c.str))) empYs.push(y);
    }
    empYs.sort((a, b) => b - a);

    for (const y of empYs) {
      const windowItems = items.filter(i => Math.abs(i.transform[5] - y) <= 1.5)
        .sort((a, b) => a.transform[4] - b.transform[4]);
      const nameCells = windowItems.filter(c => c.transform[4] <= nameColMaxX);
      const empCell = nameCells.find(c => /^(19|20)\d{6}/.test(c.str));
      if (!empCell) continue;
      const empCode = empCell.str.match(/^(19|20)\d{6}/)![0];
      const idx = nameCells.indexOf(empCell);
      let carNo: string | null = null;
      for (let i = 0; i < idx; i++) {
        if (/^\d{1,4}$/.test(nameCells[i].str)) { carNo = nameCells[i].str; break; }
      }
      const nameParts = [empCell.str.replace(/^(19|20)\d{6}\s*/, '')];
      for (let i = idx + 1; i < nameCells.length; i++) nameParts.push(nameCells[i].str);
      const name = nameParts.join(' ').replace(/\s+/g, ' ').trim();

      if (!seenEmpCodes.has(empCode)) {
        seenEmpCodes.add(empCode);
        members.push({ emp_code: empCode, name, car_no: carNo, division: pageDivision, team });
      }

      for (const c of windowItems) {
        if (c.transform[4] <= nameColMaxX) continue;
        if (/^\d+\.\d$/.test(c.str)) continue; // 右端の勤務数合計はスキップ
        const di = nearestAnchorIdx(c.transform[4]);
        if (di === -1) continue;
        shifts.push({ emp_code: empCode, date: dates[di], code: c.str });
      }
    }
  }

  if (members.length === 0) {
    warnings.push('乗務員データを1件も読み取れませんでした。PDFの形式が想定と異なる可能性があります');
  }

  return {
    startDate: periodStart,
    endDate: periodEnd,
    members,
    shifts,
    teams: [...teams].sort((a, b) => a - b),
    division,
    warnings,
  };
}

// ===================================================
// 個人別勤務予定表PDF（1人1ページ形式）のパーサー
// レイアウトは班一覧形式と全くの別物（1ページに1人分、左右2カラムで日付が並ぶ）だが、
// 出力先（emp_code/division/team/date/code）は班一覧形式と同じcrew_shift_members/crew_shiftsを想定。
// PDF内の課番号（例:「１課」）はそのまま「板橋１課」のように会社名を補って division にする
// （既存の乗務員シフトの division 表記が「板橋2課」のように会社名接頭辞付きのため）。
//
// ページ内のテキストアイテムは項目ごとに完全に分離されており（同一セル内で結合されない）、
// x座標も全ページで固定のため、班一覧形式のような複雑な行グルーピングは不要:
//   ヘッダー行（y≈556付近）: 期間の2つの日付 / 「Ｎ課 Ｍ班」1アイテム / 社員コード（8桁）1アイテム /
//                             氏名（姓・名で分割されることが多い）複数アイテム / 「様」1アイテム
//   表ヘッダー行（「日付」「曜日」「勤務」を含む行）: 左右2カラムのx座標アンカー
//   データ行: 左カラム「日付/曜日/勤務」+ 右カラム「日付/曜日/勤務」が同じy（=同じ行）に同居
// 日付は月をまたぐため「日付ラベル（日のみ）」ではなく、左カラム上から下→右カラム上から下の
// 出現順に期間開始日から連番で実日付を割り当てる（班一覧形式パーサーと同じ考え方）。
export async function parseIndividualCrewShiftPdf(bytes: Uint8Array): Promise<ParsedCrewShiftPdf> {
  const pdf = await getDocumentProxy(bytes);
  const members: ParsedCrewShiftMember[] = [];
  const shifts: ParsedCrewShiftCell[] = [];
  const warnings: string[] = [];
  const seenEmpCodes = new Set<string>();
  const teams = new Set<number>();
  let division = '';
  let periodStart = '';
  let periodEnd = '';

  for (let p = 1; p <= pdf.numPages; p++) {
    let items: Item[];
    try {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      items = (content.items as Item[]).filter(i => 'str' in i && i.str.trim() !== '');
    } catch (err) {
      warnings.push(`${p}ページ目: 破損したデータのため読み取れませんでした。このページはスキップします（${err instanceof Error ? err.message : String(err)}）`);
      continue;
    }
    if (items.length === 0) continue;

    // ヘッダー行（タイトル「◆勤務予定表◆」より下、表ヘッダーより上）
    const headerItems = items.filter(i => i.transform[5] > 548 && i.transform[5] < 565)
      .sort((a, b) => a.transform[4] - b.transform[4]);
    const headerText = headerItems.map(i => i.str).join('');
    const mPeriod = headerText.match(/(\d{4})\/(\d{2})\/(\d{2}).*?(\d{4})\/(\d{2})\/(\d{2})/);
    const empItem = headerItems.find(i => /^(19|20)\d{6}$/.test(i.str));
    const teamItem = headerItems.find(i => /^\d+課\s*\d+班$/.test(toHalfWidth(i.str)));
    const sonItem = headerItems.find(i => i.str.trim() === '様');
    if (!mPeriod || !empItem || !teamItem || !sonItem) {
      warnings.push(`${p}ページ目: ヘッダー（氏名・課班・期間）を認識できませんでした。スキップします`);
      continue;
    }

    const startDate = `${mPeriod[1]}-${mPeriod[2]}-${mPeriod[3]}`;
    const endDate = `${mPeriod[4]}-${mPeriod[5]}-${mPeriod[6]}`;
    const mTeam = toHalfWidth(teamItem.str).match(/(\d+)課\s*(\d+)班/)!;
    const pageDivision = `板橋${mTeam[1]}課`;
    const team = parseInt(mTeam[2]);
    const empCode = empItem.str;
    const name = headerItems
      .filter(i => i.transform[4] > empItem.transform[4] && i.transform[4] < sonItem.transform[4])
      .map(i => i.str).join(' ').replace(/\s+/g, ' ').trim();
    if (!name) {
      warnings.push(`${p}ページ目: 氏名を認識できませんでした。スキップします`);
      continue;
    }

    if (!division) division = pageDivision;
    if (!periodStart) { periodStart = startDate; periodEnd = endDate; }
    teams.add(team);

    // 表ヘッダー行から左右カラムの「日付」「勤務」列x座標アンカーを取得
    const byY = new Map<number, Item[]>();
    for (const it of items) {
      const y = Math.round(it.transform[5] * 4) / 4;
      const arr = byY.get(y);
      if (arr) arr.push(it); else byY.set(y, [it]);
    }
    let leftDateX = -1, leftCodeX = -1, rightDateX = -1, rightCodeX = -1, headerRowY = Infinity;
    for (const [y, cells] of byY) {
      const dateCells = cells.filter(c => c.str === '日付').sort((a, b) => a.transform[4] - b.transform[4]);
      const workCells = cells.filter(c => c.str === '勤務').sort((a, b) => a.transform[4] - b.transform[4]);
      if (dateCells.length === 2 && workCells.length === 2) {
        leftDateX = dateCells[0].transform[4]; rightDateX = dateCells[1].transform[4];
        leftCodeX = workCells[0].transform[4]; rightCodeX = workCells[1].transform[4];
        headerRowY = y;
        break;
      }
    }
    if (leftDateX === -1) {
      warnings.push(`${p}ページ目（${name}）: 日付・勤務の列見出しを認識できませんでした。スキップします`);
      continue;
    }
    const noteItem = items.find(i => i.str === '連絡事項');
    const bottomY = noteItem ? noteItem.transform[5] : -Infinity;

    type Row = { y: number; side: 'L' | 'R'; code: string };
    const rows: Row[] = [];
    for (const [y, cells] of byY) {
      if (y >= headerRowY || y <= bottomY) continue;
      const pick = (dateX: number, codeX: number, side: 'L' | 'R') => {
        const dateCell = cells.find(c => Math.abs(c.transform[4] - dateX) <= 8 && /^\d{1,2}$/.test(c.str));
        if (!dateCell) return;
        const codeCell = cells.find(c => c !== dateCell && Math.abs(c.transform[4] - codeX) <= 8 && !/^\d+\.\d$/.test(c.str));
        rows.push({ y, side, code: codeCell ? codeCell.str : '' });
      };
      pick(leftDateX, leftCodeX, 'L');
      pick(rightDateX, rightCodeX, 'R');
    }

    const leftRows = rows.filter(r => r.side === 'L').sort((a, b) => b.y - a.y);
    const rightRows = rows.filter(r => r.side === 'R').sort((a, b) => b.y - a.y);
    const orderedRows = [...leftRows, ...rightRows];

    const expectedDays = Math.round((new Date(endDate + 'T00:00:00Z').getTime() - new Date(startDate + 'T00:00:00Z').getTime()) / 86400000) + 1;
    if (orderedRows.length !== expectedDays) {
      warnings.push(`${p}ページ目（${name}）: 日数が一致しません（期待${expectedDays}日、検出${orderedRows.length}日）。このページの勤務データは取り込みません`);
      continue;
    }

    if (!seenEmpCodes.has(empCode)) {
      seenEmpCodes.add(empCode);
      members.push({ emp_code: empCode, name, car_no: null, division: pageDivision, team, sheet_left_days: leftRows.length });
    }

    const cur = new Date(startDate + 'T00:00:00Z');
    for (const row of orderedRows) {
      const dateStr = cur.toISOString().slice(0, 10);
      if (row.code) shifts.push({ emp_code: empCode, date: dateStr, code: row.code });
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }

  if (members.length === 0) {
    warnings.push('乗務員データを1件も読み取れませんでした。PDFの形式が想定と異なる可能性があります');
  }

  return {
    startDate: periodStart,
    endDate: periodEnd,
    members,
    shifts,
    teams: [...teams].sort((a, b) => a - b),
    division,
    warnings,
  };
}
