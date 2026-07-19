-- ===================================================
-- migration_039: 一般報告機能
--   事故・違反に当てはまらない「単純な報告」用。
--   lost_item_reports / accident_reports と同じ非正規化方針。
-- ===================================================

CREATE TABLE IF NOT EXISTS general_reports (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at       TEXT,    -- 受電時刻
  vehicle_no        TEXT,    -- 車番（任意）
  employee_name     TEXT,
  employee_emp_no   TEXT,
  employee_division INTEGER,
  employee_team     INTEGER,
  content           TEXT,    -- 報告内容（本文）
  status            TEXT DEFAULT 'open', -- 'open' / 'resolved'
  reported_by_uid   TEXT,
  created_at        TEXT DEFAULT (datetime('now', 'localtime')),
  resolved_by_name  TEXT,
  resolved_at       TEXT
);
