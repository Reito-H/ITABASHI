// 出勤者ボード: 日付を選ぶと、その日の出勤者を勤務区分ごとに一覧。
//   ・チェック（消し込み）＝「確認した」印。全アカウント共有・日付ごと。押すと即サーバー保存。
//   ・リセット（確認アラート付き）＝その日のチェックを全消去。
//   ・出勤者判定は data/attendance.ts（シフト優先＋勤務体系で補完）。
import { Hono } from 'hono';
import type { Env } from '../auth';
import { layout, escHtml } from '../html/layout';
import { ADMIN_PATH } from '../config';
import { resolveAttendance, type AttendancePerson } from '../data/attendance';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

function todayJST(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T00:00:00+09:00').getTime());
}
function shiftDate(s: string, deltaDays: number): string {
  const d = new Date(s + 'T00:00:00+09:00');
  d.setDate(d.getDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}
const WD = ['日', '月', '火', '水', '木', '金', '土'];
function wdLabel(s: string): string {
  return WD[new Date(s + 'T00:00:00+09:00').getDay()];
}

async function adminName(c: { env: Env; get: (k: 'adminId') => number }): Promise<string> {
  const row = await c.env.DB.prepare('SELECT username FROM admins WHERE id = ?').bind(c.get('adminId')).first<{ username: string }>();
  return row?.username ?? `id:${c.get('adminId')}`;
}

// ===== ページ =====
app.get('/attendance-board', async (c) => {
  const dateQ = (c.req.query('date') ?? '').trim();
  const date = isValidDate(dateQ) ? dateQ : todayJST();
  const divQ = c.req.query('div') ?? 'all';
  const div = ['all', '1', '2', '3', '4'].includes(divQ) ? divQ : 'all';

  const [{ hasShiftData, people }, checkRows] = await Promise.all([
    resolveAttendance(c.env.DB, date),
    c.env.DB.prepare('SELECT emp_id FROM attendance_board_checks WHERE date = ?').bind(date).all<{ emp_id: number }>(),
  ]);
  const checkedSet = new Set((checkRows.results ?? []).map(r => r.emp_id));

  const filtered = div === 'all' ? people : people.filter(p => String(p.division ?? '') === div);

  // グループ化（groupOrder順を維持）
  const groups: Array<{ key: string; label: string; order: number; people: AttendancePerson[] }> = [];
  const gmap = new Map<string, { key: string; label: string; order: number; people: AttendancePerson[] }>();
  for (const p of filtered) {
    let g = gmap.get(p.groupKey);
    if (!g) { g = { key: p.groupKey, label: p.groupLabel, order: p.groupOrder, people: [] }; gmap.set(p.groupKey, g); groups.push(g); }
    g.people.push(p);
  }
  groups.sort((a, b) => a.order - b.order);

  const total = filtered.length;
  const done = filtered.filter(p => checkedSet.has(p.empId)).length;
  const rest = total - done;

  const divTab = (v: string, label: string) =>
    `<a href="${ADMIN_PATH}/attendance-board?date=${date}&div=${v}" style="padding:6px 12px;text-decoration:none;font-size:12px;border:1px solid #d1d5db;border-radius:7px;${div === v ? 'background:#1a3a5c;color:white;font-weight:700;border-color:#1a3a5c;' : 'background:white;color:#374151;'}">${label}</a>`;

  const personRow = (p: AttendancePerson) => {
    const on = checkedSet.has(p.empId);
    const sub = [
      p.division ? `${p.division}課${p.team ? p.team + '班' : ''}` : '',
      p.carNo ? `車${escHtml(p.carNo)}` : '',
      escHtml(p.detail),
    ].filter(Boolean).join(' ・ ');
    return `<div class="abp${on ? ' done' : ''}" data-emp="${p.empId}">
      <input type="checkbox" ${on ? 'checked' : ''} onchange="toggleCheck(${p.empId}, this)" aria-label="${escHtml(p.name)} を確認済みにする">
      <div class="abp-main">
        <a href="${ADMIN_PATH}/crew-portal/employee/${p.empId}" class="abp-name">${escHtml(p.name)}</a>
        <div class="abp-sub">${sub}${p.source === 'schedule' ? ' <span class="abp-fallback">勤務体系から補完</span>' : ''}</div>
      </div>
    </div>`;
  };

  const groupsHtml = groups.length
    ? groups.map(g => `<div class="abcol">
        <div class="abcol-h">${escHtml(g.label)} <em>${g.people.length}</em></div>
        ${g.people.map(personRow).join('')}
      </div>`).join('')
    : `<div style="color:#9ca3af;font-size:13px;padding:24px;">この日の出勤者データがありません（乗務員シフトが未取込で、勤務体系も未設定の場合は表示されません）。</div>`;

  const content = `
<div style="font-family:'Hiragino Sans','Meiryo',sans-serif;">
  <style>
    .ab-toolbar { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:12px; }
    .ab-datenav { display:flex; align-items:center; gap:6px; }
    .ab-datenav a, .ab-datenav span.cur { padding:6px 10px; border:1px solid #d1d5db; border-radius:7px; text-decoration:none; font-size:13px; color:#374151; background:white; }
    .ab-datenav span.cur { font-weight:700; color:#1a3a5c; font-family:monospace; }
    .ab-counts { margin-left:auto; font-size:13px; color:#374151; }
    .ab-counts b { font-family:monospace; }
    .ab-counts .rest { color:#b45309; }
    .ab-btn { padding:7px 14px; border-radius:7px; font-size:12px; font-weight:700; cursor:pointer; border:1px solid #d1d5db; background:white; color:#374151; }
    .ab-btn.reset { background:#fef2f2; color:#dc2626; border-color:#fecaca; }
    .abcols { display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:12px; }
    .abcol { border:1px solid #e5e7eb; border-radius:10px; background:white; overflow:hidden; }
    .abcol-h { padding:9px 12px; background:#f8fafc; font-size:12px; font-weight:700; color:#374151; display:flex; justify-content:space-between; }
    .abcol-h em { font-style:normal; color:#9ca3af; font-family:monospace; }
    .abp { display:grid; grid-template-columns:20px 1fr; gap:9px; align-items:start; padding:9px 12px; border-top:1px solid #f1f5f9; font-size:13px; }
    .abp input { width:16px; height:16px; margin-top:2px; accent-color:#166534; cursor:pointer; }
    .abp-name { font-weight:700; color:#1f2937; text-decoration:none; }
    .abp-name:hover { text-decoration:underline; }
    .abp-sub { font-size:11px; color:#6b7280; margin-top:2px; }
    .abp-fallback { background:#f3f4f6; color:#6b7280; border-radius:4px; padding:0 5px; font-size:10px; }
    .abp.done { background:#f8fafc; opacity:.55; }
    .abp.done .abp-name { text-decoration:line-through; color:#6b7280; }
    @media print {
      .ab-toolbar, .ab-actions { display:none !important; }
      .abcols { grid-template-columns:repeat(4, 1fr); }
      .abp.done { opacity:.5; }
    }
  </style>

  <h2 style="font-size:16px;font-weight:700;color:#1a3a5c;margin:0 0 4px;">出勤者ボード</h2>
  <p style="font-size:12px;color:#6b7280;margin:0 0 14px;">日付を選ぶと、その日の出勤者が勤務区分ごとに並びます。確認できた人はチェックで消し込み（薄いグレーになります）。チェックは全員で共有され、日付ごとに別管理です。</p>

  <div class="ab-toolbar">
    <div class="ab-datenav">
      <a href="${ADMIN_PATH}/attendance-board?date=${shiftDate(date, -1)}&div=${div}" title="前日">◀</a>
      <span class="cur">${date}（${wdLabel(date)}）</span>
      <a href="${ADMIN_PATH}/attendance-board?date=${shiftDate(date, 1)}&div=${div}" title="翌日">▶</a>
      <a href="${ADMIN_PATH}/attendance-board?date=${todayJST()}&div=${div}">今日</a>
      <input type="date" value="${date}" onchange="if(this.value)location.href='${ADMIN_PATH}/attendance-board?date='+this.value+'&div=${div}'" style="padding:5px 8px;border:1px solid #d1d5db;border-radius:7px;font-size:12px;">
    </div>
    <div class="ab-counts">出勤 <b>${total}</b>名 ／ 確認済 <b id="ab-done">${done}</b> ／ 残り <b class="rest" id="ab-rest">${rest}</b></div>
  </div>

  <div class="ab-toolbar ab-actions">
    ${['all', '1', '2', '3', '4'].map(v => divTab(v, v === 'all' ? '全課' : v + '課')).join('')}
    <div style="margin-left:auto;display:flex;gap:8px;">
      <button class="ab-btn" onclick="window.print()">印刷</button>
      <button class="ab-btn reset" onclick="resetDay()">この日のチェックをリセット</button>
    </div>
  </div>
  ${!hasShiftData ? `<div style="background:#fffbeb;border:1px solid #fde68a;color:#92400e;font-size:12px;border-radius:8px;padding:8px 12px;margin-bottom:12px;">この日の乗務員シフトが取り込まれていないため、全員を社員マスタの勤務体系から補完表示しています。</div>` : ''}

  <div class="abcols">${groupsHtml}</div>
</div>

<script>
const AB_DATE = ${JSON.stringify(date)};
const AB_ADMIN = ${JSON.stringify(ADMIN_PATH)};

function refreshCounts() {
  const rows = [...document.querySelectorAll('.abp')];
  const done = rows.filter(r => r.classList.contains('done')).length;
  document.getElementById('ab-done').textContent = done;
  document.getElementById('ab-rest').textContent = rows.length - done;
}

async function toggleCheck(empId, el) {
  const checked = el.checked;
  const row = el.closest('.abp');
  row.classList.toggle('done', checked);
  refreshCounts();
  try {
    const res = await fetch(AB_ADMIN + '/api/attendance-board/check', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify({ date: AB_DATE, empId: empId, checked: checked }),
    });
    if (!res.ok) throw new Error('save failed');
  } catch (e) {
    el.checked = !checked;
    row.classList.toggle('done', !checked);
    refreshCounts();
    alert('保存できませんでした。通信状態を確認してもう一度お試しください。');
  }
}

async function resetDay() {
  if (!confirm(AB_DATE + ' のチェックをすべて消します。よろしいですか？')) return;
  try {
    const res = await fetch(AB_ADMIN + '/api/attendance-board/reset', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify({ date: AB_DATE }),
    });
    if (!res.ok) throw new Error('reset failed');
    location.reload();
  } catch (e) {
    alert('リセットできませんでした。もう一度お試しください。');
  }
}
</script>`;

  return c.html(layout('出勤者ボード', content, 'attendance-board'));
});

// ===== API =====
app.post('/api/attendance-board/check', async (c) => {
  const b = await c.req.json<{ date?: string; empId?: number; checked?: boolean }>().catch(() => ({} as { date?: string; empId?: number; checked?: boolean }));
  const date = String(b.date ?? '');
  const empId = Number(b.empId);
  if (!isValidDate(date) || !Number.isInteger(empId) || empId <= 0) return c.json({ error: 'bad request' }, 400);

  if (b.checked) {
    await c.env.DB.prepare(
      `INSERT INTO attendance_board_checks (date, emp_id, checked_at, checked_by)
       VALUES (?, ?, datetime('now','localtime'), ?)
       ON CONFLICT(date, emp_id) DO UPDATE SET checked_at = datetime('now','localtime'), checked_by = excluded.checked_by`
    ).bind(date, empId, await adminName(c)).run();
  } else {
    await c.env.DB.prepare('DELETE FROM attendance_board_checks WHERE date = ? AND emp_id = ?').bind(date, empId).run();
  }
  return c.json({ ok: true });
});

app.post('/api/attendance-board/reset', async (c) => {
  const b = await c.req.json<{ date?: string }>().catch(() => ({} as { date?: string }));
  const date = String(b.date ?? '');
  if (!isValidDate(date)) return c.json({ error: 'bad request' }, 400);
  await c.env.DB.prepare('DELETE FROM attendance_board_checks WHERE date = ?').bind(date).run();
  return c.json({ ok: true });
});

export default app;
