-- ===================================================
-- migration_083: 事故データ（保険会社システムCSVエクスポート取込）
--   紙/Excel手入力で行っていた「無事故キロ数計算」用の事故集計を、
--   保険システムから出力される事故データCSVの取込に置き換える。
--   事故番号（1事故1保険請求=1行）をキーにUPSERTするため、同一CSVや
--   月をまたいだ再アップロードをしても重複しない。
-- ===================================================

CREATE TABLE IF NOT EXISTS accident_records (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  accident_no           TEXT NOT NULL UNIQUE,
  office                TEXT,
  vehicle_code          TEXT,
  plate_no              TEXT,
  division              INTEGER,
  team                  TEXT,
  emp_no                TEXT,
  emp_name              TEXT,
  accident_category     TEXT,
  occurred_date         TEXT NOT NULL,
  occurred_time         TEXT,
  weather               TEXT,
  loc_city              TEXT,
  loc_town              TEXT,
  loc_addr              TEXT,
  fault_pct_planned     INTEGER,
  fault_pct_final       INTEGER,
  damage_amount         INTEGER,
  accident_target       TEXT,
  accident_form         TEXT,
  road_condition        TEXT,
  business_status       TEXT,
  emp_age               INTEGER,
  emp_tenure_years      INTEGER,
  memo                  TEXT,
  past3y_accident_count INTEGER,
  road_shape            TEXT,
  cause_reason           TEXT,
  cause_direct           TEXT,
  imported_at           TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_accident_records_date     ON accident_records(occurred_date DESC);
CREATE INDEX IF NOT EXISTS idx_accident_records_division ON accident_records(division, occurred_date DESC);
