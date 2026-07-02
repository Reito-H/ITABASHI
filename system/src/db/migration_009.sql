-- migration_009: 車両検索システム

-- 車両マスタ
CREATE TABLE IF NOT EXISTS vehicles (
  id          INTEGER PRIMARY KEY,
  radio_no    INTEGER,           -- 無線番号（Z列）
  plate_no    TEXT,              -- 車両番号フル（例: 川口510あ3105）
  plate_num   TEXT,              -- 末尾番号（例: 3105）※検索キー
  car_type    TEXT,              -- 車種名
  fuel        TEXT,              -- 燃料
  grade       TEXT,              -- グレード
  company     TEXT,              -- 会社
  office      TEXT,              -- 営業所
  capacity    INTEGER,           -- 乗車人数
  luggage     TEXT,              -- 荷物スペース
  office2     TEXT,              -- 詳細営業所名
  radio_no2   INTEGER,           -- 別無線番号
  division    TEXT               -- 課
);

-- 検索インデックス
CREATE INDEX IF NOT EXISTS idx_vehicles_radio_no ON vehicles(radio_no);
CREATE INDEX IF NOT EXISTS idx_vehicles_plate_num ON vehicles(plate_num);

-- 車両検索可能なLINE管理者
CREATE TABLE IF NOT EXISTS vehicle_search_admins (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  line_uid   TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL DEFAULT '',
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);
