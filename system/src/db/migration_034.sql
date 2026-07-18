-- ===================================================
-- migration_034: 班長シフト 希望休枠 + 深夜0時の出勤者LINE通知
--   ・kancho_wishes: 構造化された希望休（従来のフリーテキスト希望休メモとは別枠）
--     「希望休を自動反映」で公休(赤文字)としてシフトに自動割り当てされる
--   ・kancho_notify_optin: 0時通知の送信先（統括/運行管理者のうちWebでオンにした人のみ）
-- ===================================================

CREATE TABLE IF NOT EXISTS kancho_wishes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id  INTEGER NOT NULL REFERENCES kancho_members(id),
  date       TEXT NOT NULL,                 -- "YYYY-MM-DD"
  note       TEXT NOT NULL DEFAULT '',
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  UNIQUE (member_id, date)
);
CREATE INDEX IF NOT EXISTS idx_kancho_wishes_date ON kancho_wishes(date);

CREATE TABLE IF NOT EXISTS kancho_notify_optin (
  line_uid   TEXT PRIMARY KEY,              -- line_liff_users.line_uid
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

-- 深夜0時（JST）に本日の出勤者を送信。送信先が未登録なら何も送られない
INSERT OR IGNORE INTO notification_settings (type, send_hour, send_minute, is_enabled)
VALUES ('kancho_attendance', 0, 0, 1);
