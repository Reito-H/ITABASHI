// 期間限定 オリジナルTシャツ（設定ページ・管理側）
// ページ: /settings/tshirt（共有URL・サイズ別集計・注文一覧）
// API   : /api/tshirt/*（ページ権限: settings.tshirt）
// 詳細設定（タイトル・説明・サイズ・締切・受付ON/OFF）と注文の追加・修正・削除は admin アカウント（username='admin'）のみ。
// それ以外のアカウントには「オリジナルTシャツオーダー」として共有URL・集計・一覧（閲覧/CSV/印刷）だけを表示する。
// 公開側（社員番号 or 名前 → サイズの注文ページ）は routes/public_tshirt.ts を参照。
import { Hono } from 'hono';
import qrcode from 'qrcode-generator';
import type { Env } from '../auth';
import { layout, safeJson } from '../html/layout';
import { settingsSubHeader } from './admin';
import { ADMIN_PATH, TSHIRT_PATH } from '../config';
import { isAdminAccount } from '../utils/maintenance';
import { loadTshirtSettings, isTshirtAccepting, normalizeName } from './public_tshirt';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

export const TSHIRT_ADMIN_TITLE = '期間限定 オリジナルTシャツ';
export const TSHIRT_BASIC_TITLE = 'オリジナルTシャツオーダー';

const SHARE_URL = `https://bentenclub.com${TSHIRT_PATH}`;

function qrSvg(data: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(data);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true })
    .replace(/black/g, '#1e3a5f').replace(/white/g, '#ffffff');
}

type OrderRow = { id: number; emp_no: string; name: string; size: string; created_at: string; updated_at: string };

async function loadOrders(db: D1Database, sizes: string[]): Promise<OrderRow[]> {
  const r = await db.prepare('SELECT id, emp_no, name, size, created_at, updated_at FROM tshirt_orders').all<OrderRow>();
  const rank = (s: string) => { const i = sizes.indexOf(s); return i < 0 ? 999 : i; };
  // サイズ順 → 社員番号順（名前で登録した人は各サイズの最後）
  return (r.results ?? []).sort((a, b) =>
    rank(a.size) - rank(b.size)
    || (a.emp_no === '' ? 1 : 0) - (b.emp_no === '' ? 1 : 0)
    || a.emp_no.localeCompare(b.emp_no, 'ja', { numeric: true })
    || a.name.localeCompare(b.name, 'ja'));
}

const esc = (s: string) => s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));

function fmtDeadline(s: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(s);
  return m ? `${m[1]}年${Number(m[2])}月${Number(m[3])}日 ${m[4]}:${m[5]}` : '';
}

// ===== ページ =====
app.get('/settings/tshirt', async (c) => {
  const isAdmin = await isAdminAccount(c.env.DB, c.get('adminId'));
  const s = await loadTshirtSettings(c.env.DB);
  const orders = await loadOrders(c.env.DB, s.sizes);
  const accepting = isTshirtAccepting(s);

  // サイズ別集計（設定から外したサイズで残っている注文は末尾に表示）
  const counts = new Map<string, number>();
  for (const sz of s.sizes) counts.set(sz, 0);
  for (const o of orders) counts.set(o.size, (counts.get(o.size) ?? 0) + 1);

  const status = accepting
    ? `<span style="background:#dcfce7;color:#166534;font-weight:700;font-size:12px;padding:3px 10px;border-radius:999px;">受付中</span>`
    : `<span style="background:#f3f4f6;color:#6b7280;font-weight:700;font-size:12px;padding:3px 10px;border-radius:999px;">受付終了</span>`;

  const box = 'background:white;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-bottom:16px;';
  const inp = 'border:1px solid #d1d5db;border-radius:6px;padding:7px 9px;font-size:13px;font-family:inherit;';
  const btn = (bg: string, bd: string, fg: string) => `padding:7px 14px;background:${bg};border:1px solid ${bd};color:${fg};border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;`;

  const html = settingsSubHeader(isAdmin ? TSHIRT_ADMIN_TITLE : TSHIRT_BASIC_TITLE) + `
    <style>
      .ts-tbl { border-collapse: collapse; width: 100%; font-size: 13px; }
      .ts-tbl th { background: #f8fafc; color: #6b7280; font-size: 12px; font-weight: 700; text-align: left; padding: 6px 10px; border-bottom: 1px solid #e5e7eb; }
      .ts-tbl td { padding: 5px 10px; border-bottom: 1px solid #f1f5f9; }
      .ts-size-row { display: flex; align-items: center; gap: 6px; padding: 3px 0; }
      .ts-size-row.drag-over { border-top: 2px solid #2563eb; }
      .ts-handle { cursor: grab; color: #9ca3af; padding: 0 4px; user-select: none; }
      @media print {
        .no-print { display: none !important; }
        .ts-print-only { display: block !important; }
        body * { visibility: hidden; }
        #ts-print, #ts-print * { visibility: visible; }
        #ts-print { position: absolute; left: 0; top: 0; width: 100%; }
      }
    </style>

    <div class="no-print" style="${box}max-width:860px;">
      <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start;">
        <div style="width:110px;height:110px;flex-shrink:0;">${qrSvg(SHARE_URL)}</div>
        <div style="flex:1;min-width:240px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
            <span style="font-size:13px;font-weight:700;color:#1e3a5f;">注文ページの共有URL</span>${status}
            ${s.deadline ? `<span style="font-size:12px;color:#b45309;font-weight:700;">締切 ${fmtDeadline(s.deadline)}</span>` : ''}
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <code style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px;padding:8px 10px;font-size:12px;word-break:break-all;flex:1;min-width:200px;">${SHARE_URL}</code>
            <button onclick="tsCopy()" style="${btn('#f0fdf4', '#86efac', '#166534')}">コピー</button>
            <a href="${TSHIRT_PATH}" target="_blank" rel="noopener" style="${btn('#eff6ff', '#bfdbfe', '#1d4ed8')}text-decoration:none;">開く</a>
          </div>
          <div style="font-size:12px;color:#6b7280;margin-top:8px;line-height:1.7;">
            URLを開いて 社員番号（ない人はお名前）→ サイズ を選ぶと登録されます。同じ人がもう一度登録するとサイズが上書きされます。
          </div>
        </div>
      </div>
    </div>

    ${isAdmin ? `
    <div class="no-print" style="${box}max-width:860px;">
      <div style="font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:12px;">詳細設定（adminのみ）</div>
      <div style="display:flex;gap:20px;flex-wrap:wrap;">
        <div style="flex:1;min-width:280px;">
          <label style="font-size:12px;color:#6b7280;display:block;margin-bottom:10px;">タイトル（注文ページの見出し）
            <input id="f-title" type="text" maxlength="60" value="${esc(s.title)}" style="${inp}width:100%;box-sizing:border-box;margin-top:3px;">
          </label>
          <label style="font-size:12px;color:#6b7280;display:block;margin-bottom:10px;">説明（任意・注文ページに表示）
            <textarea id="f-desc" rows="4" maxlength="1000" style="${inp}width:100%;box-sizing:border-box;margin-top:3px;">${esc(s.description)}</textarea>
          </label>
          <label style="font-size:12px;color:#6b7280;display:block;margin-bottom:10px;">締切（空欄なら締切なし）
            <div style="display:flex;gap:6px;align-items:center;margin-top:3px;">
              <input id="f-deadline" type="datetime-local" value="${esc(s.deadline)}" style="${inp}">
              <button type="button" onclick="document.getElementById('f-deadline').value=''" style="${btn('#f9fafb', '#d1d5db', '#374151')}">クリア</button>
            </div>
          </label>
          <label style="font-size:13px;color:#374151;display:flex;align-items:center;gap:6px;">
            <input id="f-open" type="checkbox" ${s.is_open ? 'checked' : ''}> 受付する（外すとすぐ受付終了）
          </label>
        </div>
        <div style="width:220px;">
          <div style="font-size:12px;color:#6b7280;margin-bottom:4px;">サイズ（ドラッグで並べ替え）</div>
          <div id="size-rows"></div>
          <button type="button" onclick="tsAddSize('')" style="${btn('#f9fafb', '#d1d5db', '#374151')}margin-top:6px;">＋ サイズを追加</button>
        </div>
      </div>
      <div style="margin-top:14px;display:flex;gap:10px;align-items:center;">
        <button onclick="tsSaveSettings(this)" style="${btn('#1e3a5f', '#1e3a5f', '#fff')}padding:8px 22px;">設定を保存</button>
        <span id="settings-msg" style="font-size:12px;color:#16a34a;"></span>
      </div>
    </div>` : ''}

    <div id="ts-print" style="${box}max-width:860px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;">
        <div style="font-size:14px;font-weight:700;color:#1e3a5f;">${esc(s.title)}　注文一覧</div>
        <div style="font-size:13px;color:#374151;">合計 <b style="font-size:16px;">${orders.length}</b> 枚</div>
        <div class="no-print" style="margin-left:auto;display:flex;gap:8px;">
          <a href="${ADMIN_PATH}/api/tshirt/orders.csv" style="${btn('#f9fafb', '#d1d5db', '#374151')}text-decoration:none;">CSV</a>
          <button onclick="window.print()" style="${btn('#f9fafb', '#d1d5db', '#374151')}">印刷</button>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">
        ${[...counts.entries()].map(([sz, n]) => `
          <div style="border:1px solid ${s.sizes.includes(sz) ? '#e5e7eb' : '#fca5a5'};border-radius:8px;padding:6px 14px;text-align:center;min-width:64px;">
            <div style="font-size:12px;color:#6b7280;font-weight:700;">${esc(sz)}</div>
            <div style="font-size:18px;font-weight:800;color:#1e3a5f;">${n}</div>
          </div>`).join('')}
      </div>

      ${isAdmin ? `
      <div class="no-print" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:12px;padding:10px;background:#f8fafc;border-radius:8px;">
        <span style="font-size:12px;color:#6b7280;">代理で追加:</span>
        <input id="a-emp" type="text" placeholder="社員番号" style="${inp}width:100px;">
        <span style="font-size:12px;color:#9ca3af;">または</span>
        <input id="a-name" type="text" placeholder="名前（社員番号がない人）" maxlength="40" style="${inp}width:180px;">
        <select id="a-size" style="${inp}">${s.sizes.map(sz => `<option>${esc(sz)}</option>`).join('')}</select>
        <button onclick="tsAddOrder(this)" style="${btn('#1e3a5f', '#1e3a5f', '#fff')}">追加</button>
      </div>` : ''}

      ${orders.length === 0 ? `<div style="color:#9ca3af;font-size:13px;padding:10px 0;">まだ注文はありません</div>` : `
      <table class="ts-tbl">
        <thead><tr><th style="width:40px;">No</th><th>社員番号</th><th>名前</th><th>サイズ</th><th class="no-print">登録日時</th>${isAdmin ? '<th class="no-print"></th>' : ''}</tr></thead>
        <tbody>
          ${orders.map((o, i) => `
          <tr>
            <td style="color:#9ca3af;">${i + 1}</td>
            <td>${o.emp_no ? esc(o.emp_no) : '<span style="font-size:11px;color:#b45309;">名前で登録</span>'}</td>
            <td>${esc(o.name)}</td>
            <td>${isAdmin
              ? `<select class="no-print" data-id="${o.id}" onchange="tsChangeSize(this)" style="${inp}padding:3px 6px;">${(s.sizes.includes(o.size) ? s.sizes : [...s.sizes, o.size]).map(sz => `<option${sz === o.size ? ' selected' : ''}>${esc(sz)}</option>`).join('')}</select><span class="ts-print-only" style="display:none;font-weight:700;">${esc(o.size)}</span>`
              : `<b>${esc(o.size)}</b>`}</td>
            <td class="no-print" style="font-size:12px;color:#9ca3af;">${esc(o.updated_at || o.created_at)}</td>
            ${isAdmin ? `<td class="no-print" style="text-align:right;"><button data-id="${o.id}" data-name="${esc(o.name)}" onclick="tsDelete(this)" style="${btn('#fef2f2', '#fecaca', '#b91c1c')}padding:3px 10px;">削除</button></td>` : ''}
          </tr>`).join('')}
        </tbody>
      </table>`}
    </div>

    <script>
      var API = ${safeJson(ADMIN_PATH + '/api/tshirt')};
      var SHARE_URL = ${safeJson(SHARE_URL)};
      var SIZES = ${safeJson(s.sizes)};

      function tsCopy() {
        navigator.clipboard.writeText(SHARE_URL).then(function() { alert('URLをコピーしました'); });
      }
      async function tsSend(method, url, body) {
        var res = await fetch(url, { method: method, headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: body ? JSON.stringify(body) : undefined });
        var d = await res.json().catch(function() { return {}; });
        if (!res.ok) { alert(d.error || '保存に失敗しました'); return null; }
        return d;
      }
      async function tsChangeSize(sel) {
        if (await tsSend('PUT', API + '/orders/' + sel.dataset.id, { size: sel.value })) location.reload();
      }
      async function tsDelete(b) {
        if (!confirm(b.dataset.name + ' さんの注文を削除しますか？')) return;
        if (await tsSend('DELETE', API + '/orders/' + b.dataset.id)) location.reload();
      }
      async function tsAddOrder(b) {
        b.disabled = true;
        var d = await tsSend('POST', API + '/orders', {
          emp_no: document.getElementById('a-emp').value,
          name: document.getElementById('a-name').value,
          size: document.getElementById('a-size').value
        });
        b.disabled = false;
        if (d) location.reload();
      }

      // ===== サイズ編集（adminのみ表示） =====
      var dragRow = null;
      function tsAddSize(v) {
        var wrap = document.getElementById('size-rows');
        if (!wrap) return;
        var row = document.createElement('div');
        row.className = 'ts-size-row';
        row.draggable = true;
        row.innerHTML = '<span class="ts-handle">&#8801;</span>'
          + '<input type="text" maxlength="12" style="${inp}width:110px;padding:4px 8px;">'
          + '<button type="button" style="${btn('#fef2f2', '#fecaca', '#b91c1c')}padding:3px 8px;">削除</button>';
        row.querySelector('input').value = v;
        row.querySelector('button').onclick = function() { row.remove(); };
        row.addEventListener('dragstart', function() { dragRow = row; });
        row.addEventListener('dragover', function(e) { e.preventDefault(); row.classList.add('drag-over'); });
        row.addEventListener('dragleave', function() { row.classList.remove('drag-over'); });
        row.addEventListener('drop', function(e) {
          e.preventDefault(); row.classList.remove('drag-over');
          if (dragRow && dragRow !== row) wrap.insertBefore(dragRow, row);
        });
        wrap.appendChild(row);
        if (!v) row.querySelector('input').focus();
      }
      if (document.getElementById('size-rows')) SIZES.forEach(tsAddSize);

      async function tsSaveSettings(b) {
        var sizes = Array.prototype.map.call(document.querySelectorAll('#size-rows input'), function(i) { return i.value.trim(); })
          .filter(function(v) { return v; });
        b.disabled = true;
        var d = await tsSend('PUT', API + '/settings', {
          title: document.getElementById('f-title').value,
          description: document.getElementById('f-desc').value,
          deadline: document.getElementById('f-deadline').value,
          is_open: document.getElementById('f-open').checked,
          sizes: sizes
        });
        b.disabled = false;
        if (d) location.reload();
      }
    </script>`;
  return c.html(layout(isAdmin ? TSHIRT_ADMIN_TITLE : TSHIRT_BASIC_TITLE, html, 'settings'));
});

// ===== API =====
async function requireAdminAccount(c: { env: Env; get: (k: 'adminId') => number }): Promise<boolean> {
  return isAdminAccount(c.env.DB, c.get('adminId'));
}
const ADMIN_ONLY = { error: 'この操作は admin アカウントのみ行えます' };

app.get('/api/tshirt/orders.csv', async (c) => {
  const s = await loadTshirtSettings(c.env.DB);
  const orders = await loadOrders(c.env.DB, s.sizes);
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [['No', '社員番号', '名前', 'サイズ', '登録日時'].map(q).join(',')];
  orders.forEach((o, i) => lines.push([String(i + 1), o.emp_no, o.name, o.size, o.updated_at || o.created_at].map(q).join(',')));
  return new Response('﻿' + lines.join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('オリジナルTシャツ注文.csv')}`,
    },
  });
});

app.put('/api/tshirt/settings', async (c) => {
  if (!(await requireAdminAccount(c))) return c.json(ADMIN_ONLY, 403);
  const b = await c.req.json<{ title?: string; description?: string; deadline?: string; is_open?: boolean; sizes?: unknown[] }>();
  const title = String(b.title ?? '').trim().slice(0, 60);
  if (!title) return c.json({ error: 'タイトルを入力してください' }, 400);
  const sizes = [...new Set((Array.isArray(b.sizes) ? b.sizes : []).map(v => String(v ?? '').trim().slice(0, 12)).filter(Boolean))];
  if (sizes.length === 0) return c.json({ error: 'サイズを1つ以上設定してください' }, 400);
  const deadline = String(b.deadline ?? '').trim();
  if (deadline && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(deadline)) return c.json({ error: '締切の日時が正しくありません' }, 400);
  await c.env.DB.prepare(
    "UPDATE tshirt_settings SET title = ?, description = ?, sizes = ?, deadline = ?, is_open = ?, updated_at = datetime('now','localtime') WHERE id = 1"
  ).bind(title, String(b.description ?? '').slice(0, 1000), JSON.stringify(sizes), deadline, b.is_open ? 1 : 0).run();
  return c.json({ ok: true });
});

// 代理登録（社員番号があれば名簿と照合、なければ名前で登録。同じ人がいれば上書き）
app.post('/api/tshirt/orders', async (c) => {
  if (!(await requireAdminAccount(c))) return c.json(ADMIN_ONLY, 403);
  const s = await loadTshirtSettings(c.env.DB);
  const b = await c.req.json<{ emp_no?: string; name?: string; size?: string }>();
  const size = String(b.size ?? '');
  if (!s.sizes.includes(size)) return c.json({ error: 'サイズを選んでください' }, 400);
  const empNo = String(b.emp_no ?? '').trim().replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
  let name = normalizeName(String(b.name ?? ''));
  if (empNo) {
    const emp = await c.env.DB.prepare('SELECT name FROM employees WHERE emp_no = ? AND is_active = 1').bind(empNo).first<{ name: string }>();
    if (!emp) return c.json({ error: '社員番号が名簿に見つかりません' }, 404);
    name = emp.name;
  } else if (!name) {
    return c.json({ error: '社員番号か名前を入力してください' }, 400);
  }
  const cur = empNo
    ? await c.env.DB.prepare('SELECT id FROM tshirt_orders WHERE emp_no = ?').bind(empNo).first<{ id: number }>()
    : await c.env.DB.prepare("SELECT id FROM tshirt_orders WHERE emp_no = '' AND name = ?").bind(name).first<{ id: number }>();
  if (cur) {
    await c.env.DB.prepare("UPDATE tshirt_orders SET name = ?, size = ?, updated_at = datetime('now','localtime') WHERE id = ?").bind(name, size, cur.id).run();
  } else {
    await c.env.DB.prepare('INSERT INTO tshirt_orders (emp_no, name, size) VALUES (?, ?, ?)').bind(empNo, name, size).run();
  }
  return c.json({ ok: true });
});

app.put('/api/tshirt/orders/:id', async (c) => {
  if (!(await requireAdminAccount(c))) return c.json(ADMIN_ONLY, 403);
  const s = await loadTshirtSettings(c.env.DB);
  const b = await c.req.json<{ size?: string }>();
  const size = String(b.size ?? '');
  if (!s.sizes.includes(size)) return c.json({ error: 'サイズを選んでください' }, 400);
  await c.env.DB.prepare("UPDATE tshirt_orders SET size = ?, updated_at = datetime('now','localtime') WHERE id = ?")
    .bind(size, Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});

app.delete('/api/tshirt/orders/:id', async (c) => {
  if (!(await requireAdminAccount(c))) return c.json(ADMIN_ONLY, 403);
  await c.env.DB.prepare('DELETE FROM tshirt_orders WHERE id = ?').bind(Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});

export default app;
