// ===================================================
// メンテナンスモード
//   system_settings.maintenance_mode = '1' で全機能をメンテナンス画面に切替。
//   admin アカウント（username = 'admin'）のセッションのみ通常利用可。
//   切替は admin のシステムステータスページから（routes/admin.ts）。
// ===================================================

import type { Env } from '../auth';

// フラグ読み取り。DB障害時に全体が誤ってメンテ画面にならないよう、
// 読み取り失敗はメンテOFF扱い（フェイルオープン）
export async function getMaintenanceMode(db: D1Database): Promise<boolean> {
  try {
    const row = await db.prepare("SELECT value FROM system_settings WHERE key = 'maintenance_mode'")
      .first<{ value: string }>();
    return row?.value === '1';
  } catch {
    return false;
  }
}

export async function setMaintenanceMode(db: D1Database, enabled: boolean): Promise<void> {
  await db.prepare(`
    INSERT INTO system_settings (key, value, updated_at)
    VALUES ('maintenance_mode', ?, datetime('now', 'localtime'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).bind(enabled ? '1' : '0').run();
}

// ===================================================
// 期間指定メンテナンス（予約メンテナンス）
//   maintenance_start_at / maintenance_end_at に 'YYYY-MM-DDTHH:MM' 形式（JST・
//   datetime-local inputの値そのまま）で保存する。end は空欄可（無期限）。
//   手動トグル（maintenance_mode）がOFFでも、この期間内であれば自動的にメンテ扱いになる。
// ===================================================
export interface MaintenanceSchedule {
  start: string | null;
  end: string | null;
}

export async function getMaintenanceSchedule(db: D1Database): Promise<MaintenanceSchedule> {
  try {
    const rows = await db.prepare(
      "SELECT key, value FROM system_settings WHERE key IN ('maintenance_start_at', 'maintenance_end_at')"
    ).all<{ key: string; value: string }>();
    const map: Record<string, string> = {};
    for (const r of rows.results ?? []) map[r.key] = r.value;
    return { start: map.maintenance_start_at || null, end: map.maintenance_end_at || null };
  } catch {
    return { start: null, end: null };
  }
}

export async function setMaintenanceSchedule(db: D1Database, start: string | null, end: string | null): Promise<void> {
  await db.batch([
    db.prepare(`
      INSERT INTO system_settings (key, value, updated_at)
      VALUES ('maintenance_start_at', ?, datetime('now', 'localtime'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).bind(start ?? ''),
    db.prepare(`
      INSERT INTO system_settings (key, value, updated_at)
      VALUES ('maintenance_end_at', ?, datetime('now', 'localtime'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).bind(end ?? ''),
  ]);
}

// 'YYYY-MM-DDTHH:MM' 形式のJST現在時刻（datetime-local inputの値と直接比較できる形式）
function jstNowStamp(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' }).slice(0, 16).replace(' ', 'T');
}

export function isWithinSchedule(schedule: MaintenanceSchedule, now: string = jstNowStamp()): boolean {
  if (!schedule.start) return false;
  if (now < schedule.start) return false;
  if (schedule.end && now > schedule.end) return false;
  return true;
}

// 手動トグル・期間指定のいずれかが有効なら true（実際のアクセス制御・画面表示に使う総合判定）
export async function isMaintenanceActive(db: D1Database): Promise<boolean> {
  try {
    if (await getMaintenanceMode(db)) return true;
    return isWithinSchedule(await getMaintenanceSchedule(db));
  } catch {
    return false;
  }
}

// メンテナンス除外対象は username = 'admin' のアカウントのみ
// （permissions が NULL の全権限アカウントでも admin 以外はメンテ画面）
export async function isAdminAccount(db: D1Database, adminId: number): Promise<boolean> {
  try {
    const row = await db.prepare('SELECT username FROM admins WHERE id = ?')
      .bind(adminId).first<{ username: string }>();
    return row?.username === 'admin';
  } catch {
    return false;
  }
}

// メンテ中にLINE Botへメッセージが来たときの返信文
export const MAINTENANCE_BOT_MESSAGE =
  'いつもご利用ありがとうございます。\n\n' +
  'ただいまシステム改良、セキュリティ保守のためのメンテナンスを行っております。\n\n' +
  'ご不便をおかけしますが、メンテナンス終了後にあらためてお試しください。';

// メンテ中のLINE Webhookイベント処理。個人チャットの message / postback のみ返信し、
// グループ・ルームには反応しない（グループ内の雑談すべてに返信してしまうのを防ぐ）
export async function replyMaintenanceToLineEvent(env: Env, event: Record<string, unknown>): Promise<void> {
  if (event.type !== 'message' && event.type !== 'postback') return;
  const source = event.source as Record<string, string> | undefined;
  if (source?.type !== 'user') return;
  const replyToken = event.replyToken as string | undefined;
  const accessToken = env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!replyToken || !accessToken) return;
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ replyToken, messages: [{ type: 'text', text: MAINTENANCE_BOT_MESSAGE }] }),
  });
}

// メンテナンス画面（管理画面・LIFF・フォーム共通、503で返す）
export function maintenancePage(): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>メンテナンス中 | ホシコン</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Hiragino Sans', 'Meiryo', sans-serif;
      background: #f6f8fa;
      background-image: linear-gradient(rgba(30,58,95,.04) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(30,58,95,.04) 1px, transparent 1px);
      background-size: 24px 24px;
      min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px;
    }
    .card {
      background: #fff; border: 1px solid #e2e8f0; border-radius: 14px;
      box-shadow: 0 4px 20px rgba(15,23,42,.08);
      max-width: 420px; width: 100%; padding: 40px 32px 32px; text-align: center;
    }
    .gears { position: relative; width: 96px; height: 76px; margin: 0 auto 22px; }
    .gear { position: absolute; color: #1e3a5f; }
    .gear.big { width: 56px; height: 56px; left: 0; top: 0; animation: spin 9s linear infinite; }
    .gear.small { width: 38px; height: 38px; right: 4px; bottom: 0; color: #64a0d8; animation: spin 6s linear infinite reverse; }
    @keyframes spin { to { transform: rotate(360deg); } }
    h1 { font-size: 17px; color: #1e3a5f; font-weight: 700; margin-bottom: 12px; }
    p { font-size: 13px; color: #475569; line-height: 1.9; margin-bottom: 20px; }
    .tag {
      display: inline-block; font-family: Menlo, Consolas, monospace; font-size: 10px;
      letter-spacing: .14em; color: #64748b; background: #f1f5f9; border: 1px solid #e2e8f0;
      border-radius: 20px; padding: 5px 14px;
    }
    .tag .dot {
      display: inline-block; width: 7px; height: 7px; border-radius: 50%;
      background: #f59e0b; margin-right: 7px; vertical-align: 1px; animation: blink 1.4s infinite;
    }
    @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
    .footer { margin-top: 24px; font-size: 11px; color: #94a3b8; }
    /* PC版は大きく赤文字で強調表示する */
    @media (min-width: 769px) {
      .card { max-width: 680px; padding: 72px 64px 56px; }
      .gears { width: 140px; height: 110px; margin-bottom: 32px; }
      h1 { font-size: 44px; color: #dc2626; font-weight: 800; margin-bottom: 22px; }
      p { font-size: 17px; color: #7f1d1d; }
      .tag { font-size: 13px; padding: 8px 20px; }
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="gears">
      <svg class="gear big" viewBox="0 0 24 24" fill="currentColor"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0 6.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5zM21.7 13.4c.05-.46.08-.93.08-1.4s-.03-.94-.08-1.4l2.1-1.64a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.6-.22l-2.48 1a7.7 7.7 0 0 0-2.42-1.4l-.38-2.64A.5.5 0 0 0 15.55 1h-4a.5.5 0 0 0-.5.42l-.37 2.64c-.88.36-1.7.84-2.42 1.4l-2.48-1a.5.5 0 0 0-.61.22l-2 3.46a.5.5 0 0 0 .12.64l2.11 1.65A8.6 8.6 0 0 0 5.32 12c0 .47.03.94.08 1.4l-2.1 1.64a.5.5 0 0 0-.13.64l2 3.46c.13.22.39.31.61.22l2.48-1c.72.57 1.54 1.05 2.42 1.4l.37 2.65c.04.24.25.42.5.42h4c.24 0 .45-.18.49-.42l.38-2.64a7.7 7.7 0 0 0 2.42-1.4l2.48 1c.22.09.48 0 .6-.22l2-3.46a.5.5 0 0 0-.12-.64l-2.1-1.65z" transform="translate(-1.55 0)"/></svg>
      <svg class="gear small" viewBox="0 0 24 24" fill="currentColor"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0 6.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5zM21.7 13.4c.05-.46.08-.93.08-1.4s-.03-.94-.08-1.4l2.1-1.64a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.6-.22l-2.48 1a7.7 7.7 0 0 0-2.42-1.4l-.38-2.64A.5.5 0 0 0 15.55 1h-4a.5.5 0 0 0-.5.42l-.37 2.64c-.88.36-1.7.84-2.42 1.4l-2.48-1a.5.5 0 0 0-.61.22l-2 3.46a.5.5 0 0 0 .12.64l2.11 1.65A8.6 8.6 0 0 0 5.32 12c0 .47.03.94.08 1.4l-2.1 1.64a.5.5 0 0 0-.13.64l2 3.46c.13.22.39.31.61.22l2.48-1c.72.57 1.54 1.05 2.42 1.4l.37 2.65c.04.24.25.42.5.42h4c.24 0 .45-.18.49-.42l.38-2.64a7.7 7.7 0 0 0 2.42-1.4l2.48 1c.22.09.48 0 .6-.22l2-3.46a.5.5 0 0 0-.12-.64l-2.1-1.65z" transform="translate(-1.55 0)"/></svg>
    </div>
    <h1>ただいまメンテナンス中です</h1>
    <p>システム改良、セキュリティ保守のためのメンテナンスを行っております。<br>ご不便をおかけしますが、終了までしばらくお待ちください。</p>
    <span class="tag"><span class="dot"></span>MAINTENANCE IN PROGRESS</span>
    <div class="footer">ホシコン</div>
  </div>
</body>
</html>`;
}
