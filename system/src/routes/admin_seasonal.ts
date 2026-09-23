// シーズナル演出: ハロウィン/クリスマス/イースター/年末年始カウントダウン/謹賀新年の期間中、
// 管理画面の全ページ（デジタルサイネージの一覧/編集/投影/印刷ページを除く）に控えめな演出（seasonal_fx.ts）を表示する。
// ページ: /settings/seasonal（イベントごとのON/OFF・期間の手動上書き・プレビュー表示）
// 管理API: /api/seasonal/settings（書き込みは settings.seasonal.edit 必須）
// 表示用API: /api/seasonal/active
//   → 全アカウント共通で叩けるようにするため、誕生日ポップアップと同じくADMIN_PATH配下ではなくルート直下にマウントする
// プレビュー表示はサーバーに状態を持たず、seasonal_fx.ts の window.seasonalFxPreviewToggle() でクライアント側だけで完結させる
// （演出自体は全アカウント共通表示で個人情報を含まないため、誕生日の test-trigger 方式のようなDB経由の
//   ポーリング待ちは不要と判断）
import { Hono } from 'hono';
import type { Env } from '../auth';
import { layout, safeJson, escHtml } from '../html/layout';
import { settingsSubHeader } from './admin';
import { ADMIN_PATH } from '../config';
import { getAdminPermissions } from '../permissions';
import {
  SEASONAL_EVENT_KEYS,
  SEASONAL_EVENT_LABELS,
  computeDefaultRange,
  getActiveSeasonalEvent,
  type SeasonalEventKey,
  type SeasonalEventRow,
} from '../utils/seasonal_dates';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

async function canEdit(c: { env: Env; get: (k: 'adminId') => number }): Promise<boolean> {
  const perms = await getAdminPermissions(c.env.DB, c.get('adminId'));
  return perms === null || perms.includes('settings.seasonal.edit');
}

function nowJSTParts(): { year: number; month: number; day: number } {
  const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return { year: nowJST.getUTCFullYear(), month: nowJST.getUTCMonth() + 1, day: nowJST.getUTCDate() };
}

// ===== ページ =====
app.get('/settings/seasonal', async (c) => {
  const editable = await canEdit(c);
  const rows = await c.env.DB.prepare('SELECT * FROM seasonal_events').all<SeasonalEventRow>();
  const rowMap = new Map((rows.results ?? []).map(r => [r.event_key, r]));
  const { year } = nowJSTParts();

  const events = SEASONAL_EVENT_KEYS.map((key) => {
    const row = rowMap.get(key) ?? {
      event_key: key, is_enabled: 1,
      override_start_month: null, override_start_day: null, override_end_month: null, override_end_day: null,
    };
    const def = computeDefaultRange(key, year);
    return {
      key, label: SEASONAL_EVENT_LABELS[key], enabled: !!row.is_enabled,
      defaultStart: def.start, defaultEnd: def.end,
      overrideStartMonth: row.override_start_month, overrideStartDay: row.override_start_day,
      overrideEndMonth: row.override_end_month, overrideEndDay: row.override_end_day,
    };
  });

  function monthOptions(selected: number | null): string {
    let html = `<option value="">－</option>`;
    for (let m = 1; m <= 12; m++) html += `<option value="${m}" ${m === selected ? 'selected' : ''}>${m}月</option>`;
    return html;
  }
  function dayOptions(selected: number | null): string {
    let html = `<option value="">－</option>`;
    for (let d = 1; d <= 31; d++) html += `<option value="${d}" ${d === selected ? 'selected' : ''}>${d}日</option>`;
    return html;
  }

  const cardsHtml = events.map((e) => `
    <div class="sf-card" data-key="${e.key}" style="background:white;border-radius:10px;padding:16px 18px;box-shadow:0 1px 3px rgba(0,0,0,0.08);border:1px solid #e5e7eb;margin-bottom:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:6px;">
        <div style="font-size:13.5px;font-weight:700;color:#1e3a5f;">${escHtml(e.label)}</div>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#374151;">
          <input type="checkbox" class="sf-enabled" ${e.enabled ? 'checked' : ''} ${editable ? '' : 'disabled'}> 有効にする
        </label>
      </div>
      <div style="font-size:12px;color:#6b7280;margin-bottom:10px;">既定の期間（${year}年）: ${e.defaultStart.month}月${e.defaultStart.day}日 〜 ${e.defaultEnd.month}月${e.defaultEnd.day}日</div>
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:10px;">
        <span style="font-size:12px;color:#374151;">開始を上書き:</span>
        <select class="sf-os-m" ${editable ? '' : 'disabled'} style="border:1px solid #d1d5db;border-radius:6px;padding:5px 6px;font-size:12.5px;">${monthOptions(e.overrideStartMonth)}</select>
        <select class="sf-os-d" ${editable ? '' : 'disabled'} style="border:1px solid #d1d5db;border-radius:6px;padding:5px 6px;font-size:12.5px;">${dayOptions(e.overrideStartDay)}</select>
        <span style="font-size:12px;color:#374151;margin-left:10px;">終了を上書き:</span>
        <select class="sf-oe-m" ${editable ? '' : 'disabled'} style="border:1px solid #d1d5db;border-radius:6px;padding:5px 6px;font-size:12.5px;">${monthOptions(e.overrideEndMonth)}</select>
        <select class="sf-oe-d" ${editable ? '' : 'disabled'} style="border:1px solid #d1d5db;border-radius:6px;padding:5px 6px;font-size:12.5px;">${dayOptions(e.overrideEndDay)}</select>
        ${editable ? `<button type="button" onclick="clearOverride(this)" style="margin-left:6px;padding:4px 10px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;font-size:11.5px;cursor:pointer;">既定に戻す</button>` : ''}
      </div>
      <button type="button" onclick="togglePreview('${e.key}')" class="sf-preview-btn" data-key="${e.key}" style="padding:6px 16px;background:#f3f4f6;color:#374151;border:1px solid #d1d5db;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">プレビュー表示</button>
    </div>`).join('');

  const html = settingsSubHeader('シーズナル演出') + `
    <div style="max-width:760px;">
      <p style="font-size:12px;color:#6b7280;margin:0 0 20px;line-height:1.7;">
        期間中、管理画面のページ全体に控えめな演出（隅の小さいアイコンと、たまに流れる落ち葉や雪）を表示します。デジタルサイネージの一覧・編集・投影・印刷ページには表示されません。<br>
        期間を上書きした場合、月日は毎年繰り返し適用されます（今年だけの一時的な調整には向きません）。開始・終了はどちらも「月」「日」を両方指定してください。<br>
        「プレビュー表示」を押すとこの画面で今すぐ演出を確認できます（もう一度押すまで表示し続けます）。
      </p>

      ${cardsHtml}

      ${editable ? `
      <button type="button" onclick="saveSettings()" id="sf-save-btn" style="padding:8px 24px;background:#1a3a5c;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">保存</button>
      <span id="sf-msg" style="font-size:12px;color:#6b7280;margin-left:10px;"></span>` : ''}
    </div>

    <script>
    var EDITABLE = ${editable ? 'true' : 'false'};
    var API = ${safeJson(`${ADMIN_PATH}/api/seasonal`)};

    function clearOverride(btn) {
      var card = btn.closest('.sf-card');
      card.querySelector('.sf-os-m').value = '';
      card.querySelector('.sf-os-d').value = '';
      card.querySelector('.sf-oe-m').value = '';
      card.querySelector('.sf-oe-d').value = '';
    }
    function refreshPreviewButtons() {
      if (typeof window.seasonalFxIsPreviewing !== 'function') return;
      document.querySelectorAll('.sf-preview-btn').forEach(function(btn) {
        var on = window.seasonalFxIsPreviewing(btn.getAttribute('data-key'));
        btn.textContent = on ? 'プレビューをやめる' : 'プレビュー表示';
        btn.style.background = on ? '#b45309' : '#f3f4f6';
        btn.style.color = on ? 'white' : '#374151';
        btn.style.borderColor = on ? '#b45309' : '#d1d5db';
      });
    }
    function togglePreview(key) {
      if (typeof window.seasonalFxPreviewToggle !== 'function') return;
      window.seasonalFxPreviewToggle(key);
      refreshPreviewButtons();
    }

    function saveSettings() {
      var events = [];
      var errorMsg = '';
      document.querySelectorAll('.sf-card').forEach(function(card) {
        var key = card.getAttribute('data-key');
        var enabled = card.querySelector('.sf-enabled').checked;
        var osM = card.querySelector('.sf-os-m').value, osD = card.querySelector('.sf-os-d').value;
        var oeM = card.querySelector('.sf-oe-m').value, oeD = card.querySelector('.sf-oe-d').value;
        var startFilled = osM !== '' && osD !== '';
        var endFilled = oeM !== '' && oeD !== '';
        var startEmpty = osM === '' && osD === '';
        var endEmpty = oeM === '' && oeD === '';
        if (!startFilled && !startEmpty) errorMsg = '開始日は月・日を両方指定するか、両方空にしてください';
        if (!endFilled && !endEmpty) errorMsg = '終了日は月・日を両方指定するか、両方空にしてください';
        events.push({
          key: key, enabled: enabled,
          startMonth: startFilled ? Number(osM) : null, startDay: startFilled ? Number(osD) : null,
          endMonth: endFilled ? Number(oeM) : null, endDay: endFilled ? Number(oeD) : null,
        });
      });
      var msg = document.getElementById('sf-msg');
      if (errorMsg) { msg.style.color = '#dc2626'; msg.textContent = errorMsg; return; }

      var btn = document.getElementById('sf-save-btn');
      btn.disabled = true; var orig = btn.textContent; btn.textContent = '保存中…'; msg.style.color = '#6b7280'; msg.textContent = '';
      fetch(API + '/settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events: events }),
      })
        .then(function(r) { return r.json().then(function(j) { return { ok: r.ok, j: j }; }); })
        .then(function(res) {
          btn.disabled = false; btn.textContent = orig;
          if (!res.ok) { msg.style.color = '#dc2626'; msg.textContent = res.j.error || '保存に失敗しました'; return; }
          msg.style.color = '#059669'; msg.textContent = '保存しました';
          setTimeout(function() { msg.textContent = ''; }, 2500);
        })
        .catch(function() { btn.disabled = false; btn.textContent = orig; msg.style.color = '#dc2626'; msg.textContent = '通信エラーが発生しました'; });
    }
    </script>`;

  return c.html(layout('シーズナル演出', html, 'settings'));
});

// ===== 管理API =====
const VALID_KEYS = new Set<string>(SEASONAL_EVENT_KEYS);

function isValidOptionalMonthDay(month: unknown, day: unknown): boolean {
  if (month === null && day === null) return true;
  if (typeof month !== 'number' || typeof day !== 'number') return false;
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  if (!Number.isInteger(day) || day < 1 || day > 31) return false;
  const d = new Date(2024, month - 1, day); // うるう年を含む2024年で実在日付か確認
  return d.getMonth() === month - 1 && d.getDate() === day;
}

app.post('/api/seasonal/settings', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const b = await c.req.json<{
    events?: { key?: unknown; enabled?: unknown; startMonth?: unknown; startDay?: unknown; endMonth?: unknown; endDay?: unknown }[];
  }>().catch(() => ({}) as { events?: never[] });

  if (!Array.isArray(b.events)) return c.json({ error: '不正なリクエストです' }, 400);

  const updates: { key: SeasonalEventKey; enabled: number; sm: number | null; sd: number | null; em: number | null; ed: number | null }[] = [];
  for (const ev of b.events) {
    const key = String(ev.key ?? '');
    if (!VALID_KEYS.has(key)) return c.json({ error: '不正なイベントキーです' }, 400);
    const sm = ev.startMonth === null || ev.startMonth === undefined ? null : Number(ev.startMonth);
    const sd = ev.startDay === null || ev.startDay === undefined ? null : Number(ev.startDay);
    const em = ev.endMonth === null || ev.endMonth === undefined ? null : Number(ev.endMonth);
    const ed = ev.endDay === null || ev.endDay === undefined ? null : Number(ev.endDay);
    if (!isValidOptionalMonthDay(sm, sd)) return c.json({ error: `${key}の開始日が不正です` }, 400);
    if (!isValidOptionalMonthDay(em, ed)) return c.json({ error: `${key}の終了日が不正です` }, 400);
    updates.push({ key: key as SeasonalEventKey, enabled: ev.enabled ? 1 : 0, sm, sd, em, ed });
  }

  await c.env.DB.batch(
    updates.map(u => c.env.DB.prepare(`
      UPDATE seasonal_events SET is_enabled = ?, override_start_month = ?, override_start_day = ?, override_end_month = ?, override_end_day = ?, updated_at = datetime('now','localtime')
      WHERE event_key = ?
    `).bind(u.enabled, u.sm, u.sd, u.em, u.ed, u.key))
  );
  return c.json({ ok: true });
});

export default app;

// ===== 表示用API（ADMIN_PATHの秘密パス配下ではなくルート /api/seasonal にマウントする。
// 全ページのlayout.tsから秘密パスを意識せず叩けるようにするため。誕生日ポップアップと同じ扱い。
// root /api/* はGETを常に許可する（index.tsの権限ミドルウェアはPOST/PATCH/DELETEのみ制限するため、
// GETのみのこのAPIは明示的な除外設定なしで全アカウントから利用できる） =====
export const seasonalPublicApi = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

seasonalPublicApi.get('/active', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM seasonal_events').all<SeasonalEventRow>();
  const activeKey = getActiveSeasonalEvent(nowJSTParts(), rows.results ?? []);
  return c.json({ event: activeKey ? { key: activeKey, label: SEASONAL_EVENT_LABELS[activeKey] } : null });
});
