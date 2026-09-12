-- ===================================================
-- migration_145: 出勤者ボードのチェック（消し込み）状態
--   ・日付＋社員IDで1件。全アカウント共有。
--   ・「日付ごと自動白紙」は date でしか絞らない運用で実現（過去日付の行は残るが表示されない）。
--   ・リセット = DELETE WHERE date = ?
-- ===================================================

CREATE TABLE IF NOT EXISTS attendance_board_checks (
  date        TEXT NOT NULL,                 -- "YYYY-MM-DD"
  emp_id      INTEGER NOT NULL,
  checked_at  TEXT DEFAULT (datetime('now', 'localtime')),
  checked_by  TEXT,
  PRIMARY KEY (date, emp_id)
);
CREATE INDEX IF NOT EXISTS idx_attendance_board_checks_date ON attendance_board_checks(date);
