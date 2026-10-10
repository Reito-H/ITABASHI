-- ===================================================
-- migration_180: サイバー（セキュリティ監視）
--   security_events: ログイン成功/失敗・ロック・国外アクセス遮断・攻撃パターン探索・
--                    権限外アクセス・LINE署名不正・強制ログアウト・メンテ切替 等の検知ログ。
--                    created_at はJST（datetime('now','+9 hours')）。180日より古い行は cron.ts で削除。
--   sessions に接続元（IP・国・回線・ブラウザ）を追加し、サイバーページの「ログイン中の端末」に表示する。
--   権限キー settings.status（システムステータス廃止）を settings.cyber に置き換える。
-- ===================================================

CREATE TABLE IF NOT EXISTS security_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type  TEXT NOT NULL,
  severity    TEXT NOT NULL DEFAULT 'info',   -- info / warn / critical
  ip          TEXT,
  country     TEXT,
  as_org      TEXT,
  username    TEXT,
  admin_id    INTEGER,
  path        TEXT,
  user_agent  TEXT,
  detail      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now', '+9 hours'))
);
CREATE INDEX IF NOT EXISTS idx_security_events_created ON security_events(created_at);
CREATE INDEX IF NOT EXISTS idx_security_events_type_created ON security_events(event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_security_events_username ON security_events(username, event_type);

ALTER TABLE sessions ADD COLUMN ip TEXT;
ALTER TABLE sessions ADD COLUMN country TEXT;
ALTER TABLE sessions ADD COLUMN as_org TEXT;
ALTER TABLE sessions ADD COLUMN user_agent TEXT;

UPDATE admins SET permissions = REPLACE(REPLACE(permissions, '"settings.status.edit"', '"settings.cyber.edit"'), '"settings.status"', '"settings.cyber"')
WHERE permissions LIKE '%settings.status%';
