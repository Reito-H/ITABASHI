// 事故データ予測AI（統計処理による日別「事故発生しやすさスコア」）年間カレンダー
// ページ: /accidents/forecast
import { ADMIN_PATH } from '../config';
import { escHtml } from './layout';
import { accidentsTabNav } from './accidents';
import { type DayScore, TIER_LABELS, TIER_COLORS, WEEKDAY_LABELS_JA } from '../utils/accident_forecast';

export interface AccidentsForecastOpts {
  year: number;
  selectedDivision: number | null;
  usedFallback: boolean;
  insufficientData: boolean;
  totalCount: number;
  totalDays: number;
  dayScores: DayScore[];
}

function monthGridHtml(year: number, month: number, scoreByDate: Map<string, DayScore>): string {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: string[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push('<div class="af-cell af-cell-blank"></div>');
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const s = scoreByDate.get(dateStr);
    const color = s ? TIER_COLORS[s.tier] : { bg: '#f9fafb', fg: '#9ca3af' };
    const title = s
      ? `${month}/${d}（${WEEKDAY_LABELS_JA[s.weekday]}）スコア${s.score100} ${TIER_LABELS[s.tier]}`
      : `${month}/${d}`;
    const star = s && s.isAlert ? '<span class="af-star">★</span>' : '';
    cells.push(`<div class="af-cell" style="background:${color.bg};color:${color.fg};" title="${escHtml(title)}">${d}${star}</div>`);
  }
  return `
  <div class="af-month">
    <div class="af-month-title">${month}月</div>
    <div class="af-weekday-row">${WEEKDAY_LABELS_JA.map(w => `<div class="af-wd">${w}</div>`).join('')}</div>
    <div class="af-grid">${cells.join('')}</div>
  </div>`;
}

export function accidentsForecastPage(opts: AccidentsForecastOpts): string {
  const { year, selectedDivision, usedFallback, insufficientData, totalCount, totalDays, dayScores } = opts;

  const nowYear = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCFullYear();
  const yearOptions = [nowYear - 2, nowYear - 1, nowYear, nowYear + 1].map(y =>
    `<option value="${y}" ${y === year ? 'selected' : ''}>${y}年</option>`).join('');
  const divOptions = ['<option value="">全社</option>', ...[1, 2, 3, 4].map(d =>
    `<option value="${d}" ${d === selectedDivision ? 'selected' : ''}>${d}課</option>`)].join('');

  const legendHtml = TIER_LABELS.map((label, i) =>
    `<span class="af-legend-item"><span class="af-legend-dot" style="background:${TIER_COLORS[i].bg};border-color:${TIER_COLORS[i].fg};"></span>${label}</span>`
  ).join('');

  const tabNav = accidentsTabNav('forecast');
  const filterBar = `
  <div class="af-filter-bar">
    <select class="af-select" id="af-year" onchange="afReload()">${yearOptions}</select>
    <select class="af-select" id="af-division" onchange="afReload()">${divOptions}</select>
  </div>`;

  if (insufficientData) {
    return `
<style>${AF_BASE_CSS}</style>
<div class="af">
  ${tabNav}
  ${filterBar}
  <div class="af-empty-card">データが不足しているため予測を計算できません（事故データ${totalCount}件、期間${totalDays}日）。CSVインポートでデータが蓄積されると自動的に表示されます。</div>
</div>`;
  }

  const scoreByDate = new Map(dayScores.map(s => [s.date, s]));
  const monthsHtml = Array.from({ length: 12 }, (_, i) => monthGridHtml(year, i + 1, scoreByDate)).join('');

  const byWeekday = Array.from({ length: 7 }, () => ({ sum: 0, cnt: 0 }));
  const byMonth = Array.from({ length: 12 }, () => ({ sum: 0, cnt: 0 }));
  for (const s of dayScores) {
    byWeekday[s.weekday].sum += s.score100; byWeekday[s.weekday].cnt++;
    byMonth[s.month - 1].sum += s.score100; byMonth[s.month - 1].cnt++;
  }
  const weekdayAvg = byWeekday.map(x => x.cnt ? x.sum / x.cnt : 0);
  const monthAvg = byMonth.map(x => x.cnt ? x.sum / x.cnt : 0);
  const topWeekday = WEEKDAY_LABELS_JA[weekdayAvg.indexOf(Math.max(...weekdayAvg))];
  const topMonth = monthAvg.indexOf(Math.max(...monthAvg)) + 1;
  const alertDaysCount = dayScores.filter(s => s.isAlert).length;

  const fallbackNoteHtml = usedFallback
    ? `<div class="af-note">※ この課のデータが少ないため、全社データの傾向で計算しています。</div>`
    : '';

  return `
<style>${AF_BASE_CSS}</style>
<div class="af">
  ${tabNav}
  ${filterBar}
  ${fallbackNoteHtml}

  <div class="af-summary">
    <div class="af-summary-card"><div class="af-summary-label">最も事故が多い傾向の曜日</div><div class="af-summary-val">${topWeekday}曜日</div></div>
    <div class="af-summary-card"><div class="af-summary-label">最も事故が多い傾向の月</div><div class="af-summary-val">${topMonth}月</div></div>
    <div class="af-summary-card"><div class="af-summary-label">${year}年の「多発傾向」日数</div><div class="af-summary-val">${alertDaysCount}日<span class="af-summary-unit">/ 年（上位1割目安）</span></div></div>
  </div>

  <div class="af-legend">${legendHtml}<span class="af-legend-item"><span class="af-star">★</span>引き継ぎシートで警告表示される日</span></div>

  <div class="af-months-grid">${monthsHtml}</div>

  <div class="af-note" style="margin-top:18px;">
    このスコアは過去の事故データから「月ごと」「曜日ごと」の発生頻度を統計的に算出し、掛け合わせて求めた相対的な目安です（機械学習的な統計処理。天気予報のようにその日固有の状況を予測するものではありません）。
  </div>
</div>

<script>
function afReload() {
  var year = document.getElementById('af-year').value;
  var division = document.getElementById('af-division').value;
  var url = '${ADMIN_PATH}/accidents/forecast?year=' + year + (division ? '&division=' + division : '');
  location.href = url;
}
</script>
`;
}

const AF_BASE_CSS = `
  .af { font-family:'Hiragino Sans','Meiryo',sans-serif; max-width:1160px; }
  .ac-tabnav { display:flex; gap:4px; margin-bottom:14px; border-bottom:1px solid #e5e7eb; }
  .ac-tab-link { padding:9px 16px; font-size:13px; font-weight:600; color:#64748b; text-decoration:none; border-bottom:2px solid transparent; margin-bottom:-1px; }
  .ac-tab-link:hover { color:#1a3a5c; }
  .ac-tab-link.active { color:#1a3a5c; border-bottom-color:#1a3a5c; }
  .af-filter-bar { display:flex; gap:10px; margin-bottom:14px; }
  .af-select { border:1px solid #d1d5db; border-radius:8px; padding:9px 12px; font-size:13px; background:#fff; }
  .af-note { font-size:12px; color:#6b7280; background:#f9fafb; border-radius:8px; padding:10px 14px; line-height:1.6; }
  .af-empty-card { background:#fff; border:1px solid #e8edf3; border-radius:12px; padding:32px; text-align:center; color:#6b7280; font-size:13px; }
  .af-summary { display:grid; grid-template-columns:1fr 1fr 1fr; gap:14px; margin-bottom:16px; }
  @media (max-width:900px) { .af-summary { grid-template-columns:1fr; } }
  .af-summary-card { background:#fff; border:1px solid #e8edf3; border-radius:12px; padding:14px 16px; }
  .af-summary-label { font-size:12px; font-weight:700; color:#94a3b8; margin-bottom:8px; }
  .af-summary-val { font-size:22px; font-weight:800; color:#1a3a5c; }
  .af-summary-unit { font-size:11px; font-weight:600; color:#94a3b8; margin-left:4px; }
  .af-legend { display:flex; gap:16px; flex-wrap:wrap; align-items:center; font-size:12px; color:#475569; margin-bottom:16px; }
  .af-legend-item { display:flex; align-items:center; gap:5px; }
  .af-legend-dot { width:12px; height:12px; border-radius:3px; border:1px solid; display:inline-block; }
  .af-star { color:#b91c1c; font-size:10px; margin-left:1px; }
  .af-months-grid { display:grid; grid-template-columns:repeat(3, 1fr); gap:14px; }
  @media (max-width:900px) { .af-months-grid { grid-template-columns:repeat(2, 1fr); } }
  @media (max-width:600px) { .af-months-grid { grid-template-columns:1fr; } }
  .af-month { background:#fff; border:1px solid #e8edf3; border-radius:12px; padding:12px 14px; }
  .af-month-title { font-size:13px; font-weight:700; color:#1a3a5c; margin-bottom:8px; }
  .af-weekday-row, .af-grid { display:grid; grid-template-columns:repeat(7, 1fr); gap:3px; }
  .af-wd { font-size:10px; color:#94a3b8; text-align:center; padding-bottom:3px; }
  .af-cell { aspect-ratio:1; display:flex; align-items:center; justify-content:center; border-radius:5px; font-size:11px; font-weight:600; position:relative; cursor:default; }
  .af-cell-blank { visibility:hidden; }
`;
