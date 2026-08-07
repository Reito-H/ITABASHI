// LINE LIFF 権限管理・報告一覧 の管理者ページ

import { Hono } from 'hono';
import type { Context } from 'hono';
import { layout, escHtml, safeJson } from '../html/layout';
import { ADMIN_PATH } from '../config';
import { getSessionFromCookie, validateSession } from '../auth';
import type { Env } from '../auth';
import { getAdminPermissions } from '../permissions';
import { renderReportPrintPage, type ReportPrintField } from '../html/report_print';
import { renderReportPrintBulkPage, type ReportPrintBulkItem } from '../html/report_print_bulk';
import { saveToastHtml, saveToastScript } from '../html/layout';

const app = new Hono<{ Bindings: Env }>();

export const ROLE_LABELS: Record<string, string> = {
  general_manager:     '統括管理者',
  operations_manager:  '運行管理者',
  vehicle_manager:     '車番管理者',
  newcomer:            '新人',
  benten_shift_master: 'ベンテンシフトマスター',
  benten_member:       'ベンテンクラブ会員',
  crew_member:         '乗務社員',
  unknown:             '権限不明者',
};

export const ROLE_COLORS: Record<string, string> = {
  general_manager:     '#1e3a5f',
  operations_manager:  '#065f46',
  vehicle_manager:     '#7c3aed',
  newcomer:            '#1d4ed8',
  benten_shift_master: '#b45309',
  benten_member:       '#0891b2',
  crew_member:         '#d97706',
  unknown:             '#9ca3af',
};

function subHeader(title: string): string {
  return `<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
    <a href="${ADMIN_PATH}/settings" style="color:#6b7280;font-size:13px;text-decoration:none;padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:white;">← 設定に戻る</a>
    <h2 style="font-size:17px;font-weight:700;color:#1e3a5f;margin:0;">${escHtml(title)}</h2>
  </div>`;
}

// ログイン中の管理者名を取得（報告の「対応者」記録用）
async function getAdminName(c: { req: { header: (n: string) => string | undefined }; env: Env }): Promise<string> {
  const cookie = c.req.header('Cookie') ?? null;
  const sid = getSessionFromCookie(cookie);
  const adminId = sid ? await validateSession(c.env.DB, sid) : null;
  const adminRow = adminId
    ? await c.env.DB.prepare('SELECT username FROM admins WHERE id = ?').bind(adminId).first<{ username: string }>()
    : null;
  return adminRow?.username ?? '管理者';
}

// 忘れ物・事故・違反・一般・引き継ぎメモ 共通のタブナビ（権限のないタブは data-perm-key で自動的に非表示になる）
function reportTabs(active: 'lost' | 'accident' | 'violation' | 'general' | 'memo'): string {
  const tabs = [
    { key: 'lost',      href: `${ADMIN_PATH}/settings/lost-items`,      perm: 'settings.lost-items',      label: '忘れ物' },
    { key: 'accident',  href: `${ADMIN_PATH}/settings/accidents`,       perm: 'settings.accidents',       label: '事故' },
    { key: 'violation', href: `${ADMIN_PATH}/settings/violations`,      perm: 'settings.violations',      label: '違反' },
    { key: 'general',   href: `${ADMIN_PATH}/settings/general-reports`, perm: 'settings.general-reports', label: '一般報告' },
    { key: 'memo',      href: `${ADMIN_PATH}/settings/handover-memos`,  perm: 'settings.handover-memos',  label: '引き継ぎメモ' },
  ];
  return `<div style="display:flex;gap:0;margin-bottom:16px;border-bottom:2px solid #e5e7eb;">
    ${tabs.map(t => `<a href="${t.href}" data-perm-key="${t.perm}" style="padding:8px 20px;font-size:14px;text-decoration:none;font-weight:600;margin-bottom:-2px;${t.key === active
      ? 'color:#1e3a5f;border-bottom:2px solid #1e3a5f;'
      : 'color:#9ca3af;border-bottom:2px solid transparent;'}">${escHtml(t.label)}</a>`).join('')}
  </div>`;
}

// GET /settings/reports — 報告センターの入口。権限のある最初のタブへリダイレクト
// （設定トップのカードを1枚に集約したため、アカウントごとに見えるタブが違っても入口は共通）
app.get('/settings/reports', async (c) => {
  const orderedPerms = ['settings.lost-items', 'settings.accidents', 'settings.violations', 'settings.general-reports', 'settings.handover-memos'];
  const hrefs: Record<string, string> = {
    'settings.lost-items':      `${ADMIN_PATH}/settings/lost-items`,
    'settings.accidents':       `${ADMIN_PATH}/settings/accidents`,
    'settings.violations':      `${ADMIN_PATH}/settings/violations`,
    'settings.general-reports': `${ADMIN_PATH}/settings/general-reports`,
    'settings.handover-memos':  `${ADMIN_PATH}/settings/handover-memos`,
  };
  const cookie = c.req.header('Cookie') ?? null;
  const sid = getSessionFromCookie(cookie);
  const adminId = sid ? await validateSession(c.env.DB, sid) : null;
  const perms = adminId ? await getAdminPermissions(c.env.DB, adminId) : null;
  // perms === null は全権限アカウント
  const key = perms === null ? orderedPerms[0] : orderedPerms.find(k => perms.includes(k));
  if (!key) return c.redirect(`${ADMIN_PATH}/settings`);
  return c.redirect(hrefs[key]);
});

// 状態セルのHTML（resolvedLabel: 忘れ物・事故=解決済 / 違反=対応済）
function statusCellHtml(resolved: boolean, resolvedLabel: string): string {
  const label = resolved ? resolvedLabel : '対応中';
  const color = resolved ? '#059669' : '#d97706';
  return `<span style="color:${color};font-size:12px;font-weight:600;">${label}</span>`;
}

// 対応者セルのHTML（誰が・いつ対応したか）
function resolverCellHtml(resolvedByName: string | null, resolvedAt: string | null): string {
  if (!resolvedByName) return '<span style="color:#d1d5db;font-size:12px;">—</span>';
  return `<span style="color:#059669;font-size:12px;font-weight:600;">${escHtml(resolvedByName)}</span>
    ${resolvedAt ? `<div style="font-size:11px;color:#9ca3af;margin-top:1px;">${escHtml(resolvedAt.slice(5, 16))}</div>` : ''}`;
}

// 行内で状態切替・削除・履歴表示を行う共通スクリプト（ページ再読み込みなしで行だけ更新する）
function reportRowScript(apiPath: string, deleteLabel: string, resolvedLabel: string, bulkPrintPath: string): string {
  return `
    var ADMIN_PATH = ${safeJson(ADMIN_PATH)};
    function toggleAllChecks(master) {
      document.querySelectorAll('.report-chk').forEach(function(cb){ cb.checked = master.checked; });
      updateBulkPrintBtn();
    }
    function updateBulkPrintBtn() {
      var checked = document.querySelectorAll('.report-chk:checked');
      var btn = document.getElementById('bulk-print-btn');
      var cnt = document.getElementById('bulk-print-count');
      if (btn) { btn.disabled = checked.length === 0; btn.style.opacity = checked.length ? '1' : '.5'; }
      if (cnt) cnt.textContent = checked.length + '件選択中';
    }
    function openBulkPrint() {
      var ids = Array.prototype.map.call(document.querySelectorAll('.report-chk:checked'), function(cb){ return cb.value; });
      if (ids.length === 0) return;
      window.open(ADMIN_PATH + '${bulkPrintPath}?ids=' + ids.join(','), '_blank');
    }
    async function toggleReportStatus(id, btn) {
      var current = btn.dataset.status;
      var next = current === 'resolved' ? 'open' : 'resolved';
      var res = await fetch(ADMIN_PATH + '${apiPath}/' + id + '/status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) { alert('更新に失敗しました'); return; }
      var j = await res.json().catch(function(){ return {}; });
      var name = j.adminName || '管理者';
      btn.dataset.status = next;
      btn.textContent = next === 'resolved' ? '再開' : '${resolvedLabel}にする';
      var st = document.getElementById('st-' + id);
      if (st) {
        st.innerHTML = next === 'resolved'
          ? '<span style="color:#059669;font-size:12px;font-weight:600;">${resolvedLabel}</span>'
          : '<span style="color:#d97706;font-size:12px;font-weight:600;">対応中</span>';
      }
      var rc = document.getElementById('res-' + id);
      if (rc) {
        rc.innerHTML = '';
        var span = document.createElement('span');
        if (next === 'resolved') {
          span.style.cssText = 'color:#059669;font-size:12px;font-weight:600;';
          span.textContent = name;
        } else {
          span.style.cssText = 'color:#d1d5db;font-size:12px;';
          span.textContent = '—';
        }
        rc.appendChild(span);
      }
    }
    async function deleteReport(id, label) {
      if (!confirm('この${deleteLabel}を削除しますか？\\n「' + label + '」\\n※削除しても「誰がいつ削除したか」は履歴に残ります')) return;
      var res = await fetch(ADMIN_PATH + '${apiPath}/' + id, { method: 'DELETE' });
      if (!res.ok) { alert('削除に失敗しました'); return; }
      var row = document.getElementById('report-row-' + id);
      if (row) row.remove();
      var cnt = document.getElementById('report-count');
      if (cnt) cnt.textContent = '報告 ' + Math.max(0, parseInt(cnt.textContent.replace(/[^0-9]/g, '') || '1') - 1) + '件';
      updateBulkPrintBtn();
    }
    function escLog(s) {
      return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    async function showReportLogs(id) {
      var res = await fetch(ADMIN_PATH + '${apiPath}/' + id + '/logs');
      if (!res.ok) { alert('履歴の取得に失敗しました'); return; }
      var j = await res.json();
      var logs = j.logs || [];
      var body = document.getElementById('report-log-body');
      if (logs.length === 0) {
        body.innerHTML = '<div style="color:#9ca3af;font-size:13px;padding:12px 0;">まだ履歴がありません（履歴の記録開始前の操作は残っていません）</div>';
      } else {
        body.innerHTML = logs.map(function(l) {
          return '<div style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:13px;">'
            + '<span style="color:#9ca3af;font-size:11px;">' + escLog(l.created_at) + '</span><br>'
            + '<strong>' + escLog(l.admin_name) + '</strong> さんが ' + escLog(l.action_label)
            + (l.summary ? '<div style="font-size:11px;color:#6b7280;margin-top:1px;">対象: ' + escLog(l.summary) + '</div>' : '')
            + '</div>';
        }).join('');
      }
      document.getElementById('report-log-modal').style.display = 'flex';
    }
    function closeReportLogs() { document.getElementById('report-log-modal').style.display = 'none'; }
    async function copyHandoverLink(btn) {
      var fullUrl = location.origin + btn.dataset.url;
      var titleText = 'タイトル：' + btn.dataset.title + 'の件';
      var summaryText = btn.dataset.summary ? ('概要：' + btn.dataset.summary) : '';
      var html = '<a href="' + fullUrl + '" target="_blank" rel="noopener" style="color:#1d4ed8;font-weight:700;text-decoration:underline;">'
        + escLog(titleText) + (summaryText ? '<br>' + escLog(summaryText) : '') + '</a>';
      var plain = titleText + (summaryText ? ('\\n' + summaryText) : '') + '\\n' + fullUrl;
      try {
        if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
          await navigator.clipboard.write([new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([plain], { type: 'text/plain' }),
          })]);
        } else {
          await navigator.clipboard.writeText(plain);
        }
        var orig = btn.textContent;
        btn.textContent = 'コピーしました';
        btn.disabled = true;
        setTimeout(function () { btn.textContent = orig; btn.disabled = false; }, 1500);
      } catch (e) {
        alert('コピーに失敗しました（ブラウザの設定をご確認ください）');
      }
    }`;
}

// 乗務員の「n課n班 氏名（社員番号）」表示（帳票印刷ページとも共用・社員番号はホシコン内のみ表示）
function empDisplay(name: string | null, division: number | null, team: number | null, empNo?: string | null): string {
  if (!name) return '—';
  const no = empNo ? `（${empNo}）` : '';
  return `${division ? division + '課' : ''}${team ? team + '班' : ''} ${name}${no}`;
}

// 報告者列の表示：LINEからの報告はLINE表示名、管理画面から直接登録した場合は管理者名＋注記
function reporterDisplay(lineReporterName: string | null, adminName: string | null): string {
  if (lineReporterName) return lineReporterName;
  if (adminName) return `${adminName}（管理画面）`;
  return '—';
}

// 一般報告の「報告内容」セル：長文は初期折りたたみ、クリックで全文表示（toggleReportContentは呼び出し側scriptで定義）
function contentCellHtml(content: string | null): string {
  if (!content) return '—';
  const escaped = escHtml(content);
  if (content.length <= 60) return `<div style="white-space:pre-wrap;word-break:break-word;">${escaped}</div>`;
  return `
    <div class="gr-content" style="white-space:pre-wrap;word-break:break-word;max-height:2.6em;overflow:hidden;">${escaped}</div>
    <button type="button" onclick="toggleReportContent(this)"
      style="margin-top:4px;padding:2px 8px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:4px;font-size:11px;cursor:pointer;">続きを見る</button>`;
}

// 帳票印刷ページの宛先の初期値（報告に紐づく乗務員の課・班から班長を推測）
function suggestedTo(division: number | null, team: number | null): string {
  return division ? `${division}課${team ? team + '班' : ''}班長` : '';
}

// 帳票のフィールド一覧を「ラベル: 値」の1行サマリーに圧縮する（まとめ帳票の内容欄用）
function fieldsSummary(fields: ReportPrintField[]): string {
  return fields.filter(f => f.value).map(f => `${f.label}: ${f.value}`).join(' ／ ');
}

// まとめ帳票印刷用に ?ids=1,2,3 をパースする（不正値は除外、上限50件）
function parseBulkIds(idsParam: string | undefined): number[] {
  return (idsParam ?? '')
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => Number.isInteger(n))
    .slice(0, 50);
}

// 一覧の行アクションに追加する「帳票印刷」ボタン（新しいタブで印刷/画像保存ページを開く）
function printLinkHtml(printPath: string, id: number): string {
  return `<a href="${ADMIN_PATH}${printPath}/${id}" target="_blank"
    style="padding:3px 8px;background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;border-radius:4px;font-size:11px;cursor:pointer;margin-left:4px;text-decoration:none;display:inline-block;">帳票</a>`;
}

// 長文を指定文字数に切り詰める（引継リンクの概要文用）
function truncateSummary(s: string | null | undefined, n: number = 80): string {
  const v = (s ?? '').trim();
  return v.length > n ? v.slice(0, n) + '…' : v;
}

// 一覧の行アクションに追加する「引継リンク」ボタン（クリックで案件の帳票ページ＝報告センターの概要ページへのリンクを
// 「タイトル：○○の件 / 概要：△△」形式のリッチテキストとしてクリップボードへコピーする。
// 引き継ぎシートのメイン欄はcontenteditableで貼り付けたHTMLをそのまま受け付けるため、貼り付けるだけでクリック可能なリンクになる）
function handoverLinkButtonHtml(printPath: string, id: number, title: string, summary: string): string {
  const url = `${ADMIN_PATH}${printPath}/${id}`;
  return `<button type="button" data-url="${escHtml(url)}" data-title="${escHtml(title)}" data-summary="${escHtml(summary)}"
    onclick="copyHandoverLink(this)"
    style="padding:3px 8px;background:#fef3c7;color:#92400e;border:1px solid #fde68a;border-radius:4px;font-size:11px;cursor:pointer;margin-left:4px;">引継リンク</button>`;
}

// 一覧上部の「まとめて帳票印刷」バー（チェックした複数件をA4横1枚にまとめて印刷/画像保存するページを新しいタブで開く）
function bulkPrintBarHtml(): string {
  return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
    <button id="bulk-print-btn" onclick="openBulkPrint()" disabled style="opacity:.5;padding:7px 16px;background:#059669;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">📋 まとめて帳票印刷</button>
    <span id="bulk-print-count" style="font-size:12px;color:#6b7280;">0件選択中</span>
  </div>`;
}

// 一覧テーブルの選択チェックボックス列（ヘッダー用・行用）
function reportCheckboxTh(): string {
  return `<th style="padding:8px 12px;"><input type="checkbox" onchange="toggleAllChecks(this)"></th>`;
}
function reportCheckboxTd(id: number): string {
  return `<td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;"><input type="checkbox" class="report-chk" value="${id}" onchange="updateBulkPrintBtn()"></td>`;
}

// 履歴モーダル（各報告一覧ページ共通）
function reportLogModalHtml(): string {
  return `
  <div id="report-log-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1001;align-items:center;justify-content:center;padding:16px;" onclick="if(event.target===this)closeReportLogs()">
    <div style="background:white;border-radius:12px;padding:20px;width:100%;max-width:440px;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <h3 style="font-size:15px;font-weight:700;color:#1e3a5f;margin:0;">対応履歴</h3>
        <button onclick="closeReportLogs()" style="color:#9ca3af;font-size:22px;background:none;border:none;cursor:pointer;">✕</button>
      </div>
      <div id="report-log-body"></div>
    </div>
  </div>`;
}

// ===================================================
// 報告センター：ブラウザから直接報告するモーダル（LINEを使わない管理者・事務側の入力用）
//   忘れ物/事故/違反/一般報告の4フォーム共通の骨組み・乗務員検索を提供する。
//   1ページに1モーダルしか出さない前提で、要素IDは "nr-" 固定にして共通化している。
// ===================================================

// 一覧ページ上部の「＋ 新規報告」ボタン（クリックでモーダルを開く）
function newReportButtonHtml(label: string): string {
  return `<button onclick="openNewReportModal()" style="margin-left:auto;padding:7px 16px;background:#1e3a5f;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">＋ ${escHtml(label)}</button>`;
}

// モーダルの外枠（タイトル・閉じるボタン・フォーム本体・送信ボタン）
function newReportModalHtml(title: string, bodyHtml: string, submitLabel: string): string {
  return `
  <div id="nr-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1002;align-items:center;justify-content:center;padding:16px;" onclick="if(event.target===this)closeNewReportModal()">
    <div style="background:white;border-radius:12px;padding:20px;width:100%;max-width:480px;max-height:88vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <h3 style="font-size:15px;font-weight:700;color:#1e3a5f;margin:0;">${escHtml(title)}</h3>
        <button onclick="closeNewReportModal()" style="color:#9ca3af;font-size:22px;background:none;border:none;cursor:pointer;">✕</button>
      </div>
      <div id="nr-error" style="display:none;background:#fee2e2;color:#991b1b;border-radius:6px;padding:8px 10px;font-size:12px;margin-bottom:10px;"></div>
      <form id="nr-form" onsubmit="event.preventDefault();submitNewReport();">
        ${bodyHtml}
        <button type="submit" id="nr-submit-btn" style="width:100%;margin-top:16px;padding:12px;background:#1e3a5f;color:white;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">${escHtml(submitLabel)}</button>
      </form>
    </div>
  </div>`;
}

// フォーム共通のフィールドスタイル（LIFF側フォームに寄せて統一感を出す）
const NR_FIELD_STYLE = `
  <style>
    #nr-modal .nr-field { margin-bottom: 12px; }
    #nr-modal label { display: block; font-size: 12px; color: #374151; margin-bottom: 4px; font-weight: 600; }
    #nr-modal input[type=text], #nr-modal input[type=tel], #nr-modal input[type=time], #nr-modal input[type=date],
    #nr-modal textarea, #nr-modal select {
      width: 100%; border: 1px solid #d1d5db; border-radius: 6px; padding: 8px 10px;
      font-size: 14px; font-family: inherit; background: #f9fafb; color: #111827; box-sizing: border-box;
    }
    #nr-modal textarea { resize: vertical; min-height: 70px; }
    #nr-modal .nr-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    #nr-modal .nr-emp-wrap { position: relative; }
    #nr-modal .nr-emp-suggestions { position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #d1d5db; border-radius: 6px; z-index: 10; box-shadow: 0 4px 12px rgba(0,0,0,0.12); max-height: 180px; overflow-y: auto; margin-top: 2px; display: none; }
    #nr-modal .nr-emp-item { padding: 8px 10px; font-size: 13px; cursor: pointer; border-bottom: 1px solid #f3f4f6; }
    #nr-modal .nr-emp-item:last-child { border-bottom: none; }
    #nr-modal .nr-emp-item:hover { background: #eff6ff; }
    #nr-modal .nr-emp-meta { font-size: 11px; color: #6b7280; margin-top: 2px; }
    #nr-modal .nr-emp-selected { font-size: 12px; color: #059669; margin-top: 4px; font-weight: 600; }
    #nr-modal .nr-toggle-group { display: flex; gap: 8px; flex-wrap: wrap; }
    #nr-modal .nr-toggle-btn { padding: 6px 14px; border: 2px solid #d1d5db; border-radius: 6px; background: white; color: #374151; font-size: 13px; font-weight: 600; cursor: pointer; }
    #nr-modal .nr-toggle-btn.active { border-color: #1e3a5f; background: #eff6ff; color: #1e3a5f; }
    #nr-modal .nr-check-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; }
    #nr-modal .nr-check-row label { margin: 0; font-weight: 400; cursor: pointer; }
  </style>`;

// 乗務員検索フィールド（管理画面セッションの /api/liff-users/employee-search を使う。LIFFトークン不要）
function nrEmpSearchFieldHtml(): string {
  return `
    <div class="nr-field">
      <label>乗務員（あれば）</label>
      <div class="nr-emp-wrap">
        <input type="text" id="nr-emp-search" placeholder="氏名・社員番号で検索" autocomplete="off" oninput="nrEmpSearchDebounce()">
        <div class="nr-emp-suggestions" id="nr-emp-suggestions"></div>
      </div>
      <div class="nr-emp-selected" id="nr-emp-selected" style="display:none;"></div>
    </div>
    <div class="nr-row2 nr-field">
      <div>
        <label>課</label>
        <input type="text" id="nr-employee_division" readonly style="background:#f3f4f6;color:#6b7280;">
      </div>
      <div>
        <label>班</label>
        <input type="text" id="nr-employee_team" readonly style="background:#f3f4f6;color:#6b7280;">
      </div>
    </div>`;
}

// モーダル共通JS：開閉・エラー表示・乗務員検索（各ページのフォーム別JSから submitNewReport() を定義して使う）
// empSearchPath: 一覧ページごとに権限キーが違うため、そのタブ自身の権限（settings.lost-items等）で
// 通る専用パスを渡す（settings.liff権限がなくても各報告タブの権限だけで乗務員検索できるようにするため）
function newReportModalCoreJs(empSearchPath: string): string {
  return `
  var nrSelectedEmp = null;
  var nrEmpSearchTimer = null;

  function openNewReportModal() {
    document.getElementById('nr-form').reset();
    document.getElementById('nr-error').style.display = 'none';
    nrSelectedEmp = null;
    var sel = document.getElementById('nr-emp-selected');
    if (sel) { sel.style.display = 'none'; sel.textContent = ''; }
    if (typeof resetNewReportExtra === 'function') resetNewReportExtra();
    document.getElementById('nr-modal').style.display = 'flex';
  }
  function closeNewReportModal() {
    document.getElementById('nr-modal').style.display = 'none';
  }
  function nrShowError(msg) {
    var box = document.getElementById('nr-error');
    box.textContent = msg;
    box.style.display = 'block';
  }

  function nrEmpSearchDebounce() {
    clearTimeout(nrEmpSearchTimer);
    nrEmpSearchTimer = setTimeout(nrDoEmpSearch, 300);
  }
  function nrDoEmpSearch() {
    var q = document.getElementById('nr-emp-search').value.trim();
    var sug = document.getElementById('nr-emp-suggestions');
    if (q.length < 1) { sug.style.display = 'none'; return; }
    fetch('${ADMIN_PATH}${empSearchPath}?q=' + encodeURIComponent(q))
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var list = (data && data.results) || [];
        if (!list.length) { sug.style.display = 'none'; return; }
        sug.innerHTML = list.map(function(e) {
          var div = e.division ? e.division + '課' : '';
          var team = e.team ? e.team + '班' : '';
          return '<div class="nr-emp-item" onclick="nrSelectEmp(' + JSON.stringify(e).replace(/</g,'\\\\u003c').replace(/"/g,'&quot;') + ')">'
            + '<div>' + e.name + '</div><div class="nr-emp-meta">' + div + team + ' / ' + e.emp_no + '</div></div>';
        }).join('');
        sug.style.display = 'block';
      })
      .catch(function() { sug.style.display = 'none'; });
  }
  function nrSelectEmp(e) {
    nrSelectedEmp = e;
    document.getElementById('nr-emp-search').value = '';
    document.getElementById('nr-emp-suggestions').style.display = 'none';
    var div = e.division ? e.division + '課' : '';
    var team = e.team ? e.team + '班' : '';
    var sel = document.getElementById('nr-emp-selected');
    sel.style.display = 'block';
    sel.textContent = '選択中: ' + e.name + '（' + div + team + ' / ' + e.emp_no + '）';
    document.getElementById('nr-employee_division').value = e.division || '';
    document.getElementById('nr-employee_team').value = e.team || '';
  }
  document.addEventListener('click', function(e) {
    var sug = document.getElementById('nr-emp-suggestions');
    var input = document.getElementById('nr-emp-search');
    if (sug && input && !input.contains(e.target) && !sug.contains(e.target)) sug.style.display = 'none';
  });
  // フローティング新規報告ボタン（?new=1）から遷移してきた場合はモーダルを自動で開く
  if (new URLSearchParams(location.search).get('new') === '1') {
    openNewReportModal();
    if (window.history && window.history.replaceState) {
      var nrCleanUrl = new URL(location.href);
      nrCleanUrl.searchParams.delete('new');
      window.history.replaceState({}, '', nrCleanUrl.toString());
    }
  }
  `;
}

// ===================================================
// GET /settings/liff — LIFF権限管理ページ
// ===================================================
app.get('/settings/liff', async (c) => {
  const users = await c.env.DB.prepare(`
    SELECT u.id, u.line_uid, u.name, u.role, u.emp_id, u.created_at, u.updated_at,
           e.emp_no, e.division, e.team
    FROM line_liff_users u
    LEFT JOIN employees e ON u.emp_id = e.id
    ORDER BY
      CASE u.role
        WHEN 'general_manager' THEN 1
        WHEN 'operations_manager' THEN 2
        WHEN 'vehicle_manager' THEN 3
        WHEN 'newcomer' THEN 4
        WHEN 'benten_shift_master' THEN 5
        WHEN 'benten_member' THEN 6
        ELSE 7
      END, u.created_at DESC
  `).all<{
    id: number; line_uid: string; name: string; role: string;
    emp_id: number | null; created_at: string; updated_at: string;
    emp_no: string | null; division: number | null; team: number | null;
  }>();

  const all = users.results ?? [];

  const instructorsRes = await c.env.DB.prepare(
    'SELECT id, name, line_uid FROM instructors WHERE is_active = 1 ORDER BY sort_order, id'
  ).all<{ id: number; name: string; line_uid: string | null }>();
  const instructors = instructorsRes.results ?? [];

  const regCodesRes = await c.env.DB.prepare(`
    SELECT q.token, q.target_type, q.role, q.instructor_id, q.is_used, q.expires_at, q.created_at,
           i.name AS instructor_name
    FROM line_reg_qrcodes q
    LEFT JOIN instructors i ON i.id = q.instructor_id
    ORDER BY q.created_at DESC
    LIMIT 50
  `).all<{
    token: string; target_type: string; role: string | null; instructor_id: number | null;
    is_used: number; expires_at: string; created_at: string; instructor_name: string | null;
  }>();
  const regCodes = regCodesRes.results ?? [];

  // 統計
  const stats: Record<string, number> = {};
  for (const u of all) { stats[u.role] = (stats[u.role] ?? 0) + 1; }

  const statCards = Object.entries(ROLE_LABELS).map(([role, label]) => {
    const count = stats[role] ?? 0;
    const color = ROLE_COLORS[role];
    return `<div style="background:white;border-radius:10px;padding:14px 18px;box-shadow:0 1px 3px rgba(0,0,0,0.08);display:flex;flex-direction:column;align-items:center;gap:4px;">
      <div style="font-size:22px;font-weight:700;color:${color};">${count}</div>
      <div style="font-size:12px;color:#6b7280;">${escHtml(label)}</div>
    </div>`;
  }).join('');

  const rows = all.map(u => {
    const role = u.role ?? 'unknown';
    const label = ROLE_LABELS[role] ?? role;
    const color = ROLE_COLORS[role] ?? '#9ca3af';
    const empInfo = u.division ? `${u.division}課${u.team ? u.team + '班' : ''} / ${u.emp_no ?? ''}` : (u.emp_no ?? '');
    const options = Object.entries(ROLE_LABELS).map(([r, l]) =>
      `<option value="${r}" ${r === role ? 'selected' : ''}>${escHtml(l)}</option>`
    ).join('');
    const searchBlob = `${(u.name ?? '')} ${(u.emp_no ?? '')}`.toLowerCase();
    return `<tr id="row-${u.id}" data-role="${role}" data-search="${escHtml(searchBlob)}" data-linked="${u.emp_id ? '1' : '0'}">
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">
        <div onclick="openLinkModal(${u.id})" title="タップして氏名修正・社員紐付け" style="font-size:14px;font-weight:600;color:#111827;cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px;">${escHtml(u.name ?? '（名前未設定）')}</div>
        ${empInfo ? `<div style="font-size:11px;color:#6b7280;margin-top:2px;">${escHtml(empInfo)}</div>` : '<div style="font-size:11px;color:#d97706;margin-top:2px;">社員未紐付け</div>'}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:11px;font-family:monospace;color:#9ca3af;">
        ${escHtml(u.line_uid.slice(0, 12))}…
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">
        <span style="background:${color};color:white;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;">${escHtml(label)}</span>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">
        <div style="display:flex;gap:8px;align-items:center;">
          <select id="role-sel-${u.id}" style="border:1px solid #d1d5db;border-radius:6px;padding:5px 8px;font-size:13px;background:white;">
            ${options}
          </select>
          <button onclick="changeRole(${u.id})"
            style="padding:5px 10px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:12px;cursor:pointer;white-space:nowrap;">変更</button>
        </div>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#9ca3af;white-space:nowrap;">
        ${escHtml(u.created_at.slice(0, 10))}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;">
        <button onclick="deleteUser(${u.id},'${escHtml(u.name ?? '')}')"
          style="padding:4px 8px;background:#fee2e2;color:#991b1b;border:none;border-radius:4px;font-size:11px;cursor:pointer;">削除</button>
      </td>
    </tr>`;
  }).join('');

  const roleOptionsForIssue = Object.entries(ROLE_LABELS)
    .filter(([r]) => r !== 'unknown')
    .map(([r, l]) => `<option value="${r}">${escHtml(l)}</option>`).join('');

  const instructorOptions = instructors.map(i =>
    `<option value="${i.id}">${escHtml(i.name)}${i.line_uid ? '（連携済み）' : ''}</option>`
  ).join('');

  const nowIso = new Date().toISOString();
  const regCodeRows = regCodes.map(q => {
    const expired = q.expires_at < nowIso;
    const label = q.target_type === 'instructor'
      ? `班長・指導者: ${escHtml(q.instructor_name ?? '')}`
      : escHtml(ROLE_LABELS[q.role ?? ''] ?? q.role ?? '');
    const statusHtml = (q.target_type === 'instructor' && q.is_used)
      ? '<span style="background:#bbf7d0;padding:2px 8px;border-radius:4px;font-size:12px;">使用済</span>'
      : expired
        ? '<span style="background:#fee2e2;padding:2px 8px;border-radius:4px;font-size:12px;">期限切れ</span>'
        : '<span style="background:#fef9c3;padding:2px 8px;border-radius:4px;font-size:12px;">有効</span>';
    return `<tr id="reg-row-${escHtml(q.token)}">
      <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">${label}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;">${statusHtml}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;">${q.expires_at.slice(0, 16)}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #f3f4f6;">
        <button onclick="revokeCode('${escHtml(q.token)}')" style="padding:2px 8px;background:#fee2e2;color:#991b1b;border:none;border-radius:4px;font-size:11px;cursor:pointer;">失効</button>
      </td>
    </tr>`;
  }).join('');

  const instructorLinkRows = instructors.map(i => `
    <tr>
      <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:600;">${escHtml(i.name)}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;">
        ${i.line_uid
          ? '<span style="background:#bbf7d0;padding:2px 8px;border-radius:4px;font-size:12px;">連携済み</span>'
          : '<span style="background:#f3f4f6;color:#9ca3af;padding:2px 8px;border-radius:4px;font-size:12px;">未連携</span>'}
      </td>
    </tr>`).join('');

  const content = `
    ${subHeader('LINE連携')}

    <!-- タブ -->
    <div style="display:flex;gap:8px;margin-bottom:20px;">
      <button id="tab-btn-issue" onclick="switchTab('issue')" style="padding:10px 20px;border:none;border-radius:8px 8px 0 0;font-size:14px;font-weight:700;cursor:pointer;background:#1e3a5f;color:white;">QRコード発行</button>
      <button id="tab-btn-users" onclick="switchTab('users')" style="padding:10px 20px;border:none;border-radius:8px 8px 0 0;font-size:14px;font-weight:700;cursor:pointer;background:#e5e7eb;color:#6b7280;">連携済みユーザー管理</button>
    </div>

    <!-- タブA: QRコード発行 -->
    <div id="tab-issue">
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:14px 18px;margin-bottom:20px;font-size:13px;color:#1e40af;">
        リッチメニューの「登録はこちら」から氏名入力＋QR読み取り画面が開きます。ここで発行したQRコードを本人に見せて読み取ってもらってください。
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px;">
        <!-- ロール指定QR -->
        <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);padding:20px;">
          <h3 style="font-size:15px;font-weight:bold;color:#1e3a5f;margin-bottom:16px;">ロール指定QR発行</h3>
          <div style="margin-bottom:12px;">
            <label style="font-size:13px;color:#6b7280;display:block;margin-bottom:6px;">ロール（新人を含む）</label>
            <select id="issue-role" style="width:100%;border:1px solid #d1d5db;border-radius:8px;padding:8px;font-size:13px;">
              ${roleOptionsForIssue}
            </select>
          </div>
          <div style="margin-bottom:12px;">
            <label style="font-size:13px;color:#6b7280;display:block;margin-bottom:6px;">有効期限</label>
            <select id="issue-role-hours" style="width:100%;border:1px solid #d1d5db;border-radius:8px;padding:8px;font-size:13px;">
              <option value="24">24時間</option>
              <option value="1">1時間</option>
              <option value="72">3日間</option>
              <option value="168">7日間</option>
            </select>
          </div>
          <div style="font-size:12px;color:#9ca3af;margin-bottom:12px;">期限内であれば複数人が同じQRで登録できます</div>
          <button onclick="issueRoleQr()" style="width:100%;padding:10px;background:#2563eb;color:white;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">QRコードを発行する</button>
          <div id="role-qr-result" style="display:none;margin-top:16px;padding:16px;background:#f0f9ff;border-radius:8px;text-align:center;"></div>
        </div>

        <!-- 班長・指導者 個別QR -->
        <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);padding:20px;">
          <h3 style="font-size:15px;font-weight:bold;color:#1e3a5f;margin-bottom:16px;">班長・指導者 個別QR発行</h3>
          <div style="margin-bottom:12px;">
            <label style="font-size:13px;color:#6b7280;display:block;margin-bottom:6px;">対象者を選択</label>
            <select id="issue-instructor" style="width:100%;border:1px solid #d1d5db;border-radius:8px;padding:8px;font-size:13px;">
              <option value="">選択してください...</option>
              ${instructorOptions}
            </select>
          </div>
          <div style="font-size:12px;color:#9ca3af;margin-bottom:12px;">有効期限24時間・1回使用すると失効します</div>
          <button onclick="issueInstructorQr()" style="width:100%;padding:10px;background:#2563eb;color:white;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">QRコードを発行する</button>
          <div id="instructor-qr-result" style="display:none;margin-top:16px;padding:16px;background:#f0f9ff;border-radius:8px;text-align:center;"></div>
        </div>
      </div>

      <!-- 発行済みQR一覧 -->
      <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);overflow:hidden;">
        <div style="padding:14px 20px;border-bottom:1px solid #f3f4f6;">
          <div style="font-size:15px;font-weight:700;color:#1e3a5f;">発行済みQRコード</div>
        </div>
        <table style="width:100%;border-collapse:collapse;">
          <thead style="background:#f9fafb;">
            <tr>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;">対象</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;">状態</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;">有効期限</th>
              <th style="padding:8px 12px;"></th>
            </tr>
          </thead>
          <tbody id="reg-code-tbody">${regCodeRows || '<tr><td colspan="4" style="padding:20px;text-align:center;color:#9ca3af;">発行済みのQRコードはありません</td></tr>'}</tbody>
        </table>
      </div>
    </div>

    <!-- タブB: 連携済みユーザー管理 -->
    <div id="tab-users" style="display:none;">
      <!-- 統計カード -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px;margin-bottom:20px;">
        ${statCards}
      </div>

      <!-- 検索・絞り込み -->
      <div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap;">
        <input id="user-search" type="text" placeholder="氏名・社員番号で検索…" oninput="filterUsers()" style="flex:1;min-width:200px;border:1px solid #d1d5db;border-radius:8px;padding:9px 12px;font-size:13px;box-sizing:border-box;">
        <select id="role-filter" onchange="filterUsers()" style="border:1px solid #d1d5db;border-radius:8px;padding:9px 12px;font-size:13px;background:white;">
          <option value="">すべてのロール</option>
          ${Object.entries(ROLE_LABELS).map(([r, l]) => `<option value="${r}">${escHtml(l)}</option>`).join('')}
        </select>
        <select id="link-filter" onchange="filterUsers()" style="border:1px solid #d1d5db;border-radius:8px;padding:9px 12px;font-size:13px;background:white;">
          <option value="">紐付け状況すべて</option>
          <option value="1">社員紐付け済み</option>
          <option value="0">未紐付け</option>
        </select>
      </div>

      <!-- ユーザー一覧 -->
      <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);overflow:hidden;margin-bottom:20px;">
        <div style="padding:14px 20px;border-bottom:1px solid #f3f4f6;display:flex;align-items:center;justify-content:space-between;">
          <div style="font-size:15px;font-weight:700;color:#1e3a5f;" id="user-count-label">登録ユーザー（${all.length}名）</div>
        </div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;min-width:600px;">
          <thead style="background:#f9fafb;">
            <tr>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">氏名</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">LINE UID</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">現在の権限</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">権限変更</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">登録日</th>
              <th style="padding:8px 12px;"></th>
            </tr>
          </thead>
          <tbody id="user-tbody">
            ${rows || '<tr><td colspan="6" style="padding:24px;text-align:center;color:#9ca3af;">登録ユーザーがいません</td></tr>'}
          </tbody>
        </table>
      </div>
      </div>

      <!-- 班長・指導者の連携状況 -->
      <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);overflow:hidden;">
        <div style="padding:14px 20px;border-bottom:1px solid #f3f4f6;">
          <div style="font-size:15px;font-weight:700;color:#1e3a5f;">班長・指導者の連携状況</div>
        </div>
        <table style="width:100%;border-collapse:collapse;">
          <thead style="background:#f9fafb;">
            <tr>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;">氏名</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;">連携状況</th>
            </tr>
          </thead>
          <tbody>${instructorLinkRows || '<tr><td colspan="2" style="padding:20px;text-align:center;color:#9ca3af;">班長・指導者が登録されていません</td></tr>'}</tbody>
        </table>
      </div>
    </div>

    <!-- 氏名修正・社員紐付けモーダル -->
    <div id="link-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;align-items:center;justify-content:center;padding:12px;">
      <div style="background:white;border-radius:12px;padding:20px;width:100%;max-width:440px;max-height:88vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <h3 style="font-size:15px;font-weight:700;color:#1e3a5f;margin:0;">氏名修正・社員紐付け</h3>
          <button onclick="closeLinkModal()" style="color:#9ca3af;font-size:22px;background:none;border:none;cursor:pointer;">✕</button>
        </div>
        <div style="font-size:12px;color:#6b7280;margin-bottom:4px;font-weight:600;">表示名（LINE連携ミスがあれば修正）</div>
        <input id="link-name" type="text" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;margin-bottom:14px;box-sizing:border-box;">

        <div style="font-size:12px;color:#6b7280;margin-bottom:4px;font-weight:600;">社員名簿との紐付け</div>
        <div id="link-current" style="font-size:12px;margin-bottom:8px;"></div>
        <input id="link-search" type="text" placeholder="社員名または社員番号で検索…" oninput="searchEmployee(this.value)" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;margin-bottom:6px;box-sizing:border-box;">
        <div id="link-candidates" style="max-height:180px;overflow-y:auto;border:1px solid #f3f4f6;border-radius:6px;"></div>

        <div id="link-error" style="display:none;color:#dc2626;font-size:12px;margin-top:8px;"></div>
        <div style="display:flex;gap:8px;margin-top:16px;">
          <button onclick="closeLinkModal()" style="flex:1;padding:10px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;cursor:pointer;background:#fff;">キャンセル</button>
          <button onclick="saveLinkModal()" id="link-save-btn" style="flex:2;padding:10px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;">保存</button>
        </div>
      </div>
    </div>

    <script>
    const ADMIN_PATH = '${ADMIN_PATH}';
    var LINK_USERS = ${safeJson(all.map(u => ({ id: u.id, name: u.name, emp_id: u.emp_id, emp_no: u.emp_no, division: u.division, team: u.team })))};
    var ROLE_LABELS_JS = ${safeJson(ROLE_LABELS)};
    var _linkId = null;
    var _linkSelectedEmpId = null;

    function switchTab(tab) {
      document.getElementById('tab-issue').style.display = tab === 'issue' ? 'block' : 'none';
      document.getElementById('tab-users').style.display = tab === 'users' ? 'block' : 'none';
      document.getElementById('tab-btn-issue').style.background = tab === 'issue' ? '#1e3a5f' : '#e5e7eb';
      document.getElementById('tab-btn-issue').style.color = tab === 'issue' ? 'white' : '#6b7280';
      document.getElementById('tab-btn-users').style.background = tab === 'users' ? '#1e3a5f' : '#e5e7eb';
      document.getElementById('tab-btn-users').style.color = tab === 'users' ? 'white' : '#6b7280';
    }

    function filterUsers() {
      var q = document.getElementById('user-search').value.trim().toLowerCase();
      var role = document.getElementById('role-filter').value;
      var linked = document.getElementById('link-filter').value;
      var rowsEl = document.querySelectorAll('#user-tbody tr[data-role]');
      var visible = 0;
      rowsEl.forEach(function(tr) {
        var matchQ = !q || (tr.getAttribute('data-search') || '').indexOf(q) !== -1;
        var matchRole = !role || tr.getAttribute('data-role') === role;
        var matchLinked = !linked || tr.getAttribute('data-linked') === linked;
        var show = matchQ && matchRole && matchLinked;
        tr.style.display = show ? '' : 'none';
        if (show) visible++;
      });
      document.getElementById('user-count-label').textContent = '登録ユーザー（' + visible + ' / ${all.length}名）';
    }

    async function issueRoleQr() {
      var role = document.getElementById('issue-role').value;
      var hours = parseInt(document.getElementById('issue-role-hours').value);
      var res = await fetch('/api/line-reg/issue', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_type: 'role', role: role, hours: hours }),
      });
      var j = await res.json();
      if (!res.ok) { alert('発行に失敗しました: ' + (j.error || '')); return; }
      var el = document.getElementById('role-qr-result');
      el.innerHTML = j.qr_svg + '<div style="font-size:12px;color:#6b7280;margin-top:8px;">有効期限: ' + j.expires_at.slice(0, 16) + '</div>';
      el.style.display = 'block';
      prependRegRow(j, role, null);
    }

    async function issueInstructorQr() {
      var instructorId = document.getElementById('issue-instructor').value;
      if (!instructorId) { alert('対象者を選択してください'); return; }
      var res = await fetch('/api/line-reg/issue', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_type: 'instructor', instructor_id: parseInt(instructorId) }),
      });
      var j = await res.json();
      if (!res.ok) { alert('発行に失敗しました: ' + (j.error || '')); return; }
      var el = document.getElementById('instructor-qr-result');
      el.innerHTML = j.qr_svg + '<div style="font-size:12px;color:#6b7280;margin-top:8px;">有効期限: ' + j.expires_at.slice(0, 16) + '</div>';
      el.style.display = 'block';
      var name = document.getElementById('issue-instructor').selectedOptions[0].textContent;
      prependRegRow(j, null, name);
    }

    function prependRegRow(j, role, instructorName) {
      var tbody = document.getElementById('reg-code-tbody');
      var label = instructorName ? ('班長・指導者: ' + instructorName) : (ROLE_LABELS_JS[role] || role);
      var tr = document.createElement('tr');
      tr.id = 'reg-row-' + j.token;
      tr.innerHTML = '<td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">' + label + '</td>'
        + '<td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;"><span style="background:#fef9c3;padding:2px 8px;border-radius:4px;font-size:12px;">有効</span></td>'
        + '<td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;">' + j.expires_at.slice(0, 16) + '</td>'
        + '<td style="padding:4px 8px;border-bottom:1px solid #f3f4f6;"><button onclick="revokeCode(\\'' + j.token + '\\')" style="padding:2px 8px;background:#fee2e2;color:#991b1b;border:none;border-radius:4px;font-size:11px;cursor:pointer;">失効</button></td>';
      if (tbody.children.length === 1 && tbody.children[0].children.length === 1) tbody.innerHTML = '';
      tbody.insertBefore(tr, tbody.firstChild);
    }

    async function revokeCode(token) {
      if (!confirm('このQRコードを失効させますか？')) return;
      var res = await fetch('/api/line-reg/' + encodeURIComponent(token), { method: 'DELETE' });
      if (res.ok) {
        var row = document.getElementById('reg-row-' + token);
        if (row) row.remove();
      } else {
        alert('失効に失敗しました');
      }
    }

    function closeLinkModal() { document.getElementById('link-modal').style.display = 'none'; }

    function renderCurrentLink(u) {
      var el = document.getElementById('link-current');
      if (u.emp_id) {
        el.innerHTML = '社員番号 <b>' + (u.emp_no || '') + '</b>' + (u.division ? '（' + u.division + '課' + (u.team ? u.team + '班' : '') + '）' : '') + ' に紐付け済み　<a href="#" onclick="unlinkEmployee();return false;" style="color:#dc2626;">解除</a>';
      } else {
        el.innerHTML = '<span style="color:#d97706;">未紐付け</span>';
      }
    }

    function unlinkEmployee() {
      _linkSelectedEmpId = null;
      document.getElementById('link-current').innerHTML = '<span style="color:#d97706;">未紐付け（解除予定）</span>';
      document.getElementById('link-candidates').innerHTML = '';
      document.getElementById('link-search').value = '';
    }

    function openLinkModal(id) {
      var u = LINK_USERS.find(function(x) { return x.id === id; });
      if (!u) return;
      _linkId = id;
      _linkSelectedEmpId = u.emp_id || null;
      document.getElementById('link-name').value = u.name || '';
      document.getElementById('link-search').value = '';
      document.getElementById('link-candidates').innerHTML = '';
      document.getElementById('link-error').style.display = 'none';
      renderCurrentLink(u);
      document.getElementById('link-modal').style.display = 'flex';
    }

    var _searchTimer = null;
    function searchEmployee(q) {
      clearTimeout(_searchTimer);
      if (!q || q.trim().length < 1) { document.getElementById('link-candidates').innerHTML = ''; return; }
      _searchTimer = setTimeout(async function() {
        var res = await fetch(ADMIN_PATH + '/api/liff-users/employee-search?q=' + encodeURIComponent(q.trim()));
        var d = await res.json().catch(function() { return { results: [] }; });
        var list = d.results || [];
        document.getElementById('link-candidates').innerHTML = list.length === 0
          ? '<div style="padding:10px;font-size:12px;color:#9ca3af;">該当する社員が見つかりません</div>'
          : list.map(function(e) {
              return '<div onclick="selectEmployee(' + e.id + ',\\'' + e.name.replace(/'/g, "\\\\'") + '\\',\\'' + (e.emp_no || '') + '\\')" style="padding:8px 10px;font-size:13px;cursor:pointer;border-bottom:1px solid #f9fafb;" onmouseover="this.style.background=\\'#f8fafc\\'" onmouseout="this.style.background=\\'#fff\\'">'
                + e.name + ' <span style="color:#9ca3af;font-size:11px;">（' + (e.emp_no || '') + (e.division ? ' / ' + e.division + '課' + (e.team ? e.team + '班' : '') : '') + '）</span></div>';
            }).join('');
      }, 250);
    }

    function selectEmployee(empId, name, empNo) {
      _linkSelectedEmpId = empId;
      document.getElementById('link-current').innerHTML = '選択中: <b>' + name + '</b>（' + empNo + '）　<a href="#" onclick="unlinkEmployee();return false;" style="color:#dc2626;">取消</a>';
      document.getElementById('link-candidates').innerHTML = '';
      document.getElementById('link-search').value = '';
    }

    async function saveLinkModal() {
      var btn = document.getElementById('link-save-btn');
      btn.disabled = true; btn.textContent = '保存中...';
      var newName = document.getElementById('link-name').value.trim();
      try {
        if (!newName) throw new Error('氏名を入力してください');
        var r1 = await fetch(ADMIN_PATH + '/api/liff-users/' + _linkId + '/name', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName }),
        });
        if (!r1.ok) throw new Error((await r1.json().catch(function(){return {};})).error || '氏名の保存に失敗しました');

        var r2 = await fetch(ADMIN_PATH + '/api/liff-users/' + _linkId + '/emp-link', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emp_id: _linkSelectedEmpId }),
        });
        if (!r2.ok) throw new Error((await r2.json().catch(function(){return {};})).error || '社員紐付けの保存に失敗しました');

        location.reload();
      } catch (e) {
        document.getElementById('link-error').textContent = e.message;
        document.getElementById('link-error').style.display = 'block';
        btn.disabled = false; btn.textContent = '保存';
      }
    }

    async function changeRole(id) {
      const sel = document.getElementById('role-sel-' + id);
      const role = sel.value;
      const res = await fetch(ADMIN_PATH + '/api/liff-users/' + id + '/role', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      if (res.ok) { location.reload(); }
      else { alert('変更に失敗しました'); }
    }
    async function deleteUser(id, name) {
      if (!confirm(name + ' を削除しますか？\\nLINE連携が解除されます。')) return;
      const res = await fetch(ADMIN_PATH + '/api/liff-users/' + id, { method: 'DELETE' });
      if (res.ok) { location.reload(); }
      else { alert('削除に失敗しました'); }
    }
    </script>
  `;

  return c.html(layout('LINE連携', content, 'settings'));
});

// ===================================================
// GET /settings/lost-items — 忘れ物報告一覧
// ===================================================
app.get('/settings/lost-items', async (c) => {
  const typeFilter = c.req.query('type') ?? '';
  const statusFilter = c.req.query('status') ?? '';

  let where = 'WHERE 1=1';
  const binds: string[] = [];
  if (typeFilter === 'staff' || typeFilter === 'customer') {
    where += ' AND r.report_type = ?'; binds.push(typeFilter);
  }
  if (statusFilter === 'open' || statusFilter === 'resolved') {
    where += ' AND r.status = ?'; binds.push(statusFilter);
  }

  const reports = await c.env.DB.prepare(
    `SELECT r.*, u.name AS reporter_name
     FROM lost_item_reports r
     LEFT JOIN line_liff_users u ON u.line_uid = r.reported_by_uid
     ${where} ORDER BY r.created_at DESC LIMIT 200`
  ).bind(...binds).all<{
    id: number; report_type: string; received_at: string | null;
    vehicle_no: string | null; employee_name: string | null;
    employee_division: number | null; employee_team: number | null; employee_emp_no: string | null;
    item_description: string | null; pickup_location: string | null; dropoff_location: string | null;
    customer_name: string | null; customer_phone: string | null; return_method: string | null;
    notes: string | null; status: string; created_at: string;
    resolved_by_name: string | null; resolved_at: string | null;
    reporter_name: string | null; reported_by_admin: string | null;
  }>();

  const all = reports.results ?? [];

  const rows = all.map(r => {
    const isCustomer = r.report_type === 'customer';
    const typeLabel = isCustomer ? '客問い合わせ' : '社員報告';
    const typeColor = isCustomer ? '#7c3aed' : '#1d4ed8';
    const empStr = empDisplay(r.employee_name, r.employee_division, r.employee_team, r.employee_emp_no);
    const handoverTitle = `${r.vehicle_no ?? '車番不明'} の忘れ物報告`;
    const handoverSummary = truncateSummary(r.item_description);
    return `<tr id="report-row-${r.id}">
      ${reportCheckboxTd(r.id)}
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;white-space:nowrap;">${escHtml(r.created_at.slice(0, 16))}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">
        <span style="background:${typeColor};color:white;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;">${escHtml(typeLabel)}</span>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">${escHtml(r.received_at ?? '—')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:600;">${escHtml(r.vehicle_no ?? '—')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">${escHtml(empStr)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(r.item_description ?? '')}">${escHtml(r.item_description ?? '—')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#374151;">${escHtml(reporterDisplay(r.reporter_name, r.reported_by_admin))}</td>
      <td id="st-${r.id}" style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">
        ${statusCellHtml(r.status === 'resolved', '解決済')}
      </td>
      <td id="res-${r.id}" style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">
        ${resolverCellHtml(r.resolved_by_name, r.resolved_at)}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;white-space:nowrap;">
        <button onclick="toggleReportStatus(${r.id},this)" data-status="${r.status}"
          style="padding:3px 8px;background:#f3f4f6;color:#374151;border:1px solid #d1d5db;border-radius:4px;font-size:11px;cursor:pointer;">
          ${r.status === 'resolved' ? '再開' : '解決済にする'}
        </button>
        <button onclick="showReportLogs(${r.id})"
          style="padding:3px 8px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:4px;font-size:11px;cursor:pointer;margin-left:4px;">履歴</button>
        <button onclick="deleteReport(${r.id},'${escHtml((r.item_description ?? '').slice(0, 20))}')"
          style="padding:3px 8px;background:#fee2e2;color:#991b1b;border:none;border-radius:4px;font-size:11px;cursor:pointer;margin-left:4px;">削除</button>
        ${printLinkHtml('/settings/lost-items/print', r.id)}
        ${handoverLinkButtonHtml('/settings/lost-items/print', r.id, handoverTitle, handoverSummary)}
      </td>
    </tr>`;
  }).join('');

  const buildUrl = (t: string, s: string) =>
    `${ADMIN_PATH}/settings/lost-items?type=${t}&status=${s}`;

  const filterBtn = (label: string, t: string, s: string) => {
    const active = typeFilter === t && statusFilter === s;
    return `<a href="${buildUrl(t, s)}" style="padding:6px 14px;border-radius:20px;font-size:13px;text-decoration:none;font-weight:600;
      ${active ? 'background:#1e3a5f;color:white;' : 'background:white;color:#374151;border:1px solid #d1d5db;'}">${escHtml(label)}</a>`;
  };

  const content = `
    ${subHeader('報告センター')}
    ${reportTabs('lost')}

    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px;align-items:center;">
      ${filterBtn('すべて', '', '')}
      ${filterBtn('社員報告', 'staff', '')}
      ${filterBtn('客問い合わせ', 'customer', '')}
      ${filterBtn('対応中', '', 'open')}
      ${filterBtn('解決済', '', 'resolved')}
      ${newReportButtonHtml('新規報告')}
    </div>

    ${bulkPrintBarHtml()}

    <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);overflow:hidden;">
      <div style="padding:14px 20px;border-bottom:1px solid #f3f4f6;">
        <span id="report-count" style="font-size:15px;font-weight:700;color:#1e3a5f;">報告 ${all.length}件</span>
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;min-width:700px;">
          <thead style="background:#f9fafb;">
            <tr>
              ${reportCheckboxTh()}
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">登録日時</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">種別</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">受電</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">車番</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">乗務員</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">忘れ物</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">報告者</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">状態</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">対応者</th>
              <th style="padding:8px 12px;"></th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="11" style="padding:24px;text-align:center;color:#9ca3af;">報告がありません</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    ${reportLogModalHtml()}
    ${NR_FIELD_STYLE}
    ${newReportModalHtml('忘れ物報告の新規登録', `
      <div class="nr-field">
        <label>種別</label>
        <div class="nr-toggle-group">
          <button type="button" class="nr-toggle-btn active" id="nr-type-staff" onclick="nrSetLostType('staff')">社員からの報告</button>
          <button type="button" class="nr-toggle-btn" id="nr-type-customer" onclick="nrSetLostType('customer')">客からの問い合わせ</button>
        </div>
      </div>
      <div class="nr-row2 nr-field">
        <div><label>受電時刻</label><input type="time" id="nr-received_at"></div>
        <div><label>車番</label><input type="text" id="nr-vehicle_no" placeholder="例: 5232" inputmode="numeric"></div>
      </div>
      ${nrEmpSearchFieldHtml()}
      <div class="nr-field"><label>忘れ物の内容</label><textarea id="nr-item_description" placeholder="例: 黒い財布、iPhone"></textarea></div>
      <div class="nr-row2 nr-field">
        <div><label>乗車地</label><input type="text" id="nr-pickup_location" placeholder="例: 板橋駅"></div>
        <div><label>降車地</label><input type="text" id="nr-dropoff_location" placeholder="例: 池袋駅"></div>
      </div>
      <div id="nr-customer-section" style="display:none;">
        <div class="nr-row2 nr-field">
          <div><label>お客様氏名</label><input type="text" id="nr-customer_name" placeholder="田中 一郎"></div>
          <div><label>お客様電話番号</label><input type="tel" id="nr-customer_phone" placeholder="090-0000-0000"></div>
        </div>
        <div class="nr-field">
          <label>返却方法</label>
          <div class="nr-toggle-group">
            <button type="button" class="nr-toggle-btn" id="nr-return-cod" onclick="nrSetReturnMethod('着払い')">着払い</button>
            <button type="button" class="nr-toggle-btn" id="nr-return-pickup" onclick="nrSetReturnMethod('来社受け取り')">来社受け取り</button>
          </div>
        </div>
      </div>
      <div class="nr-field"><label>備考</label><textarea id="nr-notes" placeholder="その他、特記事項があれば"></textarea></div>
    `, '登録する')}
    <script>
    ${reportRowScript('/api/liff/lost-items', '忘れ物報告', '解決済', '/settings/lost-items/print-bulk')}
    ${newReportModalCoreJs('/api/liff/lost-items/employee-search')}
    var nrLostType = 'staff';
    var nrReturnMethod = '';
    function nrSetLostType(t) {
      nrLostType = t;
      document.getElementById('nr-type-staff').className = 'nr-toggle-btn' + (t === 'staff' ? ' active' : '');
      document.getElementById('nr-type-customer').className = 'nr-toggle-btn' + (t === 'customer' ? ' active' : '');
      document.getElementById('nr-customer-section').style.display = t === 'customer' ? 'block' : 'none';
    }
    function nrSetReturnMethod(m) {
      nrReturnMethod = m;
      document.getElementById('nr-return-cod').className = 'nr-toggle-btn' + (m === '着払い' ? ' active' : '');
      document.getElementById('nr-return-pickup').className = 'nr-toggle-btn' + (m === '来社受け取り' ? ' active' : '');
    }
    function resetNewReportExtra() {
      nrSetLostType('staff');
      nrReturnMethod = '';
      document.getElementById('nr-return-cod').className = 'nr-toggle-btn';
      document.getElementById('nr-return-pickup').className = 'nr-toggle-btn';
    }
    function submitNewReport() {
      var btn = document.getElementById('nr-submit-btn');
      btn.disabled = true;
      var payload = {
        report_type: nrLostType,
        received_at: document.getElementById('nr-received_at').value || null,
        vehicle_no: document.getElementById('nr-vehicle_no').value.trim() || null,
        employee_name: nrSelectedEmp ? nrSelectedEmp.name : null,
        employee_emp_no: nrSelectedEmp ? nrSelectedEmp.emp_no : null,
        employee_division: nrSelectedEmp ? nrSelectedEmp.division : null,
        employee_team: nrSelectedEmp ? nrSelectedEmp.team : null,
        item_description: document.getElementById('nr-item_description').value.trim() || null,
        pickup_location: document.getElementById('nr-pickup_location').value.trim() || null,
        dropoff_location: document.getElementById('nr-dropoff_location').value.trim() || null,
        customer_name: document.getElementById('nr-customer_name').value.trim() || null,
        customer_phone: document.getElementById('nr-customer_phone').value.trim() || null,
        return_method: nrReturnMethod || null,
        notes: document.getElementById('nr-notes').value.trim() || null,
      };
      fetch('${ADMIN_PATH}/api/liff/lost-items', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        btn.disabled = false;
        if (data.ok) { location.reload(); }
        else { nrShowError(data.error || '登録に失敗しました'); }
      })
      .catch(function() { btn.disabled = false; nrShowError('通信エラーが発生しました'); });
    }
    </script>
  `;

  return c.html(layout('忘れ物報告一覧', content, 'settings'));
});

// ===================================================
// GET /settings/accidents — 事故報告一覧
// ===================================================
app.get('/settings/accidents', async (c) => {
  const statusFilter = c.req.query('status') ?? '';

  let where = '';
  const binds: string[] = [];
  if (statusFilter === 'open' || statusFilter === 'resolved') {
    where = 'WHERE r.status = ?'; binds.push(statusFilter);
  }

  const reports = await c.env.DB.prepare(`
    SELECT r.*, u.name AS reporter_name
    FROM accident_reports r
    LEFT JOIN line_liff_users u ON u.line_uid = r.reported_by_uid
    ${where} ORDER BY r.created_at DESC LIMIT 200
  `).bind(...binds).all<{
    id: number; received_at: string | null; vehicle_no: string | null;
    employee_name: string | null; employee_division: number | null; employee_team: number | null; employee_emp_no: string | null;
    accident_type: string | null; location: string | null; car_status: string | null;
    other_party_name: string | null; other_party_phone: string | null;
    summary_text: string | null; status: string; created_at: string;
    resolved_by_name: string | null; resolved_at: string | null;
    reporter_name: string | null; reported_by_admin: string | null;
  }>();

  const all = reports.results ?? [];

  const rows = all.map(r => {
    const empStr = empDisplay(r.employee_name, r.employee_division, r.employee_team, r.employee_emp_no);
    const otherPartyStr = (r.other_party_name || r.other_party_phone) ? `${r.other_party_name ?? ''} ${r.other_party_phone ?? ''}`.trim() : '—';
    const handoverTitle = `${r.vehicle_no ?? '車番不明'} の事故報告`;
    const handoverSummary = truncateSummary(r.summary_text || r.accident_type || r.location);
    return `<tr id="report-row-${r.id}">
      ${reportCheckboxTd(r.id)}
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;white-space:nowrap;">${escHtml(r.created_at.slice(0, 16))}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">${escHtml(r.received_at ?? '—')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:600;">${escHtml(r.vehicle_no ?? '—')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">${escHtml(empStr)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">${escHtml(r.accident_type ?? '—')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(r.location ?? '')}">${escHtml(r.location ?? '—')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;">${escHtml(r.car_status ?? '—')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;white-space:nowrap;">${escHtml(otherPartyStr)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#374151;">${escHtml(reporterDisplay(r.reporter_name, r.reported_by_admin))}</td>
      <td id="st-${r.id}" style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">
        ${statusCellHtml(r.status === 'resolved', '解決済')}
      </td>
      <td id="res-${r.id}" style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">
        ${resolverCellHtml(r.resolved_by_name, r.resolved_at)}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;white-space:nowrap;">
        <button onclick="toggleReportStatus(${r.id},this)" data-status="${r.status}"
          style="padding:3px 8px;background:#f3f4f6;color:#374151;border:1px solid #d1d5db;border-radius:4px;font-size:11px;cursor:pointer;">
          ${r.status === 'resolved' ? '再開' : '解決済にする'}
        </button>
        <button onclick="showReportLogs(${r.id})"
          style="padding:3px 8px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:4px;font-size:11px;cursor:pointer;margin-left:4px;">履歴</button>
        <button onclick="deleteReport(${r.id},'${escHtml((r.vehicle_no ?? '車番不明') + (r.accident_type ? ' / ' + r.accident_type : ''))}')"
          style="padding:3px 8px;background:#fee2e2;color:#991b1b;border:none;border-radius:4px;font-size:11px;cursor:pointer;margin-left:4px;">削除</button>
        ${printLinkHtml('/settings/accidents/print', r.id)}
        ${handoverLinkButtonHtml('/settings/accidents/print', r.id, handoverTitle, handoverSummary)}
      </td>
    </tr>`;
  }).join('');

  const filterBtn = (label: string, s: string) => {
    const active = statusFilter === s;
    return `<a href="${ADMIN_PATH}/settings/accidents?status=${s}" style="padding:6px 14px;border-radius:20px;font-size:13px;text-decoration:none;font-weight:600;
      ${active ? 'background:#1e3a5f;color:white;' : 'background:white;color:#374151;border:1px solid #d1d5db;'}">${escHtml(label)}</a>`;
  };

  const content = `
    ${subHeader('報告センター')}
    ${reportTabs('accident')}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px;align-items:center;">
      ${filterBtn('すべて', '')}
      ${filterBtn('対応中', 'open')}
      ${filterBtn('解決済', 'resolved')}
      ${newReportButtonHtml('新規報告')}
    </div>
    ${bulkPrintBarHtml()}
    <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);overflow:hidden;">
      <div style="padding:14px 20px;border-bottom:1px solid #f3f4f6;">
        <span id="report-count" style="font-size:15px;font-weight:700;color:#1e3a5f;">報告 ${all.length}件</span>
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;min-width:900px;">
          <thead style="background:#f9fafb;">
            <tr>
              ${reportCheckboxTh()}
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">登録日時</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">受電</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">車番</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">乗務員</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">事故形態</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">場所</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">状態</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">事故相手</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">報告者</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">進捗</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">対応者</th>
              <th style="padding:8px 12px;"></th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="13" style="padding:24px;text-align:center;color:#9ca3af;">報告がありません</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
    ${reportLogModalHtml()}
    ${NR_FIELD_STYLE}
    ${newReportModalHtml('事故報告の新規登録', `
      <div class="nr-row2 nr-field">
        <div><label>受電時刻</label><input type="time" id="nr-received_at"></div>
        <div><label>車番</label><input type="text" id="nr-vehicle_no" placeholder="例: 5232" inputmode="numeric"></div>
      </div>
      ${nrEmpSearchFieldHtml()}
      <div class="nr-field">
        <label>乗車状態</label>
        <div class="nr-toggle-group">
          <button type="button" class="nr-toggle-btn" id="nr-cs-kusha" onclick="nrSetCarStatus('空車')">空車</button>
          <button type="button" class="nr-toggle-btn" id="nr-cs-jissha" onclick="nrSetCarStatus('実車')">実車</button>
          <button type="button" class="nr-toggle-btn" id="nr-cs-geisha" onclick="nrSetCarStatus('迎車')">迎車</button>
        </div>
      </div>
      <div class="nr-field"><label>事故形態</label><input type="text" id="nr-accident_type" placeholder="例: 単独接触事故、追突事故"></div>
      <div class="nr-field"><label>事故発生場所</label><input type="text" id="nr-location" placeholder="例: 足立区栗原3丁目の住宅街"></div>
      <div class="nr-row2 nr-field">
        <div><label>事故相手の名前</label><input type="text" id="nr-other_party_name" placeholder="例: 田中 一郎"></div>
        <div><label>事故相手の電話番号</label><input type="tel" id="nr-other_party_phone" placeholder="090-0000-0000"></div>
      </div>
      <div id="nr-passenger-check" class="nr-check-row" style="display:none;">
        <input type="checkbox" id="nr-passenger_delivered"><label for="nr-passenger_delivered">乗客を目的地まで送り届けた</label>
      </div>
      <div class="nr-check-row"><input type="checkbox" id="nr-substitute_requested"><label for="nr-substitute_requested">代車要請は済んでいる</label></div>
      <div class="nr-check-row"><input type="checkbox" id="nr-police_notified"><label for="nr-police_notified">警察対応するよう指示した</label></div>
      <div class="nr-field"><label>追加情報・メモ</label><textarea id="nr-additional_info" placeholder="経緯・詳細など"></textarea></div>
    `, '登録する')}
    <script>
    ${reportRowScript('/api/liff/accident-reports', '事故報告', '解決済', '/settings/accidents/print-bulk')}
    ${newReportModalCoreJs('/api/liff/accident-reports/employee-search')}
    var nrCarStatus = '';
    function nrSetCarStatus(s) {
      nrCarStatus = s;
      ['kusha','jissha','geisha'].forEach(function(id) { document.getElementById('nr-cs-' + id).className = 'nr-toggle-btn'; });
      var map = { '空車': 'kusha', '実車': 'jissha', '迎車': 'geisha' };
      if (map[s]) document.getElementById('nr-cs-' + map[s]).className = 'nr-toggle-btn active';
      document.getElementById('nr-passenger-check').style.display = (s === '実車' || s === '迎車') ? 'flex' : 'none';
    }
    function resetNewReportExtra() {
      nrCarStatus = '';
      ['kusha','jissha','geisha'].forEach(function(id) { document.getElementById('nr-cs-' + id).className = 'nr-toggle-btn'; });
      document.getElementById('nr-passenger-check').style.display = 'none';
    }
    function submitNewReport() {
      var btn = document.getElementById('nr-submit-btn');
      btn.disabled = true;
      var payload = {
        received_at: document.getElementById('nr-received_at').value || null,
        vehicle_no: document.getElementById('nr-vehicle_no').value.trim() || null,
        employee_name: nrSelectedEmp ? nrSelectedEmp.name : null,
        employee_emp_no: nrSelectedEmp ? nrSelectedEmp.emp_no : null,
        employee_division: nrSelectedEmp ? nrSelectedEmp.division : null,
        employee_team: nrSelectedEmp ? nrSelectedEmp.team : null,
        accident_type: document.getElementById('nr-accident_type').value.trim() || null,
        location: document.getElementById('nr-location').value.trim() || null,
        car_status: nrCarStatus || null,
        substitute_requested: document.getElementById('nr-substitute_requested').checked,
        police_notified: document.getElementById('nr-police_notified').checked,
        passenger_delivered: document.getElementById('nr-passenger_delivered').checked,
        additional_info: document.getElementById('nr-additional_info').value.trim() || null,
        other_party_name: document.getElementById('nr-other_party_name').value.trim() || null,
        other_party_phone: document.getElementById('nr-other_party_phone').value.trim() || null,
      };
      fetch('${ADMIN_PATH}/api/liff/accident-reports', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        btn.disabled = false;
        if (data.ok) { location.reload(); }
        else { nrShowError(data.error || '登録に失敗しました'); }
      })
      .catch(function() { btn.disabled = false; nrShowError('通信エラーが発生しました'); });
    }
    </script>
  `;

  return c.html(layout('事故報告一覧', content, 'settings'));
});

// ===================================================
// GET /settings/violations — 違反報告一覧ページ
// ===================================================
app.get('/settings/violations', async (c) => {
  const statusFilter = c.req.query('status') ?? '';

  let where = '';
  const binds: string[] = [];
  if (statusFilter === 'open' || statusFilter === 'resolved') {
    where = 'WHERE r.status = ?'; binds.push(statusFilter);
  }

  const reports = await c.env.DB.prepare(`
    SELECT r.*, u.name AS reporter_name
    FROM violation_reports r
    LEFT JOIN line_liff_users u ON u.line_uid = r.reported_by_uid
    ${where} ORDER BY r.created_at DESC LIMIT 200
  `).bind(...binds).all<{
    id: number; received_at: string | null; vehicle_no: string | null; violation_at: string | null;
    employee_name: string | null; employee_division: number | null; employee_team: number | null; employee_emp_no: string | null;
    violation_type_name: string | null; violation_points: number | null; violation_fine_amount: number | null;
    location: string | null; travel_from: string | null; travel_to: string | null;
    car_status: string | null; substitute_needed: number | null;
    status: string; created_at: string;
    resolved_by_name: string | null; resolved_at: string | null;
    reporter_name: string | null; reported_by_admin: string | null;
  }>();

  const all = reports.results ?? [];

  const rows = all.map(r => {
    const empStr = empDisplay(r.employee_name, r.employee_division, r.employee_team, r.employee_emp_no);
    const violationStr = r.violation_type_name
      ? `${r.violation_type_name}${typeof r.violation_points === 'number' ? `（${r.violation_points}点/${(r.violation_fine_amount ?? 0).toLocaleString()}円）` : ''}`
      : '—';
    const placeParts: string[] = [];
    if (r.location) placeParts.push(escHtml(r.location));
    if (r.travel_from || r.travel_to) placeParts.push(escHtml(`${r.travel_from ?? '?'}→${r.travel_to ?? '?'}`));
    if (r.car_status) {
      let cs = r.car_status;
      if ((r.car_status === '実車' || r.car_status === '迎車') && r.substitute_needed !== null) {
        cs += ` / 代車${r.substitute_needed ? '要' : '不要'}`;
      }
      placeParts.push(escHtml(cs));
    }
    const placeStr = placeParts.length ? placeParts.join('<br>') : '—';
    const handoverTitle = `${r.vehicle_no ?? '車番不明'} の違反報告`;
    const handoverSummary = truncateSummary(violationStr !== '—' ? violationStr : r.location);
    return `<tr id="report-row-${r.id}">
      ${reportCheckboxTd(r.id)}
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;white-space:nowrap;">${escHtml(r.created_at.slice(0, 16))}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">${escHtml(r.received_at ?? '—')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:600;">${escHtml(r.vehicle_no ?? '—')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">${escHtml(r.violation_at ?? '—')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">${escHtml(empStr)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">${escHtml(violationStr)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#374151;">${placeStr}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#374151;">${escHtml(reporterDisplay(r.reporter_name, r.reported_by_admin))}</td>
      <td id="st-${r.id}" style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">
        ${statusCellHtml(r.status === 'resolved', '対応済')}
      </td>
      <td id="res-${r.id}" style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">
        ${resolverCellHtml(r.resolved_by_name, r.resolved_at)}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;white-space:nowrap;">
        <button onclick="toggleReportStatus(${r.id},this)" data-status="${r.status}"
          style="padding:3px 8px;background:#f3f4f6;color:#374151;border:1px solid #d1d5db;border-radius:4px;font-size:11px;cursor:pointer;">
          ${r.status === 'resolved' ? '再開' : '対応済にする'}
        </button>
        <button onclick="showReportLogs(${r.id})"
          style="padding:3px 8px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:4px;font-size:11px;cursor:pointer;margin-left:4px;">履歴</button>
        <button onclick="deleteReport(${r.id},'${escHtml((r.vehicle_no ?? '車番不明') + (r.violation_type_name ? ' / ' + r.violation_type_name : ''))}')"
          style="padding:3px 8px;background:#fee2e2;color:#991b1b;border:none;border-radius:4px;font-size:11px;cursor:pointer;margin-left:4px;">削除</button>
        ${printLinkHtml('/settings/violations/print', r.id)}
        ${handoverLinkButtonHtml('/settings/violations/print', r.id, handoverTitle, handoverSummary)}
      </td>
    </tr>`;
  }).join('');

  const filterBtn = (label: string, s: string) => {
    const active = statusFilter === s;
    return `<a href="${ADMIN_PATH}/settings/violations?status=${s}" style="padding:6px 14px;border-radius:20px;font-size:13px;text-decoration:none;font-weight:600;
      ${active ? 'background:#1e3a5f;color:white;' : 'background:white;color:#374151;border:1px solid #d1d5db;'}">${escHtml(label)}</a>`;
  };

  const content = `
    ${subHeader('報告センター')}
    ${reportTabs('violation')}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px;align-items:center;">
      ${filterBtn('すべて', '')}
      ${filterBtn('対応中', 'open')}
      ${filterBtn('対応済', 'resolved')}
      ${newReportButtonHtml('新規報告')}
    </div>
    ${bulkPrintBarHtml()}
    <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);overflow:hidden;">
      <div style="padding:14px 20px;border-bottom:1px solid #f3f4f6;">
        <span id="report-count" style="font-size:15px;font-weight:700;color:#1e3a5f;">報告 ${all.length}件</span>
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;min-width:800px;">
          <thead style="background:#f9fafb;">
            <tr>
              ${reportCheckboxTh()}
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">登録日時</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">受電</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">車番</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">違反発生日時</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">乗務員</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">違反種類（点数/反則金）</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">場所・状態</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">報告者</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">進捗</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">対応者</th>
              <th style="padding:8px 12px;"></th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="12" style="padding:24px;text-align:center;color:#9ca3af;">報告がありません</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
    ${reportLogModalHtml()}
    ${NR_FIELD_STYLE}
    ${newReportModalHtml('違反報告の新規登録', `
      <div class="nr-row2 nr-field">
        <div><label>受電時刻</label><input type="time" id="nr-received_at"></div>
        <div><label>車番</label><input type="text" id="nr-vehicle_no" placeholder="例: 5232" inputmode="numeric"></div>
      </div>
      <div class="nr-row2 nr-field">
        <div><label>違反発生日</label><input type="date" id="nr-violation_date"></div>
        <div><label>違反発生時刻</label><input type="time" id="nr-violation_time"></div>
      </div>
      ${nrEmpSearchFieldHtml()}
      <div class="nr-field">
        <label>違反の種類</label>
        <select id="nr-violation_type_id"><option value="">選択してください</option></select>
      </div>
      <div class="nr-field"><label>住所（違反発生場所）</label><input type="text" id="nr-location" placeholder="例: 板橋区大山東町51-1 付近"></div>
      <div class="nr-row2 nr-field">
        <div><label>どこから</label><input type="text" id="nr-travel_from" placeholder="例: 池袋駅"></div>
        <div><label>どこへ進行中</label><input type="text" id="nr-travel_to" placeholder="例: 成増方面"></div>
      </div>
      <div class="nr-field">
        <label>乗車状態</label>
        <div class="nr-toggle-group">
          <button type="button" class="nr-toggle-btn" id="nr-cs-kusha" onclick="nrSetCarStatus('空車')">空車</button>
          <button type="button" class="nr-toggle-btn" id="nr-cs-jissha" onclick="nrSetCarStatus('実車')">実車</button>
          <button type="button" class="nr-toggle-btn" id="nr-cs-geisha" onclick="nrSetCarStatus('迎車')">迎車</button>
        </div>
        <div id="nr-substitute-row" class="nr-check-row" style="display:none;">
          <input type="checkbox" id="nr-substitute_needed"><label for="nr-substitute_needed">代車要請が必要</label>
        </div>
      </div>
      <div class="nr-field"><label>備考</label><textarea id="nr-notes" placeholder="その他、特記事項があれば"></textarea></div>
    `, '登録する')}
    <script>
    ${reportRowScript('/api/liff/violation-reports', '違反報告', '対応済', '/settings/violations/print-bulk')}
    ${newReportModalCoreJs('/api/liff/violation-reports/employee-search')}
    var nrCarStatus = '';
    var nrViolationTypes = [];
    fetch('${ADMIN_PATH}/api/liff/violation-reports/violation-types').then(function(r){return r.json();}).then(function(data){
      nrViolationTypes = data || [];
      var sel = document.getElementById('nr-violation_type_id');
      nrViolationTypes.forEach(function(vt) {
        var opt = document.createElement('option');
        opt.value = vt.id; opt.textContent = vt.name;
        sel.appendChild(opt);
      });
    });
    function nrSetCarStatus(s) {
      nrCarStatus = s;
      ['kusha','jissha','geisha'].forEach(function(id) { document.getElementById('nr-cs-' + id).className = 'nr-toggle-btn'; });
      var map = { '空車': 'kusha', '実車': 'jissha', '迎車': 'geisha' };
      if (map[s]) document.getElementById('nr-cs-' + map[s]).className = 'nr-toggle-btn active';
      var row = document.getElementById('nr-substitute-row');
      if (s === '実車' || s === '迎車') { row.style.display = 'flex'; }
      else { row.style.display = 'none'; document.getElementById('nr-substitute_needed').checked = false; }
    }
    function resetNewReportExtra() {
      nrCarStatus = '';
      ['kusha','jissha','geisha'].forEach(function(id) { document.getElementById('nr-cs-' + id).className = 'nr-toggle-btn'; });
      document.getElementById('nr-substitute-row').style.display = 'none';
      var now = new Date();
      var yyyy = now.getFullYear();
      var mo = String(now.getMonth() + 1).padStart(2, '0');
      var dd = String(now.getDate()).padStart(2, '0');
      document.getElementById('nr-violation_date').value = yyyy + '-' + mo + '-' + dd;
    }
    function submitNewReport() {
      var btn = document.getElementById('nr-submit-btn');
      btn.disabled = true;
      var vDate = document.getElementById('nr-violation_date').value;
      var vTime = document.getElementById('nr-violation_time').value;
      var violationAt = vDate ? (vDate + (vTime ? ' ' + vTime : '')) : null;
      var payload = {
        received_at: document.getElementById('nr-received_at').value || null,
        vehicle_no: document.getElementById('nr-vehicle_no').value.trim() || null,
        violation_at: violationAt,
        employee_name: nrSelectedEmp ? nrSelectedEmp.name : null,
        employee_emp_no: nrSelectedEmp ? nrSelectedEmp.emp_no : null,
        employee_division: nrSelectedEmp ? nrSelectedEmp.division : null,
        employee_team: nrSelectedEmp ? nrSelectedEmp.team : null,
        violation_type_id: document.getElementById('nr-violation_type_id').value || null,
        location: document.getElementById('nr-location').value.trim() || null,
        travel_from: document.getElementById('nr-travel_from').value.trim() || null,
        travel_to: document.getElementById('nr-travel_to').value.trim() || null,
        car_status: nrCarStatus || null,
        substitute_needed: document.getElementById('nr-substitute_needed').checked,
        notes: document.getElementById('nr-notes').value.trim() || null,
      };
      fetch('${ADMIN_PATH}/api/liff/violation-reports', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        btn.disabled = false;
        if (data.ok) { location.reload(); }
        else { nrShowError(data.error || '登録に失敗しました'); }
      })
      .catch(function() { btn.disabled = false; nrShowError('通信エラーが発生しました'); });
    }
    </script>
  `;

  return c.html(layout('違反報告一覧', content, 'settings'));
});

// ===================================================
// GET /settings/general-reports — 一般報告一覧ページ
// ===================================================
app.get('/settings/general-reports', async (c) => {
  const statusFilter = c.req.query('status') ?? '';

  let where = '';
  const binds: string[] = [];
  if (statusFilter === 'open' || statusFilter === 'resolved') {
    where = 'WHERE r.status = ?'; binds.push(statusFilter);
  }

  const reports = await c.env.DB.prepare(`
    SELECT r.*, u.name AS reporter_name
    FROM general_reports r
    LEFT JOIN line_liff_users u ON u.line_uid = r.reported_by_uid
    ${where} ORDER BY r.created_at DESC LIMIT 200
  `).bind(...binds).all<{
    id: number; title: string | null; received_at: string | null; vehicle_no: string | null;
    location: string | null; route_from: string | null; route_to: string | null;
    employee_name: string | null; employee_division: number | null; employee_team: number | null; employee_emp_no: string | null;
    customer_name: string | null; customer_phone: string | null;
    content: string | null; status: string; created_at: string;
    resolved_by_name: string | null; resolved_at: string | null;
    reporter_name: string | null; reported_by_admin: string | null;
  }>();

  const all = reports.results ?? [];

  const rows = all.map(r => {
    const empStr = empDisplay(r.employee_name, r.employee_division, r.employee_team, r.employee_emp_no);
    const routeStr = (r.route_from || r.route_to) ? `${r.route_from ?? '?'} → ${r.route_to ?? '?'}` : '—';
    const customerStr = (r.customer_name || r.customer_phone) ? `${r.customer_name ?? ''} ${r.customer_phone ?? ''}`.trim() : '—';
    const handoverTitle = r.title ?? (r.vehicle_no ? `${r.vehicle_no} の一般報告` : '一般報告');
    const handoverSummary = truncateSummary(r.content);
    return `<tr id="report-row-${r.id}">
      ${reportCheckboxTd(r.id)}
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;white-space:nowrap;">${escHtml(r.created_at.slice(0, 16))}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:600;">${escHtml(r.title ?? '—')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">${escHtml(r.received_at ?? '—')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:600;">${escHtml(r.vehicle_no ?? '—')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(r.location ?? '')}">${escHtml(r.location ?? '—')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;white-space:nowrap;">${escHtml(routeStr)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">${escHtml(empStr)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;white-space:nowrap;">${escHtml(customerStr)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;max-width:360px;">${contentCellHtml(r.content)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#374151;">${escHtml(reporterDisplay(r.reporter_name, r.reported_by_admin))}</td>
      <td id="st-${r.id}" style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">
        ${statusCellHtml(r.status === 'resolved', '対応済')}
      </td>
      <td id="res-${r.id}" style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">
        ${resolverCellHtml(r.resolved_by_name, r.resolved_at)}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;white-space:nowrap;">
        <button onclick="toggleReportStatus(${r.id},this)" data-status="${r.status}"
          style="padding:3px 8px;background:#f3f4f6;color:#374151;border:1px solid #d1d5db;border-radius:4px;font-size:11px;cursor:pointer;">
          ${r.status === 'resolved' ? '再開' : '対応済にする'}
        </button>
        <button onclick="showReportLogs(${r.id})"
          style="padding:3px 8px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:4px;font-size:11px;cursor:pointer;margin-left:4px;">履歴</button>
        <button onclick="deleteReport(${r.id},'${escHtml((r.title ?? r.vehicle_no ?? '車番なし') + (r.content ? ' / ' + r.content.slice(0, 20) : ''))}')"
          style="padding:3px 8px;background:#fee2e2;color:#991b1b;border:none;border-radius:4px;font-size:11px;cursor:pointer;margin-left:4px;">削除</button>
        ${printLinkHtml('/settings/general-reports/print', r.id)}
        ${handoverLinkButtonHtml('/settings/general-reports/print', r.id, handoverTitle, handoverSummary)}
      </td>
    </tr>`;
  }).join('');

  const filterBtn = (label: string, s: string) => {
    const active = statusFilter === s;
    return `<a href="${ADMIN_PATH}/settings/general-reports?status=${s}" style="padding:6px 14px;border-radius:20px;font-size:13px;text-decoration:none;font-weight:600;
      ${active ? 'background:#1e3a5f;color:white;' : 'background:white;color:#374151;border:1px solid #d1d5db;'}">${escHtml(label)}</a>`;
  };

  const content = `
    ${subHeader('報告センター')}
    ${reportTabs('general')}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px;align-items:center;">
      ${filterBtn('すべて', '')}
      ${filterBtn('対応中', 'open')}
      ${filterBtn('対応済', 'resolved')}
      ${newReportButtonHtml('新規報告')}
    </div>
    ${bulkPrintBarHtml()}
    <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);overflow:hidden;">
      <div style="padding:14px 20px;border-bottom:1px solid #f3f4f6;">
        <span id="report-count" style="font-size:15px;font-weight:700;color:#1e3a5f;">報告 ${all.length}件</span>
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;min-width:1100px;">
          <thead style="background:#f9fafb;">
            <tr>
              ${reportCheckboxTh()}
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">登録日時</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">タイトル</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">受電</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">車番</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">住所</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">区間</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">乗務員</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">お客様</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">報告内容</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">報告者</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">進捗</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">対応者</th>
              <th style="padding:8px 12px;"></th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="14" style="padding:24px;text-align:center;color:#9ca3af;">報告がありません</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
    ${reportLogModalHtml()}
    ${NR_FIELD_STYLE}
    ${newReportModalHtml('一般報告の新規登録', `
      <div class="nr-field">
        <label>タイトル（あれば）</label>
        <input type="text" id="nr-title" list="nr-title-suggestions" placeholder="例: 社内汚損">
        <datalist id="nr-title-suggestions">
          <option value="社内汚損"><option value="車両トラブル"><option value="苦情対応">
          <option value="遅延"><option value="お客様からの着電"><option value="その他連絡">
        </datalist>
      </div>
      <div class="nr-row2 nr-field">
        <div><label>受電時刻</label><input type="time" id="nr-received_at"></div>
        <div><label>車番（あれば）</label><input type="text" id="nr-vehicle_no" placeholder="例: 5232" inputmode="numeric"></div>
      </div>
      <div class="nr-field"><label>住所（あれば）</label><input type="text" id="nr-location" placeholder="例: 板橋区大山東町51-1 付近"></div>
      <div class="nr-row2 nr-field">
        <div><label>お客様名（着電があれば）</label><input type="text" id="nr-customer_name" placeholder="例: 田中 一郎"></div>
        <div><label>電話番号</label><input type="tel" id="nr-customer_phone" placeholder="090-0000-0000"></div>
      </div>
      <div class="nr-row2 nr-field">
        <div><label>出発地（あれば）</label><input type="text" id="nr-route_from" placeholder="例: 板橋営業所"></div>
        <div><label>到着地</label><input type="text" id="nr-route_to" placeholder="例: 東京駅"></div>
      </div>
      ${nrEmpSearchFieldHtml()}
      <div class="nr-field"><label>報告内容</label><textarea id="nr-content" placeholder="報告したい内容を自由に入力してください"></textarea></div>
    `, '登録する')}
    <script>
    ${reportRowScript('/api/liff/general-reports', '一般報告', '対応済', '/settings/general-reports/print-bulk')}
    function toggleReportContent(btn) {
      var box = btn.previousElementSibling;
      var expanded = box.style.maxHeight === 'none';
      box.style.maxHeight = expanded ? '2.6em' : 'none';
      btn.textContent = expanded ? '続きを見る' : '閉じる';
    }
    ${newReportModalCoreJs('/api/liff/general-reports/employee-search')}
    function submitNewReport() {
      var btn = document.getElementById('nr-submit-btn');
      btn.disabled = true;
      var payload = {
        title: document.getElementById('nr-title').value.trim() || null,
        received_at: document.getElementById('nr-received_at').value || null,
        vehicle_no: document.getElementById('nr-vehicle_no').value.trim() || null,
        location: document.getElementById('nr-location').value.trim() || null,
        route_from: document.getElementById('nr-route_from').value.trim() || null,
        route_to: document.getElementById('nr-route_to').value.trim() || null,
        employee_name: nrSelectedEmp ? nrSelectedEmp.name : null,
        employee_emp_no: nrSelectedEmp ? nrSelectedEmp.emp_no : null,
        employee_division: nrSelectedEmp ? nrSelectedEmp.division : null,
        employee_team: nrSelectedEmp ? nrSelectedEmp.team : null,
        customer_name: document.getElementById('nr-customer_name').value.trim() || null,
        customer_phone: document.getElementById('nr-customer_phone').value.trim() || null,
        content: document.getElementById('nr-content').value.trim() || null,
      };
      fetch('${ADMIN_PATH}/api/liff/general-reports', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        btn.disabled = false;
        if (data.ok) { location.reload(); }
        else { nrShowError(data.error || '登録に失敗しました'); }
      })
      .catch(function() { btn.disabled = false; nrShowError('通信エラーが発生しました'); });
    }
    </script>
  `;

  return c.html(layout('一般報告一覧', content, 'settings'));
});

// ===================================================
// 引き継ぎメモ（報告センターの5つ目のタブ）
//   何でも自由に書けるセル形式（Excel風グリッド）のメモ。LINEからは投稿できず、管理画面でのみ作成・編集する。
//   grid_data は { rows, cols, cells: { "r,c": { v, sz, c, bg, b } } } のJSON文字列で保存する
// ===================================================

const MEMO_DEFAULT_ROWS = 30;
const MEMO_DEFAULT_COLS = 10;
const MEMO_MAX_ROWS = 300;
const MEMO_MAX_COLS = 40;

type MemoCell = { v?: string; sz?: number; c?: string; bg?: string; b?: number };
type MemoGrid = { rows: number; cols: number; cells: Record<string, MemoCell> };

function parseMemoGrid(raw: string): MemoGrid {
  try {
    const g = JSON.parse(raw);
    const rows = Number.isInteger(g.rows) ? Math.min(Math.max(g.rows, 1), MEMO_MAX_ROWS) : MEMO_DEFAULT_ROWS;
    const cols = Number.isInteger(g.cols) ? Math.min(Math.max(g.cols, 1), MEMO_MAX_COLS) : MEMO_DEFAULT_COLS;
    return { rows, cols, cells: (g.cells && typeof g.cells === 'object') ? g.cells : {} };
  } catch {
    return { rows: MEMO_DEFAULT_ROWS, cols: MEMO_DEFAULT_COLS, cells: {} };
  }
}

// 引き継ぎメモ 編集画面ツールバー・グリッドの共通スクリプト
function memoEditorScript(id: number, grid: MemoGrid): string {
  return `
    var ADMIN_PATH = ${safeJson(ADMIN_PATH)};
    var MEMO_ID = ${id};
    var GRID = ${safeJson(grid)};
    var dirty = false, mouseDown = false;
    var anchorR = 0, anchorC = 0, curR = 0, curC = 0;
    var PRESET_COLORS = ['#111827','#dc2626','#2563eb','#059669','#d97706','#7c3aed','#6b7280'];
    var PRESET_BGS = ['#ffffff','#fef3c7','#fee2e2','#dbeafe','#dcfce7','#ede9fe','#f3f4f6'];

    function cellKey(r, c) { return r + ',' + c; }
    function ensureCell(r, c) {
      var k = cellKey(r, c);
      if (!GRID.cells[k]) GRID.cells[k] = {};
      return GRID.cells[k];
    }
    function pruneCell(r, c) {
      var k = cellKey(r, c), d = GRID.cells[k];
      if (d && !d.v && !d.sz && !d.c && !d.bg && !d.b) delete GRID.cells[k];
    }
    function markDirty() { dirty = true; }

    function colLabel(c) {
      var s = ''; c++;
      while (c > 0) {
        var m = (c - 1) % 26;
        s = String.fromCharCode(65 + m) + s;
        c = Math.floor((c - 1) / 26);
      }
      return s;
    }

    function buildGrid() {
      var table = document.getElementById('memo-grid');
      table.innerHTML = '';
      var thead = document.createElement('tr');
      thead.appendChild(document.createElement('th'));
      for (var c = 0; c < GRID.cols; c++) {
        var th = document.createElement('th');
        th.textContent = colLabel(c);
        th.style.cssText = 'min-width:110px;padding:4px;font-size:11px;color:#9ca3af;background:#f9fafb;border:1px solid #e5e7eb;position:sticky;top:0;';
        thead.appendChild(th);
      }
      table.appendChild(thead);
      for (var r = 0; r < GRID.rows; r++) {
        var tr = document.createElement('tr');
        var rh = document.createElement('th');
        rh.textContent = String(r + 1);
        rh.style.cssText = 'padding:4px 8px;font-size:11px;color:#9ca3af;background:#f9fafb;border:1px solid #e5e7eb;position:sticky;left:0;';
        tr.appendChild(rh);
        for (var c2 = 0; c2 < GRID.cols; c2++) {
          var td = document.createElement('td');
          td.style.cssText = 'border:1px solid #e5e7eb;padding:0;';
          var input = document.createElement('input');
          input.type = 'text';
          input.dataset.r = r; input.dataset.c = c2;
          var d = GRID.cells[cellKey(r, c2)] || {};
          input.value = d.v || '';
          input.style.cssText = 'border:none;outline:none;padding:4px 6px;box-sizing:border-box;width:110px;height:30px;'
            + 'font-size:' + (d.sz || 14) + 'px;color:' + (d.c || '#111827') + ';font-weight:' + (d.b ? '700' : '400') + ';background:' + (d.bg || '#ffffff') + ';';
          input.addEventListener('input', onCellInput);
          input.addEventListener('mousedown', onCellMouseDown);
          input.addEventListener('mouseover', onCellMouseOver);
          input.addEventListener('focus', onCellFocus);
          td.appendChild(input);
          tr.appendChild(td);
        }
        table.appendChild(tr);
      }
    }

    function onCellInput() {
      var r = parseInt(this.dataset.r), c = parseInt(this.dataset.c);
      var v = this.value;
      if (v) { ensureCell(r, c).v = v; }
      else if (GRID.cells[cellKey(r, c)]) { delete GRID.cells[cellKey(r, c)].v; pruneCell(r, c); }
      markDirty();
    }
    function onCellMouseDown() {
      mouseDown = true;
      anchorR = curR = parseInt(this.dataset.r);
      anchorC = curC = parseInt(this.dataset.c);
      updateSelection();
    }
    function onCellMouseOver() {
      if (!mouseDown) return;
      curR = parseInt(this.dataset.r); curC = parseInt(this.dataset.c);
      updateSelection();
    }
    function onCellFocus() {
      if (mouseDown) return;
      anchorR = curR = parseInt(this.dataset.r);
      anchorC = curC = parseInt(this.dataset.c);
      updateSelection();
    }
    function updateSelection() {
      var r0 = Math.min(anchorR, curR), r1 = Math.max(anchorR, curR);
      var c0 = Math.min(anchorC, curC), c1 = Math.max(anchorC, curC);
      document.querySelectorAll('#memo-grid input').forEach(function(inp) {
        var r = parseInt(inp.dataset.r), c = parseInt(inp.dataset.c);
        inp.style.boxShadow = (r >= r0 && r <= r1 && c >= c0 && c <= c1) ? 'inset 0 0 0 2px #2563eb' : 'none';
      });
    }
    function selectedInputs() {
      var r0 = Math.min(anchorR, curR), r1 = Math.max(anchorR, curR);
      var c0 = Math.min(anchorC, curC), c1 = Math.max(anchorC, curC);
      return Array.prototype.filter.call(document.querySelectorAll('#memo-grid input'), function(inp) {
        var r = parseInt(inp.dataset.r), c = parseInt(inp.dataset.c);
        return r >= r0 && r <= r1 && c >= c0 && c <= c1;
      });
    }

    function applySize(sz) {
      sz = parseInt(sz);
      selectedInputs().forEach(function(inp) {
        ensureCell(parseInt(inp.dataset.r), parseInt(inp.dataset.c)).sz = sz;
        inp.style.fontSize = sz + 'px';
      });
      markDirty();
    }
    function applyColor(color) {
      selectedInputs().forEach(function(inp) {
        ensureCell(parseInt(inp.dataset.r), parseInt(inp.dataset.c)).c = color;
        inp.style.color = color;
      });
      markDirty();
    }
    function applyBg(color) {
      selectedInputs().forEach(function(inp) {
        ensureCell(parseInt(inp.dataset.r), parseInt(inp.dataset.c)).bg = color;
        inp.style.background = color;
      });
      markDirty();
    }
    function toggleBold() {
      var inputs = selectedInputs();
      if (inputs.length === 0) return;
      var makeBold = inputs[0].style.fontWeight !== '700';
      inputs.forEach(function(inp) {
        var r = parseInt(inp.dataset.r), c = parseInt(inp.dataset.c);
        inp.style.fontWeight = makeBold ? '700' : '400';
        if (makeBold) { ensureCell(r, c).b = 1; }
        else { var d = GRID.cells[cellKey(r, c)]; if (d) delete d.b; pruneCell(r, c); }
      });
      markDirty();
    }
    function clearFormat() {
      selectedInputs().forEach(function(inp) {
        var r = parseInt(inp.dataset.r), c = parseInt(inp.dataset.c);
        var k = cellKey(r, c);
        var v = (GRID.cells[k] && GRID.cells[k].v) || '';
        if (v) { GRID.cells[k] = { v: v }; } else { delete GRID.cells[k]; }
        inp.style.fontSize = '14px'; inp.style.color = '#111827'; inp.style.background = '#ffffff'; inp.style.fontWeight = '400';
      });
      markDirty();
    }
    function addRows() { GRID.rows += 10; buildGrid(); markDirty(); }

    function buildSwatches(containerId, colors, applyFn) {
      var el = document.getElementById(containerId);
      colors.forEach(function(col) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.title = col;
        btn.style.cssText = 'width:20px;height:20px;border-radius:4px;border:1px solid #d1d5db;background:' + col + ';cursor:pointer;padding:0;';
        btn.onclick = function() { applyFn(col); };
        el.appendChild(btn);
      });
    }

    function saveMemo() {
      var btn = document.getElementById('memo-save-btn');
      btn.disabled = true;
      var payload = { title: document.getElementById('memo-title').value.trim() || '無題のメモ', grid_data: JSON.stringify(GRID) };
      fetch(ADMIN_PATH + '/api/handover-memos/' + MEMO_ID, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        btn.disabled = false;
        if (data.ok) { dirty = false; showToast('保存しました'); }
        else { alert('保存に失敗しました'); }
      })
      .catch(function() { btn.disabled = false; alert('通信エラーが発生しました'); });
    }

    window.addEventListener('beforeunload', function(e) {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = '';
    });
    document.addEventListener('mouseup', function() { mouseDown = false; });

    buildSwatches('tb-color-swatches', PRESET_COLORS, applyColor);
    buildSwatches('tb-bg-swatches', PRESET_BGS, applyBg);
    buildGrid();
  `;
}

app.get('/settings/handover-memos', async (c) => {
  const memos = await c.env.DB.prepare(
    'SELECT id, title, created_by_admin, updated_by_admin, created_at, updated_at FROM handover_memos ORDER BY updated_at DESC, id DESC LIMIT 200'
  ).all<{
    id: number; title: string; created_by_admin: string | null; updated_by_admin: string | null;
    created_at: string; updated_at: string;
  }>();
  const all = memos.results ?? [];

  const rows = all.map(m => `<tr id="memo-row-${m.id}">
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:600;">
        <a href="${ADMIN_PATH}/settings/handover-memos/${m.id}" style="color:#1e3a5f;text-decoration:none;">${escHtml(m.title || '無題のメモ')}</a>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#374151;">${escHtml(m.created_by_admin ?? '—')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#374151;">${escHtml(m.updated_by_admin ?? '—')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;white-space:nowrap;">${escHtml(m.updated_at.slice(0, 16))}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;white-space:nowrap;">
        <a href="${ADMIN_PATH}/settings/handover-memos/${m.id}" style="padding:3px 8px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:4px;font-size:11px;cursor:pointer;text-decoration:none;display:inline-block;">開く</a>
        <button onclick="deleteMemo(${m.id},'${escHtml((m.title || '無題のメモ').replace(/'/g, ''))}')"
          style="padding:3px 8px;background:#fee2e2;color:#991b1b;border:none;border-radius:4px;font-size:11px;cursor:pointer;margin-left:4px;">削除</button>
      </td>
    </tr>`).join('');

  const content = `
    ${subHeader('報告センター')}
    ${reportTabs('memo')}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px;align-items:center;">
      <button onclick="createMemo()" style="padding:7px 16px;background:#1e3a5f;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">＋ 新規メモを作成</button>
    </div>
    <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);overflow:hidden;">
      <div style="padding:14px 20px;border-bottom:1px solid #f3f4f6;">
        <span id="memo-count" style="font-size:15px;font-weight:700;color:#1e3a5f;">メモ ${all.length}件</span>
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;min-width:600px;">
          <thead style="background:#f9fafb;">
            <tr>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">タイトル</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">作成者</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">最終更新者</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">更新日時</th>
              <th style="padding:8px 12px;"></th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="5" style="padding:24px;text-align:center;color:#9ca3af;">メモがありません</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
    <script>
    var ADMIN_PATH = ${safeJson(ADMIN_PATH)};
    function createMemo() {
      fetch(ADMIN_PATH + '/api/handover-memos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.ok) { location.href = ADMIN_PATH + '/settings/handover-memos/' + data.id; }
        else { alert('作成に失敗しました'); }
      })
      .catch(function() { alert('通信エラーが発生しました'); });
    }
    async function deleteMemo(id, title) {
      if (!confirm('このメモを削除しますか？\\n「' + title + '」')) return;
      var res = await fetch(ADMIN_PATH + '/api/handover-memos/' + id, { method: 'DELETE' });
      if (!res.ok) { alert('削除に失敗しました'); return; }
      var row = document.getElementById('memo-row-' + id);
      if (row) row.remove();
      var cnt = document.getElementById('memo-count');
      if (cnt) cnt.textContent = 'メモ ' + Math.max(0, parseInt(cnt.textContent.replace(/[^0-9]/g, '') || '1') - 1) + '件';
    }
    </script>
  `;

  return c.html(layout('引き継ぎメモ一覧', content, 'settings'));
});

app.get('/settings/handover-memos/:id', async (c) => {
  const id = parseInt(c.req.param('id') ?? '');
  if (!Number.isInteger(id)) return c.text('invalid id', 400);
  const memo = await c.env.DB.prepare(
    'SELECT id, title, grid_data, created_by_admin, updated_by_admin, created_at, updated_at FROM handover_memos WHERE id = ?'
  ).bind(id).first<{
    id: number; title: string; grid_data: string; created_by_admin: string | null; updated_by_admin: string | null;
    created_at: string; updated_at: string;
  }>();
  if (!memo) return c.text('メモが見つかりません', 404);

  const grid = parseMemoGrid(memo.grid_data);

  const content = `
    ${subHeader('報告センター')}
    ${reportTabs('memo')}
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;flex-wrap:wrap;">
      <a href="${ADMIN_PATH}/settings/handover-memos" style="color:#6b7280;font-size:13px;text-decoration:none;white-space:nowrap;">← メモ一覧に戻る</a>
      <input type="text" id="memo-title" oninput="markDirty()" value="${escHtml(memo.title)}" placeholder="メモのタイトル"
        style="flex:1;min-width:200px;padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:15px;font-weight:700;color:#1e3a5f;">
    </div>
    <div style="font-size:11px;color:#9ca3af;margin-bottom:10px;">
      作成: ${escHtml(memo.created_by_admin ?? '—')}（${escHtml(memo.created_at.slice(0, 16))}） ／
      最終更新: ${escHtml(memo.updated_by_admin ?? '—')}（${escHtml(memo.updated_at.slice(0, 16))}）
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;background:white;border:1px solid #e5e7eb;border-radius:8px;padding:10px 14px;margin-bottom:12px;">
      <button type="button" onclick="toggleBold()" title="太字" style="width:32px;height:32px;font-weight:700;border:1px solid #d1d5db;border-radius:4px;background:white;cursor:pointer;">B</button>
      <select onchange="applySize(this.value)" style="padding:5px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:13px;">
        <option value="12">12px</option>
        <option value="14" selected>14px</option>
        <option value="16">16px</option>
        <option value="18">18px</option>
        <option value="20">20px</option>
        <option value="24">24px</option>
        <option value="28">28px</option>
        <option value="32">32px</option>
      </select>
      <span style="font-size:12px;color:#6b7280;">文字色</span>
      <div id="tb-color-swatches" style="display:flex;gap:4px;"></div>
      <input type="color" onchange="applyColor(this.value)" value="#111827" title="文字色を選ぶ" style="width:28px;height:28px;padding:0;border:1px solid #d1d5db;border-radius:4px;cursor:pointer;">
      <span style="font-size:12px;color:#6b7280;margin-left:8px;">背景色</span>
      <div id="tb-bg-swatches" style="display:flex;gap:4px;"></div>
      <input type="color" onchange="applyBg(this.value)" value="#ffffff" title="背景色を選ぶ" style="width:28px;height:28px;padding:0;border:1px solid #d1d5db;border-radius:4px;cursor:pointer;">
      <button type="button" onclick="clearFormat()" style="padding:5px 10px;font-size:12px;border:1px solid #d1d5db;border-radius:4px;background:white;cursor:pointer;">書式クリア</button>
      <button type="button" onclick="addRows()" style="padding:5px 10px;font-size:12px;border:1px solid #d1d5db;border-radius:4px;background:white;cursor:pointer;">＋10行</button>
      <div style="flex:1;"></div>
      <button type="button" onclick="saveMemo()" id="memo-save-btn" style="padding:7px 18px;background:#1e3a5f;color:white;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;">保存</button>
    </div>
    <div style="overflow:auto;max-height:70vh;border:1px solid #e5e7eb;border-radius:8px;background:white;">
      <table id="memo-grid" style="border-collapse:collapse;"></table>
    </div>
    ${saveToastHtml()}
    <script>
    ${saveToastScript()}
    ${memoEditorScript(id, grid)}
    </script>
  `;

  return c.html(layout(`引き継ぎメモ: ${memo.title}`, content, 'settings'));
});

app.post('/api/handover-memos', async (c) => {
  const adminName = await getAdminName(c);
  const body = await c.req.json<{ title?: string }>().catch(() => ({} as { title?: string }));
  const title = (body.title ?? '').trim() || '無題のメモ';
  const grid: MemoGrid = { rows: MEMO_DEFAULT_ROWS, cols: MEMO_DEFAULT_COLS, cells: {} };

  const result = await c.env.DB.prepare(
    'INSERT INTO handover_memos (title, grid_data, created_by_admin, updated_by_admin) VALUES (?, ?, ?, ?)'
  ).bind(title, JSON.stringify(grid), adminName, adminName).run();
  const id = result.meta.last_row_id as number;

  await logReportAction(c.env.DB, 'handover_memo', id, 'created', adminName, title);
  return c.json({ ok: true, id });
});

app.put('/api/handover-memos/:id', async (c) => {
  const id = parseInt(c.req.param('id') ?? '');
  if (!Number.isInteger(id)) return c.json({ error: 'invalid id' }, 400);
  const exists = await c.env.DB.prepare('SELECT id FROM handover_memos WHERE id = ?').bind(id).first();
  if (!exists) return c.json({ error: 'not found' }, 404);

  const adminName = await getAdminName(c);
  const body = await c.req.json<{ title?: string; grid_data?: string }>();
  const title = (body.title ?? '').trim() || '無題のメモ';
  const grid = parseMemoGrid(body.grid_data ?? '{}');

  await c.env.DB.prepare(
    "UPDATE handover_memos SET title = ?, grid_data = ?, updated_by_admin = ?, updated_at = datetime('now','localtime') WHERE id = ?"
  ).bind(title, JSON.stringify(grid), adminName, id).run();
  return c.json({ ok: true });
});

app.delete('/api/handover-memos/:id', async (c) => {
  const id = parseInt(c.req.param('id') ?? '');
  if (!Number.isInteger(id)) return c.json({ error: 'invalid id' }, 400);
  const row = await c.env.DB.prepare('SELECT title FROM handover_memos WHERE id = ?').bind(id).first<{ title: string }>();
  if (!row) return c.json({ error: 'not found' }, 404);

  const adminName = await getAdminName(c);
  await c.env.DB.prepare('DELETE FROM handover_memos WHERE id = ?').bind(id).run();
  await logReportAction(c.env.DB, 'handover_memo', id, 'deleted', adminName, row.title);
  return c.json({ ok: true });
});

// ===================================================
// 帳票印刷ページ（忘れ物/事故/違反/一般報告 共通・A4横1枚）
//   宛先・追加備考はページ側で自由入力するのみで、DBには保存しない
// ===================================================

app.get('/settings/lost-items/print/:id', async (c) => {
  const id = parseInt(c.req.param('id') ?? '');
  if (!Number.isInteger(id)) return c.text('invalid id', 400);
  const r = await c.env.DB.prepare(`
    SELECT r.*, u.name AS reporter_name
    FROM lost_item_reports r
    LEFT JOIN line_liff_users u ON u.line_uid = r.reported_by_uid
    WHERE r.id = ?
  `).bind(id).first<{
    id: number; report_type: string; received_at: string | null; vehicle_no: string | null;
    employee_name: string | null; employee_division: number | null; employee_team: number | null; employee_emp_no: string | null;
    item_description: string | null; pickup_location: string | null; dropoff_location: string | null;
    customer_name: string | null; customer_phone: string | null; return_method: string | null;
    notes: string | null; status: string; created_at: string;
    resolved_by_name: string | null; resolved_at: string | null;
    reporter_name: string | null; reported_by_admin: string | null;
  }>();
  if (!r) return c.text('報告が見つかりません', 404);

  const fields: ReportPrintField[] = [
    { label: '種別', value: r.report_type === 'customer' ? '客問い合わせ' : '社員報告' },
    { label: '受電時刻', value: r.received_at ?? '' },
    { label: '車番', value: r.vehicle_no ?? '' },
    { label: '乗務員', value: empDisplay(r.employee_name, r.employee_division, r.employee_team, r.employee_emp_no) },
    { label: '忘れ物の内容', value: r.item_description ?? '', full: true },
    { label: '乗車地', value: r.pickup_location ?? '' },
    { label: '降車地', value: r.dropoff_location ?? '' },
    { label: '客氏名', value: r.customer_name ?? '' },
    { label: '客電話番号', value: r.customer_phone ?? '' },
    { label: '返却方法', value: r.return_method ?? '' },
    { label: '備考', value: r.notes ?? '', full: true },
  ];

  return c.html(renderReportPrintPage({
    kindLabel: '忘れ物報告', kindColor: '#1d4ed8',
    pageTitle: `忘れ物報告 帳票 #${r.id}`,
    headingTitle: `${r.vehicle_no ?? '車番不明'} の忘れ物報告`,
    reportId: r.id, createdAt: r.created_at, fields,
    status: r.status, resolvedLabel: '解決済',
    resolvedByName: r.resolved_by_name, resolvedAt: r.resolved_at,
    reporterName: reporterDisplay(r.reporter_name, r.reported_by_admin),
    suggestedTo: suggestedTo(r.employee_division, r.employee_team),
    backHref: `${ADMIN_PATH}/settings/lost-items`,
  }));
});

app.get('/settings/accidents/print/:id', async (c) => {
  const id = parseInt(c.req.param('id') ?? '');
  if (!Number.isInteger(id)) return c.text('invalid id', 400);
  const r = await c.env.DB.prepare(`
    SELECT r.*, u.name AS reporter_name
    FROM accident_reports r
    LEFT JOIN line_liff_users u ON u.line_uid = r.reported_by_uid
    WHERE r.id = ?
  `).bind(id).first<{
    id: number; received_at: string | null; vehicle_no: string | null;
    employee_name: string | null; employee_division: number | null; employee_team: number | null; employee_emp_no: string | null;
    accident_type: string | null; location: string | null; car_status: string | null;
    other_party_name: string | null; other_party_phone: string | null;
    substitute_requested: number | null; police_notified: number | null; passenger_delivered: number | null;
    additional_info: string | null; summary_text: string | null;
    status: string; created_at: string;
    resolved_by_name: string | null; resolved_at: string | null;
    reporter_name: string | null; reported_by_admin: string | null;
  }>();
  if (!r) return c.text('報告が見つかりません', 404);

  const fields: ReportPrintField[] = [
    { label: '受電時刻', value: r.received_at ?? '' },
    { label: '車番', value: r.vehicle_no ?? '' },
    { label: '乗務員', value: empDisplay(r.employee_name, r.employee_division, r.employee_team, r.employee_emp_no) },
    { label: '事故形態', value: r.accident_type ?? '' },
    { label: '発生場所', value: r.location ?? '' },
    { label: '車両状態', value: r.car_status ?? '' },
    { label: '事故相手の名前', value: r.other_party_name ?? '' },
    { label: '事故相手の電話番号', value: r.other_party_phone ?? '' },
    { label: '代車要請', value: r.substitute_requested ? '要請済み' : '未要請' },
    { label: '警察対応', value: r.police_notified ? '指示済み' : '未指示' },
    { label: '乗客対応', value: r.passenger_delivered ? '送り届け済み' : '未対応' },
    { label: '追加情報', value: r.additional_info ?? '', full: true },
    { label: '報告書まとめ', value: r.summary_text ?? '', full: true },
  ];

  return c.html(renderReportPrintPage({
    kindLabel: '事故報告', kindColor: '#dc2626',
    pageTitle: `事故報告 帳票 #${r.id}`,
    headingTitle: `${r.vehicle_no ?? '車番不明'} の事故報告`,
    reportId: r.id, createdAt: r.created_at, fields,
    status: r.status, resolvedLabel: '解決済',
    resolvedByName: r.resolved_by_name, resolvedAt: r.resolved_at,
    reporterName: reporterDisplay(r.reporter_name, r.reported_by_admin),
    suggestedTo: suggestedTo(r.employee_division, r.employee_team),
    backHref: `${ADMIN_PATH}/settings/accidents`,
  }));
});

app.get('/settings/violations/print/:id', async (c) => {
  const id = parseInt(c.req.param('id') ?? '');
  if (!Number.isInteger(id)) return c.text('invalid id', 400);
  const r = await c.env.DB.prepare(`
    SELECT r.*, u.name AS reporter_name
    FROM violation_reports r
    LEFT JOIN line_liff_users u ON u.line_uid = r.reported_by_uid
    WHERE r.id = ?
  `).bind(id).first<{
    id: number; received_at: string | null; vehicle_no: string | null; violation_at: string | null;
    employee_name: string | null; employee_division: number | null; employee_team: number | null; employee_emp_no: string | null;
    violation_type_name: string | null; violation_points: number | null; violation_fine_amount: number | null;
    location: string | null; travel_from: string | null; travel_to: string | null;
    car_status: string | null; substitute_needed: number | null; notes: string | null;
    status: string; created_at: string;
    resolved_by_name: string | null; resolved_at: string | null;
    reporter_name: string | null; reported_by_admin: string | null;
  }>();
  if (!r) return c.text('報告が見つかりません', 404);

  const violationStr = r.violation_type_name
    ? `${r.violation_type_name}${typeof r.violation_points === 'number' ? `（${r.violation_points}点/${(r.violation_fine_amount ?? 0).toLocaleString()}円）` : ''}`
    : '';
  const routeStr = (r.travel_from || r.travel_to) ? `${r.travel_from ?? '?'} → ${r.travel_to ?? '?'}` : '';
  const substituteStr = (r.car_status === '実車' || r.car_status === '迎車') && r.substitute_needed !== null
    ? (r.substitute_needed ? '要' : '不要') : '';

  const fields: ReportPrintField[] = [
    { label: '受電時刻', value: r.received_at ?? '' },
    { label: '車番', value: r.vehicle_no ?? '' },
    { label: '違反発生日時', value: r.violation_at ?? '' },
    { label: '乗務員', value: empDisplay(r.employee_name, r.employee_division, r.employee_team, r.employee_emp_no) },
    { label: '違反種類', value: violationStr },
    { label: '発生場所', value: r.location ?? '' },
    { label: '進行区間', value: routeStr },
    { label: '車両状態', value: r.car_status ?? '' },
    { label: '代車要否', value: substituteStr },
    { label: '備考', value: r.notes ?? '', full: true },
  ];

  return c.html(renderReportPrintPage({
    kindLabel: '違反報告', kindColor: '#b45309',
    pageTitle: `違反報告 帳票 #${r.id}`,
    headingTitle: `${r.vehicle_no ?? '車番不明'} の違反報告`,
    reportId: r.id, createdAt: r.created_at, fields,
    status: r.status, resolvedLabel: '対応済',
    resolvedByName: r.resolved_by_name, resolvedAt: r.resolved_at,
    reporterName: reporterDisplay(r.reporter_name, r.reported_by_admin),
    suggestedTo: suggestedTo(r.employee_division, r.employee_team),
    backHref: `${ADMIN_PATH}/settings/violations`,
  }));
});

app.get('/settings/general-reports/print/:id', async (c) => {
  const id = parseInt(c.req.param('id') ?? '');
  if (!Number.isInteger(id)) return c.text('invalid id', 400);
  const r = await c.env.DB.prepare(`
    SELECT r.*, u.name AS reporter_name
    FROM general_reports r
    LEFT JOIN line_liff_users u ON u.line_uid = r.reported_by_uid
    WHERE r.id = ?
  `).bind(id).first<{
    id: number; title: string | null; received_at: string | null; vehicle_no: string | null;
    location: string | null; route_from: string | null; route_to: string | null;
    employee_name: string | null; employee_division: number | null; employee_team: number | null; employee_emp_no: string | null;
    customer_name: string | null; customer_phone: string | null;
    content: string | null; status: string; created_at: string;
    resolved_by_name: string | null; resolved_at: string | null;
    reporter_name: string | null; reported_by_admin: string | null;
  }>();
  if (!r) return c.text('報告が見つかりません', 404);

  const routeStr = (r.route_from || r.route_to) ? `${r.route_from ?? '?'} → ${r.route_to ?? '?'}` : '';

  const fields: ReportPrintField[] = [
    { label: 'タイトル', value: r.title ?? '' },
    { label: '受電時刻', value: r.received_at ?? '' },
    { label: '車番', value: r.vehicle_no ?? '' },
    { label: '住所', value: r.location ?? '' },
    { label: '区間', value: routeStr },
    { label: '乗務員', value: empDisplay(r.employee_name, r.employee_division, r.employee_team, r.employee_emp_no) },
    { label: 'お客様', value: `${r.customer_name ?? ''} ${r.customer_phone ?? ''}`.trim() },
    { label: '報告内容', value: r.content ?? '', full: true },
  ];

  return c.html(renderReportPrintPage({
    kindLabel: '一般報告', kindColor: '#0891b2',
    pageTitle: `一般報告 帳票 #${r.id}`,
    headingTitle: r.title ?? (r.vehicle_no ? `${r.vehicle_no} の一般報告` : '一般報告'),
    reportId: r.id, createdAt: r.created_at, fields,
    status: r.status, resolvedLabel: '対応済',
    resolvedByName: r.resolved_by_name, resolvedAt: r.resolved_at,
    reporterName: reporterDisplay(r.reporter_name, r.reported_by_admin),
    suggestedTo: suggestedTo(r.employee_division, r.employee_team),
    backHref: `${ADMIN_PATH}/settings/general-reports`,
  }));
});

// ===================================================
// まとめ帳票印刷ページ（忘れ物/事故/違反/一般報告 共通・複数件をA4横1枚に一覧表でまとめる）
//   ?ids=1,2,3 で選択された報告を一覧に取得し、DBには何も保存しない
// ===================================================

const STATUS_COLOR = { open: '#d97706', resolved: '#059669' };

app.get('/settings/lost-items/print-bulk', async (c) => {
  const ids = parseBulkIds(c.req.query('ids'));
  if (ids.length === 0) return c.text('対象の報告が指定されていません', 400);
  const placeholders = ids.map(() => '?').join(',');
  const reports = await c.env.DB.prepare(`
    SELECT r.* FROM lost_item_reports r WHERE r.id IN (${placeholders})
  `).bind(...ids).all<{
    id: number; report_type: string; received_at: string | null; vehicle_no: string | null;
    employee_name: string | null; employee_division: number | null; employee_team: number | null; employee_emp_no: string | null;
    item_description: string | null; pickup_location: string | null; dropoff_location: string | null;
    customer_name: string | null; customer_phone: string | null; return_method: string | null;
    notes: string | null; status: string; created_at: string;
  }>();
  const byId = new Map((reports.results ?? []).map(r => [r.id, r]));

  const items: ReportPrintBulkItem[] = ids.filter(id => byId.has(id)).map(id => {
    const r = byId.get(id)!;
    const fields: ReportPrintField[] = [
      { label: '種別', value: r.report_type === 'customer' ? '客問い合わせ' : '社員報告' },
      { label: '忘れ物の内容', value: r.item_description ?? '' },
      { label: '乗車地', value: r.pickup_location ?? '' },
      { label: '降車地', value: r.dropoff_location ?? '' },
      { label: '客氏名', value: r.customer_name ?? '' },
      { label: '客電話番号', value: r.customer_phone ?? '' },
      { label: '返却方法', value: r.return_method ?? '' },
      { label: '備考', value: r.notes ?? '' },
    ];
    return {
      kindLabel: '忘れ物報告', kindColor: '#1d4ed8',
      createdAt: r.created_at, vehicleNo: r.vehicle_no ?? '',
      employeeStr: empDisplay(r.employee_name, r.employee_division, r.employee_team, r.employee_emp_no),
      contentSummary: fieldsSummary(fields),
      statusLabel: r.status === 'resolved' ? '解決済' : '対応中',
      statusColor: r.status === 'resolved' ? STATUS_COLOR.resolved : STATUS_COLOR.open,
    };
  });

  return c.html(renderReportPrintBulkPage({
    pageTitle: `忘れ物報告 まとめ帳票（${items.length}件）`,
    headingTitle: '忘れ物報告 まとめ',
    suggestedTo: '',
    items,
    backHref: `${ADMIN_PATH}/settings/lost-items`,
  }));
});

app.get('/settings/accidents/print-bulk', async (c) => {
  const ids = parseBulkIds(c.req.query('ids'));
  if (ids.length === 0) return c.text('対象の報告が指定されていません', 400);
  const placeholders = ids.map(() => '?').join(',');
  const reports = await c.env.DB.prepare(`
    SELECT r.* FROM accident_reports r WHERE r.id IN (${placeholders})
  `).bind(...ids).all<{
    id: number; received_at: string | null; vehicle_no: string | null;
    employee_name: string | null; employee_division: number | null; employee_team: number | null; employee_emp_no: string | null;
    accident_type: string | null; location: string | null; car_status: string | null;
    other_party_name: string | null; other_party_phone: string | null;
    substitute_requested: number | null; police_notified: number | null; passenger_delivered: number | null;
    additional_info: string | null; summary_text: string | null;
    status: string; created_at: string;
  }>();
  const byId = new Map((reports.results ?? []).map(r => [r.id, r]));

  const items: ReportPrintBulkItem[] = ids.filter(id => byId.has(id)).map(id => {
    const r = byId.get(id)!;
    const fields: ReportPrintField[] = [
      { label: '事故形態', value: r.accident_type ?? '' },
      { label: '発生場所', value: r.location ?? '' },
      { label: '車両状態', value: r.car_status ?? '' },
      { label: '事故相手', value: `${r.other_party_name ?? ''} ${r.other_party_phone ?? ''}`.trim() },
      { label: '代車要請', value: r.substitute_requested ? '要請済み' : '未要請' },
      { label: '警察対応', value: r.police_notified ? '指示済み' : '未指示' },
      { label: '乗客対応', value: r.passenger_delivered ? '送り届け済み' : '未対応' },
      { label: '追加情報', value: r.additional_info ?? '' },
      { label: '報告書まとめ', value: r.summary_text ?? '' },
    ];
    return {
      kindLabel: '事故報告', kindColor: '#dc2626',
      createdAt: r.created_at, vehicleNo: r.vehicle_no ?? '',
      employeeStr: empDisplay(r.employee_name, r.employee_division, r.employee_team, r.employee_emp_no),
      contentSummary: fieldsSummary(fields),
      statusLabel: r.status === 'resolved' ? '解決済' : '対応中',
      statusColor: r.status === 'resolved' ? STATUS_COLOR.resolved : STATUS_COLOR.open,
    };
  });

  return c.html(renderReportPrintBulkPage({
    pageTitle: `事故報告 まとめ帳票（${items.length}件）`,
    headingTitle: '事故報告 まとめ',
    suggestedTo: '',
    items,
    backHref: `${ADMIN_PATH}/settings/accidents`,
  }));
});

app.get('/settings/violations/print-bulk', async (c) => {
  const ids = parseBulkIds(c.req.query('ids'));
  if (ids.length === 0) return c.text('対象の報告が指定されていません', 400);
  const placeholders = ids.map(() => '?').join(',');
  const reports = await c.env.DB.prepare(`
    SELECT r.* FROM violation_reports r WHERE r.id IN (${placeholders})
  `).bind(...ids).all<{
    id: number; received_at: string | null; vehicle_no: string | null; violation_at: string | null;
    employee_name: string | null; employee_division: number | null; employee_team: number | null; employee_emp_no: string | null;
    violation_type_name: string | null; violation_points: number | null; violation_fine_amount: number | null;
    location: string | null; travel_from: string | null; travel_to: string | null;
    car_status: string | null; substitute_needed: number | null; notes: string | null;
    status: string; created_at: string;
  }>();
  const byId = new Map((reports.results ?? []).map(r => [r.id, r]));

  const items: ReportPrintBulkItem[] = ids.filter(id => byId.has(id)).map(id => {
    const r = byId.get(id)!;
    const violationStr = r.violation_type_name
      ? `${r.violation_type_name}${typeof r.violation_points === 'number' ? `（${r.violation_points}点/${(r.violation_fine_amount ?? 0).toLocaleString()}円）` : ''}`
      : '';
    const routeStr = (r.travel_from || r.travel_to) ? `${r.travel_from ?? '?'} → ${r.travel_to ?? '?'}` : '';
    const substituteStr = (r.car_status === '実車' || r.car_status === '迎車') && r.substitute_needed !== null
      ? (r.substitute_needed ? '要' : '不要') : '';
    const fields: ReportPrintField[] = [
      { label: '違反発生日時', value: r.violation_at ?? '' },
      { label: '違反種類', value: violationStr },
      { label: '発生場所', value: r.location ?? '' },
      { label: '進行区間', value: routeStr },
      { label: '車両状態', value: r.car_status ?? '' },
      { label: '代車要否', value: substituteStr },
      { label: '備考', value: r.notes ?? '' },
    ];
    return {
      kindLabel: '違反報告', kindColor: '#b45309',
      createdAt: r.created_at, vehicleNo: r.vehicle_no ?? '',
      employeeStr: empDisplay(r.employee_name, r.employee_division, r.employee_team, r.employee_emp_no),
      contentSummary: fieldsSummary(fields),
      statusLabel: r.status === 'resolved' ? '対応済' : '対応中',
      statusColor: r.status === 'resolved' ? STATUS_COLOR.resolved : STATUS_COLOR.open,
    };
  });

  return c.html(renderReportPrintBulkPage({
    pageTitle: `違反報告 まとめ帳票（${items.length}件）`,
    headingTitle: '違反報告 まとめ',
    suggestedTo: '',
    items,
    backHref: `${ADMIN_PATH}/settings/violations`,
  }));
});

app.get('/settings/general-reports/print-bulk', async (c) => {
  const ids = parseBulkIds(c.req.query('ids'));
  if (ids.length === 0) return c.text('対象の報告が指定されていません', 400);
  const placeholders = ids.map(() => '?').join(',');
  const reports = await c.env.DB.prepare(`
    SELECT r.* FROM general_reports r WHERE r.id IN (${placeholders})
  `).bind(...ids).all<{
    id: number; title: string | null; received_at: string | null; vehicle_no: string | null;
    location: string | null; route_from: string | null; route_to: string | null;
    employee_name: string | null; employee_division: number | null; employee_team: number | null; employee_emp_no: string | null;
    customer_name: string | null; customer_phone: string | null;
    content: string | null; status: string; created_at: string;
  }>();
  const byId = new Map((reports.results ?? []).map(r => [r.id, r]));

  const items: ReportPrintBulkItem[] = ids.filter(id => byId.has(id)).map(id => {
    const r = byId.get(id)!;
    const routeStr = (r.route_from || r.route_to) ? `${r.route_from ?? '?'} → ${r.route_to ?? '?'}` : '';
    const fields: ReportPrintField[] = [
      { label: 'タイトル', value: r.title ?? '' },
      { label: '住所', value: r.location ?? '' },
      { label: '区間', value: routeStr },
      { label: 'お客様', value: `${r.customer_name ?? ''} ${r.customer_phone ?? ''}`.trim() },
      { label: '報告内容', value: r.content ?? '' },
    ];
    return {
      kindLabel: '一般報告', kindColor: '#0891b2',
      createdAt: r.created_at, vehicleNo: r.vehicle_no ?? '',
      employeeStr: empDisplay(r.employee_name, r.employee_division, r.employee_team, r.employee_emp_no),
      contentSummary: fieldsSummary(fields),
      statusLabel: r.status === 'resolved' ? '対応済' : '対応中',
      statusColor: r.status === 'resolved' ? STATUS_COLOR.resolved : STATUS_COLOR.open,
    };
  });

  return c.html(renderReportPrintBulkPage({
    pageTitle: `一般報告 まとめ帳票（${items.length}件）`,
    headingTitle: '一般報告 まとめ',
    suggestedTo: '',
    items,
    backHref: `${ADMIN_PATH}/settings/general-reports`,
  }));
});

// ===================================================
// GET /settings/violation-types — 違反種類・点数/反則金マスタ管理ページ
// ===================================================
app.get('/settings/violation-types', async (c) => {
  const types = await c.env.DB.prepare(`
    SELECT id, name, points, fine_amount, sort_order, is_active
    FROM violation_types ORDER BY sort_order, id
  `).all<{ id: number; name: string; points: number; fine_amount: number; sort_order: number; is_active: number }>();

  const all = types.results ?? [];

  const rows = all.map(t => `<tr data-id="${t.id}">
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;">
        <input type="text" value="${escHtml(t.name)}" data-field="name" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:13px;">
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;">
        <input type="number" value="${t.points}" data-field="points" style="width:70px;border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:13px;">
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;">
        <input type="number" value="${t.fine_amount}" data-field="fine_amount" style="width:100px;border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:13px;">
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;text-align:center;">
        <input type="checkbox" data-field="is_active" ${t.is_active ? 'checked' : ''}>
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;">
        <button onclick="saveViolationType(${t.id})" style="padding:4px 10px;background:#1e3a5f;color:white;border:none;border-radius:4px;font-size:11px;cursor:pointer;">保存</button>
      </td>
    </tr>`).join('');

  const content = `
    ${subHeader('違反種類・点数/反則金')}
    <p style="font-size:12px;color:#9ca3af;margin:-8px 0 16px;">点数・反則金は目安です。法改正等で数値が変わった場合はここで更新してください（既存の報告履歴には影響しません）。</p>
    <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);overflow:hidden;">
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;min-width:600px;">
          <thead style="background:#f9fafb;">
            <tr>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">違反の種類</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">点数</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">反則金(円)</th>
              <th style="padding:8px 12px;text-align:center;font-size:12px;color:#6b7280;font-weight:600;">有効</th>
              <th style="padding:8px 12px;"></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
    <script>
    var ADMIN_PATH = ${JSON.stringify(ADMIN_PATH)};
    async function saveViolationType(id) {
      const tr = document.querySelector('tr[data-id="' + id + '"]');
      const name = tr.querySelector('[data-field=name]').value.trim();
      const points = parseInt(tr.querySelector('[data-field=points]').value, 10) || 0;
      const fineAmount = parseInt(tr.querySelector('[data-field=fine_amount]').value, 10) || 0;
      const isActive = tr.querySelector('[data-field=is_active]').checked;
      const res = await fetch(ADMIN_PATH + '/api/violation-types/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, points, fine_amount: fineAmount, is_active: isActive }),
      });
      if (res.ok) { alert('保存しました'); } else { alert('保存に失敗しました'); }
    }
    </script>
  `;

  return c.html(layout('違反種類・点数/反則金', content, 'settings'));
});

// ===================================================
// API: 権限変更
// ===================================================
app.put('/api/liff-users/:id/role', async (c) => {
  const id = parseInt(c.req.param('id'));
  const { role } = await c.req.json<{ role: string }>();
  const validRoles = ['general_manager', 'operations_manager', 'vehicle_manager', 'newcomer', 'benten_shift_master', 'benten_member', 'crew_member', 'unknown'];
  if (!validRoles.includes(role)) return c.json({ error: 'invalid role' }, 400);

  await c.env.DB.prepare(
    `UPDATE line_liff_users SET role = ?, updated_at = datetime('now', 'localtime') WHERE id = ?`
  ).bind(role, id).run();

  // リッチメニューを再割り当て
  const user = await c.env.DB.prepare('SELECT line_uid FROM line_liff_users WHERE id = ?')
    .bind(id).first<{ line_uid: string }>();
  if (user) {
    await reassignRichMenu(user.line_uid, role, c.env);
  }

  return c.json({ ok: true });
});

// ===================================================
// API: 氏名修正（LINE連携時の名前入力ミスの是正用）
// ===================================================
app.put('/api/liff-users/:id/name', async (c) => {
  const id = parseInt(c.req.param('id'));
  const { name } = await c.req.json<{ name?: string }>();
  const trimmed = (name ?? '').trim();
  if (!trimmed) return c.json({ error: '氏名を入力してください' }, 400);

  await c.env.DB.prepare(
    `UPDATE line_liff_users SET name = ?, updated_at = datetime('now', 'localtime') WHERE id = ?`
  ).bind(trimmed, id).run();
  return c.json({ ok: true });
});

// ===================================================
// API: 社員名簿検索（氏名紐付けモーダル用）
// ===================================================
app.get('/api/liff-users/employee-search', async (c) => {
  const q = (c.req.query('q') ?? '').trim();
  if (!q) return c.json({ results: [] });
  const like = `%${q}%`;
  const results = await c.env.DB.prepare(
    `SELECT id, emp_no, name, division, team FROM employees
     WHERE is_active = 1 AND (name LIKE ? OR emp_no LIKE ?)
     ORDER BY name LIMIT 20`
  ).bind(like, like).all<{ id: number; emp_no: string; name: string; division: number | null; team: number | null }>();
  return c.json({ results: results.results ?? [] });
});

// ===================================================
// API: 社員名簿との紐付け・解除
// ===================================================
app.put('/api/liff-users/:id/emp-link', async (c) => {
  const id = parseInt(c.req.param('id'));
  const { emp_id } = await c.req.json<{ emp_id?: number | null }>();

  if (emp_id != null) {
    const emp = await c.env.DB.prepare('SELECT id FROM employees WHERE id = ? AND is_active = 1')
      .bind(emp_id).first<{ id: number }>();
    if (!emp) return c.json({ error: '社員が見つかりません' }, 404);

    const other = await c.env.DB.prepare('SELECT id, name FROM line_liff_users WHERE emp_id = ? AND id != ?')
      .bind(emp_id, id).first<{ id: number; name: string }>();
    if (other) return c.json({ error: `この社員は既に別のLINEアカウント（${other.name}）に紐付けられています。先にそちらを解除してください` }, 409);
  }

  await c.env.DB.prepare(
    `UPDATE line_liff_users SET emp_id = ?, updated_at = datetime('now', 'localtime') WHERE id = ?`
  ).bind(emp_id ?? null, id).run();
  return c.json({ ok: true });
});

// ===================================================
// API: ユーザー削除
// ===================================================
app.delete('/api/liff-users/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const user = await c.env.DB.prepare('SELECT line_uid FROM line_liff_users WHERE id = ?')
    .bind(id).first<{ line_uid: string }>();

  if (user) {
    await fetch(`https://api.line.me/v2/bot/user/${user.line_uid}/richmenu`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${c.env.LINE_CHANNEL_ACCESS_TOKEN ?? ''}` },
    });
  }
  await c.env.DB.prepare('DELETE FROM line_liff_users WHERE id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM line_conv_states WHERE line_uid = ?').bind(user?.line_uid ?? '').run();
  return c.json({ ok: true });
});

// ===================================================
// API: 報告のステータス更新・削除・対応履歴（忘れ物/事故/違反 共通）
//   対応者名はセッションから確定し、全操作を report_action_logs に記録する
// ===================================================

// 各報告種別のテーブル情報と履歴用の概要スナップショット
const REPORT_KINDS: Record<string, { table: string; summarySql: string }> = {
  lost_item: { table: 'lost_item_reports', summarySql: "COALESCE(vehicle_no,'車番不明') || ' / ' || COALESCE(item_description,'—')" },
  accident:  { table: 'accident_reports',  summarySql: "COALESCE(vehicle_no,'車番不明') || ' / ' || COALESCE(accident_type,'—')" },
  violation: { table: 'violation_reports', summarySql: "COALESCE(vehicle_no,'車番不明') || ' / ' || COALESCE(violation_type_name,'—')" },
  general:   { table: 'general_reports',   summarySql: "COALESCE(title, COALESCE(vehicle_no,'車番なし')) || ' / ' || COALESCE(substr(content,1,20),'—')" },
};

async function logReportAction(
  db: D1Database, kind: string, reportId: number, action: string, adminName: string, summary: string | null
): Promise<void> {
  await db.prepare(
    'INSERT INTO report_action_logs (report_kind, report_id, action, admin_name, summary) VALUES (?, ?, ?, ?, ?)'
  ).bind(kind, reportId, action, adminName, summary).run();
}

async function handleReportStatus(c: Context<{ Bindings: Env }>, kind: string) {
  const info = REPORT_KINDS[kind];
  const id = parseInt(c.req.param('id') ?? '');
  if (!Number.isInteger(id)) return c.json({ error: 'invalid id' }, 400);
  const { status } = await c.req.json() as { status: string };
  if (status !== 'open' && status !== 'resolved') return c.json({ error: 'invalid' }, 400);

  // 対応者名はクライアント申告ではなくログインセッションから確定する
  const adminName = await getAdminName(c);
  const row = await c.env.DB.prepare(
    `SELECT id, ${info.summarySql} AS summary FROM ${info.table} WHERE id = ?`
  ).bind(id).first<{ id: number; summary: string }>();
  if (!row) return c.json({ error: 'not found' }, 404);

  if (status === 'resolved') {
    await c.env.DB.prepare(
      `UPDATE ${info.table} SET status = ?, resolved_by_name = ?, resolved_at = datetime('now','localtime') WHERE id = ?`
    ).bind(status, adminName, id).run();
  } else {
    await c.env.DB.prepare(
      `UPDATE ${info.table} SET status = ?, resolved_by_name = NULL, resolved_at = NULL WHERE id = ?`
    ).bind(status, id).run();
  }
  await logReportAction(c.env.DB, kind, id, status === 'resolved' ? 'resolved' : 'reopened', adminName, row.summary);
  return c.json({ ok: true, adminName });
}

async function handleReportDelete(c: Context<{ Bindings: Env }>, kind: string) {
  const info = REPORT_KINDS[kind];
  const id = parseInt(c.req.param('id') ?? '');
  if (!Number.isInteger(id)) return c.json({ error: 'invalid id' }, 400);

  const adminName = await getAdminName(c);
  const row = await c.env.DB.prepare(
    `SELECT id, ${info.summarySql} AS summary FROM ${info.table} WHERE id = ?`
  ).bind(id).first<{ id: number; summary: string }>();
  if (!row) return c.json({ error: 'not found' }, 404);

  await c.env.DB.prepare(`DELETE FROM ${info.table} WHERE id = ?`).bind(id).run();
  await logReportAction(c.env.DB, kind, id, 'deleted', adminName, row.summary);
  return c.json({ ok: true });
}

// ===================================================
// API: 報告センターからの新規登録（LINEを使わず管理画面のブラウザから直接入力する場合）
//   ログイン中の管理者名を reported_by_admin に保存する（LINEのreported_by_uidとは別枠）
// ===================================================
app.post('/api/liff/lost-items', async (c) => {
  const adminName = await getAdminName(c);
  const body = await c.req.json<{
    report_type?: string; received_at?: string; vehicle_no?: string;
    employee_name?: string; employee_emp_no?: string;
    employee_division?: number | null; employee_team?: number | null;
    item_description?: string; pickup_location?: string; dropoff_location?: string;
    customer_name?: string; customer_phone?: string; return_method?: string; notes?: string;
  }>();
  const reportType = body.report_type === 'customer' ? 'customer' : 'staff';

  const result = await c.env.DB.prepare(`
    INSERT INTO lost_item_reports
      (report_type, received_at, vehicle_no, employee_name, employee_emp_no,
       employee_division, employee_team, item_description, pickup_location, dropoff_location,
       customer_name, customer_phone, return_method, notes, reported_by_admin)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    reportType, body.received_at ?? null, body.vehicle_no ?? null,
    body.employee_name ?? null, body.employee_emp_no ?? null,
    body.employee_division ?? null, body.employee_team ?? null,
    body.item_description ?? null, body.pickup_location ?? null, body.dropoff_location ?? null,
    body.customer_name ?? null, body.customer_phone ?? null, body.return_method ?? null,
    body.notes ?? null, adminName,
  ).run();

  await logReportAction(c.env.DB, 'lost_item', result.meta.last_row_id as number, 'created', adminName,
    `${body.vehicle_no ?? '車番不明'} / ${body.item_description ?? '—'}`);
  return c.json({ ok: true });
});

app.post('/api/liff/accident-reports', async (c) => {
  const adminName = await getAdminName(c);
  const body = await c.req.json<{
    received_at?: string; vehicle_no?: string;
    employee_name?: string; employee_emp_no?: string;
    employee_division?: number | null; employee_team?: number | null;
    accident_type?: string; location?: string; car_status?: string;
    substitute_requested?: boolean; police_notified?: boolean; passenger_delivered?: boolean;
    additional_info?: string;
    other_party_name?: string; other_party_phone?: string;
  }>();

  const result = await c.env.DB.prepare(`
    INSERT INTO accident_reports
      (received_at, vehicle_no, employee_name, employee_emp_no,
       employee_division, employee_team, accident_type, location, car_status,
       substitute_requested, police_notified, passenger_delivered,
       additional_info, other_party_name, other_party_phone, reported_by_admin)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    body.received_at ?? null, body.vehicle_no ?? null,
    body.employee_name ?? null, body.employee_emp_no ?? null,
    body.employee_division ?? null, body.employee_team ?? null,
    body.accident_type ?? null, body.location ?? null, body.car_status ?? null,
    body.substitute_requested ? 1 : 0, body.police_notified ? 1 : 0, body.passenger_delivered ? 1 : 0,
    body.additional_info ?? null, body.other_party_name ?? null, body.other_party_phone ?? null, adminName,
  ).run();

  await logReportAction(c.env.DB, 'accident', result.meta.last_row_id as number, 'created', adminName,
    `${body.vehicle_no ?? '車番不明'} / ${body.accident_type ?? '—'}`);
  return c.json({ ok: true });
});

app.post('/api/liff/violation-reports', async (c) => {
  const adminName = await getAdminName(c);
  const body = await c.req.json<{
    received_at?: string; vehicle_no?: string; violation_at?: string;
    employee_name?: string; employee_emp_no?: string;
    employee_division?: number | null; employee_team?: number | null;
    violation_type_id?: number | null; location?: string; travel_from?: string; travel_to?: string;
    car_status?: string; substitute_needed?: boolean; notes?: string;
  }>();

  const carStatus = ['空車', '実車', '迎車'].includes(body.car_status ?? '') ? body.car_status! : null;
  const substituteNeeded = (carStatus === '実車' || carStatus === '迎車')
    ? (body.substitute_needed ? 1 : 0)
    : null;

  let violationTypeName: string | null = null;
  let violationPoints: number | null = null;
  let violationFineAmount: number | null = null;
  if (body.violation_type_id) {
    const vt = await c.env.DB.prepare(
      'SELECT name, points, fine_amount FROM violation_types WHERE id = ?'
    ).bind(body.violation_type_id).first<{ name: string; points: number; fine_amount: number }>();
    if (vt) {
      violationTypeName = vt.name;
      violationPoints = vt.points;
      violationFineAmount = vt.fine_amount;
    }
  }

  const result = await c.env.DB.prepare(`
    INSERT INTO violation_reports
      (received_at, vehicle_no, violation_at, employee_name, employee_emp_no,
       employee_division, employee_team, violation_type_id, violation_type_name,
       violation_points, violation_fine_amount, location, travel_from, travel_to,
       car_status, substitute_needed, notes, reported_by_admin)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    body.received_at ?? null, body.vehicle_no ?? null, body.violation_at ?? null,
    body.employee_name ?? null, body.employee_emp_no ?? null,
    body.employee_division ?? null, body.employee_team ?? null,
    body.violation_type_id ?? null, violationTypeName, violationPoints, violationFineAmount,
    body.location ?? null, body.travel_from ?? null, body.travel_to ?? null,
    carStatus, substituteNeeded, body.notes ?? null, adminName,
  ).run();

  await logReportAction(c.env.DB, 'violation', result.meta.last_row_id as number, 'created', adminName,
    `${body.vehicle_no ?? '車番不明'} / ${violationTypeName ?? '—'}`);
  return c.json({ ok: true });
});

app.post('/api/liff/general-reports', async (c) => {
  const adminName = await getAdminName(c);
  const body = await c.req.json<{
    title?: string; received_at?: string; vehicle_no?: string; location?: string;
    route_from?: string; route_to?: string;
    employee_name?: string; employee_emp_no?: string;
    employee_division?: number | null; employee_team?: number | null;
    customer_name?: string; customer_phone?: string; content?: string;
  }>();

  const result = await c.env.DB.prepare(`
    INSERT INTO general_reports
      (title, received_at, vehicle_no, location, route_from, route_to, employee_name, employee_emp_no,
       employee_division, employee_team, customer_name, customer_phone, content, reported_by_admin)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    body.title ?? null, body.received_at ?? null, body.vehicle_no ?? null, body.location ?? null,
    body.route_from ?? null, body.route_to ?? null,
    body.employee_name ?? null, body.employee_emp_no ?? null,
    body.employee_division ?? null, body.employee_team ?? null,
    body.customer_name ?? null, body.customer_phone ?? null, body.content ?? null, adminName,
  ).run();

  await logReportAction(c.env.DB, 'general', result.meta.last_row_id as number, 'created', adminName,
    `${body.title ?? body.vehicle_no ?? '車番なし'} / ${(body.content ?? '').slice(0, 20) || '—'}`);
  return c.json({ ok: true });
});

app.put('/api/liff/lost-items/:id/status',        (c) => handleReportStatus(c, 'lost_item'));
app.delete('/api/liff/lost-items/:id',            (c) => handleReportDelete(c, 'lost_item'));
app.put('/api/liff/accident-reports/:id/status',  (c) => handleReportStatus(c, 'accident'));
app.delete('/api/liff/accident-reports/:id',      (c) => handleReportDelete(c, 'accident'));
app.put('/api/liff/violation-reports/:id/status', (c) => handleReportStatus(c, 'violation'));
app.delete('/api/liff/violation-reports/:id',     (c) => handleReportDelete(c, 'violation'));
app.put('/api/liff/general-reports/:id/status',   (c) => handleReportStatus(c, 'general'));
app.delete('/api/liff/general-reports/:id',       (c) => handleReportDelete(c, 'general'));

// 対応履歴の取得（行の「履歴」ボタン用）
// パスを既存の権限マッピング（/api/liff/lost-items 等の前方一致）に乗せるため種別ごとに定義
const ACTION_LABELS: Record<string, string> = { created: '管理画面から登録した', resolved: '解決済にした', reopened: '再開した', deleted: '削除した' };

async function handleReportLogs(c: Context<{ Bindings: Env }>, kind: string) {
  const id = parseInt(c.req.param('id') ?? '');
  if (!Number.isInteger(id)) return c.json({ error: 'invalid id' }, 400);
  const rows = await c.env.DB.prepare(
    'SELECT action, admin_name, summary, created_at FROM report_action_logs WHERE report_kind = ? AND report_id = ? ORDER BY created_at DESC, id DESC LIMIT 50'
  ).bind(kind, id).all<{ action: string; admin_name: string; summary: string | null; created_at: string }>();
  const logs = (rows.results ?? []).map(r => ({
    ...r, action_label: ACTION_LABELS[r.action] ?? r.action,
  }));
  return c.json({ logs });
}

app.get('/api/liff/lost-items/:id/logs',        (c) => handleReportLogs(c, 'lost_item'));
app.get('/api/liff/accident-reports/:id/logs',  (c) => handleReportLogs(c, 'accident'));
app.get('/api/liff/violation-reports/:id/logs', (c) => handleReportLogs(c, 'violation'));
app.get('/api/liff/general-reports/:id/logs',   (c) => handleReportLogs(c, 'general'));

// ===================================================
// API: 報告センターの新規登録モーダル用（乗務員検索・違反種類マスタ）
//   /api/liff-users/employee-search はsettings.liff権限が必要なため、
//   settings.liff を持たないが各報告タブの権限だけは持つアカウント（例: itabashi2）でも
//   使えるように、各報告タブ自身の権限キーで通るパスに乗務員検索を複製して置く。
// ===================================================
async function nrEmployeeSearchHandler(c: Context<{ Bindings: Env }>) {
  const q = (c.req.query('q') ?? '').trim();
  if (!q) return c.json({ results: [] });
  const like = `%${q}%`;
  const results = await c.env.DB.prepare(
    `SELECT id, emp_no, name, division, team FROM employees
     WHERE is_active = 1 AND (name LIKE ? OR emp_no LIKE ?)
     ORDER BY name LIMIT 20`
  ).bind(like, like).all<{ id: number; emp_no: string; name: string; division: number | null; team: number | null }>();
  return c.json({ results: results.results ?? [] });
}
app.get('/api/liff/lost-items/employee-search',        nrEmployeeSearchHandler);
app.get('/api/liff/accident-reports/employee-search',  nrEmployeeSearchHandler);
app.get('/api/liff/violation-reports/employee-search', nrEmployeeSearchHandler);
app.get('/api/liff/general-reports/employee-search',   nrEmployeeSearchHandler);

// 車番から乗務員を検索（クイック報告モーダルの車番入力用。employees.car_noの完全一致）
async function nrCarSearchHandler(c: Context<{ Bindings: Env }>) {
  const carNo = (c.req.query('car_no') ?? '').trim();
  if (!carNo) return c.json({ results: [] });
  const results = await c.env.DB.prepare(
    `SELECT id, emp_no, name, division, team FROM employees
     WHERE is_active = 1 AND car_no = ?
     ORDER BY name LIMIT 10`
  ).bind(carNo).all<{ id: number; emp_no: string; name: string; division: number | null; team: number | null }>();
  return c.json({ results: results.results ?? [] });
}
app.get('/api/liff/lost-items/employee-by-car',        nrCarSearchHandler);
app.get('/api/liff/accident-reports/employee-by-car',  nrCarSearchHandler);
app.get('/api/liff/violation-reports/employee-by-car', nrCarSearchHandler);
app.get('/api/liff/general-reports/employee-by-car',   nrCarSearchHandler);

// 乗務員選択時に、その課の当日の引き継ぎシート概要を返す（クイック報告モーダル用の抜粋表示）
async function nrDivisionInfoHandler(c: Context<{ Bindings: Env }>) {
  const division = parseInt(c.req.query('division') ?? '', 10);
  const date = c.req.query('date') ?? '';
  if (!Number.isInteger(division) || division < 1 || division > 4 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return c.json({ sheet: null });
  }
  const sheet = await c.env.DB.prepare(
    `SELECT douta, main_content, toka_content FROM handover_sheets WHERE division = ? AND date = ?`
  ).bind(division, date).first<{ douta: string; main_content: string; toka_content: string }>();
  return c.json({ sheet: sheet ?? null });
}
app.get('/api/liff/lost-items/division-info',        nrDivisionInfoHandler);
app.get('/api/liff/accident-reports/division-info',  nrDivisionInfoHandler);
app.get('/api/liff/violation-reports/division-info', nrDivisionInfoHandler);
app.get('/api/liff/general-reports/division-info',   nrDivisionInfoHandler);

// LINE連携者（役職付きLIFF利用者）への報告サマリー送信（クイック報告モーダル用）
async function nrLineRecipientsHandler(c: Context<{ Bindings: Env }>) {
  const rows = await c.env.DB.prepare(
    `SELECT id, name, role FROM line_liff_users WHERE role != 'unknown' ORDER BY role, name`
  ).all<{ id: number; name: string | null; role: string }>();
  return c.json({ results: rows.results ?? [] });
}
app.get('/api/liff/lost-items/line-recipients',        nrLineRecipientsHandler);
app.get('/api/liff/accident-reports/line-recipients',  nrLineRecipientsHandler);
app.get('/api/liff/violation-reports/line-recipients', nrLineRecipientsHandler);
app.get('/api/liff/general-reports/line-recipients',   nrLineRecipientsHandler);

async function lineMulticastSimple(token: string, uids: string[], messages: object[]): Promise<void> {
  const batches: string[][] = [];
  for (let i = 0; i < uids.length; i += 500) batches.push(uids.slice(i, i + 500));
  await Promise.allSettled(batches.map(batch =>
    fetch('https://api.line.me/v2/bot/message/multicast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to: batch, messages }),
    })
  ));
}
async function nrSendLineSummaryHandler(c: Context<{ Bindings: Env }>) {
  const b = await c.req.json<{ recipient_ids?: number[]; summary?: string }>().catch(() => ({}) as { recipient_ids?: number[]; summary?: string });
  const ids = Array.isArray(b.recipient_ids) ? b.recipient_ids.filter(n => Number.isInteger(n)) : [];
  const summary = (b.summary ?? '').trim();
  if (!ids.length || !summary) return c.json({ error: '送信先と内容が必要です' }, 400);
  if (!c.env.LINE_CHANNEL_ACCESS_TOKEN) return c.json({ error: 'LINE未設定' }, 500);
  const placeholders = ids.map(() => '?').join(',');
  const rows = await c.env.DB.prepare(
    `SELECT line_uid FROM line_liff_users WHERE id IN (${placeholders}) AND role != 'unknown'`
  ).bind(...ids).all<{ line_uid: string }>();
  const uids = [...new Set((rows.results ?? []).map(r => r.line_uid))];
  if (!uids.length) return c.json({ error: '送信先が見つかりません' }, 400);
  await lineMulticastSimple(c.env.LINE_CHANNEL_ACCESS_TOKEN, uids, [{ type: 'text', text: summary }]);
  return c.json({ ok: true, sent: uids.length });
}
app.post('/api/liff/lost-items/send-line-summary',        nrSendLineSummaryHandler);
app.post('/api/liff/accident-reports/send-line-summary',  nrSendLineSummaryHandler);
app.post('/api/liff/violation-reports/send-line-summary', nrSendLineSummaryHandler);
app.post('/api/liff/general-reports/send-line-summary',   nrSendLineSummaryHandler);

// 違反種類マスタ（settings.violation-types ではなく settings.violations 権限で通す）
app.get('/api/liff/violation-reports/violation-types', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT id, name, points, fine_amount
    FROM violation_types
    WHERE is_active = 1
    ORDER BY sort_order, id
  `).all<{ id: number; name: string; points: number; fine_amount: number }>();
  return c.json(rows.results ?? []);
});

// ===================================================
// API: 違反種類マスタ更新
// ===================================================
app.put('/api/violation-types/:id', async (c) => {
  const id = parseInt(c.req.param('id') ?? '');
  if (!Number.isInteger(id)) return c.json({ error: 'invalid id' }, 400);
  const { name, points, fine_amount, is_active } = await c.req.json<{
    name: string; points: number; fine_amount: number; is_active: boolean;
  }>();
  await c.env.DB.prepare(
    'UPDATE violation_types SET name = ?, points = ?, fine_amount = ?, is_active = ? WHERE id = ?'
  ).bind(name, points, fine_amount, is_active ? 1 : 0, id).run();
  return c.json({ ok: true });
});

// ===================================================
// リッチメニュー再割り当てヘルパー
// ===================================================
async function reassignRichMenu(lineUid: string, role: string, env: Env): Promise<void> {
  const at = env.LINE_CHANNEL_ACCESS_TOKEN ?? '';
  if (!at) return;

  const menuId = getRichMenuForRole(role, env);
  if (menuId) {
    await fetch(`https://api.line.me/v2/bot/user/${lineUid}/richmenu/${menuId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${at}` },
    });
  } else {
    // 車番管理者・権限不明者はリッチメニューなし
    await fetch(`https://api.line.me/v2/bot/user/${lineUid}/richmenu`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${at}` },
    });
  }
}

export function getRichMenuForRole(role: string, env: Env): string {
  switch (role) {
    case 'newcomer':            return env.RICHMENU_ID_PATTERN1 ?? '';
    case 'operations_manager':  return env.RICHMENU_ID_PATTERN2 ?? '';
    case 'general_manager':     return env.RICHMENU_ID_PATTERN3 ?? '';
    case 'benten_member':
    case 'benten_shift_master': return env.RICHMENU_ID_BENTEN ?? '';
    case 'crew_member':         return env.RICHMENU_ID_CREW_MEMBER ?? '';
    case 'unknown':             return env.RICHMENU_ID_UNKNOWN ?? '';
    default:                    return '';
  }
}

export default app;
