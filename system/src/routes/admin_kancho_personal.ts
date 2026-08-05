// 班長シフト「個人別確認」: 班長一人ひとりの1ヶ月分の予定をWebで確認するページ
// 旧⭐カレ（LINE LIFF）の代替。ログイン必須・班長シフトを開ける全アカウント（閲覧権限で可）が対象。
// 勤務欄は既存の班長シフト（内勤=kancho_shifts / 乗務=kancho_crew_schedules）をそのまま表示する閲覧専用。
// 「その他」欄（自由記述）のみ、社員番号で指定した本人分をその場で編集・保存できる。
// ページ: /kancho-shift/personal
// API   : /api/kancho-personal/*（index.ts のミドルウェアで <kancho-shift.edit> 要求を外し、
//          このファイル内で kancho-shift の有無だけをチェックする）
import { Hono } from 'hono';
import type { Env } from '../auth';
import { getPeriodSettings, getPeriodRange, getPeriod } from '../auth';
import { layout, saveToastHtml, saveToastScript } from '../html/layout';
import { getAdminPermissions } from '../permissions';
import { ADMIN_PATH } from '../config';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

async function canAccess(c: { env: Env; get: (k: 'adminId') => number }): Promise<boolean> {
  const perms = await getAdminPermissions(c.env.DB, c.get('adminId'));
  return perms === null || perms.includes('kancho-shift');
}

async function adminName(c: { env: Env; get: (k: 'adminId') => number }): Promise<{ id: number; name: string }> {
  const id = c.get('adminId');
  const row = await c.env.DB.prepare('SELECT username FROM admins WHERE id = ?').bind(id).first<{ username: string }>();
  return { id, name: row?.username ?? `id:${id}` };
}

// 全角数字を半角に変換（入力ゆれ対策）
function toHalfWidth(s: string): string {
  return s.replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
}

function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  const cur = new Date(start);
  const last = new Date(end);
  while (cur <= last) {
    out.push(cur.toISOString().split('T')[0]);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

// ===== API =====

app.get('/api/kancho-personal/lookup', async (c) => {
  if (!(await canAccess(c))) return c.json({ error: 'この操作を行う権限がありません' }, 403);
  const now = getPeriod(new Date().toISOString().split('T')[0]);
  const year = parseInt(c.req.query('year') ?? '') || now.year;
  const month = parseInt(c.req.query('month') ?? '') || now.month;
  const empNo = toHalfWidth((c.req.query('emp_no') ?? '').trim());
  if (!empNo) return c.json({ error: '社員番号を入力してください' }, 400);

  const member = await c.env.DB.prepare(
    `SELECT id, name, role, is_indoor FROM kancho_members
     WHERE emp_no = ? AND section = 'main' AND is_active = 1 AND year = ? AND month = ?`
  ).bind(empNo, year, month).first<{ id: number; name: string; role: string | null; is_indoor: number }>();
  if (!member) return c.json({ error: '該当する班長が見つかりませんでした。社員番号・対象月度をご確認ください' }, 404);
  return c.json({ year, month, member });
});

app.get('/api/kancho-personal/calendar', async (c) => {
  if (!(await canAccess(c))) return c.json({ error: 'この操作を行う権限がありません' }, 403);
  const memberId = parseInt(c.req.query('member_id') ?? '');
  if (!memberId) return c.json({ error: 'member_id が必要です' }, 400);
  const now = getPeriod(new Date().toISOString().split('T')[0]);
  const year = parseInt(c.req.query('year') ?? '') || now.year;
  const month = parseInt(c.req.query('month') ?? '') || now.month;

  const member = await c.env.DB.prepare(
    `SELECT id, name, role, is_indoor FROM kancho_members WHERE id = ? AND section = 'main' AND year = ? AND month = ?`
  ).bind(memberId, year, month).first<{ id: number; name: string; role: string | null; is_indoor: number }>();
  if (!member) return c.json({ error: '対象の班長が見つかりません' }, 404);

  const periodCfg = await getPeriodSettings(c.env.DB);
  const { start: periodStart, end: periodEnd } = getPeriodRange(year, month, periodCfg);
  const dates = dateRange(periodStart, periodEnd);

  // 内勤(kancho_shifts)は色マス(記号なし+cell_color)=早日勤の判定にcell_colorが要るが、
  // 乗務(kancho_crew_schedules)にはcell_color列が無いため個別にSELECT列を分ける
  const entriesQuery = member.is_indoor
    ? c.env.DB.prepare(`SELECT date, code, cell_color FROM kancho_shifts WHERE member_id = ? AND date BETWEEN ? AND ?`)
        .bind(memberId, periodStart, periodEnd).all<{ date: string; code: string; cell_color: string | null }>()
    : c.env.DB.prepare(`SELECT date, code FROM kancho_crew_schedules WHERE member_id = ? AND date BETWEEN ? AND ?`)
        .bind(memberId, periodStart, periodEnd).all<{ date: string; code: string }>();

  const [types, entries, notes] = await Promise.all([
    c.env.DB.prepare(
      `SELECT code, label, color FROM kancho_shift_types WHERE year = ? AND month = ?`
    ).bind(year, month).all<{ code: string; label: string; color: string }>(),
    entriesQuery,
    c.env.DB.prepare(
      `SELECT date, note FROM kancho_calendar_notes WHERE member_id = ? AND date BETWEEN ? AND ?`
    ).bind(memberId, periodStart, periodEnd).all<{ date: string; note: string }>(),
  ]);

  return c.json({
    year, month, periodStart, periodEnd, dates,
    member,
    types: types.results ?? [],
    entries: entries.results ?? [],
    notes: notes.results ?? [],
  });
});

app.post('/api/kancho-personal/note', async (c) => {
  if (!(await canAccess(c))) return c.json({ error: 'この操作を行う権限がありません' }, 403);
  const body = await c.req.json<{ member_id?: number; date?: string; note?: string }>();
  const memberId = body.member_id;
  const date = (body.date ?? '').trim();
  if (!memberId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ error: 'member_id, date が不正です' }, 400);

  const member = await c.env.DB.prepare(
    `SELECT id, name FROM kancho_members WHERE id = ? AND section = 'main'`
  ).bind(memberId).first<{ id: number; name: string }>();
  if (!member) return c.json({ error: '対象の班長が見つかりません' }, 404);

  const { name: adminUser } = await adminName(c);
  const note = (body.note ?? '').trim();
  if (note) {
    await c.env.DB.prepare(
      `INSERT INTO kancho_calendar_notes (member_id, date, note, updated_at, updated_by) VALUES (?, ?, ?, datetime('now','localtime'), ?)
       ON CONFLICT(member_id, date) DO UPDATE SET note = excluded.note, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
    ).bind(memberId, date, note, adminUser).run();
  } else {
    await c.env.DB.prepare(`DELETE FROM kancho_calendar_notes WHERE member_id = ? AND date = ?`).bind(memberId, date).run();
  }
  return c.json({ ok: true });
});

// ===== ページ =====
app.get('/kancho-shift/personal', (c) => {
  const now = getPeriod(new Date().toISOString().split('T')[0]);
  const html = `
    <div class="no-print" style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
      <a href="${ADMIN_PATH}/kancho-shift" style="color:#6b7280;font-size:13px;text-decoration:none;padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:white;">← 班長シフトに戻る</a>
      <h2 style="font-size:17px;font-weight:700;color:#1e3a5f;">個人別確認</h2>
    </div>

    <div id="step-lookup" style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:18px;max-width:480px;margin-bottom:16px;">
      <div style="font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:10px;">対象を指定してください</div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:12px;align-items:flex-end;">
        <label style="font-size:12px;color:#6b7280;">対象月度
          <div>
            <input id="lk-year" type="number" value="${now.year}" style="width:80px;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;">年
            <input id="lk-month" type="number" value="${now.month}" min="1" max="12" style="width:56px;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;">月度
          </div>
        </label>
      </div>
      <label style="font-size:12px;color:#6b7280;">社員番号<div>
        <input id="lk-emp-no" type="text" inputmode="numeric" placeholder="12345678" style="width:100%;max-width:220px;border:1px solid #93c5fd;border-radius:8px;padding:10px;font-size:15px;letter-spacing:1px;">
      </div></label>
      <button onclick="lookup()" id="lookup-btn" style="margin-top:14px;padding:9px 22px;background:#2563eb;color:white;border:none;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer;">表示</button>
      <div id="lookup-err" style="display:none;color:#dc2626;font-size:12px;margin-top:8px;"></div>
    </div>

    <div id="step-confirm" style="display:none;background:white;border:1px solid #e5e7eb;border-radius:10px;padding:24px;max-width:480px;margin-bottom:16px;text-align:center;">
      <div style="font-size:13px;color:#6b7280;">このお名前で間違いありませんか？</div>
      <div id="confirm-name" style="font-size:22px;font-weight:700;color:#1e3a5f;margin:10px 0 18px;"></div>
      <button onclick="confirmYes()" style="padding:10px 28px;background:#16a34a;color:white;border:none;border-radius:7px;font-size:14px;font-weight:700;cursor:pointer;margin-right:8px;">はい、表示する</button>
      <button onclick="backToLookup()" style="padding:10px 20px;background:#f3f4f6;color:#374151;border:none;border-radius:7px;font-size:13px;cursor:pointer;">番号を入力し直す</button>
    </div>

    <div id="step-calendar" style="display:none;background:white;border:1px solid #e5e7eb;border-radius:10px;padding:18px;max-width:820px;">
      <div class="no-print" style="display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-bottom:10px;">
        <button onclick="saveAsImage()" id="image-save-btn" style="padding:7px 16px;background:#f0fdf4;border:1px solid #86efac;color:#166534;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">🖼️ 画像で保存(PNG)</button>
        <button onclick="backToLookup()" style="padding:7px 16px;background:#f3f4f6;color:#374151;border:none;border-radius:6px;font-size:12px;cursor:pointer;">別の人を見る</button>
      </div>
      <div id="capture-area" style="background:white;">
        <div style="margin-bottom:14px;">
          <div id="cal-name" style="font-size:16px;font-weight:700;color:#1e3a5f;"></div>
          <div id="cal-period" style="font-size:12px;color:#9ca3af;"></div>
        </div>
        <div style="font-size:11px;color:#9ca3af;margin-bottom:10px;">「勤務」は班長シフト表のデータをそのまま表示しています（ここからは変更できません）。「その他」欄のみ自由に入力・保存できます。</div>
        <div id="cal-body">読み込み中...</div>
      </div>
    </div>
    ${saveToastHtml()}

    <script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"></script>
    <script>
    ${saveToastScript()}
    function escH(s) { return (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    function toHalfWidth(s) { return s.replace(/[０-９]/g, function(ch) { return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0); }); }
    var API = '${ADMIN_PATH}/api/kancho-personal';
    var _lookupResult = null; // {year, month, member}
    var _cache = null;

    function showStep(id) {
      ['step-lookup','step-confirm','step-calendar'].forEach(function(s) {
        document.getElementById(s).style.display = (s === id) ? 'block' : 'none';
      });
    }

    async function lookup() {
      var errEl = document.getElementById('lookup-err');
      errEl.style.display = 'none';
      var empNo = toHalfWidth(document.getElementById('lk-emp-no').value.trim());
      var year = parseInt(document.getElementById('lk-year').value) || 0;
      var month = parseInt(document.getElementById('lk-month').value) || 0;
      if (!empNo) { errEl.textContent = '社員番号を入力してください'; errEl.style.display = 'block'; return; }
      var btn = document.getElementById('lookup-btn');
      btn.disabled = true; btn.textContent = '確認中...';
      try {
        var res = await fetch(API + '/lookup?emp_no=' + encodeURIComponent(empNo) + '&year=' + year + '&month=' + month);
        var d = await res.json();
        if (!res.ok) { errEl.textContent = d.error || '見つかりませんでした'; errEl.style.display = 'block'; return; }
        _lookupResult = d;
        document.getElementById('confirm-name').textContent = d.member.name + ' さん';
        showStep('step-confirm');
      } catch (e) {
        errEl.textContent = '確認に失敗しました。もう一度お試しください'; errEl.style.display = 'block';
      } finally {
        btn.disabled = false; btn.textContent = '表示';
      }
    }

    function backToLookup() {
      _lookupResult = null; _cache = null;
      document.getElementById('lk-emp-no').value = '';
      showStep('step-lookup');
    }

    async function confirmYes() {
      showStep('step-calendar');
      document.getElementById('cal-body').innerHTML = '読み込み中...';
      try {
        var res = await fetch(API + '/calendar?member_id=' + _lookupResult.member.id + '&year=' + _lookupResult.year + '&month=' + _lookupResult.month);
        var d = await res.json();
        if (!res.ok) { document.getElementById('cal-body').innerHTML = '<div style="color:#dc2626;">' + escH(d.error || '読み込みに失敗しました') + '</div>'; return; }
        _cache = d;
        renderCalendar();
      } catch (e) {
        document.getElementById('cal-body').innerHTML = '<div style="color:#dc2626;">読み込みに失敗しました</div>';
      }
    }

    var WD = ['日','月','火','水','木','金','土'];
    function renderCalendar() {
      var d = _cache;
      document.getElementById('cal-name').textContent = d.member.name + ' さん' + (d.member.role ? '（' + d.member.role + '）' : '') + (d.member.is_indoor ? '' : '（乗務）');
      document.getElementById('cal-period').textContent = d.year + '年' + d.month + '月度（' + d.periodStart + ' 〜 ' + d.periodEnd + '）';
      var emap = {}; d.entries.forEach(function(e) { emap[e.date] = e; });
      var nmap = {}; d.notes.forEach(function(n) { nmap[n.date] = n.note; });
      var colorMap = {}; d.types.forEach(function(t) { colorMap[t.code] = t.color; });
      // 表示ラベルの上書き: 「非」は制度上つねに「明け」を意味する（記号マスタ上の「非番」表記とは別）
      var labelMap = {}; d.types.forEach(function(t) { labelMap[t.code] = t.label; });
      var LABEL_OVERRIDE = { '非': '明け' };
      var today = new Date(Date.now() + 9*3600*1000).toISOString().slice(0,10);

      var rows = d.dates.map(function(dt) {
        var t = new Date(dt + 'T00:00:00');
        var dow = t.getDay();
        var e = emap[dt];
        var code = e ? (e.code || '') : '';
        var note = nmap[dt] || '';
        var dowColor = dow === 0 ? '#dc2626' : dow === 6 ? '#2563eb' : '#6b7280';
        var stampBg, stampLabel;
        if (code) {
          // 通常の記号（直・非・遅・早番・公 等）。「非」は「明け」表記で統一
          var dispCode = LABEL_OVERRIDE[code] || code;
          var subLabel = LABEL_OVERRIDE[code] ? '' : (labelMap[code] ? ' <span style="font-weight:400;color:#6b7280;">(' + escH(labelMap[code]) + ')</span>' : '');
          stampBg = colorMap[code] || '#e5e7eb';
          stampLabel = escH(dispCode) + subLabel;
        } else if (e && e.cell_color) {
          // 記号なし+色マス = 早日勤（7:30〜16:30）
          stampBg = e.cell_color;
          stampLabel = '早日勤';
        } else {
          stampBg = '#f9fafb';
          stampLabel = '<span style="color:#c1c7d0;">―</span>';
        }
        var isToday = dt === today;
        return '<tr' + (isToday ? ' style="background:#eff6ff;"' : '') + '>'
          + '<td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;white-space:nowrap;font-weight:700;color:#1e3a5f;">' + (t.getMonth()+1) + '/' + t.getDate() + '</td>'
          + '<td style="padding:8px 6px;border-bottom:1px solid #f3f4f6;white-space:nowrap;font-weight:700;color:' + dowColor + ';">' + WD[dow] + '</td>'
          + '<td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;white-space:nowrap;"><span style="display:inline-block;padding:4px 12px;border-radius:6px;background:' + stampBg + ';font-size:13px;font-weight:700;">' + stampLabel + '</span></td>'
          + '<td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;">'
          + '<input type="text" class="note-input" data-date="' + dt + '" value="' + escH(note) + '" placeholder="その他（自由記入）" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:7px 9px;font-size:13px;box-sizing:border-box;" onblur="saveNote(this)" onkeydown="if(event.key===\\'Enter\\'){this.blur();}">'
          + '</td>'
          + '</tr>';
      }).join('');

      document.getElementById('cal-body').innerHTML =
        '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;min-width:520px;">'
        + '<thead><tr style="background:#f8fafc;">'
        + '<th style="padding:7px 10px;text-align:left;border-bottom:2px solid #e5e7eb;">日付</th>'
        + '<th style="padding:7px 6px;text-align:left;border-bottom:2px solid #e5e7eb;">曜日</th>'
        + '<th style="padding:7px 10px;text-align:left;border-bottom:2px solid #e5e7eb;">勤務</th>'
        + '<th style="padding:7px 10px;text-align:left;border-bottom:2px solid #e5e7eb;">その他</th>'
        + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
    }

    function saveAsImage() {
      if (!_cache) { alert('先に対象の班長を表示してください'); return; }
      var el = document.getElementById('capture-area');
      if (typeof html2canvas === 'undefined') { alert('画像化ライブラリの読み込みに失敗しました。通信環境を確認してください。'); return; }
      var btn = document.getElementById('image-save-btn');
      btn.disabled = true; btn.textContent = '画像を生成中...';
      html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true }).then(function(canvas) {
        var link = document.createElement('a');
        link.download = '班長シフト_個人別確認_' + _cache.member.name + '_' + _cache.year + _cache.month + '.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
      }).catch(function() {
        alert('画像の生成に失敗しました');
      }).finally(function() {
        btn.disabled = false; btn.textContent = '🖼️ 画像で保存(PNG)';
      });
    }

    var _noteSaving = {};
    async function saveNote(el) {
      var date = el.dataset.date;
      var note = el.value;
      if (_noteSaving[date]) return;
      _noteSaving[date] = true;
      try {
        var res = await fetch(API + '/note', {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ member_id: _cache.member.id, date: date, note: note })
        });
        if (!res.ok) { var d = await res.json().catch(function(){return {};}); alert(d.error || '保存に失敗しました'); return; }
        showToast(date.slice(5).replace('-','/') + ' を保存しました');
      } catch (e) {
        alert('保存に失敗しました。もう一度お試しください');
      } finally {
        _noteSaving[date] = false;
      }
    }
    </script>`;
  return c.html(layout('個人別確認', html, 'kancho-shift'));
});

export default app;
