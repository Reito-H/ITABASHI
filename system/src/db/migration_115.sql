-- migration_115: 事故研修記録（実施した事故研修の5W1H記録＋担当者所感）
--   accidents_training.tsの「事故研修のお知らせ」は対象者抽出→案内印刷までで、
--   実際に研修を実施した後の記録が残らなかったため、実施記録専用のテーブルを新設する。
CREATE TABLE IF NOT EXISTS accident_training_records (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id       INTEGER,
  employee_name     TEXT NOT NULL,
  emp_no            TEXT,
  division          INTEGER,
  team              TEXT,
  conducted_date    TEXT NOT NULL,
  location          TEXT,
  trainer_name      TEXT,
  content           TEXT,
  reason            TEXT,
  method            TEXT,
  comment           TEXT,
  created_by        INTEGER,
  created_at        TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_accident_training_records_date ON accident_training_records(conducted_date DESC);
CREATE INDEX IF NOT EXISTS idx_accident_training_records_employee ON accident_training_records(employee_id);
