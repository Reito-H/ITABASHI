// 事故防止研修教材 印刷ページ（/accidents/material/print）
// A4縦を連続配置し、各シートを report_print.ts 系と同じ fitSheetToPage 方式で自動縮小して収める。
// 枚数は対象者の有無で変動する（renderMaterialSheetsInner()参照）。
// ページ内容は accidents_material_render.ts の renderMaterialSheetsInner() で組み立てる（Web版と共通）。
import { escHtml } from './layout';
import { MATERIAL_PAGE_CSS, FIT_ALL_SHEETS_SCRIPT, renderMaterialSheetsInner } from './accidents_material_render';
import type { MaterialStats, PersonalStats } from '../utils/accident_material_stats';

export interface AccidentsMaterialPrintOptions {
  stats: MaterialStats;
  personal: PersonalStats | null;
  backHref: string;
}

export function renderAccidentsMaterialPrintPage(o: AccidentsMaterialPrintOptions): string {
  const pageBodies = renderMaterialSheetsInner(o.stats, o.personal);
  const sheets = pageBodies
    .map(
      (page, i) => `<div class="sheet"${i === pageBodies.length - 1 ? '' : ' style="page-break-after: always;"'}>
      <div class="sheet-fit">${page.body}</div>
      ${page.stampFooterHtml || ''}
    </div>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="robots" content="noindex, nofollow">
<title>事故防止研修教材（印刷用）</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #e5e7eb; font-family: 'Hiragino Sans', 'Meiryo', sans-serif; color: #111827; }
  .toolbar { position: sticky; top: 0; z-index: 10; background: #1e3a5f; padding: 10px 16px; display: flex; gap: 8px; align-items: center; }
  .toolbar a, .toolbar button { font-size: 13px; padding: 7px 16px; border-radius: 6px; border: none; cursor: pointer; text-decoration: none; font-weight: 600; }
  .toolbar a { background: #374151; color: #fff; }
  .toolbar button.print-btn { background: #0f766e; color: #fff; }
  .toolbar .hint { margin-left: auto; font-size: 12px; color: #cbd5e1; }
  .stage { padding: 24px; display: flex; flex-direction: column; align-items: center; gap: 20px; }

  .sheet {
    width: 210mm; height: 297mm; background: #fff; padding: 16mm 18mm;
    box-shadow: 0 4px 20px rgba(0,0,0,0.25); overflow: hidden; position: relative;
  }
  .sheet-fit { width: 100%; transform-origin: top left; }

  ${MATERIAL_PAGE_CSS}

  @media print {
    @page { size: A4 portrait; margin: 0; }
    html, body { background: #fff; }
    .toolbar { display: none; }
    .stage { padding: 0; gap: 0; }
    .sheet { box-shadow: none; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <a href="${escHtml(o.backHref)}">← 教材ビューアに戻る</a>
    <button class="print-btn" onclick="window.print()">🖨️ 印刷 / PDF保存</button>
    <span class="hint">A4縦${pageBodies.length}枚（各ページ自動縮小）</span>
  </div>
  <div class="stage">
    ${sheets}
  </div>
  <script>
    ${FIT_ALL_SHEETS_SCRIPT}
    fitAllSheets();
    window.addEventListener('load', fitAllSheets);
    window.addEventListener('beforeprint', fitAllSheets);
  </script>
</body>
</html>`;
}
