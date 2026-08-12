-- migration_086: メーター検査（仮検査/本検査）・車検管理
CREATE TABLE meter_inspections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ka INTEGER NOT NULL CHECK (ka BETWEEN 1 AND 4),
  car_no TEXT NOT NULL,
  tentative_limit TEXT,              -- 仮検査期限 'YYYY-MM-DD'
  tentative_assignee_id INTEGER,
  tentative_assignee_name TEXT,
  honkensa_limit TEXT,               -- 本検査期限 'YYYY-MM-DD'
  honkensa_assignee_id INTEGER,
  honkensa_assignee_name TEXT,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX idx_meter_inspections_ka ON meter_inspections(ka);

CREATE TABLE shaken_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ka INTEGER NOT NULL CHECK (ka BETWEEN 1 AND 4),
  car_no TEXT NOT NULL,
  shaken_date TEXT,          -- 次回車検予定日 'YYYY-MM-DD'
  shaken_limit TEXT,         -- 車検証有効期限 'YYYY-MM-DD'
  cert_exchange_limit TEXT,  -- 車検証交換リミット 'YYYY-MM-DD'
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX idx_shaken_records_ka ON shaken_records(ka);

-- 大画面アラートの「一旦閉じる」スヌーズ（課全体で共有・1時間で自動失効）
CREATE TABLE deadline_alert_snoozes (
  source TEXT NOT NULL,        -- 'meter_tentative' | 'meter_honkensa' | 'shaken_date' | 'shaken_limit' | 'shaken_cert'
  record_id INTEGER NOT NULL,
  snoozed_until TEXT NOT NULL, -- datetime（JST基準の壁時計値。他機能と同じ+9h補正パターンで比較する）
  PRIMARY KEY (source, record_id)
);
