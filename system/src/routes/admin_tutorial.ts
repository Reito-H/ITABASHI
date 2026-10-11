// =====================================================================
// チュートリアル（かんたん使い方ガイド）
//   /settings/tutorial          … ガイド本体（本文は html/tutorial_content.ts）
//   /settings/tutorial/img/*    … 画面写真（R2 DOCUMENTS_BUCKET の tutorial/<name>.webp）
// 権限キーは settings.tutorial（permissions.ts の PATH_PERMISSIONS で /settings/tutorial 配下をまとめて判定）。
// 本文の各節には data-perm-key が付いており、index.ts の filterHtmlByPermissions で
// アカウント権限のない機能の説明は自動的に消える。
// 画面写真の撮り直し手順は scripts/tutorial_screenshots/README.md を参照。
// =====================================================================
import { Hono } from 'hono';
import type { Env } from '../auth';
import { layout } from '../html/layout';
import { settingsSubHeader } from './admin';
import { renderTutorialBody } from '../html/tutorial_content';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

app.get('/settings/tutorial/img/:name', async (c) => {
  const name = c.req.param('name');
  if (!/^[a-z0-9_]+\.webp$/.test(name)) return c.text('Not found', 404);
  const obj = await c.env.DOCUMENTS_BUCKET.get('tutorial/' + name);
  if (!obj) return c.text('Not found', 404);
  return new Response(obj.body, {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'private, max-age=86400',
    },
  });
});

app.get('/settings/tutorial', (c) => {
  const html = settingsSubHeader('チュートリアル — かんたん使い方ガイド') + `
<style>
  /* 文字は大きめ・行間広め。年配の方がスマホで読んでも疲れないサイズにする */
  .tut-body { max-width:860px; font-family:'Hiragino Sans','Meiryo',sans-serif; color:#1f2937; line-height:1.9; font-size:16px; }
  .tut-body p { margin:0 0 10px; }
  .tut-toolbar { display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom:20px; }
  .print-btn { padding:10px 22px; background:#1e3a5f; color:white; border:none; border-radius:8px; font-size:15px; font-weight:700; cursor:pointer; }
  .tut-top-btn { position:fixed; right:24px; bottom:150px; z-index:50; padding:10px 14px; background:#fff; color:#1e3a5f; border:2px solid #1e3a5f; border-radius:999px; font-size:14px; font-weight:700; cursor:pointer; box-shadow:0 4px 10px rgba(0,0,0,0.15); display:none; }

  .tut-cover { text-align:center; padding:44px 16px 36px; border-bottom:4px solid #1e3a5f; margin-bottom:28px; background:linear-gradient(180deg,#f8fafc,#fff); border-radius:12px 12px 0 0; }
  .tut-cover-kicker { font-size:12px; letter-spacing:0.25em; color:#6b7280; margin-bottom:10px; }
  .tut-cover-title { font-size:34px; font-weight:900; color:#1e3a5f; letter-spacing:0.06em; line-height:1.35; margin-bottom:14px; }
  .tut-cover-sub { font-size:15px; color:#4b5563; margin-bottom:4px; }

  .tut-find { background:#fffbeb; border:2px solid #fcd34d; border-radius:12px; padding:18px 20px; margin-bottom:24px; }
  .tut-find-title { font-size:18px; font-weight:800; color:#92400e; margin-bottom:10px; }
  .tut-task-group { display:flex; gap:10px; align-items:flex-start; margin-bottom:10px; }
  .tut-task-group-label { flex-shrink:0; width:92px; font-size:13px; font-weight:800; color:#92400e; padding-top:9px; }
  .tut-tasks { display:flex; flex-wrap:wrap; gap:8px; }
  @media (max-width:700px) { .tut-task-group { flex-direction:column; gap:4px; } .tut-task-group-label { width:auto; padding-top:0; } .tut-top-btn { right:12px; bottom:210px; padding:8px 10px; font-size:12px; } }
  .tut-task { display:inline-block; padding:8px 14px; background:#fff; border:1px solid #f59e0b; border-radius:999px; color:#92400e; font-size:15px; text-decoration:none; }
  .tut-task:hover { background:#fef3c7; }
  .tut-search { display:flex; align-items:center; gap:10px; font-size:15px; font-weight:700; color:#92400e; }
  .tut-search input { flex:1; min-width:0; font-size:17px; padding:10px 14px; border:2px solid #f59e0b; border-radius:10px; background:#fff; }

  .tut-toc { background:#f8fafc; border:1px solid #e5e7eb; border-radius:12px; padding:20px 24px; margin-bottom:32px; }
  .tut-toc h3 { font-size:14px; font-weight:800; color:#6b7280; letter-spacing:0.12em; margin:0 0 10px; }
  .tut-toc-ch { margin-bottom:10px; }
  .tut-toc-section { font-size:14px; font-weight:800; color:#1e3a5f; margin:10px 0 4px; }
  .tut-toc a { display:block; font-size:15px; color:#1e3a5f; text-decoration:none; padding:4px 0 4px 12px; }
  .tut-toc a:hover { text-decoration:underline; }

  .tut-chapter { border-left:6px solid #1e3a5f; padding-left:16px; margin:44px 0 10px; }
  .tut-chapter h2 { font-size:26px; font-weight:900; color:#1e3a5f; margin:0; }
  .tut-chapter-label { font-size:12px; color:#6b7280; font-weight:700; letter-spacing:0.12em; }
  .tut-intro { font-size:16px; color:#374151; background:#f1f5f9; border-radius:10px; padding:12px 16px; margin:12px 0 8px; }

  .tut-section { margin-top:34px; padding-top:26px; border-top:2px solid #e5e7eb; }
  .tut-section h3 { font-size:22px; font-weight:800; color:#1e3a5f; margin:0 0 10px; display:flex; align-items:center; gap:10px; line-height:1.3; }
  .tut-num { display:inline-flex; align-items:center; justify-content:center; min-width:52px; height:30px; padding:0 8px; background:#1e3a5f; color:#fff; border-radius:8px; font-size:14px; font-weight:800; flex-shrink:0; }
  .tut-lead { font-size:17px; color:#111827; }
  .tut-open { display:flex; gap:10px; align-items:center; font-size:15px; color:#1e3a5f; background:#eef2ff; border-radius:8px; padding:8px 12px; }
  .tut-open-label { background:#1e3a5f; color:#fff; font-size:12px; font-weight:800; padding:2px 8px; border-radius:6px; flex-shrink:0; }
  .tut-can { background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:12px 16px; margin:12px 0; }
  .tut-can-title { font-size:14px; font-weight:800; color:#166534; margin-bottom:4px; }
  .tut-can ul { margin:0; padding-left:22px; font-size:15px; }
  .tut-can li { margin:3px 0; }

  .tut-fig { margin:18px 0; padding:12px; background:#f8fafc; border:1px solid #e5e7eb; border-radius:12px; }
  .tut-fig img { display:block; width:100%; height:auto; border:1px solid #d1d5db; border-radius:8px; background:#fff; }
  .tut-fig-narrow img { max-width:380px; margin:0 auto; }
  .tut-fig figcaption { font-size:14px; color:#4b5563; margin-top:8px; text-align:center; }
  .tut-marks { list-style:none; padding:0; margin:12px 0 0; display:grid; grid-template-columns:1fr; gap:6px; }
  .tut-marks li { display:flex; gap:10px; align-items:flex-start; font-size:15px; }
  .tut-mk { display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px; border-radius:50%; background:#dc2626; color:#fff; font-weight:800; font-size:14px; flex-shrink:0; margin-top:3px; }
  @media (min-width:700px) { .tut-marks { grid-template-columns:1fr 1fr; } }

  .tut-steps-block { margin:14px 0; }
  .tut-steps-title { font-size:16px; font-weight:800; color:#1e3a5f; margin-bottom:6px; padding-left:10px; border-left:4px solid #1e3a5f; }
  .tut-steps { counter-reset:step; list-style:none; padding:0; margin:6px 0; }
  .tut-steps li { counter-increment:step; display:flex; gap:12px; margin-bottom:8px; font-size:16px; }
  .tut-steps li::before { content:counter(step); display:inline-flex; align-items:center; justify-content:center; min-width:28px; height:28px; background:#dbeafe; color:#1e3a5f; border-radius:50%; font-size:14px; font-weight:800; flex-shrink:0; margin-top:2px; }
  .tut-note, .tut-tip, .tut-warn { border-radius:8px; padding:10px 14px; font-size:15px; margin:10px 0; display:flex; gap:10px; align-items:flex-start; }
  .tut-note { background:#fffbeb; border:1px solid #fde68a; color:#92400e; }
  .tut-tip  { background:#f0fdf4; border:1px solid #86efac; color:#166534; }
  .tut-warn { background:#fef2f2; border:1px solid #fecaca; color:#991b1b; }
  .tut-note-label { font-size:12px; font-weight:800; padding:2px 8px; border-radius:6px; background:rgba(0,0,0,0.08); flex-shrink:0; margin-top:3px; }
  .tut-footer { margin-top:48px; padding-top:16px; border-top:2px dashed #e5e7eb; font-size:13px; color:#6b7280; text-align:center; }
  .tut-hidden { display:none !important; }

  @media print {
    @page { size: A4 portrait; margin: 14mm 16mm; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .sidebar, .sidebar-overlay, .mobile-header, .desktop-header,
    .no-print, .print-btn, .tut-top-btn, #report-fab-wrap, #phone-search-wrap { display: none !important; }
    .main-content { margin-left: 0 !important; }
    .page-content { padding: 0 !important; }
    body { background: white !important; }
    .tut-body { max-width: 100% !important; font-size:13px; }
    .tut-cover { break-after: page; page-break-after: always; }
    .tut-toc  { break-after: page; page-break-after: always; }
    .tut-chapter { break-before: page; page-break-before: always; margin-top:0; }
    .tut-section { break-inside: avoid; page-break-inside: avoid; }
    .tut-fig, .tut-steps-block, .tut-note, .tut-tip, .tut-warn { break-inside: avoid; page-break-inside: avoid; }
    .tut-fig img { max-height: 120mm; width:auto; max-width:100%; margin:0 auto; }
    .tut-marks { grid-template-columns:1fr 1fr; }
    a { color: inherit !important; text-decoration: none !important; }
  }
</style>

<div class="tut-toolbar no-print">
  <button class="print-btn" onclick="window.print()">印刷 / PDF保存</button>
  <span style="font-size:13px;color:#6b7280;">印刷すると「やりたいことから探す」は省かれ、目次と本文だけがA4で出ます</span>
</div>
<button class="tut-top-btn" id="tut-top-btn" onclick="window.scrollTo({top:0,behavior:'smooth'})">↑ いちばん上へ</button>

<div class="tut-body">
${renderTutorialBody()}
</div>

<script>
(function(){
  // ことばで探す: 節の見出し・本文・やりたいこと（data-keywords）と本文テキストを対象に絞り込む
  var input = document.getElementById('tut-search');
  var empty = document.getElementById('tut-search-empty');
  var sections = Array.prototype.slice.call(document.querySelectorAll('.tut-section'));
  var chapters = Array.prototype.slice.call(document.querySelectorAll('.tut-chapter-wrap'));
  var toc = document.querySelector('.tut-toc');
  function norm(s){ return (s || '').toLowerCase().replace(/[\\s　]+/g, ''); }
  function apply(){
    var q = norm(input.value);
    var hit = 0;
    sections.forEach(function(sec){
      var text = norm(sec.getAttribute('data-keywords') + ' ' + sec.textContent);
      var show = !q || text.indexOf(q) >= 0;
      sec.classList.toggle('tut-hidden', !show);
      if (show) hit++;
    });
    chapters.forEach(function(ch){
      var any = ch.querySelectorAll('.tut-section:not(.tut-hidden)').length > 0;
      ch.classList.toggle('tut-hidden', !any);
    });
    if (toc) toc.classList.toggle('tut-hidden', !!q);
    empty.style.display = (q && hit === 0) ? '' : 'none';
  }
  if (input) {
    input.addEventListener('input', apply);
    input.addEventListener('search', apply);
  }
  // 「いちばん上へ」ボタン: スクロールしたら出す
  var topBtn = document.getElementById('tut-top-btn');
  window.addEventListener('scroll', function(){
    topBtn.style.display = window.scrollY > 600 ? 'block' : 'none';
  }, { passive: true });
  // 目次・やりたいことのリンク: ヘッダーに隠れないよう少し上にずらす
  document.querySelectorAll('a[href^="#sec-"]').forEach(function(a){
    a.addEventListener('click', function(e){
      var el = document.querySelector(a.getAttribute('href'));
      if (!el) return;
      e.preventDefault();
      if (input && input.value) { input.value = ''; apply(); }
      var y = el.getBoundingClientRect().top + window.scrollY - 70;
      window.scrollTo({ top: y, behavior: 'smooth' });
      history.replaceState(null, '', a.getAttribute('href'));
    });
  });
})();
</script>
`;
  return c.html(layout('チュートリアル', html, 'settings'));
});

export default app;
