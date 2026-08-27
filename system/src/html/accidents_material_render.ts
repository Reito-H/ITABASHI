// 事故防止研修「教材」の共通レンダリング（Web冊子ビューア・印刷ページの両方から呼び出す単一ソース）
// ここでコンテンツ(accidents_material_content.ts)と実データ集計(accident_material_stats.ts)を
// 合成し、1ページ分のHTML断片を作る。外部AI/LLM APIへの通信は行わない。
//
// この教材は印刷してA4縦の冊子として配布するもの（乗務員はこの管理画面にアクセスできない）。
// 対象者(PersonalStats)を指定すると、表紙の氏名欄・個人の事故傾向ページ・まとめページが
// その人の実データで埋まる。指定しない場合はそれらは空欄（手書き用）またはページ自体を省略する。
import { escHtml } from './layout';
import type { MaterialStats, RankedItem, PersonalStats, ThemeId } from '../utils/accident_material_stats';
import { THEME_ORDER } from '../utils/accident_material_stats';
import {
  COVER_CONTENT,
  SUMMARY_INTRO_TEXT,
  DIAG_INTRO_TEXT,
  SELF_DIAG_QUESTIONS,
  DIAG_TYPES,
  type DiagType,
  THEME_CONTENTS,
  type ThemeContent,
  PSYCHOLOGY_SECTIONS,
  type PsychologySection,
  CHECKLIST_SECTIONS,
  CLOSING_VOW,
} from './accidents_material_content';

// ---------------------------------------------------------------------------
// 自作SVGアイコン（AI画像生成は使わず、strokeベースの単色ラインアイコンのみ）
// ---------------------------------------------------------------------------

function iconBook(): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/></svg>`;
}
function iconClock(): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>`;
}
function iconBrain(): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.5.4.8 1 .8 1.7V16h5.6v-.5c0-.7.3-1.3.8-1.7A6 6 0 0 0 12 3z"/></svg>`;
}
function iconTarget(): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/></svg>`;
}
function iconCheck(): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></svg>`;
}
function iconUser(): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 5-6 8-6s6.5 2 8 6"/></svg>`;
}

// ---------------------------------------------------------------------------
// 共通CSS（Web冊子ビューア・印刷ページの<style>ブロックに両方含める）
// 構造系(.sheet/.stage/.toolbar等)はページ側で定義し、ここではページ内デザインのみを持つ。
// ---------------------------------------------------------------------------

export const MATERIAL_PAGE_CSS = `
  .m-page-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; padding-bottom:9px; border-bottom:2px solid #0f766e; }
  .m-page-tag { font-size:12px; font-weight:700; color:#0f766e; letter-spacing:.04em; }
  .m-page-no { font-size:12px; color:#94a3b8; font-weight:600; }
  .m-page-body { font-size:13.5px; color:#1f2937; }
  .m-section-title { font-size:13px; font-weight:700; color:#0f766e; margin:16px 0 9px; padding-left:7px; border-left:4px solid #0f766e; }
  .m-explain { font-size:13.5px; line-height:2; color:#1f2937; margin-bottom:15px; }

  .m-cover { position:relative; display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:265mm; text-align:center; padding-top:8%; }
  .m-cover-icon { color:#0f766e; margin-bottom:22px; }
  .m-cover-icon svg { width:64px; height:64px; }
  .m-cover-title { font-size:32px; font-weight:800; color:#0f172a; margin-bottom:10px; letter-spacing:.02em; }
  .m-cover-subtitle { font-size:15px; color:#475569; margin-bottom:28px; }
  .m-cover-lead { font-size:13.5px; line-height:2.1; color:#334155; max-width:440px; margin:0 auto 4px; }
  .m-cover-themes { display:flex; gap:8px; margin-top:32px; flex-wrap:wrap; justify-content:center; max-width:460px; }
  .m-cover-theme-chip { background:#f0fdfa; border:1px solid #99f6e4; color:#0f766e; border-radius:20px; padding:6px 14px; font-size:12px; font-weight:700; }
  .m-cover-id-block { position:absolute; right:0; bottom:0; text-align:left; }
  .m-cover-id-row { display:flex; align-items:baseline; gap:10px; font-size:12.5px; color:#475569; margin-bottom:9px; }
  .m-cover-id-row:last-child { margin-bottom:0; }
  .m-cover-id-label { width:34px; font-weight:700; color:#0f766e; flex-shrink:0; }
  .m-cover-id-value { font-size:14px; font-weight:700; color:#0f172a; }
  .m-cover-id-blank { display:inline-block; width:150px; border-bottom:1px solid #334155; height:19px; }

  .m-kpis { display:flex; gap:10px; margin-bottom:17px; }
  .m-kpi { flex:1; background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:11px 12px; text-align:center; }
  .m-kpi-label { font-size:10.5px; color:#94a3b8; font-weight:700; }
  .m-kpi-value { font-size:20px; font-weight:800; color:#0f766e; margin-top:4px; }

  .m-bar-list { margin-bottom:6px; }
  .m-bar-row { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
  .m-bar-label { width:120px; font-size:12.5px; color:#334155; flex-shrink:0; }
  .m-bar-track { flex:1; background:#f1f5f9; border-radius:4px; height:14px; overflow:hidden; }
  .m-bar-fill { background:#0f766e; height:100%; border-radius:4px; }
  .m-bar-val { width:92px; text-align:right; font-size:12px; color:#64748b; flex-shrink:0; }

  .m-scene { background:#f8fafc; border:1px solid #cbd5e1; border-left:4px solid #0f766e; border-radius:8px; padding:15px 17px; font-size:13.5px; line-height:2; color:#1e293b; margin-bottom:17px; }
  .m-scene-label { font-size:11px; font-weight:700; color:#0f766e; margin-bottom:7px; display:flex; align-items:center; gap:4px; }
  .m-scene-label svg { width:13px; height:13px; }

  .m-quiz-q { font-size:15px; font-weight:700; color:#0f172a; margin-bottom:11px; }
  .m-quiz-choices { margin-bottom:11px; }
  .m-quiz-choice { border:1px solid #94a3b8; border-radius:8px; padding:11px 15px; margin-bottom:9px; font-size:13px; line-height:1.7; }
  .m-quiz-hint { font-size:11px; color:#94a3b8; }

  .m-answer-list { margin-bottom:17px; }
  .m-answer-item { display:flex; gap:10px; padding:10px 0; border-bottom:1px dashed #cbd5e1; }
  .m-answer-item:last-child { border-bottom:none; }
  .m-answer-mark { width:21px; height:21px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:12.5px; font-weight:800; flex-shrink:0; background:#f1f5f9; color:#94a3b8; }
  .m-answer-item.is-correct .m-answer-mark { background:#dcfce7; color:#16a34a; }
  .m-answer-choice-text { font-size:12.5px; font-weight:700; color:#1e293b; margin-bottom:2px; }
  .m-answer-item.is-correct .m-answer-choice-text { color:#166534; }
  .m-answer-feedback { font-size:12px; line-height:1.75; color:#64748b; }

  .m-psy-note { background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:13px 15px; font-size:12.5px; line-height:1.85; color:#1e3a5f; margin-bottom:17px; }
  .m-psy-note-title { display:flex; align-items:center; gap:6px; font-weight:700; margin-bottom:5px; color:#1d4ed8; }
  .m-psy-note-title svg { width:18px; height:18px; }

  .m-theme-stat-box { background:#f0fdfa; border:1px solid #99f6e4; border-radius:8px; padding:15px; text-align:center; }
  .m-theme-stat-value { font-size:28px; font-weight:800; color:#0f766e; }
  .m-theme-stat-label { font-size:12px; color:#0f766e; margin-top:2px; }

  .m-psy-title { display:flex; align-items:center; gap:8px; font-size:18px; font-weight:800; color:#0f172a; margin-bottom:17px; }
  .m-psy-title svg { width:23px; height:23px; color:#0f766e; }

  .m-diag-list { list-style:none; padding:0; margin:0; }
  .m-diag-item { display:flex; align-items:flex-start; gap:10px; padding:10px 0; border-bottom:1px dashed #cbd5e1; font-size:13px; color:#1e293b; }
  .m-diag-check { width:16px; height:16px; margin-top:1px; flex-shrink:0; accent-color:#0f766e; }
  .m-checklist-cat { font-size:13px; font-weight:700; color:#0f766e; margin:16px 0 7px; }
  .m-checklist-cat:first-child { margin-top:0; }
  .m-checklist-item { display:flex; align-items:flex-start; gap:10px; padding:7px 0; font-size:13px; color:#1e293b; }

  .m-tally-list { margin-bottom:17px; }
  .m-tally-row { display:flex; justify-content:space-between; align-items:center; padding:11px 4px; border-bottom:1px dashed #94a3b8; font-size:14px; color:#1e293b; }
  .m-tally-box { border:1px solid #94a3b8; border-radius:6px; width:78px; height:32px; display:inline-flex; align-items:center; justify-content:center; font-size:12px; color:#94a3b8; }
  .m-tally-result { font-size:14px; color:#1e293b; }
  .m-tally-blank { display:inline-block; width:220px; border-bottom:1px solid #334155; margin-left:8px; }

  .m-personal-empty { background:#f0fdfa; border:1px solid #99f6e4; border-radius:8px; padding:16px; font-size:13.5px; line-height:2; color:#0f766e; }

  .m-advice-card { background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:15px 17px; margin-bottom:15px; }
  .m-advice-name { font-size:15px; font-weight:800; color:#0f172a; margin-bottom:5px; }
  .m-advice-desc { font-size:12.5px; color:#475569; line-height:1.8; margin-bottom:11px; }
  .m-advice-title { display:flex; align-items:center; gap:6px; font-size:13px; font-weight:700; color:#0f766e; margin-bottom:7px; }
  .m-advice-title svg { width:16px; height:16px; }
  .m-advice-body { margin:0; padding-left:19px; font-size:12.5px; line-height:1.85; color:#1f2937; }
  .m-advice-body li { margin-bottom:4px; }

  .m-vow-title { display:flex; align-items:center; gap:8px; font-size:19px; font-weight:800; color:#0f172a; margin-bottom:15px; }
  .m-vow-title svg { width:23px; height:23px; color:#0f766e; }
  .m-vow-type-box { display:flex; align-items:flex-start; gap:10px; background:#f0fdfa; border:1px solid #99f6e4; border-radius:8px; padding:12px 15px; font-size:13px; line-height:1.9; color:#0f172a; margin-bottom:15px; }
  .m-vow-type-box b { color:#0f766e; }
  .m-vow-type-icon { flex-shrink:0; color:#0f766e; }
  .m-vow-type-icon svg { width:20px; height:20px; display:block; }
  .m-vow-list { margin:15px 0 18px; }
  .m-vow-item { display:flex; align-items:flex-start; gap:12px; font-size:13.5px; line-height:1.8; color:#1e293b; padding:11px 13px; background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; margin-bottom:10px; }
  .m-vow-num { width:22px; height:22px; border-radius:50%; background:#0f766e; color:#fff; font-size:11px; font-weight:700; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .m-vow-sign { display:flex; gap:40px; margin:18px 0 20px; }
  .m-vow-sign-field { display:flex; align-items:center; gap:8px; font-size:12.5px; color:#64748b; }
  .m-vow-sign-blank { display:inline-block; width:140px; border-bottom:1px solid #334155; height:20px; }

  .m-report-lines { margin-bottom:18px; }
  .m-report-line { border-bottom:1px solid #94a3b8; height:27px; }
  .m-closing-wrap { padding-bottom:24mm; }

  /* .sheet-fit（自動縮小の対象）の外に置き、.sheet基準の絶対位置に固定することで、
     上の内容がどれだけ長くなっても印鑑欄が押し出されたり2枚目にはみ出したりしないようにする */
  .m-stamp-footer { position:absolute; right:18mm; bottom:16mm; display:flex; justify-content:flex-end; }
  .m-stamp-row { display:flex; gap:16px; }
  .m-stamp-box { display:flex; flex-direction:column; align-items:center; gap:5px; }
  .m-stamp-frame { width:48px; height:48px; border:1.5px solid #64748b; border-radius:4px; }
  .m-stamp-label { font-size:10.5px; color:#475569; }

  .m-merged-divider { margin-top:6px; padding-top:15px; border-top:1px dashed #94a3b8; }
`;

// ---------------------------------------------------------------------------
// A4シート(.sheet-fit)のフィット（複数枚版）。印刷ページで querySelectorAll ループ適用する。
// Web冊子ビューアでは、各ページごとに1回だけ同じロジックを適用する（見た目の一致を保証する核）。
// ---------------------------------------------------------------------------

export const FIT_ALL_SHEETS_SCRIPT = `
function fitAllSheets() {
  var pxPerMm = 96 / 25.4;
  var availablePx = (297 - 32) * pxPerMm;
  document.querySelectorAll('.sheet-fit').forEach(function (fit) {
    fit.style.transform = 'none';
    fit.style.width = '100%';
    // 幅を広げて縮小率を掛けるたびに文字の折り返しが変わり必要な高さも変わるため、
    // 収まるまで数回繰り返して収束させる（1回きりの補正だと余白1枚だけの空白ページが出ることがあった）
    var scale = 1;
    for (var i = 0; i < 6; i++) {
      var natural = fit.scrollHeight;
      if (natural <= 0 || natural * scale <= availablePx) break;
      scale = (availablePx / natural) * 0.97;
      fit.style.width = (100 / scale) + '%';
      fit.style.transform = 'scale(' + scale + ')';
    }
  });
}
`;

// ---------------------------------------------------------------------------
// ページ組み立てヘルパー
// ---------------------------------------------------------------------------

function renderPageShell(tag: string, pageNo: number, total: number, bodyHtml: string): string {
  return `<div class="m-page-head"><div class="m-page-tag">${escHtml(tag)}</div><div class="m-page-no">${pageNo} / ${total}</div></div><div class="m-page-body">${bodyHtml}</div>`;
}

function renderBarList(items: RankedItem[], limit = 5): string {
  const top = items.slice(0, limit);
  const max = Math.max(...top.map(i => i.cnt), 1);
  return `<div class="m-bar-list">${top
    .map(
      i => `<div class="m-bar-row">
      <div class="m-bar-label">${escHtml(i.key)}</div>
      <div class="m-bar-track"><div class="m-bar-fill" style="width:${Math.round((i.cnt / max) * 100)}%"></div></div>
      <div class="m-bar-val">${i.cnt}件（${i.pct}%）</div>
    </div>`
    )
    .join('')}</div>`;
}

function themeLabel(id: ThemeId): string {
  return THEME_CONTENTS.find(t => t.id === id)?.shortLabel ?? id;
}

// ---------------------------------------------------------------------------
// P1 表紙
// ---------------------------------------------------------------------------

function renderCoverBody(personal: PersonalStats | null): string {
  const chips = THEME_CONTENTS.map(t => `<div class="m-cover-theme-chip">${escHtml(t.shortLabel)}</div>`).join('');
  const leads = COVER_CONTENT.leadParagraphs.map(p => `<div class="m-cover-lead">${escHtml(p)}</div>`).join('');
  const idRow = (label: string, value: string | null) =>
    `<div class="m-cover-id-row"><span class="m-cover-id-label">${escHtml(label)}</span>${
      value ? `<span class="m-cover-id-value">${escHtml(value)}</span>` : `<span class="m-cover-id-blank"></span>`
    }</div>`;
  return `<div class="m-cover">
    <div class="m-cover-icon">${iconBook()}</div>
    <div class="m-cover-title">${escHtml(COVER_CONTENT.title)}</div>
    <div class="m-cover-subtitle">${escHtml(COVER_CONTENT.subtitle)}</div>
    ${leads}
    <div class="m-cover-themes">${chips}</div>
    <div class="m-cover-id-block">
      ${idRow('課', personal?.division != null ? `${personal.division}課` : null)}
      ${idRow('班', personal?.team ?? null)}
      ${idRow('氏名', personal?.name ?? null)}
    </div>
  </div>`;
}

// ---------------------------------------------------------------------------
// P2 全社統計サマリー
// ---------------------------------------------------------------------------

function renderSummaryBody(stats: MaterialStats): string {
  const peakLabel = stats.peakHourLabels.map(h => `${escHtml(h.label)}（${h.cnt}件）`).join(' ／ ');
  return `
    <div class="m-explain">${escHtml(SUMMARY_INTRO_TEXT)}</div>
    <div class="m-kpis">
      <div class="m-kpi"><div class="m-kpi-label">集計事故件数</div><div class="m-kpi-value">${stats.totalCount}件</div></div>
      <div class="m-kpi"><div class="m-kpi-label">単独物損事故</div><div class="m-kpi-value">${stats.soloObjectCount}件</div></div>
      <div class="m-kpi"><div class="m-kpi-label">乾燥路面での発生</div><div class="m-kpi-value">${stats.dryRoadPct}%</div></div>
    </div>
    <div class="m-section-title">直接原因 上位</div>
    ${renderBarList(stats.causeDirectRanking, 5)}
    <div class="m-section-title">発生時間帯</div>
    <div class="m-explain">特に事故が多いのは ${peakLabel} の時間帯です。縁石・ポール・電柱など構造物との単独事故も${stats.soloObjectCount}件と多く発生しています。</div>
  `;
}

// ---------------------------------------------------------------------------
// P3 危険傾向 自己診断
// ---------------------------------------------------------------------------

function renderDiagQuestionBody(): string {
  const items = SELF_DIAG_QUESTIONS.map(
    q => `<label class="m-diag-item"><input type="checkbox" class="m-diag-check" data-axis="${q.axis}"><span>${escHtml(q.text)}</span></label>`
  ).join('');
  return `<div class="m-explain">${escHtml(DIAG_INTRO_TEXT)}</div><div class="m-diag-list">${items}</div>`;
}

// ---------------------------------------------------------------------------
// 個人の事故傾向ページ（対象者を選んだ場合のみ挿入）
// ---------------------------------------------------------------------------

function renderPersonalAnalysisBody(personal: PersonalStats, themeCasePageNo: Record<ThemeId, number>): string {
  if (personal.totalCount === 0) {
    return `<div class="m-personal-empty">${escHtml(
      personal.name
    )}さんは、現在事故記録がありません。素晴らしい記録です。このまま安全運転を継続しつつ、この後の事例も参考にしてください。</div>`;
  }
  const narrative = personal.dominantTheme
    ? `${escHtml(personal.name)}さんの事故記録を分析すると、「${escHtml(
        themeLabel(personal.dominantTheme)
      )}」に関連する傾向が特に多く見られます（${themeCasePageNo[personal.dominantTheme]}ページの事例を重点的に確認しましょう）。`
    : `${escHtml(personal.name)}さんの事故記録には、特定の偏った傾向は見られませんでした。どのテーマも自分ごととして確認しましょう。`;
  return `
    <div class="m-explain">${narrative}</div>
    <div class="m-kpis">
      <div class="m-kpi"><div class="m-kpi-label">累計事故件数</div><div class="m-kpi-value">${personal.totalCount}件</div></div>
    </div>
    <div class="m-section-title">原因の内訳</div>
    ${renderBarList(personal.causeDirectRanking, 6)}
  `;
}

// ---------------------------------------------------------------------------
// P5-14 テーマ別 事例×クイズ
// ---------------------------------------------------------------------------

function renderThemeCaseBody(theme: ThemeContent): string {
  const choicesHtml = theme.choices
    .map(
      (c, i) => `<div class="m-quiz-choice">
      <div class="m-quiz-choice-text">${String.fromCharCode(65 + i)}. ${escHtml(c.text)}</div>
    </div>`
    )
    .join('');
  return `
    <div class="m-scene">
      <div class="m-scene-label">${iconClock()}${escHtml(theme.sceneLabel)}</div>
      <div>${escHtml(theme.sceneText)}</div>
    </div>
    <div class="m-quiz-q">Q. ${escHtml(theme.question)}</div>
    <div class="m-quiz-choices">${choicesHtml}</div>
    <div class="m-quiz-hint">自分ならどうするか考えたら、次のページで解答・解説を確認しましょう。</div>
  `;
}

// 事例クイズと解答・解説を1ページに統合したもの（旧版はこの2つを別ページに分けており、
// ページ数が不必要に膨らむ原因になっていたため統合した。auto-shrink(fitAllSheets)で1枚に収まる）
function renderThemeFullBody(theme: ThemeContent, stats: MaterialStats): string {
  return `${renderThemeCaseBody(theme)}<div class="m-merged-divider">${renderThemeStatsBody(theme, stats)}</div>`;
}

function renderThemeStatsBody(theme: ThemeContent, stats: MaterialStats): string {
  const themeStat = stats.themes[theme.id];
  const extraStat =
    theme.id === 'impatience' && stats.impatienceByBusinessStatus.length
      ? `<div class="m-section-title">「焦り」原因の事故 ― 営業状況別</div>${renderBarList(stats.impatienceByBusinessStatus, 4)}`
      : '';
  const answerItems = theme.choices
    .map(
      (c, i) => `<div class="m-answer-item${c.correct ? ' is-correct' : ''}">
      <div class="m-answer-mark">${c.correct ? '○' : '×'}</div>
      <div>
        <div class="m-answer-choice-text">${String.fromCharCode(65 + i)}. ${escHtml(c.text)}</div>
        <div class="m-answer-feedback">${escHtml(c.feedback)}</div>
      </div>
    </div>`
    )
    .join('');
  return `
    <div class="m-section-title">解答・解説</div>
    <div class="m-answer-list">${answerItems}</div>
    <div class="m-explain">${escHtml(theme.explanation)}</div>
    <div class="m-psy-note"><div class="m-psy-note-title">${iconBrain()}<span>心理学の視点</span></div>${escHtml(theme.psychologyNote)}</div>
    <div class="m-theme-stat-box">
      <div class="m-theme-stat-value">${themeStat.cnt}件</div>
      <div class="m-theme-stat-label">全事故のうち ${themeStat.pct}% がこのテーマに関連しています</div>
    </div>
    ${extraStat}
  `;
}

// ---------------------------------------------------------------------------
// なぜ事故は起きるのか（心理学的解説）
// ---------------------------------------------------------------------------

function renderPsychologyBody(section: PsychologySection): string {
  const paragraphs = section.paragraphs.map(p => `<div class="m-explain">${escHtml(p)}</div>`).join('');
  return `<div class="m-psy-title">${iconBrain()}<span>${escHtml(section.title)}</span></div>${paragraphs}`;
}

// 心理学解説2ページ分を1ページに統合したもの（ページ数削減のため）
function renderPsychologyFullBody(): string {
  return `${renderPsychologyBody(PSYCHOLOGY_SECTIONS.page15)}<div class="m-merged-divider">${renderPsychologyBody(PSYCHOLOGY_SECTIONS.page16)}</div>`;
}

// ---------------------------------------------------------------------------
// 自己診断タイプ別アドバイス
// ---------------------------------------------------------------------------

function renderDiagAdviceBody(types: DiagType[]): string {
  return types
    .map(
      t => `<div class="m-advice-card">
      <div class="m-advice-name">${escHtml(t.name)}</div>
      <div class="m-advice-desc">${escHtml(t.shortDesc)}</div>
      <div class="m-advice-title">${iconTarget()}<span>${escHtml(t.adviceTitle)}</span></div>
      <ul class="m-advice-body">${t.adviceBody.map(b => `<li>${escHtml(b)}</li>`).join('')}</ul>
    </div>`
    )
    .join('');
}

// ---------------------------------------------------------------------------
// 自己チェックリスト
// ---------------------------------------------------------------------------

function renderChecklistBody(): string {
  return CHECKLIST_SECTIONS.map(
    sec => `<div class="m-checklist-cat">${escHtml(sec.category)}</div><div class="m-checklist-items">${sec.items
      .map(item => `<label class="m-checklist-item"><input type="checkbox" class="m-diag-check"><span>${escHtml(item)}</span></label>`)
      .join('')}</div>`
  ).join('');
}

// ---------------------------------------------------------------------------
// まとめ・宣言書
// ---------------------------------------------------------------------------

function renderClosingBody(personal: PersonalStats | null, themeCasePageNo: Record<ThemeId, number>): string {
  const typeBox =
    personal && personal.totalCount > 0 && personal.dominantTheme
      ? `<div class="m-vow-type-box"><div class="m-vow-type-icon">${iconUser()}</div><div><b>${escHtml(
          personal.name
        )}さんのタイプ：</b>「${escHtml(themeLabel(personal.dominantTheme))}」の傾向が多く見られます（${
          themeCasePageNo[personal.dominantTheme]
        }ページ参照）。日々の運転でこの点を特に意識しましょう。</div></div>`
      : personal
        ? `<div class="m-vow-type-box"><div class="m-vow-type-icon">${iconUser()}</div><div><b>${escHtml(
            personal.name
          )}さんへ：</b>現在事故記録はありません。この調子で基本動作を継続しましょう。</div></div>`
        : '';
  const items = CLOSING_VOW.commitments
    .map((c, i) => `<div class="m-vow-item"><span class="m-vow-num">${i + 1}</span><span>${escHtml(c)}</span></div>`)
    .join('');
  const staffLines = Array.from({ length: 3 })
    .map(() => `<div class="m-report-line"></div>`)
    .join('');
  const reportLines = Array.from({ length: 4 })
    .map(() => `<div class="m-report-line"></div>`)
    .join('');
  return `
    <div class="m-closing-wrap">
      <div class="m-vow-title">${iconCheck()}<span>${escHtml(CLOSING_VOW.title)}</span></div>
      ${typeBox}
      <div class="m-explain">${escHtml(CLOSING_VOW.leadText)}</div>
      <div class="m-vow-list">${items}</div>
      <div class="m-vow-sign">
        <div class="m-vow-sign-field"><span>${escHtml(CLOSING_VOW.dateLabel)}</span><span class="m-vow-sign-blank"></span></div>
        <div class="m-vow-sign-field"><span>${escHtml(CLOSING_VOW.signatureLabel)}</span><span class="m-vow-sign-blank"></span></div>
      </div>
      <div class="m-section-title">乗務社員記入欄</div>
      <div class="m-report-lines">${staffLines}</div>
      <div class="m-section-title">指導者記入欄</div>
      <div class="m-report-lines">${reportLines}</div>
    </div>
  `;
}

// 印鑑欄は.sheet-fit（自動縮小の対象）の外に置くため、本文とは別に返す。
// 呼び出し側(print/viewer)で.sheet-fitの兄弟要素として配置すること。
export function renderClosingStampFooterHtml(): string {
  return `<div class="m-stamp-footer">
    <div class="m-stamp-row">
      <div class="m-stamp-box"><div class="m-stamp-frame"></div><div class="m-stamp-label">課長</div></div>
      <div class="m-stamp-box"><div class="m-stamp-frame"></div><div class="m-stamp-label">班長</div></div>
      <div class="m-stamp-box"><div class="m-stamp-frame"></div><div class="m-stamp-label">事故担当</div></div>
    </div>
  </div>`;
}

// ---------------------------------------------------------------------------
// 全ページの組み立て（対象者の有無でページ構成・総ページ数が変わる）
// ---------------------------------------------------------------------------

export interface MaterialSheet {
  body: string;
  // .sheet-fit（自動縮小の対象）の外側にそのまま差し込む追加要素（印鑑欄など）。
  // 呼び出し側は .sheet-fit の兄弟要素として配置すること。
  stampFooterHtml?: string;
}

export function renderMaterialSheetsInner(stats: MaterialStats, personal: PersonalStats | null): MaterialSheet[] {
  const orderedThemes: ThemeContent[] = THEME_ORDER.map(id => THEME_CONTENTS.find(t => t.id === id)).filter(
    (t): t is ThemeContent => !!t
  );
  const hasPersonalPage = !!personal;

  // ページ構成は固定パターンなので、実際に本文を組み立てる前に各ページの番号を求められる。
  // 個人の事故傾向ページ（対象者選択時のみ）が挿入される分、以降の番号が1つずれる。
  // 事例と解答・解説、心理学解説2本、アドバイス2本はそれぞれ1ページに統合済み（旧版はページ数が
  // 無駄に多かったため、1ページに収まる内容は極力1ページにまとめている）。
  let n = 3; // 1:表紙 2:全社統計サマリー 3:自己診断
  if (hasPersonalPage) n++;
  const themeCasePageNo = {} as Record<ThemeId, number>;
  for (const theme of orderedThemes) {
    n++;
    themeCasePageNo[theme.id] = n;
  }
  n += 1; // なぜ事故は起きるのか（統合1ページ）
  n += 1; // 自己診断タイプ別アドバイス（統合1ページ）
  n += 1; // 自己チェックリスト
  n += 1; // まとめ・宣言書
  const total = n;

  const pages: MaterialSheet[] = [];
  let pos = 0;

  pos++;
  pages.push({ body: renderPageShell('表紙', pos, total, renderCoverBody(personal)) });
  pos++;
  pages.push({ body: renderPageShell('全社統計サマリー', pos, total, renderSummaryBody(stats)) });
  pos++;
  pages.push({ body: renderPageShell('危険傾向 自己診断', pos, total, renderDiagQuestionBody()) });

  if (hasPersonalPage && personal) {
    pos++;
    pages.push({ body: renderPageShell(`${personal.name}さんの事故傾向`, pos, total, renderPersonalAnalysisBody(personal, themeCasePageNo)) });
  }

  for (const theme of orderedThemes) {
    pos++;
    pages.push({ body: renderPageShell(`事例${theme.no} ${theme.title}`, pos, total, renderThemeFullBody(theme, stats)) });
  }

  pos++;
  pages.push({ body: renderPageShell('なぜ事故は起きるのか', pos, total, renderPsychologyFullBody()) });
  pos++;
  pages.push({ body: renderPageShell('自己診断タイプ別アドバイス', pos, total, renderDiagAdviceBody(DIAG_TYPES)) });
  pos++;
  pages.push({ body: renderPageShell('自己チェックリスト', pos, total, renderChecklistBody()) });
  pos++;
  pages.push({
    body: renderPageShell('まとめ・宣言書', pos, total, renderClosingBody(personal, themeCasePageNo)),
    stampFooterHtml: renderClosingStampFooterHtml(),
  });

  return pages;
}
