-- ===================================================
-- migration_057: 班長個人ごとの月間予定確認用テーブル
--   （旧⭐カレ用に新設。⭐カレ自体はLIFFごと廃止し、2026-08-05に
--    admin_kancho_personal.ts の「個人別確認」Webページへ置き換えた。テーブルは流用）
--   内勤班長(kancho_members.is_indoor=1)は既存の kancho_shifts をそのまま使う（閲覧専用）。
--   乗務班長(is_indoor=0)は自身の出勤スケジュールを持たないため、
--   専用テーブル kancho_crew_schedules を参照する（現状は書き込み手段が無く常に空）。
--   「その他」欄（自由記述）は内勤・乗務共通で kancho_calendar_notes に保存する。本人が編集可能。
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
