-- migration_087: メーター検査・車検管理を「点検管理」ページに統合するためのスキーマ変更
--   車両行はvehicle_teams(car_no)から自動生成する方式に変更するため、
--   自由入力・自動採番id方式だったmeter_inspections/shaken_recordsをcar_noキーのUPSERT方式に作り直す。
--   本番投入済みだが実データはない（テスト時の空行のみ）ためDROP&再作成で問題ない。
DROP TABLE IF EXISTS meter_inspections;
DROP TABLE IF EXISTS shaken_records;
DROP TABLE IF EXISTS deadline_alert_snoozes;

CREATE TABLE meter_inspections (
  car_no TEXT PRIMARY KEY REFERENCES vehicle_teams(car_no),
  tentative_limit TEXT,              -- 仮検査期限 'YYYY-MM-DD'
  tentative_assignee_id INTEGER,
  tentative_assignee_name TEXT,
  honkensa_limit TEXT,               -- 本検査期限 'YYYY-MM-DD'
  honkensa_assignee_id INTEGER,
  honkensa_assignee_name TEXT,
  updated_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE shaken_records (
  car_no TEXT PRIMARY KEY REFERENCES vehicle_teams(car_no),
  shaken_date TEXT,          -- 次回車検予定日 'YYYY-MM-DD'
  shaken_limit TEXT,         -- 車検証有効期限 'YYYY-MM-DD'
  cert_exchange_limit TEXT,  -- 車検証交換リミット 'YYYY-MM-DD'
  updated_at TEXT DEFAULT (datetime('now', 'localtime'))
);

-- 大画面アラートの「一旦閉じる」スヌーズ（課全体で共有・1時間で自動失効）。キーをcar_noベースに変更
CREATE TABLE deadline_alert_snoozes (
  source TEXT NOT NULL,        -- 'meter_tentative' | 'meter_honkensa' | 'shaken_date' | 'shaken_limit' | 'shaken_cert'
  car_no TEXT NOT NULL,
  snoozed_until TEXT NOT NULL, -- datetime（JST基準の壁時計値。+9h補正パターンで比較する）
  PRIMARY KEY (source, car_no)
);
