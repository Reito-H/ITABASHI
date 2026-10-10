import { SELF, env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';

const SECRET = 's7db8q6wys';
const BASE = `https://example.com/${SECRET}/admin`;
const SID = '11111111-2222-3333-4444-555555555555';

async function setupDb() {
  const db = (env as { DB: D1Database }).DB;
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS admins (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, password TEXT NOT NULL, permissions TEXT, created_at TEXT DEFAULT (datetime(\'now\', \'localtime\')))'),
    db.prepare('CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, admin_id INTEGER NOT NULL, expires_at TEXT NOT NULL, created_at TEXT DEFAULT (datetime(\'now\', \'localtime\')))'),
    db.prepare('CREATE TABLE IF NOT EXISTS login_attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, ip TEXT NOT NULL, failed_at TEXT NOT NULL DEFAULT (datetime(\'now\', \'localtime\')))'),
    db.prepare('CREATE TABLE IF NOT EXISTS system_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT)'),
    db.prepare(`CREATE TABLE IF NOT EXISTS security_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, event_type TEXT NOT NULL, severity TEXT NOT NULL DEFAULT 'info',
      ip TEXT, country TEXT, as_org TEXT, username TEXT, admin_id INTEGER, path TEXT, user_agent TEXT, detail TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours')))`),
    db.prepare("INSERT OR IGNORE INTO admins (id, username, password, permissions) VALUES (1, 'admin', 'v2:00:00', NULL)"),
    db.prepare('INSERT OR REPLACE INTO sessions (id, admin_id, expires_at) VALUES (?, 1, ?)')
      .bind(SID, new Date(Date.now() + 3600_000).toISOString()),
  ]);
  return db;
}

describe('サイバー', () => {
  beforeAll(async () => { await setupDb(); });

  it('サイバーページがログイン済みで表示できる', async () => {
    const res = await SELF.fetch(new Request(`${BASE}/settings/cyber`, {
      headers: { 'CF-IPCountry': 'JP', Cookie: `session=${SID}` },
    }));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('脅威レベル');
    expect(html).toContain('メンテナンスモード');
  });

  it('旧システムステータスのURLはサイバーへ転送される', async () => {
    const res = await SELF.fetch(new Request(`${BASE}/settings/status`, {
      redirect: 'manual', headers: { 'CF-IPCountry': 'JP', Cookie: `session=${SID}` },
    }));
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toContain('/settings/cyber');
  });

  it('同じ接続元から5回失敗すると6回目はロックされる（再発防止テスト：以前は日時形式の違いでロックが効いていなかった）', async () => {
    const db = await setupDb();
    const login = async () => {
      const csrf = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
      const body = new FormData();
      body.set('username', 'admin');
      body.set('password', 'wrong-password');
      body.set('csrf_token', csrf);
      const res = await SELF.fetch(new Request(`${BASE}/login`, {
        method: 'POST', body,
        headers: { 'CF-IPCountry': 'JP', 'CF-Connecting-IP': '203.0.113.9', Cookie: `csrf_login=${csrf}` },
      }));
      return res.text();
    };
    for (let i = 0; i < 5; i++) {
      expect(await login()).toContain('ユーザー名またはパスワードが正しくありません');
    }
    expect(await login()).toContain('しばらく時間をおいてから再試行してください');
    const r = await db.prepare("SELECT COUNT(*) AS cnt FROM security_events WHERE event_type = 'login_failed'").first<{ cnt: number }>();
    expect(r?.cnt).toBe(5);
  });

  it('攻撃ツールの探索パスは記録される', async () => {
    const db = await setupDb();
    await SELF.fetch(new Request('https://example.com/.env', { headers: { 'CF-IPCountry': 'JP', 'CF-Connecting-IP': '198.51.100.7' } }));
    const r = await db.prepare("SELECT COUNT(*) AS cnt FROM security_events WHERE event_type = 'probe'").first<{ cnt: number }>();
    expect(r?.cnt).toBeGreaterThanOrEqual(1);
  });
});
