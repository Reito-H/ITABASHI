// 乗務員退職者名簿PDFのパーサー
// 元PDFはテキストベース（OCR不要）。課ごとにページが分かれ、各行は
// 「班／社員番号+氏名／退職年月日／入社年月日／在籍期間／退社理由／勤務種別」の
// 単一y座標に収まる罫線表（折り返しなし）。列幅は在籍期間・退社理由の文字数で
// 微妙に前後するため、x座標アンカーには頼らず、セルの中身のパターン（8桁社員番号・
// 日付形式・在籍期間形式・「隔/夜/昼」+「勤」）で意味的に切り分ける。
import { getDocumentProxy } from 'unpdf';

export type ParsedRetireeRow = {
  division: number;
  team: number | null;
  emp_no: string;
  name: string;
  retirement_date: string; // YYYY-MM-DD
  hire_date: string | null; // YYYY-MM-DD
  reason: string | null;
  work_type: string | null; // '隔勤' | '夜勤' | '昼勤' など
};

export type ParsedRetireePdf = {
  rows: ParsedRetireeRow[];
  divisionTotals: Record<number, number>;
  warnings: string[];
};

const toHalfWidth = (s: string) => s.replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));

type Item = { str: string; transform: number[] };

const DATE_RE = /^(\d{4})\/(\d{2})\/(\d{2})$/;
const ENROLLMENT_PERIOD_RE = /^(年\s*\d+ヶ月|\d+年\d+ヶ月)$/;
const WORK_TYPE_RE = /^(隔|夜|昼)$/;

export async function parseRetireePdf(bytes: Uint8Array): Promise<ParsedRetireePdf> {
  const pdf = await getDocumentProxy(bytes);
  const rows: ParsedRetireeRow[] = [];
  const warnings: string[] = [];
  const divisionTotals: Record<number, number> = {};
  const parsedCountByDivision: Record<number, number> = {};

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

    const allText = items.map(i => i.str).join('').replace(/\s+/g, '');
    const mDiv = allText.match(/板橋\s*([0-9０-９]+)\s*課/);
    if (!mDiv) {
      warnings.push(`${p}ページ目: 課の見出しを認識できませんでした。スキップします`);
      continue;
    }
    const division = parseInt(toHalfWidth(mDiv[1]));

    const mTotal = allText.match(/課\s*計\s*(\d+)\s*人/);
    if (mTotal) divisionTotals[division] = parseInt(mTotal[1]);

    // y座標でグルーピングして行を復元
    const byY = new Map<number, Item[]>();
    for (const it of items) {
      const y = Math.round(it.transform[5] * 4) / 4;
      const arr = byY.get(y);
      if (arr) arr.push(it); else byY.set(y, [it]);
    }

    for (const [, cellsUnsorted] of byY) {
      const cells = [...cellsUnsorted].sort((a, b) => a.transform[4] - b.transform[4]);
      // 社員番号(8桁数字)を含むセルを探す。無ければ社員データ行ではない（見出し・合計行など）
      const empIdx = cells.findIndex(c => /^\d{8}/.test(c.str));
      if (empIdx === -1) continue;

      const empCell = cells[empIdx];
      const empNo = empCell.str.match(/^\d{8}/)![0];

      // 班番号: 社員番号セルより前にある1桁数字
      let team: number | null = null;
      for (let i = 0; i < empIdx; i++) {
        if (/^[1-8]$/.test(cells[i].str)) { team = parseInt(cells[i].str); break; }
      }

      // 氏名: 社員番号セルの数字部分の残り＋日付が現れるまでの後続セルを結合
      const nameParts = [empCell.str.replace(/^\d{8}\s*/, '')];
      let i = empIdx + 1;
      while (i < cells.length && !DATE_RE.test(cells[i].str)) {
        nameParts.push(cells[i].str);
        i++;
      }
      const name = nameParts.join('').trim();

      if (i >= cells.length || !DATE_RE.test(cells[i].str)) {
        warnings.push(`${p}ページ目: 社員番号${empNo}の行で退職年月日を認識できませんでした。この行はスキップします`);
        continue;
      }
      const retirementDate = cells[i].str.replace(/\//g, '-');
      i++;

      let hireDate: string | null = null;
      if (i < cells.length && DATE_RE.test(cells[i].str)) {
        hireDate = cells[i].str.replace(/\//g, '-');
        i++;
      } else {
        warnings.push(`${p}ページ目: 社員番号${empNo}の行で入社年月日を認識できませんでした`);
      }

      // 残りのセル: 在籍期間（スキップ）／退社理由（自由文字列、空欄あり）／勤務種別（隔・夜・昼＋勤）
      const rest = cells.slice(i);
      const workIdx = rest.findIndex(c => WORK_TYPE_RE.test(c.str));
      const beforeWork = workIdx === -1 ? rest : rest.slice(0, workIdx);
      const reasonParts = beforeWork.filter(c => !ENROLLMENT_PERIOD_RE.test(c.str));
      const reason = reasonParts.map(c => c.str).join('').trim() || null;
      const workType = workIdx !== -1 ? rest[workIdx].str + (rest[workIdx + 1]?.str === '勤' ? '勤' : '') : null;

      rows.push({
        division,
        team,
        emp_no: empNo,
        name,
        retirement_date: retirementDate,
        hire_date: hireDate,
        reason,
        work_type: workType,
      });
      parsedCountByDivision[division] = (parsedCountByDivision[division] ?? 0) + 1;
    }
  }

  for (const [divStr, total] of Object.entries(divisionTotals)) {
    const div = parseInt(divStr);
    const parsed = parsedCountByDivision[div] ?? 0;
    if (parsed !== total) {
      warnings.push(`${div}課: PDF記載の合計人数(${total}人)とパースできた行数(${parsed}件)が一致しません。PDFの形式をご確認ください`);
    }
  }

  if (rows.length === 0) {
    warnings.push('退職者データを1件も読み取れませんでした。PDFの形式が想定と異なる可能性があります');
  }

  return { rows, divisionTotals, warnings };
}
