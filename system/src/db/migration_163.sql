-- ===================================================
-- migration_163: 引き継ぎシート「車両管理」（事故車・故障車の稼働離脱管理表）
--   紙の管理表（事故車/復活予定・故障車/復活予定の4列＋合計）をWeb化。
--   課ごとに別表（handover_sheetsの他の欄と同じくdivision単位）。行の追加・削除は手動
--   （復活予定日を過ぎても自動では消えない＝紙の運用と同じ）。
--   事故車の行だけ、車番から事故記録(accident_reports.vehicle_no)を検索して紐づけられる
--   （accident_report_id）。故障車には対応する記録が存在しないため常にNULL。
-- ===================================================
CREATE TABLE IF NOT EXISTS handover_vehicle_status (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  division              INTEGER NOT NULL CHECK(division BETWEEN 1 AND 4),
  category              TEXT NOT NULL CHECK(category IN ('accident', 'breakdown')),
  car_no                TEXT NOT NULL,
  expected_return_date  TEXT,                              -- YYYY-MM-DD（未定はNULL）
  accident_report_id    INTEGER,                           -- 紐づけた事故記録（accident_reports.id）。故障車では常にNULL
  note                  TEXT NOT NULL DEFAULT '',
  sort_order            INTEGER NOT NULL DEFAULT 0,
  created_at            TEXT DEFAULT (datetime('now', 'localtime')),
  created_by            TEXT
);
CREATE INDEX IF NOT EXISTS idx_handover_vehicle_status_div_cat ON handover_vehicle_status(division, category, sort_order);
