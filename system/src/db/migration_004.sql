-- migration_004: 月度設定テーブル追加 + birth_date追加 + キャリア→一般

-- 1. 月度設定テーブル
CREATE TABLE IF NOT EXISTS period_settings (
  month      INTEGER PRIMARY KEY CHECK(month BETWEEN 1 AND 12),
  close_day  INTEGER NOT NULL DEFAULT 17,
  start_day  INTEGER NOT NULL DEFAULT 18
);

INSERT OR IGNORE INTO period_settings (month, close_day, start_day) VALUES
  (1,17,18),(2,17,18),(3,17,18),(4,17,18),
  (5,17,18),(6,17,18),(7,17,18),(8,17,18),
  (9,17,18),(10,17,18),(11,17,18),(12,17,18);

-- 2. birth_date カラム追加（未追加の場合のみ）
ALTER TABLE employees ADD COLUMN birth_date TEXT;

-- 3. CHECK制約を無視してキャリア→一般 に更新
PRAGMA ignore_check_constraints = 1;
UPDATE employees SET entry_type = '一般' WHERE entry_type = 'キャリア';
PRAGMA ignore_check_constraints = 0;
