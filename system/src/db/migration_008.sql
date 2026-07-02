-- migration_008: 班長LINE連携・通知設定

-- 班長のLINE UID
ALTER TABLE instructors ADD COLUMN line_uid TEXT;

-- 招待コードに班長ID列を追加（emp_id か instructor_id のどちらか一方が設定される）
ALTER TABLE invite_codes ADD COLUMN instructor_id INTEGER REFERENCES instructors(id);

-- LINE通知設定
CREATE TABLE IF NOT EXISTS notification_settings (
  type           TEXT PRIMARY KEY,               -- 'morning_report' | 'bad_event_alert'
  send_hour      INTEGER NOT NULL DEFAULT 8,     -- 送信時刻（JST 時）
  send_minute    INTEGER NOT NULL DEFAULT 0,     -- 送信時刻（分）
  is_enabled     INTEGER NOT NULL DEFAULT 1,
  last_sent_date TEXT,                           -- 最後に送信した日付 YYYY-MM-DD
  updated_at     TEXT DEFAULT (datetime('now', 'localtime'))
);

INSERT OR IGNORE INTO notification_settings (type, send_hour, send_minute, is_enabled) VALUES
  ('morning_report',   8, 0, 1),
  ('bad_event_alert', 21, 0, 1);

-- 「出勤」シフト区分を追加（班長・指導者の通常出勤を意味する色付きセル）
INSERT OR IGNORE INTO schedule_types (code, color, sort_order, is_active, target)
VALUES ('出勤', '#bbf7d0', 90, 1, NULL);
