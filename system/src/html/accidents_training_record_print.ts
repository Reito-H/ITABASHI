// 事故研修記録 個別印刷ページ（/accidents/training-record/:id/print）
// A4縦1枚に自動縮小して収める（accidents_ride_along_notice_print.ts等と同じfitSheetToPage方式）。
import { escHtml } from './layout';

export interface TrainingRecordPrintData {
  employee_name: string;
  emp_no: string | null;
  division: number | null;
  team: string | null;
  conducted_date: string;
  location: string | null;
  trainer_name: string | null;
  content: string | null;
  reason: string | null;
  method: string | null;
  comment: string | null;
}

export interface AccidentsTrainingRecordPrintOptions {
  record: TrainingRecordPrintData;
  backHref: string;
}

function row(label: string, value: string | null): string {
  return `<div class="tp-row"><div class="tp-label">${label}</div><div class="tp-value">${value ? escHtml(value) : '<span class="tp-empty">—</span>'}</div></div>`;
}

export function renderAccidentsTrainingRecordPrintPage(o: AccidentsTrainingRecordPrintOptions): string {
  const r = o.record;
  const affiliation = [r.division != null ? `${r.division}課` : null, r.team ? `${r.team}` : null].filter(Boolean).join(' ');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="robots" content="noindex, nofollow">
<title>事故研修記録（印刷用）</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #e5e7eb; font-family: 'Hiragino Sans', 'Meiryo', sans-serif; color: #111827; }
  .toolbar { position: sticky; top: 0; z-index: 10; background: #1a3a5c; padding: 10px 16px; display: flex; gap: 8px; align-items: center; }
  .toolbar a, .toolbar button { font-size: 13px; padding: 7px 16px; border-radius: 6px; border: none; cursor: pointer; text-decoration: none; font-weight: 600; }
  .toolbar a { background: #374151; color: #fff; }
  .toolbar button.print-btn { background: #2563eb; color: #fff; }
  .stage { padding: 24px; display: flex; flex-direction: column; align-items: center; }

  .sheet { width: 210mm; height: 297mm; background: #fff; padding: 20mm 22mm; box-shadow: 0 4px 20px rgba(0,0,0,0.25); overflow: hidden; position: relative; }
  .sheet-fit { width: 100%; transform-origin: top left; }

  .tp-title { text-align: center; font-size: 24px; font-weight: 800; color: #0f172a; letter-spacing: .06em; margin-bottom: 22px; padding-bottom: 14px; border-bottom: 3px solid #1a3a5c; }

  .tp-id-block { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 22px; font-size: 14px; font-weight: 700; color: #000; }
  .tp-id-name { font-size: 18px; font-weight: 800; color: #000; }
  .tp-id-sub { font-size: 13px; font-weight: 700; color: #1e293b; margin-left: 8px; }

  .tp-section-title { font-size: 13px; font-weight: 800; color: #0f172a; margin: 20px 0 8px; letter-spacing: .04em; }
  .tp-box { border: 1px solid #94a3b8; border-radius: 8px; overflow: hidden; }
  .tp-row { display: flex; border-bottom: 1px solid #cbd5e1; }
  .tp-row:last-child { border-bottom: none; }
  .tp-label { width: 150px; flex: none; background: #f1f5f9; font-size: 13px; font-weight: 800; color: #0f172a; padding: 12px 14px; display: flex; align-items: flex-start; }
  .tp-value { flex: 1; font-size: 13.5px; font-weight: 600; color: #000; padding: 12px 14px; white-space: pre-wrap; line-height: 1.7; }
  .tp-empty { color: #6b7280; }

  .tp-comment-box { border: 1px solid #94a3b8; border-radius: 8px; padding: 14px 16px; min-height: 32mm; font-size: 13.5px; font-weight: 600; line-height: 1.8; white-space: pre-wrap; color: #000; }

  .tp-stamp-footer { position: absolute; right: 18mm; bottom: 16mm; display: flex; justify-content: flex-end; }
  .tp-stamp-row { display: flex; gap: 14px; }
  .tp-stamp-box { display: flex; flex-direction: column; align-items: center; gap: 5px; }
  .tp-stamp-frame { width: 46px; height: 46px; border: 1.5px solid #334155; border-radius: 4px; }
  .tp-stamp-label { font-size: 11px; font-weight: 700; color: #000; }

  @media print {
    @page { size: A4 portrait; margin: 0; }
    html, body { background: #fff; }
    .toolbar { display: none; }
    .stage { padding: 0; }
    .sheet { box-shadow: none; margin: 0; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <a href="${escHtml(o.backHref)}">← 研修記録一覧に戻る</a>
    <button class="print-btn" onclick="window.print()">🖨️ 印刷 / PDF保存</button>
  </div>
  <div class="stage">
    <div class="sheet" id="print-sheet">
      <div class="sheet-fit" id="sheet-fit">
        <div class="tp-title">事故研修記録</div>

        <div class="tp-id-block">
          <div><span class="tp-id-name">${escHtml(r.employee_name)}</span><span class="tp-id-sub">${escHtml(affiliation)}${r.emp_no ? `（${escHtml(r.emp_no)}）` : ''}</span></div>
          <div>実施日：${escHtml(r.conducted_date.slice(0, 10))}</div>
        </div>

        <div class="tp-section-title">実施記録</div>
        <div class="tp-box">
          ${row('実施日', r.conducted_date.slice(0, 10))}
          ${row('実施場所', r.location)}
          ${row('対象者', `${r.employee_name}${affiliation ? '（' + affiliation + '）' : ''}`)}
          ${row('実施者', r.trainer_name)}
          ${row('研修内容', r.content)}
          ${row('実施理由', r.reason)}
          ${row('実施方法', r.method)}
        </div>

        <div class="tp-section-title">事故研修担当者の所感</div>
        <div class="tp-comment-box">${r.comment ? escHtml(r.comment) : '<span class="tp-empty">—</span>'}</div>
      </div>
      <div class="tp-stamp-footer">
        <div class="tp-stamp-row">
          ${['所長', '課長', '班長', '事故教育'].map(label => `
            <div class="tp-stamp-box">
              <div class="tp-stamp-frame"></div>
              <div class="tp-stamp-label">${label}</div>
            </div>`).join('')}
        </div>
      </div>
    </div>
  </div>
  <script>
    function fitSheetToPage() {
      var fit = document.getElementById('sheet-fit');
      if (!fit) return;
      var pxPerMm = 96 / 25.4;
      var availablePx = (297 - 40) * pxPerMm;
      fit.style.transform = 'none';
      fit.style.width = '100%';
      var scale = 1;
      for (var i = 0; i < 6; i++) {
        var natural = fit.scrollHeight;
        if (natural <= 0 || natural * scale <= availablePx) break;
        scale = (availablePx / natural) * 0.97;
        fit.style.width = (100 / scale) + '%';
        fit.style.transform = 'scale(' + scale + ')';
      }
    }
    fitSheetToPage();
    window.addEventListener('load', fitSheetToPage);
    window.addEventListener('beforeprint', fitSheetToPage);
  </script>
</body>
</html>`;
}
