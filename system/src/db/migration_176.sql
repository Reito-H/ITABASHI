-- ===================================================
-- migration_176: 班長シフト希望休フォーム 希望休の上限日数
--   全員共通の上限（kancho_wish_settings.max_wishes、NULL=上限なし）と、
--   班長ごとの個別上限（社員番号キー。名簿は月度ごとに作り直されるため
--   member_idではなくemp_noで持ち、月度をまたいで引き継ぐ）。
-- ===================================================

ALTER TABLE kancho_wish_settings ADD COLUMN max_wishes INTEGER;

CREATE TABLE IF NOT EXISTS kancho_wish_limits (
  emp_no     TEXT PRIMARY KEY,
  max_wishes INTEGER NOT NULL,
  updated_at TEXT DEFAULT (datetime('now', 'localtime'))
);
