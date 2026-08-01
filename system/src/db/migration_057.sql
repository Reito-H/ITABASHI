-- ===================================================
-- migration_057: ⭐カレ（班長個人の縦型カレンダー）
--   内勤班長(kancho_members.is_indoor=1)は既存の kancho_shifts をそのまま使う。
--   乗務班長(is_indoor=0)は自身の出勤スケジュールを持たないため、
--   専用テーブル kancho_crew_schedules を新設する。
--   「その他（詳細メモ）」欄は内勤・乗務共通で kancho_calendar_notes に保存する。
-- ===================================================

-- 乗務班長の個人出勤スケジュール（1メンバー1日1件）
CREATE TABLE IF NOT EXISTS kancho_crew_schedules (
  member_id   INTEGER NOT NULL REFERENCES kancho_members(id),
  date        TEXT NOT NULL,                    -- "YYYY-MM-DD"
  code        TEXT NOT NULL,
  updated_at  TEXT DEFAULT (datetime('now', 'localtime')),
  updated_by  TEXT,
  PRIMARY KEY (member_id, date)
);
CREATE INDEX IF NOT EXISTS idx_kancho_crew_schedules_date ON kancho_crew_schedules(date);

-- ⭐カレ「その他」欄（1日ごとの自由記述メモ、内勤・乗務共通）
CREATE TABLE IF NOT EXISTS kancho_calendar_notes (
  member_id   INTEGER NOT NULL REFERENCES kancho_members(id),
  date        TEXT NOT NULL,
  note        TEXT NOT NULL DEFAULT '',
  updated_at  TEXT DEFAULT (datetime('now', 'localtime')),
  updated_by  TEXT,
  PRIMARY KEY (member_id, date)
);
CREATE INDEX IF NOT EXISTS idx_kancho_calendar_notes_date ON kancho_calendar_notes(date);
