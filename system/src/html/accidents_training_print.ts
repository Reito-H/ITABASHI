// 事故研修のお知らせ 一括印刷ページ（/accidents/training/print）
// 対象者ごとに1枚ずつA4のお知らせを出力する。正式な帳票デザインは後日別途用意されるため、
// 今回は「印刷できる仕組みの枠」としてプレースホルダーの文面を置き、その場でcontenteditable編集して印刷できるようにする。
// 正式な帳票デザインが来たら、この .sheet 内のマークアップのみ差し替えればよい（データ受け渡し部分は変更不要）。
import { escHtml } from './layout';

export interface TrainingNoticeItem {
  name: string;
  division: number | null;
  team: string | null;
  cnt: number;
  lastDate: string;
}

export interface AccidentsTrainingPrintOptions {
  pageTitle: string;
  periodLabel: string;
  issuedDateLabel: string;
  items: TrainingNoticeItem[];
  backHref: string;
}

export function renderAccidentsTrainingPrintPage(o: AccidentsTrainingPrintOptions): string {
  const sheets = o.items.map((it, i) => `
    <div class="sheet" style="${i === o.items.length - 1 ? '' : 'page-break-after: always;'}">
      <div class="sheet-head">
        <div class="left">
          <h1>事故研修のお知らせ</h1>
        </div>
        <div class="meta">
          発行日：<span contenteditable="true" class="f-edit">${escHtml(o.issuedDateLabel)}</span><br>
          発行：<span contenteditable="true" class="f-edit" data-placeholder="運行管理部門">&nbsp;</span>
        </div>
      </div>

      <div class="to-block">
        <span contenteditable="true" class="to-field">${escHtml(it.name)}</span>
        <span class="to-suffix">様</span>
        <span class="to-sub">${it.division != null ? `${it.division}課 ` : ''}${escHtml(it.team || '')}</span>
      </div>

      <div class="body-text" contenteditable="true">
        下記のとおり、直近の事故発生状況を踏まえ、事故防止のための研修を実施いたします。安全運転の徹底のため、必ずご出席ください。
      </div>

      <div class="summary-table">
        <div class="summary-row"><span class="summary-label">対象期間</span><span class="summary-value">${escHtml(o.periodLabel)}</span></div>
        <div class="summary-row"><span class="summary-label">期間内事故件数</span><span class="summary-value summary-value-strong">${it.cnt}件</span></div>
        <div class="summary-row"><span class="summary-label">直近事故発生日</span><span class="summary-value">${escHtml(it.lastDate.slice(0, 10))}</span></div>
      </div>

      <div class="notes-field" contenteditable="true" data-placeholder="研修日時・場所・持ち物などをここに記入してください">&nbsp;</div>

      <div class="sheet-foot">
        <span contenteditable="true" class="f-edit" data-placeholder="担当者名・連絡先">&nbsp;</span>
        <span>本紙は社内システムより自動生成されています</span>
      </div>
    </div>`).join('');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="robots" content="noindex, nofollow">
<title>${escHtml(o.pageTitle)}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #e5e7eb; font-family: 'Hiragino Sans', 'Meiryo', sans-serif; color: #111827; }
  .toolbar { position: sticky; top: 0; z-index: 10; background: #1e3a5f; padding: 10px 16px; display: flex; gap: 8px; align-items: center; }
  .toolbar a, .toolbar button { font-size: 13px; padding: 7px 16px; border-radius: 6px; border: none; cursor: pointer; text-decoration: none; font-weight: 600; }
  .toolbar a { background: #374151; color: #fff; }
  .toolbar button.print-btn { background: #2563eb; color: #fff; }
  .toolbar .hint { margin-left: auto; font-size: 12px; color: #cbd5e1; }
  .stage { padding: 24px; display: flex; flex-direction: column; align-items: center; gap: 20px; }

  .sheet {
    width: 210mm; min-height: 297mm; background: #fff; padding: 18mm 20mm;
    box-shadow: 0 4px 20px rgba(0,0,0,0.25);
  }
  .sheet-head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1e3a5f; padding-bottom: 10px; margin-bottom: 20px; }
  .sheet-head h1 { font-size: 22px; margin: 0; color: #1e3a5f; letter-spacing: .05em; }
  .sheet-head .meta { text-align: right; font-size: 11px; color: #6b7280; line-height: 1.8; }

  .to-block { display: flex; align-items: baseline; gap: 8px; margin-bottom: 18px; }
  .to-field { min-width: 160px; font-size: 20px; font-weight: 700; padding: 3px 6px; border-bottom: 2px solid #1e3a5f; outline: none; }
  .to-suffix { font-size: 16px; font-weight: 600; color: #374151; }
  .to-sub { margin-left: 14px; font-size: 12px; color: #6b7280; }

  .body-text { font-size: 14px; line-height: 2; color: #1f2937; padding: 4px 2px 20px; outline: none; }
  .body-text:focus { background: #fffbeb; }

  .summary-table { border: 1px solid #d1d5db; border-radius: 6px; margin-bottom: 18px; overflow: hidden; }
  .summary-row { display: flex; border-bottom: 1px solid #e5e7eb; }
  .summary-row:last-child { border-bottom: none; }
  .summary-label { width: 140px; flex: none; background: #f9fafb; font-size: 12px; color: #6b7280; padding: 9px 12px; font-weight: 600; }
  .summary-value { flex: 1; padding: 9px 12px; font-size: 13px; color: #111827; }
  .summary-value-strong { font-weight: 800; color: #991b1b; font-size: 15px; }

  .notes-field { min-height: 100mm; border: 1px dashed #d1d5db; border-radius: 6px; padding: 12px 14px; font-size: 13px; line-height: 1.9; outline: none; margin-bottom: 18px; }
  .notes-field:empty:before { content: attr(data-placeholder); color: #9ca3af; }
  .notes-field:focus { border-color: #2563eb; }

  .f-edit { outline: none; border-bottom: 1px dashed #cbd5e1; padding: 0 3px; }
  .f-edit:empty:before { content: attr(data-placeholder); color: #9ca3af; }
  @media print { .f-edit { border-color: transparent !important; } }

  .sheet-foot { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 10px; padding-top: 8px; border-top: 1px solid #d1d5db; font-size: 10px; color: #6b7280; }

  @media print {
    .toolbar { display: none; }
    .stage { padding: 0; gap: 0; }
    html, body { background: #fff; }
    .sheet { box-shadow: none; margin: 0; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <a href="${o.backHref}">← 対象者一覧に戻る</a>
    <button class="print-btn" onclick="window.print()">🖨️ 印刷 / PDF保存</button>
    <span class="hint">宛名・本文・研修詳細欄はクリックしてその場で書き換えられます（${o.items.length}名分・${o.items.length}枚）</span>
  </div>
  <div class="stage">
    ${sheets}
  </div>
</body>
</html>`;
}
