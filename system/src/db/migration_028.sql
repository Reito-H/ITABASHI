-- ===================================================
-- migration_028: 違反報告機能
-- ===================================================

-- 違反種類マスタ（点数・反則金は一般的な反則金早見表を基にした目安値。
-- 法改正で随時更新されるため、本番運用前に最新の一覧表と照合し、
-- 必要に応じて /settings/violation-types から修正すること）
CREATE TABLE IF NOT EXISTS violation_types (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  points       INTEGER NOT NULL DEFAULT 0,   -- 違反点数
  fine_amount  INTEGER NOT NULL DEFAULT 0,   -- 反則金(円)
  sort_order   INTEGER NOT NULL DEFAULT 0,
  is_active    INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT DEFAULT (datetime('now', 'localtime'))
);

INSERT INTO violation_types (name, points, fine_amount, sort_order) VALUES
  ('信号無視（赤色等）', 2, 9000, 10),
  ('信号無視（点滅信号）', 2, 7000, 20),
  ('指定場所一時不停止等', 2, 7000, 30),
  ('速度超過（一般道 25km以上30km未満）', 3, 18000, 40),
  ('速度超過（一般道 20km以上25km未満）', 2, 15000, 50),
  ('速度超過（一般道 15km以上20km未満）', 1, 12000, 60),
  ('速度超過（一般道 15km未満）', 1, 9000, 70),
  ('携帯電話使用等（保持）', 3, 18000, 80),
  ('シートベルト装着義務違反', 1, 0, 90),
  ('通行禁止違反', 2, 7000, 100),
  ('車間距離不保持（一般道）', 1, 6000, 110),
  ('追越し禁止違反', 2, 9000, 120),
  ('駐停車違反（放置）', 2, 12000, 130),
  ('駐停車違反（駐停車）', 1, 10000, 140),
  ('交差点右左折方法違反', 1, 6000, 150),
  ('整備不良車両運転（制動装置等）', 2, 9000, 160),
  ('横断歩行者等妨害等', 2, 9000, 170),
  ('踏切不停止等', 2, 9000, 180),
  ('その他', 0, 0, 999);

-- 違反報告テーブル（lost_item_reports / accident_reports と同じ非正規化方針。
-- 課・班・違反の点数/反則金は報告時点の値をスナップショットとして保存する）
CREATE TABLE IF NOT EXISTS violation_reports (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at           TEXT,    -- 受電時刻
  vehicle_no            TEXT,    -- 車番
  violation_at          TEXT,    -- 違反発生日時（YYYY-MM-DD HH:MM）
  employee_name         TEXT,
  employee_emp_no       TEXT,
  employee_division     INTEGER,
  employee_team         INTEGER,
  violation_type_id     INTEGER REFERENCES violation_types(id),
  violation_type_name   TEXT,    -- 報告時点の名称スナップショット
  violation_points      INTEGER, -- 報告時点の点数スナップショット
  violation_fine_amount INTEGER, -- 報告時点の反則金スナップショット
  notes                 TEXT,
  status                TEXT DEFAULT 'open', -- 'open' / 'resolved'
  reported_by_uid       TEXT,
  created_at            TEXT DEFAULT (datetime('now', 'localtime')),
  resolved_by_name      TEXT,
  resolved_at           TEXT
);
