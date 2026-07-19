-- ===================================================
-- migration_042: システム設定（key-value）テーブル + メンテナンスモード
--   maintenance_mode = '1' で全機能をメンテナンス画面に切り替える
--   （adminアカウントのみ除外・LINE Botはメンテ中メッセージを返信）。
--   切替は admin アカウントのシステムステータスページから行う。
-- ===================================================

CREATE TABLE IF NOT EXISTS system_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now', 'localtime'))
);

INSERT OR IGNORE INTO system_settings (key, value) VALUES ('maintenance_mode', '0');
