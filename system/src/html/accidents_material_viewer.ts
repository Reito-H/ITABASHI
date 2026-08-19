// 事故防止研修教材 Web冊子ビューア（/accidents/material）
// この教材は印刷してA4縦の冊子として乗務員に配布するもの。乗務員はこの管理画面に一切アクセスできないため、
// Web版はあくまで管理者が印刷前にページをめくって内容を確認するためのプレビューであり、クイズや自己診断への
// 入力・クリック操作は前提としない（クイズの解答・自己診断の集計はすべて印刷したページに手書きで行う）。
// 対象者を検索・選択すると、その人の事故データを分析した専用の教材（表紙の氏名欄・個人の事故傾向ページ・
// まとめページの分析文）に切り替わる。選択しなければ全社共通版（該当箇所は記入欄のみ）になる。
import { ADMIN_PATH } from '../config';
import { escHtml, safeJson } from './layout';
import { accidentsTabNav } from './accidents';
import { MATERIAL_PAGE_CSS, FIT_ALL_SHEETS_SCRIPT, renderMaterialSheetsInner } from './accidents_material_render';
import { THEME_CONTENTS } from './accidents_material_content';
import type { MaterialStats, PersonalStats } from '../utils/accident_material_stats';

export interface MaterialPersonOption {
  key: string;
  name: string;
  division: number | null;
  team: string | null;
  cnt: number;
}

export interface AccidentsMaterialViewerOptions {
  stats: MaterialStats;
  personal: PersonalStats | null;
  personKey: string | null;
  personOptions: MaterialPersonOption[];
}

// ページ送りUIの「セクションジャンプ」チップ。renderMaterialSheetsInner()のページ順と一致させること。
// 個人の事故傾向ページ(対象者選択時のみ)が挿入される分、以降のインデックスが1つずれる。
function buildJumpChips(hasPersonalPage: boolean): Array<{ index: number; label: string }> {
  const chips: Array<{ index: number; label: string }> = [
    { index: 0, label: '表紙' },
    { index: 1, label: '統計' },
    { index: 2, label: '自己診断' },
  ];
  let idx = 2;
  if (hasPersonalPage) {
    idx++;
    chips.push({ index: idx, label: '個人の傾向' });
  }
  for (const t of THEME_CONTENTS) {
    idx++;
    chips.push({ index: idx, label: `事例${t.no}` });
    idx++; // 解答・解説ページの分
  }
  idx++;
  chips.push({ index: idx, label: '心理学' });
  idx++; // 心理学2ページ目
  idx++;
  chips.push({ index: idx, label: 'アドバイス' });
  idx++; // アドバイス2ページ目
  idx++;
  chips.push({ index: idx, label: 'チェックリスト' });
  idx++;
  chips.push({ index: idx, label: 'まとめ' });
  return chips;
}

export function accidentsMaterialViewerPage(o: AccidentsMaterialViewerOptions): string {
  const pageBodies = renderMaterialSheetsInner(o.stats, o.personal);
  const totalPages = pageBodies.length;
  const pages = pageBodies
    .map(
      (body, i) => `<div class="sheet book-page${i === 0 ? ' active' : ''}" data-page="${i}">
      <div class="sheet-fit">${body}</div>
    </div>`
    )
    .join('');

  const chips = buildJumpChips(!!o.personal)
    .map(c => `<button type="button" class="book-chip" data-jump="${c.index}">${escHtml(c.label)}</button>`)
    .join('');

  const personChip = o.personal
    ? `<div class="m-person-chip">選択中: <b>${escHtml(o.personal.name)}</b><button type="button" id="person-clear-btn">✕ 解除</button></div>`
    : '';

  return `
  <div class="am-page">
    ${accidentsTabNav('material')}
    <style>
      .am-page { font-family:'Hiragino Sans','Meiryo',sans-serif; max-width:1160px; }
      .ac-tabnav { display:flex; gap:4px; margin-bottom:14px; border-bottom:1px solid #e5e7eb; }
      .ac-tab-link { padding:9px 16px; font-size:13px; font-weight:600; color:#64748b; text-decoration:none; border-bottom:2px solid transparent; margin-bottom:-1px; }
      .ac-tab-link:hover { color:#1a3a5c; }
      .ac-tab-link.active { color:#1a3a5c; border-bottom-color:#1a3a5c; }
      .m-book-wrap { background:#fff; border:1px solid #e5e7eb; border-radius:12px; overflow:hidden; }

      .m-person-picker { padding:12px 14px; background:#f0fdfa; border-bottom:1px solid #99f6e4; display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
      .m-person-picker-row { position:relative; flex:1; min-width:260px; max-width:420px; }
      .m-person-search { width:100%; border:1px solid #99f6e4; border-radius:8px; padding:8px 12px; font-size:13px; box-sizing:border-box; }
      .m-person-dropdown { position:absolute; top:100%; left:0; right:0; background:#fff; border:1px solid #e2e8f0; border-radius:8px; box-shadow:0 4px 16px rgba(0,0,0,.12); max-height:260px; overflow-y:auto; z-index:20; display:none; margin-top:4px; }
      .m-person-dropdown.open { display:block; }
      .m-person-dropdown-item { padding:9px 12px; font-size:12.5px; cursor:pointer; border-bottom:1px solid #f1f5f9; }
      .m-person-dropdown-item:last-child { border-bottom:none; }
      .m-person-dropdown-item:hover { background:#f0fdfa; }
      .m-person-dropdown-sub { color:#94a3b8; font-size:11px; margin-top:2px; }
      .m-person-dropdown-empty { padding:10px 12px; font-size:12px; color:#94a3b8; }
      .m-person-hint { font-size:11.5px; color:#0f766e; }
      .m-person-chip { font-size:12.5px; color:#0f766e; background:#fff; border:1px solid #99f6e4; border-radius:20px; padding:6px 12px; display:flex; align-items:center; gap:8px; }
      .m-person-chip button { border:none; background:none; color:#0f766e; font-size:12px; cursor:pointer; padding:0; }

      .m-book-toolbar { display:flex; align-items:center; gap:10px; padding:10px 14px; background:#0f766e; flex-wrap:wrap; }
      .m-book-toolbar button.m-print-link { background:#0d9488; color:#fff; border:none; border-radius:6px; padding:7px 14px; font-size:12.5px; font-weight:700; cursor:pointer; }
      .m-book-chips { display:flex; gap:6px; flex-wrap:wrap; margin-left:auto; }
      .book-chip { background:rgba(255,255,255,0.15); color:#fff; border:1px solid rgba(255,255,255,0.35); border-radius:14px; padding:4px 11px; font-size:11px; cursor:pointer; }
      .book-chip:hover { background:rgba(255,255,255,0.3); }

      .book-viewport { position:relative; background:#e2e8f0; height:calc(100vh - 310px); min-height:420px; display:flex; align-items:center; justify-content:center; overflow:hidden; }
      .book-stage { position:relative; width:210mm; height:297mm; transform-origin:center center; flex-shrink:0; }
      .sheet.book-page {
        position:absolute; inset:0; width:210mm; height:297mm; background:#fff; padding:16mm 18mm;
        box-shadow:0 6px 24px rgba(0,0,0,.25); overflow:hidden;
        opacity:0; pointer-events:none; transition:opacity .12s ease;
      }
      .sheet.book-page.active { opacity:1; pointer-events:auto; }
      .sheet-fit { width:100%; transform-origin:top left; }

      .book-controls { display:flex; align-items:center; justify-content:center; gap:16px; padding:14px; border-top:1px solid #e5e7eb; }
      .book-nav-btn { background:#0f766e; color:#fff; border:none; border-radius:8px; width:40px; height:40px; font-size:16px; cursor:pointer; }
      .book-nav-btn:disabled { background:#cbd5e1; cursor:default; }
      .book-page-indicator { font-size:13px; font-weight:700; color:#334155; min-width:70px; text-align:center; }

      ${MATERIAL_PAGE_CSS}
    </style>

    <div class="m-book-wrap">
      <div class="m-person-picker">
        <div class="m-person-picker-row">
          <input type="text" id="person-search-input" class="m-person-search" placeholder="対象の乗務員を氏名で検索（任意・未選択なら記入欄のみで印刷）" autocomplete="off">
          <div id="person-search-dropdown" class="m-person-dropdown"></div>
        </div>
        ${personChip || `<div class="m-person-hint">選択すると、その人の事故データを分析した専用の教材になります</div>`}
      </div>
      <div class="m-book-toolbar">
        <button type="button" class="m-print-link" id="book-print-btn">🖨️ 印刷用を開く</button>
        <div class="m-book-chips">${chips}</div>
      </div>
      <div class="book-viewport" id="book-viewport">
        <div class="book-stage" id="book-stage">
          ${pages}
        </div>
      </div>
      <div class="book-controls">
        <button type="button" class="book-nav-btn" id="book-prev">←</button>
        <div class="book-page-indicator"><span id="book-page-no">1</span> / ${totalPages}</div>
        <button type="button" class="book-nav-btn" id="book-next">→</button>
      </div>
    </div>
  </div>
  <script>
    ${FIT_ALL_SHEETS_SCRIPT}
    var TOTAL_PAGES = ${totalPages};
    var currentPage = 0;
    var PERSON_LIST = ${safeJson(o.personOptions)};
    var PERSON_KEY = ${safeJson(o.personKey)};

    function escapeHtmlClient(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function showPage(idx) {
      if (idx < 0 || idx >= TOTAL_PAGES) return;
      currentPage = idx;
      document.querySelectorAll('.book-page').forEach(function (el) {
        el.classList.toggle('active', parseInt(el.dataset.page, 10) === idx);
      });
      document.getElementById('book-page-no').textContent = String(idx + 1);
      document.getElementById('book-prev').disabled = idx === 0;
      document.getElementById('book-next').disabled = idx === TOTAL_PAGES - 1;
    }

    function fitStageToViewport() {
      var viewport = document.getElementById('book-viewport');
      var stage = document.getElementById('book-stage');
      if (!viewport || !stage) return;
      var rect = viewport.getBoundingClientRect();
      var pad = 28;
      var availW = rect.width - pad * 2;
      var availH = rect.height - pad * 2;
      var scale = Math.min(availW / 794, availH / 1123, 1);
      stage.style.transform = 'scale(' + scale + ')';
    }

    document.getElementById('book-prev').addEventListener('click', function () { showPage(currentPage - 1); });
    document.getElementById('book-next').addEventListener('click', function () { showPage(currentPage + 1); });
    document.querySelectorAll('.book-chip').forEach(function (chip) {
      chip.addEventListener('click', function () { showPage(parseInt(chip.dataset.jump, 10)); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') showPage(currentPage + 1);
      if (e.key === 'ArrowLeft') showPage(currentPage - 1);
    });
    (function () {
      var startX = null;
      var viewport = document.getElementById('book-viewport');
      viewport.addEventListener('touchstart', function (e) { startX = e.touches[0].clientX; }, { passive: true });
      viewport.addEventListener('touchend', function (e) {
        if (startX === null) return;
        var diff = e.changedTouches[0].clientX - startX;
        if (Math.abs(diff) > 50) showPage(currentPage + (diff < 0 ? 1 : -1));
        startX = null;
      }, { passive: true });
    })();

    document.getElementById('book-print-btn').addEventListener('click', function () {
      var url = '${ADMIN_PATH}/accidents/material/print';
      if (PERSON_KEY) url += '?person=' + encodeURIComponent(PERSON_KEY);
      window.open(url, '_blank');
    });

    var searchInput = document.getElementById('person-search-input');
    var dropdown = document.getElementById('person-search-dropdown');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        var q = searchInput.value.trim();
        if (!q) { dropdown.classList.remove('open'); dropdown.innerHTML = ''; return; }
        var matches = PERSON_LIST.filter(function (p) { return p.name.indexOf(q) !== -1; }).slice(0, 8);
        if (!matches.length) {
          dropdown.innerHTML = '<div class="m-person-dropdown-empty">該当する乗務員が見つかりません</div>';
          dropdown.classList.add('open');
          return;
        }
        dropdown.innerHTML = matches.map(function (p) {
          var sub = (p.division != null ? p.division + '課 ' : '') + (p.team || '') + ' ・事故' + p.cnt + '件';
          return '<div class="m-person-dropdown-item" data-key="' + escapeHtmlClient(p.key) + '">' +
            escapeHtmlClient(p.name) + '<div class="m-person-dropdown-sub">' + escapeHtmlClient(sub) + '</div></div>';
        }).join('');
        dropdown.classList.add('open');
        dropdown.querySelectorAll('.m-person-dropdown-item').forEach(function (item) {
          item.addEventListener('click', function () {
            window.location.href = '${ADMIN_PATH}/accidents/material?person=' + encodeURIComponent(item.dataset.key);
          });
        });
      });
      document.addEventListener('click', function (e) {
        if (!e.target.closest('.m-person-picker-row')) dropdown.classList.remove('open');
      });
    }
    var clearBtn = document.getElementById('person-clear-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () { window.location.href = '${ADMIN_PATH}/accidents/material'; });
    }

    fitAllSheets();
    fitStageToViewport();
    window.addEventListener('load', function () { fitAllSheets(); fitStageToViewport(); });
    window.addEventListener('resize', fitStageToViewport);
  </script>
  `;
}
