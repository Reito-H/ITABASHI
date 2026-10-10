-- ===================================================
-- migration_179: 星専用 引き継ぎシート 出勤時間
--   縦型カレンダーのシフトと予定メモの間の◯マークから登録する、1日1件の出勤時刻。
--   星シート専用のデータ（班長シフトには連動しない）。
-- ===================================================
CREATE TABLE IF NOT EXISTS hoshi_work_times (
  date        TEXT PRIMARY KEY,              -- "YYYY-MM-DD"
  start_time  TEXT NOT NULL,                 -- "HH:MM"
  updated_at  TEXT DEFAULT (datetime('now', 'localtime')),
  updated_by  TEXT
);
