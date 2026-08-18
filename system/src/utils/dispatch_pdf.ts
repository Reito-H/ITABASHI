// 配車計画表PDFのパーサー（H818.pdf相当：日付×班ごとに1ページ、車両起点の配車一覧）
// crew_shift_pdf.ts と同じくテキストベースPDFの座標抽出方式（OCR不要）。
//
// レイアウトのクセ:
//   ・1ページ = その日・その班の配車。ヘッダーに「令和08年08月18日(火) 分【 板橋 ３班 】」
//     形式で日付と班番号が入る（課は書かれないため Math.ceil(team/2) で導出する）。
//   ・本体は「車両/勤務/班/担当者/変更」の5列ブロックが横に3セット並び、右端に「明番者」列が2つある。
//     列見出し行の x 座標をそのままアンカーとして使い、データ行の各アイテムを最も近いアンカーへ
//     割り当てる（crew_shift_pdf.ts の nearestAnchorIdx と同じ発想）。
//   ・氏名は「社員コード+姓」と「名」が別テキストアイテムに分かれるため、同一アンカーに
//     割り当てられた複数アイテムをx順に連結してから正規表現で分離する。
//   ・論理行の判定は「車両番号セルまたは社員コードセルを含むy」を基準にし、フォントベースライン差
//     による±1.5pt程度のズレは同一行としてマージする（crew_shift_pdf.ts と同じ許容量）。
//   ・ページ下部に「(公休者)」「(未割当者)」「(備考)」の3セクションがあり、公休者/未割当者は
//     社員コード+氏名が4列で並ぶ。これらは取込確認時の突き合わせ専用で、DBには保存しない
//     （永続化するのは dispatch_assignments と備考のみ）。
import { getDocumentProxy } from 'unpdf';

export type ParsedDispatchAssignment = {
  car_no: string;
  team: number;        // その担当者が所属する班（車両の常置班とは別。多くの場合ページの班と一致）
  shift_code: string;  // crew_shift_types.code の記号空間（Ｈ/Ｄ/Ｂ/ａ/ｂ）へ正規化済み
  emp_code: string | null;
  name: string | null;
  note: string;        // 「変更」欄
};

export type ParsedPersonRef = { emp_code: string; name: string };

export type ParsedDispatchPage = {
  date: string;
  team: number;         // ページヘッダーの班番号（1ページ=1班）
  assignments: ParsedDispatchAssignment[];
  meiban: ParsedPersonRef[];
  kokyu: ParsedPersonRef[];
  unassigned: ParsedPersonRef[];
  remarks: string;
};

export type ParsedDispatchPdf = {
  pages: ParsedDispatchPage[];
  warnings: string[];
};

type Item = { str: string; transform: number[] };

const toHalfWidth = (s: string) => s.replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));

// PDF表記 → crew_shift_types.code の記号空間へ正規化
const SHIFT_CODE_MAP: Record<string, string> = {
  'Ｈ勤': 'Ｈ', 'H勤': 'Ｈ',
  'Ｄ勤': 'Ｄ', 'D勤': 'Ｄ',
  'Ｂ勤': 'Ｂ', 'B勤': 'Ｂ',
  '日勤A': 'ａ', '日勤Ａ': 'ａ',
  '日勤B': 'ｂ', '日勤Ｂ': 'ｂ',
};
function normalizeShiftCode(raw: string): string | null {
  return SHIFT_CODE_MAP[raw.trim()] ?? null;
}

const EMP_CODE_RE = /^(19|20)\d{6}/;

// 令和N年 → 西暦（令和1年=2019年）
function reiwaToSeireki(reiwaYear: number): number {
  return reiwaYear + 2018;
}

function clusterRows(items: Item[]): Item[][] {
  const sorted = [...items].sort((a, b) => b.transform[5] - a.transform[5]);
  const rows: Item[][] = [];
  let current: Item[] = [];
  let currentY: number | null = null;
  for (const it of sorted) {
    const y = it.transform[5];
    if (currentY === null || Math.abs(y - currentY) <= 1.6) {
      current.push(it);
      currentY = currentY === null ? y : (currentY + y) / 2;
    } else {
      if (current.length) rows.push(current);
      current = [it];
      currentY = y;
    }
  }
  if (current.length) rows.push(current);
  return rows;
}

type BlockAnchor = { carX: number; shiftX: number; teamX: number; nameX: number; noteX: number };

// 同一アンカーに割り当てられた複数アイテム（社員コード+姓 / 名）をx順に連結して氏名を解析する
function parsePersonCells(cells: Item[]): ParsedPersonRef | null {
  if (cells.length === 0) return null;
  const sorted = [...cells].sort((a, b) => a.transform[4] - b.transform[4]);
  const first = sorted[0].str;
  const m = first.match(EMP_CODE_RE);
  if (!m) return null;
  const empCode = m[0];
  const parts = [first.replace(EMP_CODE_RE, '').trim()];
  for (let i = 1; i < sorted.length; i++) parts.push(sorted[i].str.trim());
  const name = parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  return { emp_code: empCode, name };
}

export async function parseDispatchPdf(
  bytes: Uint8Array,
  onProgress?: (done: number, total: number) => void,
): Promise<ParsedDispatchPdf> {
  const pdf = await getDocumentProxy(bytes);
  const pages: ParsedDispatchPage[] = [];
  const warnings: string[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    let items: Item[];
    try {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      items = (content.items as Item[]).filter(i => 'str' in i && i.str.trim() !== '');
    } catch (err) {
      warnings.push(`${p}ページ目: 破損したデータのため読み取れませんでした。スキップします（${err instanceof Error ? err.message : String(err)}）`);
      onProgress?.(p, pdf.numPages);
      continue;
    }
    if (items.length === 0) { onProgress?.(p, pdf.numPages); continue; }

    const allText = [...items].sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4])
      .map(i => i.str).join('');
    const mHeader = allText.match(/令和\s*(\d+)年(\d{2})月(\d{2})日.*?【\s*(.+?)\s*([0-9０-９]+)班\s*】/);
    if (!mHeader) {
      warnings.push(`${p}ページ目: ヘッダー（日付・班）を認識できませんでした。スキップします`);
      onProgress?.(p, pdf.numPages);
      continue;
    }
    const year = reiwaToSeireki(parseInt(mHeader[1], 10));
    const date = `${year}-${mHeader[2]}-${mHeader[3]}`;
    const team = parseInt(toHalfWidth(mHeader[5]), 10);

    // 列見出し行（「車両」セルが3個以上ある行）からブロックアンカーを取得
    const byY = new Map<number, Item[]>();
    for (const it of items) {
      const y = Math.round(it.transform[5] * 4) / 4;
      const arr = byY.get(y);
      if (arr) arr.push(it); else byY.set(y, [it]);
    }
    let headerCells: Item[] = [];
    for (const cells of byY.values()) {
      const carCount = cells.filter(c => c.str === '車両').length;
      if (carCount >= 3) { headerCells = [...cells].sort((a, b) => a.transform[4] - b.transform[4]); break; }
    }
    if (headerCells.length === 0) {
      warnings.push(`${p}ページ目: 列見出し（車両/勤務/班/担当者/変更）を認識できませんでした。スキップします`);
      onProgress?.(p, pdf.numPages);
      continue;
    }
    const carXs = headerCells.filter(c => c.str === '車両').map(c => c.transform[4]);
    const shiftXs = headerCells.filter(c => c.str === '勤務').map(c => c.transform[4]);
    const teamXs = headerCells.filter(c => c.str === '班').map(c => c.transform[4]);
    const nameXs = headerCells.filter(c => c.str === '担当者').map(c => c.transform[4]);
    const noteXs = headerCells.filter(c => c.str === '変更').map(c => c.transform[4]);
    const meibanXs = headerCells.filter(c => c.str === '明番者').map(c => c.transform[4]);
    if (carXs.length < 1 || shiftXs.length !== carXs.length || teamXs.length !== carXs.length || nameXs.length !== carXs.length) {
      warnings.push(`${p}ページ目: 列構成が想定外でした。スキップします`);
      onProgress?.(p, pdf.numPages);
      continue;
    }
    const blocks: BlockAnchor[] = carXs.map((carX, i) => ({
      carX, shiftX: shiftXs[i], teamX: teamXs[i], nameX: nameXs[i], noteX: noteXs[i] ?? carX + 200,
    }));

    // 「(公休者)」「(未割当者)」「(備考)」セクションの見出しyを検出（これより下のデータ行は本体から除外する）
    let sectionY = -Infinity;
    let sectionXs: { kokyu: number; unassigned: number; remarks: number } | null = null;
    for (const [y, cells] of byY) {
      const kokyuCell = cells.find(c => c.str === '(公休者)');
      const unassignedCell = cells.find(c => c.str === '(未割当者)');
      const remarksCell = cells.find(c => c.str === '(備考)');
      if (kokyuCell && unassignedCell && remarksCell) {
        sectionY = y;
        sectionXs = { kokyu: kokyuCell.transform[4], unassigned: unassignedCell.transform[4], remarks: remarksCell.transform[4] };
        break;
      }
    }

    const bodyItems = items.filter(i => i.transform[5] > sectionY + 2);
    const rows = clusterRows(bodyItems);

    const assignments: ParsedDispatchAssignment[] = [];
    const meiban: ParsedPersonRef[] = [];

    for (const row of rows) {
      for (const block of blocks) {
        const carCell = row.find(c => Math.abs(c.transform[4] - block.carX) <= 15 && /^\d{1,5}$/.test(c.str));
        if (!carCell) continue;
        const shiftCell = row.find(c => Math.abs(c.transform[4] - block.shiftX) <= 20 && c.str in SHIFT_CODE_MAP);
        const teamCell = row.find(c => Math.abs(c.transform[4] - block.teamX) <= 15 && /^[0-9０-９]$/.test(c.str));
        const nameCells = row.filter(c => {
          if (c === carCell || c === shiftCell || c === teamCell) return false;
          const dName = Math.abs(c.transform[4] - block.nameX);
          const dNote = Math.abs(c.transform[4] - block.noteX);
          return dName < dNote && c.transform[4] >= block.carX - 5;
        });
        const person = parsePersonCells(nameCells);
        const shiftCode = shiftCell ? normalizeShiftCode(shiftCell.str) : null;
        if (!shiftCode && !person) continue; // 車両番号だけの空き行はスキップ（配車データとしては登録しない）

        const noteCell = row.find(c => Math.abs(c.transform[4] - block.noteX) <= 40 && c !== carCell && c !== shiftCell && c !== teamCell);
        assignments.push({
          car_no: carCell.str,
          team: teamCell ? parseInt(toHalfWidth(teamCell.str), 10) : team,
          shift_code: shiftCode ?? '',
          emp_code: person?.emp_code ?? null,
          name: person?.name ?? null,
          note: noteCell ? noteCell.str.trim() : '',
        });
      }
      if (meibanXs.length > 0) {
        for (const meibanX of meibanXs) {
          const cells = row.filter(c => Math.abs(c.transform[4] - meibanX) <= 45);
          const person = parsePersonCells(cells);
          if (person) meiban.push(person);
        }
      }
    }

    // ページ下部セクション（公休者/未割当者/備考）
    const kokyu: ParsedPersonRef[] = [];
    const unassigned: ParsedPersonRef[] = [];
    let remarks = '';
    if (sectionXs) {
      const sectionItems = items.filter(i => i.transform[5] < sectionY - 2);
      const sectionRows = clusterRows(sectionItems);
      // 公休者/未割当者は複数列（4列程度）に渡って展開されうるため、見出し同士の中点ではなく
      // 「次のセクション見出しの開始位置未満は手前のセクション」というルールで区切る
      for (const row of sectionRows) {
        const kokyuItems = row.filter(c => c.transform[4] < sectionXs!.unassigned);
        const unassignedItems = row.filter(c => c.transform[4] >= sectionXs!.unassigned && c.transform[4] < sectionXs!.remarks);
        const remarksItems = row.filter(c => c.transform[4] >= sectionXs!.remarks);
        // 公休者・未割当者は複数列（社員コード+氏名の組が横に複数並ぶ）になりうるため、
        // アイテムをx順に並べ、社員コード出現位置で組を区切って解析する
        for (const groupItems of [kokyuItems, unassignedItems]) {
          const sorted = [...groupItems].sort((a, b) => a.transform[4] - b.transform[4]);
          let cur: Item[] = [];
          const groups: Item[][] = [];
          for (const it of sorted) {
            if (EMP_CODE_RE.test(it.str) && cur.length) { groups.push(cur); cur = [it]; }
            else cur.push(it);
          }
          if (cur.length) groups.push(cur);
          for (const g of groups) {
            const person = parsePersonCells(g);
            if (person) (groupItems === kokyuItems ? kokyu : unassigned).push(person);
          }
        }
        if (remarksItems.length > 0) {
          remarks += (remarks ? '\n' : '') + [...remarksItems].sort((a, b) => a.transform[4] - b.transform[4]).map(c => c.str).join(' ');
        }
      }
    }

    pages.push({ date, team, assignments, meiban, kokyu, unassigned, remarks });
    onProgress?.(p, pdf.numPages);
  }

  if (pages.length === 0) {
    warnings.push('配車データを1ページも読み取れませんでした。PDFの形式が想定と異なる可能性があります');
  }

  return { pages, warnings };
}
