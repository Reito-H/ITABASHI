-- CC名簿（クレーム客の記録台帳）。既存の報告データとは独立した専用台帳。
-- アクセスはページ側で毎回5931パスワードを要求（権限キーは使わず全アカウント共通、index.tsでページ権限チェックをバイパス）。
CREATE TABLE IF NOT EXISTS cc_list (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  case_name       TEXT NOT NULL DEFAULT '',   -- 案件名
  driver_name     TEXT NOT NULL DEFAULT '',   -- 乗務社員名前
  vehicle_no      TEXT NOT NULL DEFAULT '',   -- 車番
  occurred_at     TEXT,                       -- 日時
  phone           TEXT NOT NULL DEFAULT '',   -- 電話番号
  cc_name         TEXT NOT NULL DEFAULT '',   -- CC名
  cc_phone        TEXT NOT NULL DEFAULT '',   -- CC電話番号
  cc_address      TEXT NOT NULL DEFAULT '',   -- CC住所
  cc_pickup       TEXT NOT NULL DEFAULT '',   -- CC乗車場所
  cc_dropoff      TEXT NOT NULL DEFAULT '',   -- CC降車場所
  notes           TEXT NOT NULL DEFAULT '',   -- 備考
  created_by      TEXT NOT NULL DEFAULT '',
  created_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_cc_list_occurred_at ON cc_list(occurred_at);
