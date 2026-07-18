-- ===================================================
-- migration_030: お知らせ配信の対象にLINE連携者（liff）を追加
-- announcements.target_type の CHECK 制約に 'liff' を追加するため
-- テーブルを再作成する（SQLiteはCHECK制約の変更不可）
-- ===================================================

CREATE TABLE announcements_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  message     TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT 'all' CHECK(target_type IN ('all', 'entry_month', 'individual', 'liff')),
  target_data TEXT,    -- entry_month: "YYYY-MM" / individual: カンマ区切りemp_id / liff: カンマ区切りロール
  sent_count  INTEGER DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now', 'localtime'))
);

INSERT INTO announcements_new (id, title, message, target_type, target_data, sent_count, created_at)
  SELECT id, title, message, target_type, target_data, sent_count, created_at FROM announcements;

DROP TABLE announcements;

ALTER TABLE announcements_new RENAME TO announcements;
