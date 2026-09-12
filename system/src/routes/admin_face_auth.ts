// 顔認証（検証用スタンドアロン）＋ adminログイン2段階認証の設定
//   ページ : /face-auth              左サイドバー。登録済みの顔とカメラ映像を照合する検証ページ（閲覧= face-auth）
//            /settings/face-auth      設定サブページ。顔の登録＋（adminアカウントのみ）2段階認証の設定
//   API    : /api/face-auth/faces         GET=一覧 / POST=登録(upsert) / DELETE=削除（face-auth[.edit]）
//            /api/face-auth/gate/*         2段階認証の状態・しきい値・第二パスワード・バックアップコード・有効化
//                                          （username='admin' のアカウントのみ）
//   照合・特徴抽出はブラウザ内で完結。サーバーは保存/取得と距離計算のみ（migration_141 / 142）。
import { Hono } from 'hono';
import type { Env } from '../auth';
import { ADMIN_PATH } from '../config';
import { layout, escHtml } from '../html/layout';
import { getAdminPermissions } from '../permissions';
import { isAdminAccount } from '../utils/maintenance';
import { faceAuthMatchPage, faceAuthRegisterPage } from '../html/face_auth';
import {
  getGateStatus, setSetting, getAdminAccountId, unusedBackupCount,
  regenerateBackupCodes, setSecondPassword, listAdminFaces, MAX_ADMIN_FACES,
} from '../utils/auth_gate';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

async function canEdit(c: { env: Env; get: (k: 'adminId') => number }): Promise<boolean> {
  const perms = await getAdminPermissions(c.env.DB, c.get('adminId'));
  return perms === null || perms.includes('face-auth.edit');
}
async function username(db: D1Database, adminId: number): Promise<string> {
  const row = await db.prepare('SELECT username FROM admins WHERE id = ?').bind(adminId).first<{ username: string }>();
  return row?.username ?? '';
}
function safeParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}
// 2段階認証の設定APIは admin 本人だけ
async function requireAdminAccount(c: { env: Env; get: (k: 'adminId') => number; json: (b: unknown, s?: number) => Response }): Promise<Response | null> {
  const ok = await isAdminAccount(c.env.DB, c.get('adminId'));
  return ok ? null : c.json({ error: 'この設定は admin アカウントでのみ操作できます' }, 403);
}

// ===================== ページ =====================
app.get('/face-auth', (c) =>
  c.html(layout('顔認証', faceAuthMatchPage(ADMIN_PATH), 'face-auth', '', false, true)));

app.get('/settings/face-auth', async (c) => {
  const name = await username(c.env.DB, c.get('adminId'));
  const isAdmin = await isAdminAccount(c.env.DB, c.get('adminId'));
  const gatePanel = isAdmin ? await renderGatePanel(c.env) : '';
  return c.html(layout('顔認証 顔の登録', faceAuthRegisterPage(ADMIN_PATH, name, isAdmin, gatePanel), 'settings', '', false, true));
});

// ===================== API: 顔ベクトル =====================
app.get('/api/face-auth/faces', async (c) => {
  const r = await c.env.DB.prepare(
    'SELECT id, label, descriptor, sample_count, created_by, created_at, admin_id FROM face_auth_faces ORDER BY label'
  ).all<{ id: number; label: string; descriptor: string; sample_count: number; created_by: string; created_at: string; admin_id: number | null }>();
  const faces = (r.results ?? []).map((row) => {
    const desc = safeParse(row.descriptor);
    return {
      id: row.id,
      label: row.label,
      descriptor: Array.isArray(desc) ? desc : [],
      sample_count: row.sample_count,
      created_by: row.created_by,
      created_at: row.created_at,
      for_admin_login: row.admin_id != null,
    };
  }).filter((f) => f.descriptor.length === 128);
  return c.json({ editable: await canEdit(c), faces });
});

app.post('/api/face-auth/faces', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: 'この操作を行う権限がありません' }, 403);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const label = String(body.label ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const desc = body.descriptor;
  const sampleCount = Math.max(1, Math.min(50, parseInt(String(body.sampleCount ?? 1), 10) || 1));
  if (!label) return c.json({ error: '名前を入力してください' }, 400);
  if (!Array.isArray(desc) || desc.length !== 128 || !desc.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    return c.json({ error: '顔の特徴データが不正です' }, 400);
  }
  const isAdmin = await isAdminAccount(c.env.DB, c.get('adminId'));
  // 「admin本人のログイン認証に使う」チェックは admin アカウントのときだけ有効
  const wantAdminLogin = body.forAdminLogin === true && isAdmin;
  const adminAccId = wantAdminLogin ? await getAdminAccountId(c.env.DB) : null;

  // adminログイン認証に紐づいた顔（admin_id が入っている行）は、admin アカウント以外からは
  // 上書きさせない（下位権限の delegate が admin の2要素を差し替えるのを防ぐ）。
  const existing = await c.env.DB.prepare('SELECT admin_id FROM face_auth_faces WHERE label = ?').bind(label).first<{ admin_id: number | null }>();
  if (existing && existing.admin_id != null && !isAdmin) {
    return c.json({ error: 'この名前は admin ログイン認証に使用中のため変更できません。別の名前にしてください。' }, 403);
  }
  // adminログイン用の顔は最大 MAX_ADMIN_FACES 人まで（新しい名前で4人目を追加しようとしたら拒否）
  if (wantAdminLogin && adminAccId != null && !(existing && existing.admin_id != null)) {
    const cntRow = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM face_auth_faces WHERE admin_id = ?').bind(adminAccId).first<{ n: number }>();
    if ((cntRow?.n ?? 0) >= MAX_ADMIN_FACES) {
      return c.json({ error: `adminログイン用の顔は${MAX_ADMIN_FACES}人までです。不要な顔を削除してから登録してください。` }, 400);
    }
  }

  const json = JSON.stringify((desc as number[]).map((n) => Math.round(n * 1e6) / 1e6));
  const who = await username(c.env.DB, c.get('adminId'));
  await c.env.DB.prepare(
    "INSERT INTO face_auth_faces (label, descriptor, sample_count, created_by, admin_id) VALUES (?, ?, ?, ?, ?) " +
    "ON CONFLICT(label) DO UPDATE SET descriptor = excluded.descriptor, sample_count = excluded.sample_count, " +
    "created_by = excluded.created_by, admin_id = COALESCE(excluded.admin_id, face_auth_faces.admin_id), " +
    "updated_at = datetime('now','localtime')"
  ).bind(label, json, sampleCount, who, adminAccId).run();
  return c.json({ ok: true });
});

app.delete('/api/face-auth/faces/:id', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: 'この操作を行う権限がありません' }, 403);
  const id = parseInt(c.req.param('id'), 10);
  if (!Number.isFinite(id)) return c.json({ error: 'idが不正です' }, 400);
  // adminログイン認証に紐づいた顔は admin アカウントだけが削除できる（2要素の勝手な無効化を防ぐ）。
  const row = await c.env.DB.prepare('SELECT admin_id FROM face_auth_faces WHERE id = ?').bind(id).first<{ admin_id: number | null }>();
  if (row && row.admin_id != null && !(await isAdminAccount(c.env.DB, c.get('adminId')))) {
    return c.json({ error: 'この顔は admin ログイン認証に使用中のため削除できません。' }, 403);
  }
  await c.env.DB.prepare('DELETE FROM face_auth_faces WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// ===================== API: 2段階認証の設定（adminアカウントのみ）=====================
app.get('/api/face-auth/gate', async (c) => {
  const denied = await requireAdminAccount(c); if (denied) return denied;
  const st = await getGateStatus(c.env.DB);
  return c.json({
    enabled: st.enabled, ready: st.ready, threshold: st.threshold,
    hasFace: st.hasFace, hasSecondPw: st.hasSecondPw, hasBackup: st.hasBackup,
    backupCount: st.adminId != null ? await unusedBackupCount(c.env.DB, st.adminId) : 0,
    adminFaces: st.adminId != null ? await listAdminFaces(c.env.DB, st.adminId) : [],
    maxFaces: MAX_ADMIN_FACES,
    killKeyConfigured: !!c.env.AUTH_GATE_KILL_KEY,
  });
});

app.post('/api/face-auth/gate/threshold', async (c) => {
  const denied = await requireAdminAccount(c); if (denied) return denied;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const t = parseInt(String(body.threshold ?? ''), 10);
  if (!Number.isFinite(t) || t < 0 || t > 95) return c.json({ error: 'しきい値は0〜95で指定してください' }, 400);
  await setSetting(c.env.DB, 'auth_gate_threshold', String(t));
  return c.json({ ok: true, threshold: t });
});

app.post('/api/face-auth/gate/second-password', async (c) => {
  const denied = await requireAdminAccount(c); if (denied) return denied;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const pw = String(body.password ?? '');
  if (pw.length < 8) return c.json({ error: '第二パスワードは8文字以上にしてください' }, 400);
  if (pw.length > 200) return c.json({ error: '長すぎます' }, 400);
  await setSecondPassword(c.env.DB, pw);
  return c.json({ ok: true });
});

app.post('/api/face-auth/gate/backup-codes', async (c) => {
  const denied = await requireAdminAccount(c); if (denied) return denied;
  const adminAccId = await getAdminAccountId(c.env.DB);
  if (adminAccId == null) return c.json({ error: 'admin アカウントが見つかりません' }, 400);
  const codes = await regenerateBackupCodes(c.env.DB, adminAccId, 10);
  return c.json({ ok: true, codes });
});

app.post('/api/face-auth/gate/enabled', async (c) => {
  const denied = await requireAdminAccount(c); if (denied) return denied;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const want = body.enabled === true;
  if (want) {
    const st = await getGateStatus(c.env.DB);
    if (!st.hasFace || !st.hasSecondPw || !st.hasBackup) {
      return c.json({
        error: '有効化の前に、admin本人の顔登録・第二パスワード設定・バックアップコード発行を全て済ませてください。',
        hasFace: st.hasFace, hasSecondPw: st.hasSecondPw, hasBackup: st.hasBackup,
      }, 400);
    }
  }
  await setSetting(c.env.DB, 'auth_gate_enabled', want ? '1' : '0');
  return c.json({ ok: true, enabled: want });
});

// ===================== 設定パネル HTML（adminアカウントにのみ表示）=====================
async function renderGatePanel(env: Env): Promise<string> {
  const st = await getGateStatus(env.DB);
  const backupCount = st.adminId != null ? await unusedBackupCount(env.DB, st.adminId) : 0;
  const adminFaces = st.adminId != null ? await listAdminFaces(env.DB, st.adminId) : [];
  const chip = (ok: boolean, label: string) =>
    `<span style="display:inline-block;font-size:11px;font-weight:700;padding:3px 9px;border-radius:99px;margin:2px;background:${ok ? '#dcfce7' : '#fee2e2'};color:${ok ? '#15803d' : '#b91c1c'};">${escHtml(label)}${ok ? ' ✓' : ' 未'}</span>`;
  const killLine = env.AUTH_GATE_KILL_KEY
    ? `緊急停止URL: <code style="font-size:11px;">${escHtml(ADMIN_PATH)}/login/verify/kill?key=（AUTH_GATE_KILL_KEY の値）</code>`
    : `<span style="color:#b45309;">緊急停止キー AUTH_GATE_KILL_KEY が未設定です。有効化の前に <code>wrangler secret put AUTH_GATE_KILL_KEY</code> で設定してください。</span>`;

  return `
  <div id="gate-panel" style="max-width:900px;margin:22px 0 0;border:2px solid ${st.ready ? '#bbf7d0' : '#e5e7eb'};border-radius:12px;padding:18px 20px;background:#fff;">
    <div style="font-size:15px;font-weight:800;color:#1e3a5f;margin-bottom:4px;">adminログインの2段階認証</div>
    <p style="font-size:12px;color:#6b7280;line-height:1.7;margin:0 0 12px;">
      <b>admin</b> でログインするとき、パスワードのあとに「顔」または「第二パスワード」で本人確認を行います。
      カメラの無いPCは第二パスワード、どちらも使えない時はバックアップコード。<br>
      admin を複数人で使うため、顔は <b>最大 ${MAX_ADMIN_FACES} 人</b>まで登録でき、そのうち誰か1人でも一致すれば通ります。<br>
      下の4つが全部そろうまで自動では作動しません（現在: <b>${st.ready ? '作動中' : '未作動'}</b>）。
    </p>
    <div style="margin-bottom:12px;">
      ${chip(st.hasFace, `admin本人の顔登録 (${adminFaces.length}/${MAX_ADMIN_FACES})`)}
      ${chip(st.hasSecondPw, '第二パスワード設定')}
      ${chip(backupCount > 0, `バックアップコード(残${backupCount})`)}
      ${chip(st.enabled, 'スイッチON')}
    </div>

    <div style="margin-bottom:14px;">
      <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:6px;">adminログイン用に登録された顔（最大 ${MAX_ADMIN_FACES} 人）</div>
      <div id="gate-faces"></div>
      <div style="font-size:11px;color:#9ca3af;margin-top:6px;line-height:1.6;">追加は、このページ上部の「方法1：カメラで撮る」または「方法2：写真ファイル」で名前を変えて登録し、<b>「この顔を admin 本人のログイン認証にも使う」にチェック</b>を入れてください。</div>
    </div>

    <div style="display:flex;gap:16px;flex-wrap:wrap;">
      <div style="flex:1;min-width:260px;">
        <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:6px;">一致とみなす最低%（顔認証ページで決めた値）</div>
        <input id="gate-th" type="number" min="0" max="95" value="${st.threshold}" style="width:90px;border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:13px;">
        <button id="gate-th-save" style="margin-left:6px;padding:6px 12px;font-size:12px;font-weight:700;background:#1e3a5f;color:#fff;border:none;border-radius:6px;cursor:pointer;">保存</button>
        <div id="gate-th-msg" style="font-size:11px;color:#6b7280;margin-top:4px;"></div>
      </div>

      <div style="flex:1;min-width:260px;">
        <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:6px;">第二パスワード（顔が使えない時用・8文字以上）</div>
        <input id="gate-pw" type="password" autocomplete="new-password" placeholder="新しい第二パスワード" style="width:100%;max-width:240px;border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:13px;">
        <button id="gate-pw-save" style="margin-left:6px;padding:6px 12px;font-size:12px;font-weight:700;background:#1e3a5f;color:#fff;border:none;border-radius:6px;cursor:pointer;">保存</button>
        <div id="gate-pw-msg" style="font-size:11px;color:#6b7280;margin-top:4px;">${st.hasSecondPw ? '設定済み（上書きするときだけ入力）' : '未設定'}</div>
      </div>
    </div>

    <div style="margin-top:14px;">
      <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:6px;">バックアップコード（10個・発行時に一度だけ表示）</div>
      <button id="gate-backup" style="padding:6px 12px;font-size:12px;font-weight:700;background:#b45309;color:#fff;border:none;border-radius:6px;cursor:pointer;">新しく発行する（古いコードは無効化）</button>
      <div id="gate-backup-box" style="margin-top:8px;"></div>
    </div>

    <div style="margin-top:16px;padding-top:14px;border-top:1px solid #f1f5f9;">
      <label style="display:flex;align-items:center;gap:10px;font-size:13px;font-weight:700;color:#1e3a5f;cursor:pointer;">
        <input id="gate-enabled" type="checkbox" ${st.enabled ? 'checked' : ''} style="width:16px;height:16px;">
        2段階認証のスイッチをONにする
      </label>
      <div id="gate-enabled-msg" style="font-size:11px;color:#6b7280;margin-top:6px;line-height:1.6;">${killLine}</div>
    </div>
  </div>`;
}

export default app;
