-- ===================================================
-- migration_026: 乗務社員ロール + 売上区分コード + ODOメーター記録
-- 新ロール: crew_member（line_liff_users.role に追加。スキーマ変更不要）
-- ===================================================

ALTER TABLE sales_records ADD COLUMN duty_code TEXT
  CHECK(duty_code IS NULL OR duty_code IN ('a','b','B','D','H'));

CREATE TABLE IF NOT EXISTS odo_records (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  emp_id      INTEGER NOT NULL REFERENCES employees(id),
  odo_start   INTEGER NOT NULL CHECK(odo_start BETWEEN 0 AND 999999),
  odo_end     INTEGER CHECK(odo_end IS NULL OR odo_end BETWEEN 0 AND 999999),
  distance_km INTEGER,
  started_at  TEXT DEFAULT (datetime('now', 'localtime')),
  ended_at    TEXT,
  created_at  TEXT DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX IF NOT EXISTS idx_odo_emp_open ON odo_records(emp_id, odo_end);
CREATE INDEX IF NOT EXISTS idx_odo_started ON odo_records(started_at);
