-- ===================================================
-- migration_076: お知らせ配信にWeb管理画面通知（右上ベルマーク）を追加
--   channel: 'line'=LINE配信のみ（既定・既存データ） / 'web'=Web管理画面のみ / 'both'=両方
--   admin_announcement_reads: 管理アカウントごとの既読管理（Web向けお知らせのみ対象）
-- ===================================================

ALTER TABLE announcements ADD COLUMN channel TEXT NOT NULL DEFAULT 'line';

CREATE TABLE IF NOT EXISTS admin_announcement_reads (
  admin_id         INTEGER NOT NULL REFERENCES admins(id),
  announcement_id  INTEGER NOT NULL REFERENCES announcements(id),
  read_at          TEXT DEFAULT (datetime('now', 'localtime')),
  PRIMARY KEY (admin_id, announcement_id)
);
