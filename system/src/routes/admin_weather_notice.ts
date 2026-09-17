// 異常気象警報 注意喚起サイネージ（管理画面）
//   ページ  : /settings/weather-notice
//   API     : /api/weather-notice/*（書き込みは settings.weather-notice.edit 必須）
//   投影URL : WEATHER_NOTICE_PUBLIC_PATH（config.ts。ログイン不要・専用モニター用）
//
// 運用: 警報が発令された日にその記録（日付・警報名・エリア・注意文言）を入力する。
// 専用モニターは「本日」の記録だけを、見出し→注意文言の2枚（各5秒・計10秒）で自動表示する。
// weather_notice_alerts は「警報名＋既定の注意文言」のテンプレート辞書（記録入力時の下書き用途）。
// 既存の交通安全サイネージ（signage_*）とはテーブル非共有の完全新規（weather_notice_*）。
import { Hono } from 'hono';
import type { Env } from '../auth';
import { layout, safeJson, escHtml } from '../html/layout';
import { settingsSubHeader } from './admin';
import { ADMIN_PATH, WEATHER_NOTICE_PUBLIC_PATH } from '../config';
import { getAdminPermissions } from '../permissions';
import type { WeatherNoticeAlertTemplate, WeatherNoticeEvent } from '../html/weather_notice';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

async function canEdit(c: { env: Env; get: (k: 'adminId') => number }): Promise<boolean> {
  const perms = await getAdminPermissions(c.env.DB, c.get('adminId'));
  return perms === null || perms.includes('settings.weather-notice.edit');
}
function requireEdit(c: { json: (b: unknown, s: 403) => Response }, editable: boolean): Response | null {
  return editable ? null : c.json({ error: 'この操作を行う権限がありません' }, 403);
}
function dateRegex(): RegExp { return /^\d{4}-\d{2}-\d{2}$/; }

async function loadTemplates(db: D1Database): Promise<WeatherNoticeAlertTemplate[]> {
  const r = await db.prepare('SELECT * FROM weather_notice_alerts ORDER BY sort_order ASC, id ASC').all<WeatherNoticeAlertTemplate>();
  return r.results ?? [];
}
async function renumberTemplates(db: D1Database, orderedIds: number[]): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    await db.prepare('UPDATE weather_notice_alerts SET sort_order = ? WHERE id = ?').bind(i, orderedIds[i]).run();
  }
}
async function loadEvents(db: D1Database): Promise<WeatherNoticeEvent[]> {
  const r = await db.prepare('SELECT * FROM weather_notice_events ORDER BY event_date DESC, sort_order ASC, id ASC').all<WeatherNoticeEvent>();
  return r.results ?? [];
}

function todayJstStr(): string {
  const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return nowJST.toISOString().split('T')[0];
}

// ===== ページ =====
app.get('/settings/weather-notice', async (c) => {
  const editable = await canEdit(c);
  const [templates, events] = await Promise.all([loadTemplates(c.env.DB), loadEvents(c.env.DB)]);

  const html = settingsSubHeader('異常気象警報 注意喚起サイネージ') + `
    <div style="max-width:880px;">
      <p style="font-size:12px;color:#6b7280;margin:0 0 20px;line-height:1.7;">
        気象庁の異常気象警報が発令されたら、下の「発令記録を追加」からその日の記録（警報名・対象エリア・注意文言）を入力してください。
        専用モニター画面には「本日」の記録だけが、1件あたり見出し→注意文言の2枚（約10秒）で自動的に順番表示されます。
      </p>

      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:14px 18px;margin-bottom:20px;font-size:12.5px;color:#1e40af;">
        モニターに表示する専用URL（本日の記録）：<br>
        <a href="${WEATHER_NOTICE_PUBLIC_PATH}" target="_blank" style="color:#1d4ed8;font-weight:700;word-break:break-all;">${escHtml(WEATHER_NOTICE_PUBLIC_PATH)}</a>
        <br>異常気象警報が出ている間だけ、モニターの表示先をこのURLへ手動で切り替えてください。
        <div style="margin-top:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span style="font-weight:700;">表示モード切り替え（過去の記録を確認）：</span>
          <input type="date" id="preview-date" style="border:1px solid #bfdbfe;border-radius:6px;padding:5px 8px;font-size:12.5px;">
          <button type="button" onclick="openPreview()" style="padding:6px 16px;background:#1d4ed8;color:white;border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;">この日を表示（別タブ）</button>
        </div>
      </div>

      ${editable ? `
      <div style="background:white;border-radius:10px;padding:16px 18px;box-shadow:0 1px 3px rgba(0,0,0,0.08);border:1px solid #e5e7eb;margin-bottom:20px;">
        <div style="font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:10px;">発令記録を追加</div>
        <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:10px;">
          <label style="font-size:11px;color:#374151;">発令日<br>
            <input type="date" id="ev-date" style="border:1px solid #d1d5db;border-radius:6px;padding:7px 9px;font-size:13px;">
          </label>
          <label style="font-size:11px;color:#374151;">警報名（テンプレートから選ぶと文言が自動入力されます）<br>
            <input list="tpl-list" id="ev-name" placeholder="例: 大雨警報" style="border:1px solid #d1d5db;border-radius:6px;padding:7px 9px;font-size:13px;width:220px;">
            <datalist id="tpl-list">${templates.map((t) => `<option value="${escHtml(t.name)}">`).join('')}</datalist>
          </label>
          <label style="font-size:11px;color:#374151;">対象エリア（任意）<br>
            <input type="text" id="ev-area" placeholder="例: 23区東部、23区西部" style="border:1px solid #d1d5db;border-radius:6px;padding:7px 9px;font-size:13px;width:260px;">
          </label>
        </div>
        <label style="font-size:11px;color:#374151;display:block;margin-bottom:10px;">注意文言（モニターに表示される内容）<br>
          <textarea id="ev-caution" rows="3" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;box-sizing:border-box;resize:vertical;"></textarea>
        </label>
        <div id="ev-msg" style="font-size:12px;color:#dc2626;margin-bottom:8px;"></div>
        <button type="button" onclick="addEvent()" id="ev-add-btn" style="padding:8px 22px;background:#1a3a5c;color:white;border:none;border-radius:6px;font-size:12.5px;font-weight:600;cursor:pointer;">記録を追加</button>
      </div>` : ''}

      <div style="background:white;border-radius:10px;padding:16px 18px;box-shadow:0 1px 3px rgba(0,0,0,0.08);border:1px solid #e5e7eb;margin-bottom:20px;">
        <div style="font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:4px;">発令記録一覧</div>
        <div style="font-size:12px;color:#6b7280;margin-bottom:10px;">日付が新しい順に並びます。「本日」の記録がモニターに表示されます。</div>
        <div id="event-list" style="display:flex;flex-direction:column;gap:8px;"></div>
      </div>

      <div style="background:white;border-radius:10px;padding:16px 18px;box-shadow:0 1px 3px rgba(0,0,0,0.08);border:1px solid #e5e7eb;margin-bottom:20px;">
        <div style="font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:4px;">警報名テンプレート</div>
        <div style="font-size:12px;color:#6b7280;margin-bottom:10px;">記録追加時に警報名を選ぶと、ここに登録した注意文言が自動入力されます（追加後も自由に編集可）。</div>
        <div id="tpl-list-ui" style="display:flex;flex-direction:column;gap:8px;margin-bottom:${editable ? '12px' : '0'};"></div>
        ${editable ? `<button type="button" onclick="addTemplate()" style="padding:7px 18px;background:#059669;color:white;border:none;border-radius:6px;font-size:12.5px;font-weight:600;cursor:pointer;">テンプレートを追加</button>` : ''}
      </div>
    </div>

    <script>
    var EDITABLE = ${editable ? 'true' : 'false'};
    var TODAY = ${safeJson(todayJstStr())};
    var TEMPLATES = ${safeJson(templates.map((t) => ({ id: t.id, name: t.name, caution: t.caution_text })))};
    var EVENTS = ${safeJson(events.map((e) => ({ id: e.id, date: e.event_date, name: e.warning_name, area: e.area || '', caution: e.caution_text })))};
    var API = ${safeJson(`${ADMIN_PATH}/api/weather-notice`)};
    var PUBLIC_PATH = ${safeJson(WEATHER_NOTICE_PUBLIC_PATH)};

    function openPreview() {
      var d = document.getElementById('preview-date').value || TODAY;
      window.open(PUBLIC_PATH + '?date=' + encodeURIComponent(d), '_blank');
    }

    function escHtmlJs(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    function fmtDow(dateStr) {
      var m = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(dateStr);
      if (!m) return dateStr;
      var wd = ['日','月','火','水','木','金','土'];
      var dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return Number(m[1]) + '年' + Number(m[2]) + '月' + Number(m[3]) + '日（' + wd[dt.getDay()] + '）';
    }

    // ---- 発令記録の追加 ----
    document.addEventListener('DOMContentLoaded', function() {
      var d = document.getElementById('ev-date');
      if (d) d.value = TODAY;
      var pd = document.getElementById('preview-date');
      if (pd) pd.value = TODAY;
      var nameInput = document.getElementById('ev-name');
      if (nameInput) {
        nameInput.addEventListener('change', function() {
          var t = TEMPLATES.find(function(x) { return x.name === nameInput.value; });
          var cautionEl = document.getElementById('ev-caution');
          if (t && cautionEl && !cautionEl.value) cautionEl.value = t.caution;
        });
      }
    });
    async function addEvent() {
      var msg = document.getElementById('ev-msg');
      var date = document.getElementById('ev-date').value;
      var name = document.getElementById('ev-name').value.trim();
      var area = document.getElementById('ev-area').value.trim();
      var caution = document.getElementById('ev-caution').value.trim();
      if (!date) { msg.textContent = '発令日を入力してください'; return; }
      if (!name) { msg.textContent = '警報名を入力してください'; return; }
      var btn = document.getElementById('ev-add-btn');
      btn.disabled = true; btn.textContent = '追加中...';
      try {
        var res = await fetch(API + '/events', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ event_date: date, warning_name: name, area: area, caution_text: caution }) });
        if (res.ok) { location.reload(); return; }
        var j = await res.json().catch(function(){ return {}; });
        msg.textContent = j.error || '追加に失敗しました';
      } catch (e) {
        msg.textContent = '通信エラーが発生しました';
      }
      btn.disabled = false; btn.textContent = '記録を追加';
    }

    // ---- 発令記録一覧 ----
    function renderEvents() {
      var wrap = document.getElementById('event-list');
      if (!EVENTS.length) {
        wrap.innerHTML = '<div style="padding:16px;text-align:center;color:#9ca3af;background:#f9fafb;border-radius:8px;">記録がまだありません</div>';
        return;
      }
      wrap.innerHTML = EVENTS.map(function(e) {
        var isToday = e.date === TODAY;
        var actions = EDITABLE
          ? '<button type="button" onclick="delEvent(' + e.id + ')" style="padding:4px 10px;background:#fee2e2;color:#991b1b;border:none;border-radius:4px;font-size:11px;cursor:pointer;">削除</button>'
          : '';
        return '<div style="display:flex;flex-direction:column;gap:6px;background:#f9fafb;border-radius:8px;padding:10px 12px;' + (isToday ? 'border:1px solid #059669;' : '') + '">'
          + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">'
          + '<span style="font-size:12px;font-weight:700;color:#1e3a5f;">' + fmtDow(e.date) + (isToday ? ' <span style="color:#059669;">（本日）</span>' : '') + '</span>'
          + '<input data-id="' + e.id + '" ' + (EDITABLE ? '' : 'disabled') + ' onblur="saveEventField(' + e.id + ', \\'warning_name\\', this.value)" value="' + escHtmlJs(e.name) + '" placeholder="警報名" style="flex:0 0 160px;border:1px solid #d1d5db;border-radius:6px;padding:5px 7px;font-size:12.5px;font-weight:700;box-sizing:border-box;">'
          + '<input data-id="' + e.id + '" ' + (EDITABLE ? '' : 'disabled') + ' onblur="saveEventField(' + e.id + ', \\'area\\', this.value)" value="' + escHtmlJs(e.area) + '" placeholder="対象エリア" style="flex:0 0 220px;border:1px solid #d1d5db;border-radius:6px;padding:5px 7px;font-size:12.5px;box-sizing:border-box;">'
          + '<div style="margin-left:auto;">' + actions + '</div>'
          + '</div>'
          + '<textarea data-id="' + e.id + '" ' + (EDITABLE ? '' : 'disabled') + ' onblur="saveEventField(' + e.id + ', \\'caution_text\\', this.value)" rows="2" placeholder="注意文言" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:12.5px;box-sizing:border-box;resize:vertical;">' + escHtmlJs(e.caution) + '</textarea>'
          + '</div>';
      }).join('');
    }
    async function saveEventField(id, field, value) {
      var e = EVENTS.find(function(x){ return x.id === id; });
      var body = {};
      body[field] = value;
      await fetch(API + '/events/' + id, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
      if (e) {
        if (field === 'warning_name') e.name = value;
        else if (field === 'area') e.area = value;
        else if (field === 'caution_text') e.caution = value;
      }
    }
    async function delEvent(id) {
      if (!confirm('この記録を削除しますか？')) return;
      await fetch(API + '/events/' + id, { method: 'DELETE' });
      location.reload();
    }

    // ---- 警報名テンプレート ----
    function renderTemplates() {
      var wrap = document.getElementById('tpl-list-ui');
      if (!TEMPLATES.length) {
        wrap.innerHTML = '<div style="padding:16px;text-align:center;color:#9ca3af;background:#f9fafb;border-radius:8px;">テンプレートが登録されていません</div>';
        return;
      }
      wrap.innerHTML = TEMPLATES.map(function(t) {
        var actions = EDITABLE
          ? '<button type="button" onclick="delTemplate(' + t.id + ')" style="padding:4px 10px;background:#fee2e2;color:#991b1b;border:none;border-radius:4px;font-size:11px;cursor:pointer;">削除</button>'
          : '';
        return '<div style="display:flex;align-items:center;gap:8px;background:#f9fafb;border-radius:8px;padding:8px 10px;flex-wrap:wrap;">'
          + '<input data-id="' + t.id + '" ' + (EDITABLE ? '' : 'disabled') + ' onblur="saveTemplateField(' + t.id + ', \\'name\\', this.value)" value="' + escHtmlJs(t.name) + '" style="flex:0 0 160px;border:1px solid #d1d5db;border-radius:6px;padding:5px 7px;font-size:12.5px;font-weight:700;box-sizing:border-box;">'
          + '<input data-id="' + t.id + '" ' + (EDITABLE ? '' : 'disabled') + ' onblur="saveTemplateField(' + t.id + ', \\'caution_text\\', this.value)" value="' + escHtmlJs(t.caution) + '" style="flex:1;min-width:260px;border:1px solid #d1d5db;border-radius:6px;padding:5px 7px;font-size:12.5px;box-sizing:border-box;">'
          + actions
          + '</div>';
      }).join('');
    }
    async function addTemplate() {
      var res = await fetch(API + '/alerts', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name: '', caution_text: '' }) });
      if (res.ok) location.reload();
    }
    async function saveTemplateField(id, field, value) {
      var t = TEMPLATES.find(function(x){ return x.id === id; });
      var body = {};
      body[field] = value;
      await fetch(API + '/alerts/' + id, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
      if (t) { if (field === 'name') t.name = value; else t.caution = value; }
    }
    async function delTemplate(id) {
      if (!confirm('このテンプレートを削除しますか？')) return;
      await fetch(API + '/alerts/' + id, { method: 'DELETE' });
      location.reload();
    }

    renderEvents();
    renderTemplates();
    </script>`;

  return c.html(layout('異常気象警報 注意喚起サイネージ', html, 'settings'));
});

// ===== API: 警報名テンプレート =====
app.post('/api/weather-notice/alerts', async (c) => {
  const denied = requireEdit(c, await canEdit(c)); if (denied) return denied;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = String(body.name ?? '').slice(0, 60);
  const caution = String(body.caution_text ?? '').slice(0, 1000);
  const maxRow = await c.env.DB.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM weather_notice_alerts').first<{ m: number }>();
  const ins = await c.env.DB.prepare(
    'INSERT INTO weather_notice_alerts (name, caution_text, sort_order, is_active) VALUES (?, ?, ?, 1)'
  ).bind(name, caution, (maxRow?.m ?? -1) + 1).run();
  return c.json({ ok: true, id: Number(ins.meta.last_row_id) });
});

app.patch('/api/weather-notice/alerts/:id', async (c) => {
  const denied = requireEdit(c, await canEdit(c)); if (denied) return denied;
  const id = parseInt(c.req.param('id'), 10);
  const found = await c.env.DB.prepare('SELECT id FROM weather_notice_alerts WHERE id = ?').bind(id).first<{ id: number }>();
  if (!found) return c.json({ error: '見つかりません' }, 404);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const fields: string[] = [];
  const vals: unknown[] = [];
  if ('name' in body) { fields.push('name = ?'); vals.push(String(body.name ?? '').slice(0, 60)); }
  if ('caution_text' in body) { fields.push('caution_text = ?'); vals.push(String(body.caution_text ?? '').slice(0, 1000)); }
  if (!fields.length) return c.json({ error: '更新項目がありません' }, 400);
  fields.push("updated_at = datetime('now','localtime')");
  vals.push(id);
  await c.env.DB.prepare(`UPDATE weather_notice_alerts SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run();
  return c.json({ ok: true });
});

app.delete('/api/weather-notice/alerts/:id', async (c) => {
  const denied = requireEdit(c, await canEdit(c)); if (denied) return denied;
  const id = parseInt(c.req.param('id'), 10);
  await c.env.DB.prepare('DELETE FROM weather_notice_alerts WHERE id = ?').bind(id).run();
  await renumberTemplates(c.env.DB, (await loadTemplates(c.env.DB)).map((t) => t.id));
  return c.json({ ok: true });
});

// ===== API: 発令記録 =====
app.post('/api/weather-notice/events', async (c) => {
  const denied = requireEdit(c, await canEdit(c)); if (denied) return denied;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const eventDate = String(body.event_date ?? '');
  if (!dateRegex().test(eventDate)) return c.json({ error: '発令日が不正です' }, 400);
  const name = String(body.warning_name ?? '').trim().slice(0, 60);
  if (!name) return c.json({ error: '警報名を入力してください' }, 400);
  const area = String(body.area ?? '').trim().slice(0, 200) || null;
  const caution = String(body.caution_text ?? '').slice(0, 1000);
  const maxRow = await c.env.DB.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM weather_notice_events WHERE event_date = ?')
    .bind(eventDate).first<{ m: number }>();
  const ins = await c.env.DB.prepare(
    'INSERT INTO weather_notice_events (event_date, warning_name, area, caution_text, sort_order) VALUES (?, ?, ?, ?, ?)'
  ).bind(eventDate, name, area, caution, (maxRow?.m ?? -1) + 1).run();
  return c.json({ ok: true, id: Number(ins.meta.last_row_id) });
});

app.patch('/api/weather-notice/events/:id', async (c) => {
  const denied = requireEdit(c, await canEdit(c)); if (denied) return denied;
  const id = parseInt(c.req.param('id'), 10);
  const found = await c.env.DB.prepare('SELECT id FROM weather_notice_events WHERE id = ?').bind(id).first<{ id: number }>();
  if (!found) return c.json({ error: '見つかりません' }, 404);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const fields: string[] = [];
  const vals: unknown[] = [];
  if ('event_date' in body) {
    const d = String(body.event_date ?? '');
    if (!dateRegex().test(d)) return c.json({ error: '発令日が不正です' }, 400);
    fields.push('event_date = ?'); vals.push(d);
  }
  if ('warning_name' in body) { fields.push('warning_name = ?'); vals.push(String(body.warning_name ?? '').trim().slice(0, 60)); }
  if ('area' in body) { fields.push('area = ?'); vals.push(String(body.area ?? '').trim().slice(0, 200) || null); }
  if ('caution_text' in body) { fields.push('caution_text = ?'); vals.push(String(body.caution_text ?? '').slice(0, 1000)); }
  if (!fields.length) return c.json({ error: '更新項目がありません' }, 400);
  fields.push("updated_at = datetime('now','localtime')");
  vals.push(id);
  await c.env.DB.prepare(`UPDATE weather_notice_events SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run();
  return c.json({ ok: true });
});

app.delete('/api/weather-notice/events/:id', async (c) => {
  const denied = requireEdit(c, await canEdit(c)); if (denied) return denied;
  const id = parseInt(c.req.param('id'), 10);
  await c.env.DB.prepare('DELETE FROM weather_notice_events WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

export default app;
