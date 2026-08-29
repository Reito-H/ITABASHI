// 報告センター（忘れ物・事故・違反・一般報告）の個別「詳細ビュー」ページ。
// 一覧の行クリックでまずこの画面が開く。紙都合のA4横帳票（report_print.ts）と違い、
// 画面で読むことに最適化したカード型レイアウト。編集は帳票と同じ [data-field] + autosave APIを共有し、
// ステータス変更・削除・対応履歴もこの画面で完結する。印刷したいときだけ「印刷用ページ」へ遷移する。

import { escHtml, safeJson } from './layout';
import type { ReportPrintOptions } from './report_print';

export type ReportDetailOptions = ReportPrintOptions & {
  printHref: string; // 対応する印刷用ページ（A4横帳票）へのリンク
};

export function renderReportDetailPage(o: ReportDetailOptions): string {
  const fieldCells = o.fields.map(f => {
    let valueHtml: string;
    if (f.field && f.comboField && f.comboDeriveDivision) {
      // 班は課に対して固定(1課=1,2班/2課=3,4班/3課=5,6班/4課=7,8班)。班のみ編集可、課は自動算出の読み取り専用。
      valueHtml =
        `<span class="d-combo"><span class="d-derived" id="derived-division-display">${escHtml(f.value || '?')}</span>課`
        + `<span class="d-sep">-</span>`
        + `<input type="text" class="d-edit d-edit-combo" data-field="${escHtml(f.comboField)}" value="${escHtml(f.comboValue ?? '')}" oninput="updateDerivedDivision(this.value)">班`
        + `<input type="hidden" data-field="${escHtml(f.field)}" id="derived-division-hidden" value="${escHtml(f.value)}"></span>`;
    } else if (f.field && f.comboField) {
      valueHtml =
        `<span class="d-combo"><input type="text" class="d-edit d-edit-combo" data-field="${escHtml(f.field)}" value="${escHtml(f.value)}" placeholder="${escHtml(f.comboPlaceholder ?? '')}">`
        + `<span class="d-sep">-</span>`
        + `<input type="text" class="d-edit d-edit-combo" data-field="${escHtml(f.comboField)}" value="${escHtml(f.comboValue ?? '')}"></span>`;
    } else if (!f.field) {
      valueHtml = `<span class="d-readonly">${escHtml(f.value || '—')}</span>`;
    } else if (f.input === 'checkbox') {
      valueHtml = `<label class="d-check"><input type="checkbox" data-field="${escHtml(f.field)}"${f.checked ? ' checked' : ''}> ${escHtml(f.value)}</label>`;
    } else if (f.input === 'textarea') {
      valueHtml = `<textarea class="d-edit d-edit-area" data-field="${escHtml(f.field)}" placeholder="未記入">${escHtml(f.value)}</textarea>`;
    } else {
      valueHtml = `<input type="text" class="d-edit" data-field="${escHtml(f.field)}" value="${escHtml(f.value)}" placeholder="未記入">`;
    }
    const spanClass =
      f.width === 'full' ? ' span-full'
      : f.width === 'quarter' ? ' span-quarter'
      : f.width === 'third' ? ' span-third'
      : '';
    const isLong = f.input === 'textarea' || f.width === 'full';
    return `
      <div class="d-cell${spanClass}${isLong ? ' is-long' : ''}">
        <div class="d-key">${escHtml(f.label)}</div>
        <div class="d-val">${valueHtml}</div>
      </div>`;
  }).join('');

  const statusPill = o.status === 'resolved'
    ? `<span class="pill pill-done">${escHtml(o.resolvedLabel)}</span>`
    : `<span class="pill pill-open">対応中</span>`;

  const resolvedMeta = o.status === 'resolved'
    ? `<span class="meta-sub" id="resolved-meta">対応者: ${escHtml(o.resolvedByName ?? '—')}${o.resolvedAt ? ` / ${escHtml(o.resolvedAt.slice(0, 16))}` : ''}</span>`
    : `<span class="meta-sub" id="resolved-meta"></span>`;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escHtml(o.pageTitle)}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: #f1f5f9;
    font-family: 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Meiryo', system-ui, sans-serif;
    color: #0f172a; line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }

  /* 上部スティッキーバー */
  .topbar {
    position: sticky; top: 0; z-index: 20;
    display: flex; align-items: center; gap: 12px;
    padding: 10px 20px;
    background: rgba(255,255,255,0.86); backdrop-filter: blur(8px);
    border-bottom: 1px solid #e2e8f0;
  }
  .topbar a.back { font-size: 13px; color: #475569; text-decoration: none; font-weight: 600; }
  .topbar a.back:hover { color: #0f172a; }
  .topbar .save-state { margin-left: auto; font-size: 12px; font-weight: 600; color: #94a3b8; }
  .topbar a.print-link {
    font-size: 13px; font-weight: 700; text-decoration: none;
    color: #1e3a5f; padding: 7px 14px; border: 1px solid #cbd5e1; border-radius: 8px; background: #fff;
  }
  .topbar a.print-link:hover { background: #f8fafc; border-color: #94a3b8; }

  .wrap { max-width: 920px; margin: 0 auto; padding: 24px 16px 72px; }

  .card {
    background: #fff; border: 1px solid #e2e8f0; border-radius: 16px;
    box-shadow: 0 1px 2px rgba(15,23,42,0.04), 0 8px 24px -12px rgba(15,23,42,0.12);
    margin-bottom: 18px;
  }

  /* ヘッダーカード */
  .head { padding: 22px 24px; }
  .head .row1 { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .badge {
    display: inline-block; padding: 4px 12px; border-radius: 999px;
    color: #fff; font-size: 12px; font-weight: 700; letter-spacing: .02em;
    background: ${o.kindColor};
  }
  .pill {
    display: inline-block; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 700;
  }
  .pill-open { background: #fef3c7; color: #b45309; }
  .pill-done { background: #dcfce7; color: #15803d; }
  .head h1 { font-size: 21px; font-weight: 800; margin: 12px 0 6px; letter-spacing: -.01em; color: #0f172a; }
  .head .meta { font-size: 12.5px; color: #64748b; display: flex; gap: 16px; flex-wrap: wrap; }
  .head .meta .meta-sub { color: #94a3b8; }

  /* アクション行 */
  .actions { display: flex; gap: 10px; flex-wrap: wrap; padding: 0 24px 20px; }
  .btn {
    font-size: 13px; font-weight: 700; padding: 9px 16px; border-radius: 9px;
    border: 1px solid transparent; cursor: pointer; background: #fff;
  }
  .btn-primary { background: #1e3a5f; color: #fff; }
  .btn-primary:hover { background: #182f4d; }
  .btn-ghost { border-color: #cbd5e1; color: #334155; }
  .btn-ghost:hover { background: #f8fafc; }
  .btn-danger { border-color: #fecaca; color: #dc2626; }
  .btn-danger:hover { background: #fef2f2; }

  /* セクション見出し */
  .sec-title {
    font-size: 12px; font-weight: 800; color: #1e3a5f; letter-spacing: .06em;
    padding: 20px 24px 4px;
  }

  /* 項目グリッド */
  .grid {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px;
    background: #edf1f6; border-top: 1px solid #edf1f6; border-bottom: 1px solid #edf1f6;
  }
  .d-cell { grid-column: span 2; background: #fff; padding: 12px 16px; min-width: 0; }
  .d-cell.span-quarter { grid-column: span 1; }
  .d-cell.span-third { grid-column: span 2; }
  .d-cell.span-full, .d-cell.is-long { grid-column: 1 / -1; }
  .d-key { font-size: 11px; font-weight: 700; color: #64748b; margin-bottom: 4px; letter-spacing: .02em; }
  .d-val { font-size: 15px; color: #0f172a; word-break: break-word; }
  .d-readonly { display: inline-block; padding: 2px 0; color: #0f172a; }

  .d-edit {
    width: 100%; font: inherit; font-size: 15px; color: #0f172a;
    border: 1px solid transparent; border-radius: 8px; background: #f8fafc;
    padding: 7px 10px; outline: none; transition: border-color .12s, background .12s;
  }
  .d-edit:hover { border-color: #cbd5e1; background: #fff; }
  .d-edit:focus { border-color: #1e3a5f; background: #fff; box-shadow: 0 0 0 3px rgba(30,58,95,0.10); }
  .d-edit-area { resize: vertical; min-height: 76px; line-height: 1.6; white-space: pre-wrap; }
  .d-combo { display: inline-flex; align-items: center; gap: 4px; font-size: 15px; }
  .d-combo .d-derived { font-weight: 800; }
  .d-edit-combo { width: 52px; text-align: center; padding: 7px 4px; }
  .d-sep { color: #94a3b8; }
  .d-check { display: inline-flex; align-items: center; gap: 8px; font-size: 15px; cursor: pointer; }
  .d-check input { width: 17px; height: 17px; }

  /* 対応履歴タイムライン */
  .timeline { padding: 6px 24px 22px; }
  .tl-item { position: relative; padding: 10px 0 10px 20px; border-left: 2px solid #e2e8f0; }
  .tl-item:last-child { border-left-color: transparent; }
  .tl-item::before {
    content: ''; position: absolute; left: -6px; top: 15px;
    width: 10px; height: 10px; border-radius: 999px; background: #1e3a5f;
  }
  .tl-when { font-size: 11px; color: #94a3b8; }
  .tl-what { font-size: 13.5px; color: #0f172a; margin-top: 1px; }
  .tl-what strong { font-weight: 700; }
  .tl-target { font-size: 11.5px; color: #64748b; margin-top: 1px; }
  .tl-empty { font-size: 13px; color: #94a3b8; padding: 8px 0; }

  details.print-extra { padding: 4px 24px 20px; }
  details.print-extra > summary {
    cursor: pointer; font-size: 12.5px; font-weight: 700; color: #475569; list-style: none;
    padding: 8px 0;
  }
  details.print-extra > summary::-webkit-details-marker { display: none; }
  details.print-extra > summary::before { content: '▸ '; color: #94a3b8; }
  details.print-extra[open] > summary::before { content: '▾ '; }
  .notes-field {
    width: 100%; font: inherit; font-size: 14px; line-height: 1.6; color: #0f172a;
    border: 1px solid #e2e8f0; border-radius: 10px; background: #f8fafc;
    padding: 10px 12px; outline: none; resize: vertical; min-height: 72px; white-space: pre-wrap;
  }
  .notes-field:focus { border-color: #1e3a5f; background: #fff; box-shadow: 0 0 0 3px rgba(30,58,95,0.10); }

  @media (max-width: 640px) {
    .grid { grid-template-columns: repeat(2, 1fr); }
    .d-cell, .d-cell.span-third { grid-column: 1 / -1; }
    .d-cell.span-quarter { grid-column: span 1; }
    .head h1 { font-size: 19px; }
  }
</style>
</head>
<body>
  <div class="topbar">
    <a class="back" href="${o.listHref}">← 報告センター</a>
    <span class="save-state" id="save-state"></span>
    <a class="print-link" href="${o.printHref}">印刷用ページ →</a>
  </div>

  <div class="wrap" id="detail-root">
    <div class="card head-card">
      <div class="head">
        <div class="row1">
          <span class="badge">${escHtml(o.kindLabel)}</span>
          ${statusPill}
        </div>
        <h1>${escHtml(o.headingTitle)}</h1>
        <div class="meta">
          <span>報告No. ${o.reportId}</span>
          <span>登録: ${escHtml(o.createdAt.slice(0, 16))}</span>
          <span>報告者: ${escHtml(o.reporterName ?? '—')}</span>
          ${resolvedMeta}
        </div>
      </div>
      <div class="actions">
        <button class="btn btn-primary" id="status-btn" data-status="${o.status}" onclick="toggleReportStatus()">${o.status === 'resolved' ? '対応中に戻す' : `${escHtml(o.resolvedLabel)}にする`}</button>
        <a class="btn btn-ghost" href="${o.printHref}" style="text-decoration:none;">印刷用ページを開く</a>
        <button class="btn btn-danger" onclick="deleteReport()">削除</button>
      </div>
    </div>

    <div class="card">
      <div class="sec-title">報告内容</div>
      <div class="grid">
        ${fieldCells}
      </div>
      <details class="print-extra">
        <summary>印刷時の追加備考${o.signConfirmField ? '・確認欄' : ''}</summary>
        <textarea class="notes-field" data-field="print_notes" placeholder="帳票の下部に印字される申し送り事項">${escHtml(o.printNotes)}</textarea>
        ${o.signConfirmField || o.signDateField ? `
        <div class="grid" style="margin-top:12px;border-radius:10px;overflow:hidden;">
          ${o.signConfirmField ? `<div class="d-cell span-third"><div class="d-key">確認</div><div class="d-val"><input type="text" class="d-edit" data-field="${escHtml(o.signConfirmField)}" value="${escHtml(o.signConfirmValue ?? '')}" placeholder="未記入"></div></div>` : ''}
          ${o.signDateField ? `<div class="d-cell span-third"><div class="d-key">日付</div><div class="d-val"><input type="text" class="d-edit" data-field="${escHtml(o.signDateField)}" value="${escHtml(o.signDateValue ?? '')}" placeholder="例: 8/11"></div></div>` : ''}
        </div>` : ''}
      </details>
    </div>

    <div class="card">
      <div class="sec-title">対応履歴</div>
      <div class="timeline" id="timeline"><div class="tl-empty">読み込み中…</div></div>
    </div>
  </div>

  <script>
    var API_PATH = ${safeJson(o.apiPath)};
    var REPORT_ID = ${o.reportId};
    var LIST_HREF = ${safeJson(o.listHref)};
    var RESOLVED_LABEL = ${safeJson(o.resolvedLabel)};

    // 班番号から課=Math.ceil(班/2)を自動算出（班は課に対して固定のため課は独立入力させない）
    function updateDerivedDivision(teamStr) {
      var n = parseInt(teamStr, 10);
      var div = (Number.isInteger(n) && n >= 1) ? Math.ceil(n / 2) : null;
      var disp = document.getElementById('derived-division-display');
      var hidden = document.getElementById('derived-division-hidden');
      if (disp) disp.textContent = div === null ? '?' : String(div);
      if (hidden) hidden.value = div === null ? '' : String(div);
    }

    function autosizeTextarea(el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
    document.querySelectorAll('.d-edit-area, .notes-field').forEach(autosizeTextarea);
    document.getElementById('detail-root').addEventListener('input', function(e) {
      var t = e.target;
      if (t && t.classList && (t.classList.contains('d-edit-area') || t.classList.contains('notes-field'))) autosizeTextarea(t);
    });

    function saveState(text, color) {
      var el = document.getElementById('save-state');
      if (el) { el.textContent = text; el.style.color = color; }
    }
    function collectFieldsPayload() {
      var payload = {};
      document.querySelectorAll('#detail-root [data-field]').forEach(function(el) {
        var key = el.getAttribute('data-field');
        payload[key] = el.type === 'checkbox' ? el.checked : el.value;
      });
      return payload;
    }
    function autosaveField() {
      saveState('保存中…', '#d97706');
      fetch(API_PATH + '/' + REPORT_ID + '/fields', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: collectFieldsPayload() }), keepalive: true,
      })
      .then(function(r) { return r.json(); })
      .then(function(data) { saveState(data.ok ? '保存しました' : '保存に失敗しました', data.ok ? '#15803d' : '#dc2626'); })
      .catch(function() { saveState('保存に失敗しました', '#dc2626'); });
    }
    document.querySelectorAll('#detail-root [data-field]').forEach(function(el) {
      el.addEventListener('change', autosaveField);
    });

    async function toggleReportStatus() {
      var btn = document.getElementById('status-btn');
      var current = btn.dataset.status;
      var next = current === 'resolved' ? 'open' : 'resolved';
      btn.disabled = true;
      var res = await fetch(API_PATH + '/' + REPORT_ID + '/status', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }),
      });
      btn.disabled = false;
      if (!res.ok) { alert('更新に失敗しました'); return; }
      var j = await res.json().catch(function(){ return {}; });
      var name = j.adminName || '管理者';
      btn.dataset.status = next;
      btn.textContent = next === 'resolved' ? '対応中に戻す' : (RESOLVED_LABEL + 'にする');
      var pill = document.querySelector('.pill');
      if (pill) {
        pill.className = 'pill ' + (next === 'resolved' ? 'pill-done' : 'pill-open');
        pill.textContent = next === 'resolved' ? RESOLVED_LABEL : '対応中';
      }
      var rm = document.getElementById('resolved-meta');
      if (rm) rm.textContent = next === 'resolved' ? ('対応者: ' + name) : '';
      loadTimeline();
    }

    async function deleteReport() {
      if (!confirm('この報告を削除しますか？\\n※削除しても「誰がいつ削除したか」は履歴に残ります')) return;
      var res = await fetch(API_PATH + '/' + REPORT_ID, { method: 'DELETE' });
      if (!res.ok) { alert('削除に失敗しました'); return; }
      location.href = LIST_HREF;
    }

    function escLog(s) {
      return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    async function loadTimeline() {
      var box = document.getElementById('timeline');
      try {
        var res = await fetch(API_PATH + '/' + REPORT_ID + '/logs');
        if (!res.ok) throw new Error('failed');
        var j = await res.json();
        var logs = j.logs || [];
        if (logs.length === 0) {
          box.innerHTML = '<div class="tl-empty">まだ履歴がありません（記録開始前の操作は残っていません）</div>';
          return;
        }
        box.innerHTML = logs.map(function(l) {
          return '<div class="tl-item">'
            + '<div class="tl-when">' + escLog(l.created_at) + '</div>'
            + '<div class="tl-what"><strong>' + escLog(l.admin_name) + '</strong> さんが ' + escLog(l.action_label) + '</div>'
            + (l.summary ? '<div class="tl-target">対象: ' + escLog(l.summary) + '</div>' : '')
            + '</div>';
        }).join('');
      } catch (e) {
        box.innerHTML = '<div class="tl-empty">履歴の取得に失敗しました</div>';
      }
    }
    loadTimeline();
  </script>
</body>
</html>`;
}
