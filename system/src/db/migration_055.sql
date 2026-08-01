-- ===================================================
-- migration_055: 稼働台数報告表（乗務員シフトからの自動反映）
--   認可台数は課ごとの設定値としてvehicle_utilization_capacityに保存。
--   事故休車・故障休車・a休車・b休車・全休車・稼働台数・浮き3列は
--   日付×課ごとにvehicle_utilization_reportsへ手入力保存する
--   （隔日勤務・日勤勤務の人数はcrew_shifts側から都度自動集計するため
--    テーブルには持たない）。
-- ===================================================
CREATE TABLE IF NOT EXISTS vehicle_utilization_capacity (
  division    TEXT PRIMARY KEY,
  capacity    INTEGER NOT NULL,
  updated_at  TEXT,
  updated_by  TEXT
);

INSERT OR IGNORE INTO vehicle_utilization_capacity (division, capacity) VALUES
  ('板橋1課', 93),
  ('板橋2課', 92),
  ('板橋3課', 95),
  ('板橋4課', 95);

CREATE TABLE IF NOT EXISTS vehicle_utilization_reports (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  date          TEXT NOT NULL,
  division      TEXT NOT NULL,
  accident_off  REAL NOT NULL DEFAULT 0,  -- 事故休車
  breakdown_off REAL NOT NULL DEFAULT 0,  -- 故障休車
  a_off         REAL NOT NULL DEFAULT 0,  -- a休車
  b_off         REAL NOT NULL DEFAULT 0,  -- b休車
  full_off      REAL NOT NULL DEFAULT 0,  -- 全休車
  operating     REAL,                     -- 稼働台数（手入力）
  float_a       REAL NOT NULL DEFAULT 0,  -- a番-浮き
  float_b       REAL NOT NULL DEFAULT 0,  -- b番-浮き
  float_kaku    REAL NOT NULL DEFAULT 0,  -- 隔勤-浮き
  updated_at    TEXT,
  updated_by    TEXT,
  UNIQUE (date, division)
);
