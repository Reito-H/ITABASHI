-- migration_158: km-operator（国際自動車グループ配車システム）連携 乗降ピンデータ収集
-- docs/KM_OPERATOR_API.md 参照。trip_infos/search（営業情報画面のAPI）から、板橋営業所の
-- 車両（無線番号）ごとに乗車・降車地点＋料金等を収集して蓄積する。

CREATE TABLE IF NOT EXISTS km_trip_pins (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id             TEXT NOT NULL UNIQUE,   -- km-operator側のtripId（再取込時の重複防止キー）
  radio_no            INTEGER,                 -- 無線番号
  driver_name         TEXT,
  ticket_number       TEXT,                    -- 配車由来の場合のみ（流し営業はNULL）
  ticket_status       TEXT,
  on_service_at       TEXT,                    -- 乗車日時（km-operator側の "YYYY/MM/DD HH:mm" 文字列そのまま）
  on_latitude         REAL,
  on_longitude        REAL,
  out_service_at      TEXT,                    -- 降車日時
  out_latitude        REAL,
  out_longitude       REAL,
  distance_m          INTEGER,
  drive_min           INTEGER,
  fare                INTEGER,
  customer_name_kana  TEXT,                    -- 配車由来のみ。ユーザー判断により保存可（2026-09-16）
  passenger_name_kana TEXT,
  collected_at        TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_km_trip_pins_on_service_at ON km_trip_pins(on_service_at);
CREATE INDEX IF NOT EXISTS idx_km_trip_pins_radio_no ON km_trip_pins(radio_no);

-- 収集実行ログ（管理画面の進捗・履歴表示用）
CREATE TABLE IF NOT EXISTS km_pin_collection_runs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at     TEXT DEFAULT (datetime('now', 'localtime')),
  target_date    TEXT,     -- km-operator側に渡した date パラメータ
  vehicles_total INTEGER,
  vehicles_done  INTEGER,
  trips_saved    INTEGER,
  vehicle_errors INTEGER,
  triggered_by   TEXT
);
