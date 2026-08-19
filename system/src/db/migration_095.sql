-- ===================================================
-- migration_095: AI売上分析 — 安全運転データ（ホシコン収集データCSV由来）と
-- 運転リスク検証の閾値設定（単一行）
-- 急発進・急加速・急減速（各「実車」「空車」）・最高速度（高速道/一般道、各「実車」「空車」）を
-- 社員×日付で保存する。従来形式CSVにはこのデータが無いため、ホシコン形式取込時のみ書き込まれる。
-- 実際の事故記録（accidents系テーブル）とは別物で、運転挙動データからの参考指標。
-- ===================================================

CREATE TABLE IF NOT EXISTS driving_safety_records (
  id                        INTEGER PRIMARY KEY AUTOINCREMENT,
  emp_id                    INTEGER NOT NULL REFERENCES employees(id),
  date                      TEXT NOT NULL,
  harsh_start_loaded        INTEGER, -- 急発進_実車
  harsh_start_empty         INTEGER, -- 急発進_空車
  harsh_accel_loaded        INTEGER, -- 急加速_実車
  harsh_accel_empty         INTEGER, -- 急加速_空車
  harsh_decel_loaded        INTEGER, -- 急減速_実車
  harsh_decel_empty         INTEGER, -- 急減速_空車
  max_speed_loaded_highway  INTEGER, -- 実車最高速度(高速道)
  max_speed_empty_highway   INTEGER, -- 空車最高速度(高速道)
  max_speed_loaded_local    INTEGER, -- 実車最高速度(一般道)
  max_speed_empty_local     INTEGER, -- 空車最高速度(一般道)
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT DEFAULT (datetime('now', 'localtime')),
  UNIQUE(emp_id, date)
);
CREATE INDEX IF NOT EXISTS idx_driving_safety_emp_date ON driving_safety_records(emp_id, date);

CREATE TABLE IF NOT EXISTS driving_risk_settings (
  id                            INTEGER PRIMARY KEY DEFAULT 1,
  harsh_event_daily_threshold   INTEGER NOT NULL DEFAULT 5,   -- 1日の急発進+急加速+急減速合計がこれ以上で「要注意」
  max_speed_highway_threshold   INTEGER NOT NULL DEFAULT 100, -- km/h。実車最高速度がこれを超えたら速度超過フラグ
  max_speed_local_threshold     INTEGER NOT NULL DEFAULT 60,  -- km/h
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);
INSERT OR IGNORE INTO driving_risk_settings (id) VALUES (1);
