// ベンテンクラブ シフト 管理者ページ
// /settings/benten : 会員・グループ・シフト種別・表示期間・LINE自動送信の管理
// /api/benten/*    : 管理用CRUD API（秘密パス配下・要ログイン）

import { Hono } from 'hono';
import { layout, escHtml } from '../html/layout';
import { ADMIN_PATH } from '../config';
import type { Env } from '../auth';
import {
  getBentenConfig, sendBentenDaily,
  type BentenGroup, type BentenShiftType, type BentenMember,
} from '../benten';

const app = new Hono<{ Bindings: Env }>();

function subHeader(title: string): string {
  return `<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
    <a href="${ADMIN_PATH}/settings" style="color:#6b7280;font-size:13px;text-decoration:none;padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:white;">← 設定に戻る</a>
    <h2 style="font-size:17px;font-weight:700;color:#1e3a5f;margin:0;">${escHtml(title)}</h2>
  </div>`;
}

const th = (label: string) => `<th style="padding:8px 10px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;white-space:nowrap;">${label}</th>`;
const card = (title: string, body: string) => `
  <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);margin-bottom:20px;overflow:hidden;">
    <div style="padding:12px 18px;border-bottom:1px solid #f3f4f6;font-size:15px;font-weight:700;color:#1e3a5f;">${title}</div>
    <div style="padding:16px 18px;overflow-x:auto;">${body}</div>
  </div>`;
const inp = 'border:1px solid #d1d5db;border-radius:6px;padding:5px 8px;font-size:13px;';
const btnSave = 'padding:5px 12px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:12px;cursor:pointer;';
const btnDel = 'padding:5px 10px;background:#fee2e2;color:#991b1b;border:none;border-radius:6px;font-size:12px;cursor:pointer;';
const btnAdd = 'padding:7px 16px;background:#059669;color:white;border:none;border-radius:6px;font-size:13px;cursor:pointer;';

// ===================================================
// GET /settings/benten — 管理ページ
// ===================================================
app.get('/settings/benten', async (c) => {
  const db = c.env.DB;
  const [groupsRes, typesRes, membersRes, rangesRes, notifyRes, groupId] = await Promise.all([
    db.prepare('SELECT * FROM benten_groups ORDER BY display_order, id').all<BentenGroup>(),
    db.prepare('SELECT * FROM benten_shift_types ORDER BY display_order, id').all<BentenShiftType>(),
    db.prepare('SELECT * FROM benten_members ORDER BY is_active DESC, display_order, id').all<BentenMember>(),
    db.prepare('SELECT * FROM benten_schedule_ranges ORDER BY created_at DESC, id DESC').all<{ id: number; label: string; start_date: string; end_date: string; created_at: string }>(),
    db.prepare("SELECT send_hour, send_minute, is_enabled, last_sent_date FROM notification_settings WHERE type = 'benten_shift_daily'")
      .first<{ send_hour: number; send_minute: number; is_enabled: number; last_sent_date: string | null }>(),
    getBentenConfig(db, 'line_group_id'),
  ]);

  const groups = groupsRes.results ?? [];
  const types = typesRes.results ?? [];
  const members = membersRes.results ?? [];
  const ranges = rangesRes.results ?? [];

  const groupOptions = (selected: number | null) =>
    `<option value="">（未所属）</option>` + groups.map(g =>
      `<option value="${g.id}" ${g.id === selected ? 'selected' : ''}>${escHtml(g.name)}</option>`
    ).join('');

  // ---- LINE連携・自動送信 ----
  const lineCard = card('LINE自動送信', `
    <div style="font-size:13px;color:#374151;line-height:1.9;">
      <div><strong>送信先グループ:</strong> ${groupId
        ? `<span style="color:#059669;font-weight:600;">連携済み</span> <span style="font-family:monospace;font-size:11px;color:#9ca3af;">${escHtml(groupId.slice(0, 14))}…</span>`
        : '<span style="color:#d97706;font-weight:600;">未設定</span>'}</div>
      <div style="font-size:12px;color:#6b7280;">グループにBotを招待し、シフトマスターまたは統括管理者がグループ内で「<strong>ベンテングループ登録</strong>」と送信すると連携されます。</div>
      <div style="display:flex;align-items:center;gap:10px;margin-top:10px;flex-wrap:wrap;">
        <label style="font-size:13px;">送信時刻
          <input type="number" id="notify-hour" value="${notifyRes?.send_hour ?? 7}" min="0" max="23" style="${inp}width:56px;"> 時
          <input type="number" id="notify-minute" value="${notifyRes?.send_minute ?? 0}" min="0" max="59" style="${inp}width:56px;"> 分
          <span style="font-size:11px;color:#9ca3af;">（cronは毎時0分実行のため 0分 を推奨）</span>
        </label>
        <label style="font-size:13px;"><input type="checkbox" id="notify-enabled" ${notifyRes?.is_enabled ? 'checked' : ''}> 有効</label>
        <button onclick="saveNotify()" style="${btnSave}">保存</button>
        <button onclick="testSend()" style="padding:5px 12px;background:#7c3aed;color:white;border:none;border-radius:6px;font-size:12px;cursor:pointer;">今すぐテスト送信</button>
        ${notifyRes?.last_sent_date ? `<span style="font-size:11px;color:#9ca3af;">最終送信: ${escHtml(notifyRes.last_sent_date)}</span>` : ''}
      </div>
      <div style="font-size:12px;color:#6b7280;margin-top:6px;">毎日設定時刻に「本日出勤者」とシフト表リンクをグループへ自動送信します。</div>
    </div>`);

  // ---- 会員 ----
  const memberRows = members.map(m => `
    <tr style="opacity:${m.is_active ? '1' : '0.45'};">
      <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;"><input type="text" id="m-name-${m.id}" value="${escHtml(m.name)}" style="${inp}width:110px;"></td>
      <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;"><select id="m-group-${m.id}" style="${inp}">${groupOptions(m.group_id)}</select></td>
      <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;text-align:center;"><input type="checkbox" id="m-indoor-${m.id}" ${m.is_indoor ? 'checked' : ''}></td>
      <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;text-align:center;"><input type="checkbox" id="m-ake-${m.id}" ${m.auto_ake ? 'checked' : ''}></td>
      <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;"><input type="number" id="m-order-${m.id}" value="${m.display_order}" style="${inp}width:52px;"></td>
      <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;"><input type="text" id="m-codes-${m.id}" value="${escHtml(m.allowed_codes ? (JSON.parse(m.allowed_codes) as string[]).join(',') : '')}" placeholder="全て可" style="${inp}width:90px;"></td>
      <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;white-space:nowrap;">
        ${m.line_uid
          ? `<span style="background:#d1fae5;color:#065f46;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;">連携済</span>
             <button onclick="unlinkMember(${m.id})" style="padding:2px 6px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:4px;font-size:10px;cursor:pointer;margin-left:4px;">解除</button>`
          : '<span style="background:#f3f4f6;color:#9ca3af;padding:2px 8px;border-radius:10px;font-size:11px;">未連携</span>'}
      </td>
      <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;white-space:nowrap;">
        <button onclick="saveMember(${m.id})" style="${btnSave}">保存</button>
        <button onclick="toggleMember(${m.id}, ${m.is_active})" style="padding:5px 10px;background:${m.is_active ? '#f3f4f6' : '#bbf7d0'};border:1px solid #d1d5db;border-radius:6px;font-size:12px;cursor:pointer;">${m.is_active ? '無効化' : '有効化'}</button>
        <button onclick="deleteMember(${m.id}, '${escHtml(m.name)}')" style="${btnDel}">削除</button>
      </td>
    </tr>`).join('');

  const membersCard = card(`会員（${members.filter(m => m.is_active).length}名）`, `
    <table style="width:100%;border-collapse:collapse;min-width:820px;">
      <thead><tr>${th('氏名')}${th('グループ')}${th('内勤')}${th('明け自動')}${th('表示順')}${th('入力可種別')}${th('LINE')}${th('')}</tr></thead>
      <tbody>${memberRows || '<tr><td colspan="8" style="padding:20px;text-align:center;color:#9ca3af;">会員がいません</td></tr>'}</tbody>
    </table>
    <div style="margin-top:14px;padding-top:14px;border-top:1px solid #f3f4f6;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
      <input type="text" id="new-m-name" placeholder="氏名" style="${inp}width:120px;">
      <select id="new-m-group" style="${inp}">${groupOptions(null)}</select>
      <label style="font-size:12px;"><input type="checkbox" id="new-m-indoor"> 内勤</label>
      <label style="font-size:12px;"><input type="checkbox" id="new-m-ake"> 明け自動</label>
      <button onclick="addMember()" style="${btnAdd}">＋ 会員追加</button>
      <span style="font-size:11px;color:#9ca3af;">入力可種別はコードをカンマ区切りで（空欄=全て可）。LINE登録時に同姓同名の未連携会員へ自動紐付けされます。</span>
    </div>`);

  // ---- グループ ----
  const groupRows = groups.map(g => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;"><input type="text" id="g-name-${g.id}" value="${escHtml(g.name)}" style="${inp}width:120px;"></td>
      <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;"><input type="color" id="g-color-${g.id}" value="${escHtml(g.color)}" style="width:38px;height:28px;border:1px solid #d1d5db;border-radius:4px;cursor:pointer;"></td>
      <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;"><input type="number" id="g-order-${g.id}" value="${g.display_order}" style="${inp}width:52px;"></td>
      <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;white-space:nowrap;">
        <button onclick="saveGroup(${g.id})" style="${btnSave}">保存</button>
        <button onclick="deleteGroup(${g.id}, '${escHtml(g.name)}')" style="${btnDel}">削除</button>
      </td>
    </tr>`).join('');

  const groupsCard = card('グループ', `
    <table style="border-collapse:collapse;min-width:400px;">
      <thead><tr>${th('名前')}${th('色')}${th('表示順')}${th('')}</tr></thead>
      <tbody>${groupRows || '<tr><td colspan="4" style="padding:20px;text-align:center;color:#9ca3af;">グループがありません</td></tr>'}</tbody>
    </table>
    <div style="margin-top:14px;padding-top:14px;border-top:1px solid #f3f4f6;display:flex;gap:8px;align-items:center;">
      <input type="text" id="new-g-name" placeholder="グループ名" style="${inp}width:140px;">
      <input type="color" id="new-g-color" value="#1e3a5f" style="width:38px;height:32px;border:1px solid #d1d5db;border-radius:4px;cursor:pointer;">
      <button onclick="addGroup()" style="${btnAdd}">＋ グループ追加</button>
    </div>`);

  // ---- シフト種別 ----
  const typeRows = types.map(t => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;"><input type="text" id="t-code-${t.id}" value="${escHtml(t.code)}" style="${inp}width:52px;"></td>
      <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;"><input type="text" id="t-label-${t.id}" value="${escHtml(t.label)}" style="${inp}width:80px;"></td>
      <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;white-space:nowrap;">
        <input type="color" id="t-color-${t.id}" value="${escHtml(t.color)}" style="width:34px;height:26px;border:1px solid #d1d5db;border-radius:4px;cursor:pointer;">
        <input type="color" id="t-text-${t.id}" value="${escHtml(t.text_color)}" style="width:34px;height:26px;border:1px solid #d1d5db;border-radius:4px;cursor:pointer;">
        <span style="background:${escHtml(t.color)};color:${escHtml(t.text_color)};padding:2px 9px;border-radius:5px;font-size:12px;font-weight:700;">${escHtml(t.code)}</span>
      </td>
      <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;text-align:center;"><input type="checkbox" id="t-absent-${t.id}" ${t.is_absent ? 'checked' : ''}></td>
      <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;text-align:center;"><input type="checkbox" id="t-ake-${t.id}" ${t.triggers_ake ? 'checked' : ''}></td>
      <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;"><input type="number" id="t-order-${t.id}" value="${t.display_order}" style="${inp}width:52px;"></td>
      <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;white-space:nowrap;">
        <button onclick="saveType(${t.id})" style="${btnSave}">保存</button>
        <button onclick="deleteType(${t.id}, '${escHtml(t.code)}')" style="${btnDel}">削除</button>
      </td>
    </tr>`).join('');

  const typesCard = card('シフト種別', `
    <table style="border-collapse:collapse;min-width:640px;">
      <thead><tr>${th('コード')}${th('名称')}${th('背景色 / 文字色')}${th('休み扱い')}${th('翌日明け')}${th('表示順')}${th('')}</tr></thead>
      <tbody>${typeRows}</tbody>
    </table>
    <div style="margin-top:14px;padding-top:14px;border-top:1px solid #f3f4f6;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
      <input type="text" id="new-t-code" placeholder="コード" style="${inp}width:64px;">
      <input type="text" id="new-t-label" placeholder="名称" style="${inp}width:90px;">
      <input type="color" id="new-t-color" value="#2563eb" style="width:34px;height:30px;border:1px solid #d1d5db;border-radius:4px;cursor:pointer;">
      <input type="color" id="new-t-text" value="#ffffff" style="width:34px;height:30px;border:1px solid #d1d5db;border-radius:4px;cursor:pointer;">
      <label style="font-size:12px;"><input type="checkbox" id="new-t-absent"> 休み扱い</label>
      <label style="font-size:12px;"><input type="checkbox" id="new-t-ake"> 翌日明け</label>
      <button onclick="addType()" style="${btnAdd}">＋ 種別追加</button>
      <span style="font-size:11px;color:#9ca3af;">「休み扱い」は本日出勤者コメントから除外。「翌日明け」は会員の明け自動フラグと併用。</span>
    </div>`);

  // ---- 表示期間 ----
  const rangeRows = ranges.map((r, i) => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;font-size:13px;">${escHtml(r.label)}
        ${i === 0 ? '<span style="background:#059669;color:white;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;margin-left:6px;">適用中</span>' : ''}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;font-size:13px;white-space:nowrap;">${escHtml(r.start_date)} 〜 ${escHtml(r.end_date)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;font-size:11px;color:#9ca3af;">${escHtml(r.created_at.slice(0, 16))}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;"><button onclick="deleteRange(${r.id}, '${escHtml(r.label)}')" style="${btnDel}">削除</button></td>
    </tr>`).join('');

  const rangesCard = card('表示期間（最新の1件が適用されます）', `
    <table style="border-collapse:collapse;min-width:480px;">
      <thead><tr>${th('ラベル')}${th('期間')}${th('作成日時')}${th('')}</tr></thead>
      <tbody>${rangeRows || '<tr><td colspan="4" style="padding:20px;text-align:center;color:#9ca3af;">未設定（今日から45日間が自動適用）</td></tr>'}</tbody>
    </table>
    <div style="margin-top:14px;padding-top:14px;border-top:1px solid #f3f4f6;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
      <input type="text" id="new-r-label" placeholder="例: 8月度予定" style="${inp}width:130px;">
      <input type="date" id="new-r-start" style="${inp}">
      〜 <input type="date" id="new-r-end" style="${inp}">
      <button onclick="addRange()" style="${btnAdd}">＋ 期間追加</button>
    </div>`);

  const content = `
    ${subHeader('ベンテンクラブ シフト管理')}
    ${lineCard}
    ${membersCard}
    ${groupsCard}
    ${typesCard}
    ${rangesCard}

    <script>
    var API = ${JSON.stringify(ADMIN_PATH)} + '/api/benten';
    function send(method, path, body) {
      return fetch(API + path, {
        method: method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
      }).then(function(res) {
        if (res.ok) { location.reload(); return; }
        return res.json().catch(function() { return {}; }).then(function(j) {
          alert(j.error || '操作に失敗しました');
        });
      });
    }
    function v(id) { return document.getElementById(id).value.trim(); }
    function chk(id) { return document.getElementById(id).checked ? 1 : 0; }
    function num(id) { return parseInt(document.getElementById(id).value) || 0; }

    // 会員
    function saveMember(id) {
      send('PUT', '/members/' + id, {
        name: v('m-name-' + id), group_id: v('m-group-' + id) || null,
        is_indoor: chk('m-indoor-' + id), auto_ake: chk('m-ake-' + id),
        display_order: num('m-order-' + id), allowed_codes: v('m-codes-' + id),
      });
    }
    function addMember() {
      if (!v('new-m-name')) { alert('氏名を入力してください'); return; }
      send('POST', '/members', {
        name: v('new-m-name'), group_id: v('new-m-group') || null,
        is_indoor: chk('new-m-indoor'), auto_ake: chk('new-m-ake'),
        display_order: 0, allowed_codes: '',
      });
    }
    function toggleMember(id, active) { send('PUT', '/members/' + id + '/active', { is_active: active ? 0 : 1 }); }
    function deleteMember(id, name) {
      if (!confirm(name + ' を完全に削除しますか？\\nこの会員のシフトデータもすべて削除されます。')) return;
      send('DELETE', '/members/' + id);
    }
    function unlinkMember(id) {
      if (!confirm('LINE連携を解除しますか？')) return;
      send('POST', '/members/' + id + '/unlink');
    }

    // グループ
    function saveGroup(id) { send('PUT', '/groups/' + id, { name: v('g-name-' + id), color: v('g-color-' + id), display_order: num('g-order-' + id) }); }
    function addGroup() {
      if (!v('new-g-name')) { alert('グループ名を入力してください'); return; }
      send('POST', '/groups', { name: v('new-g-name'), color: v('new-g-color'), display_order: 0 });
    }
    function deleteGroup(id, name) {
      if (!confirm('グループ「' + name + '」を削除しますか？\\n所属会員は未所属になります。')) return;
      send('DELETE', '/groups/' + id);
    }

    // シフト種別
    function saveType(id) {
      send('PUT', '/shift-types/' + id, {
        code: v('t-code-' + id), label: v('t-label-' + id),
        color: v('t-color-' + id), text_color: v('t-text-' + id),
        is_absent: chk('t-absent-' + id), triggers_ake: chk('t-ake-' + id),
        display_order: num('t-order-' + id),
      });
    }
    function addType() {
      if (!v('new-t-code') || !v('new-t-label')) { alert('コードと名称を入力してください'); return; }
      send('POST', '/shift-types', {
        code: v('new-t-code'), label: v('new-t-label'),
        color: v('new-t-color'), text_color: v('new-t-text'),
        is_absent: chk('new-t-absent'), triggers_ake: chk('new-t-ake'),
        display_order: 99,
      });
    }
    function deleteType(id, code) {
      if (!confirm('種別「' + code + '」を削除しますか？')) return;
      send('DELETE', '/shift-types/' + id);
    }

    // 表示期間
    function addRange() {
      if (!v('new-r-label') || !v('new-r-start') || !v('new-r-end')) { alert('ラベルと期間を入力してください'); return; }
      send('POST', '/ranges', { label: v('new-r-label'), start_date: v('new-r-start'), end_date: v('new-r-end') });
    }
    function deleteRange(id, label) {
      if (!confirm('期間「' + label + '」を削除しますか？')) return;
      send('DELETE', '/ranges/' + id);
    }

    // 通知
    function saveNotify() {
      send('PUT', '/notify', { send_hour: num('notify-hour'), send_minute: num('notify-minute'), is_enabled: chk('notify-enabled') });
    }
    function testSend() {
      if (!confirm('ベンテンクラブのLINEグループへ今すぐ送信しますか？')) return;
      fetch(API + '/test-send', { method: 'POST' })
        .then(function(r) { return r.json(); })
        .then(function(j) { alert(j.message || '送信しました'); })
        .catch(function() { alert('送信に失敗しました'); });
    }
    </script>
  `;

  return c.html(layout('ベンテンクラブ シフト管理', content, 'settings'));
});

// ===================================================
// API: 会員
// ===================================================

// カンマ区切り文字列 → JSON配列 or NULL
function codesToJson(codes: string | null | undefined): string | null {
  const list = (codes ?? '').split(/[,、\s]+/).map(s => s.trim()).filter(Boolean);
  return list.length > 0 ? JSON.stringify(list) : null;
}

app.post('/api/benten/members', async (c) => {
  const b = await c.req.json<{ name: string; group_id: string | number | null; is_indoor: number; auto_ake: number; display_order: number; allowed_codes: string }>();
  if (!b.name) return c.json({ error: '氏名は必須です' }, 400);
  await c.env.DB.prepare(`
    INSERT INTO benten_members (name, group_id, is_indoor, auto_ake, display_order, allowed_codes)
    VALUES (?, ?, ?, ?, COALESCE(NULLIF(?, 0), (SELECT COALESCE(MAX(display_order), 0) + 1 FROM benten_members)), ?)
  `).bind(b.name, b.group_id || null, b.is_indoor ? 1 : 0, b.auto_ake ? 1 : 0, b.display_order ?? 0, codesToJson(b.allowed_codes)).run();
  return c.json({ ok: true });
});

app.put('/api/benten/members/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const b = await c.req.json<{ name: string; group_id: string | number | null; is_indoor: number; auto_ake: number; display_order: number; allowed_codes: string }>();
  if (!id || !b.name) return c.json({ error: 'bad request' }, 400);
  await c.env.DB.prepare(`
    UPDATE benten_members SET name = ?, group_id = ?, is_indoor = ?, auto_ake = ?,
      display_order = ?, allowed_codes = ?, updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `).bind(b.name, b.group_id || null, b.is_indoor ? 1 : 0, b.auto_ake ? 1 : 0, b.display_order ?? 0, codesToJson(b.allowed_codes), id).run();
  return c.json({ ok: true });
});

app.put('/api/benten/members/:id/active', async (c) => {
  const id = parseInt(c.req.param('id'));
  const { is_active } = await c.req.json<{ is_active: number }>();
  await c.env.DB.prepare(
    "UPDATE benten_members SET is_active = ?, updated_at = datetime('now', 'localtime') WHERE id = ?"
  ).bind(is_active ? 1 : 0, id).run();
  return c.json({ ok: true });
});

app.post('/api/benten/members/:id/unlink', async (c) => {
  const id = parseInt(c.req.param('id'));
  await c.env.DB.prepare(
    "UPDATE benten_members SET line_uid = NULL, updated_at = datetime('now', 'localtime') WHERE id = ?"
  ).bind(id).run();
  return c.json({ ok: true });
});

app.delete('/api/benten/members/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  await c.env.DB.prepare('DELETE FROM benten_shifts WHERE member_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM benten_members WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// ===================================================
// API: グループ
// ===================================================

app.post('/api/benten/groups', async (c) => {
  const b = await c.req.json<{ name: string; color: string; display_order: number }>();
  if (!b.name) return c.json({ error: 'グループ名は必須です' }, 400);
  await c.env.DB.prepare(`
    INSERT INTO benten_groups (name, color, display_order)
    VALUES (?, ?, (SELECT COALESCE(MAX(display_order), 0) + 1 FROM benten_groups))
  `).bind(b.name, b.color || '#1e3a5f').run();
  return c.json({ ok: true });
});

app.put('/api/benten/groups/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const b = await c.req.json<{ name: string; color: string; display_order: number }>();
  if (!id || !b.name) return c.json({ error: 'bad request' }, 400);
  await c.env.DB.prepare('UPDATE benten_groups SET name = ?, color = ?, display_order = ? WHERE id = ?')
    .bind(b.name, b.color || '#1e3a5f', b.display_order ?? 0, id).run();
  return c.json({ ok: true });
});

app.delete('/api/benten/groups/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  await c.env.DB.prepare('UPDATE benten_members SET group_id = NULL WHERE group_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM benten_groups WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// ===================================================
// API: シフト種別
// ===================================================

app.post('/api/benten/shift-types', async (c) => {
  const b = await c.req.json<{ code: string; label: string; color: string; text_color: string; is_absent: number; triggers_ake: number; display_order: number }>();
  if (!b.code || !b.label) return c.json({ error: 'コードと名称は必須です' }, 400);
  const dup = await c.env.DB.prepare('SELECT id FROM benten_shift_types WHERE code = ?').bind(b.code).first();
  if (dup) return c.json({ error: `コード「${b.code}」は既に存在します` }, 409);
  await c.env.DB.prepare(`
    INSERT INTO benten_shift_types (code, label, color, text_color, is_absent, triggers_ake, display_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(b.code, b.label, b.color || '#2563eb', b.text_color || '#ffffff', b.is_absent ? 1 : 0, b.triggers_ake ? 1 : 0, b.display_order ?? 99).run();
  return c.json({ ok: true });
});

app.put('/api/benten/shift-types/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const b = await c.req.json<{ code: string; label: string; color: string; text_color: string; is_absent: number; triggers_ake: number; display_order: number }>();
  if (!id || !b.code || !b.label) return c.json({ error: 'bad request' }, 400);
  await c.env.DB.prepare(`
    UPDATE benten_shift_types SET code = ?, label = ?, color = ?, text_color = ?,
      is_absent = ?, triggers_ake = ?, display_order = ?
    WHERE id = ?
  `).bind(b.code, b.label, b.color, b.text_color, b.is_absent ? 1 : 0, b.triggers_ake ? 1 : 0, b.display_order ?? 0, id).run();
  return c.json({ ok: true });
});

app.delete('/api/benten/shift-types/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const used = await c.env.DB.prepare('SELECT COUNT(*) AS cnt FROM benten_shifts WHERE shift_type_id = ?')
    .bind(id).first<{ cnt: number }>();
  if ((used?.cnt ?? 0) > 0) {
    return c.json({ error: `この種別は ${used!.cnt}件のシフトで使用中のため削除できません` }, 409);
  }
  await c.env.DB.prepare('DELETE FROM benten_shift_types WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// ===================================================
// API: 表示期間
// ===================================================

app.post('/api/benten/ranges', async (c) => {
  const b = await c.req.json<{ label: string; start_date: string; end_date: string }>();
  if (!b.label || !b.start_date || !b.end_date) return c.json({ error: 'ラベルと期間は必須です' }, 400);
  if (b.start_date > b.end_date) return c.json({ error: '開始日は終了日より前にしてください' }, 400);
  await c.env.DB.prepare('INSERT INTO benten_schedule_ranges (label, start_date, end_date) VALUES (?, ?, ?)')
    .bind(b.label, b.start_date, b.end_date).run();
  return c.json({ ok: true });
});

app.delete('/api/benten/ranges/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  await c.env.DB.prepare('DELETE FROM benten_schedule_ranges WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// ===================================================
// API: 通知設定・テスト送信
// ===================================================

app.put('/api/benten/notify', async (c) => {
  const b = await c.req.json<{ send_hour: number; send_minute: number; is_enabled: number }>();
  const hour = Math.max(0, Math.min(23, b.send_hour ?? 7));
  const minute = Math.max(0, Math.min(59, b.send_minute ?? 30));
  await c.env.DB.prepare(`
    INSERT INTO notification_settings (type, send_hour, send_minute, is_enabled)
    VALUES ('benten_shift_daily', ?, ?, ?)
    ON CONFLICT(type) DO UPDATE SET
      send_hour = excluded.send_hour, send_minute = excluded.send_minute,
      is_enabled = excluded.is_enabled, updated_at = datetime('now', 'localtime')
  `).bind(hour, minute, b.is_enabled ? 1 : 0).run();
  return c.json({ ok: true });
});

app.post('/api/benten/test-send', async (c) => {
  const message = await sendBentenDaily(c.env);
  return c.json({ ok: true, message });
});

export default app;
