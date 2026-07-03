-- ===================================================
-- migration_016: LINE LIFF 権限統合 + 忘れ物/事故報告
-- ===================================================

-- LINE LIFF統合ユーザー権限テーブル
-- role: general_manager / operations_manager / vehicle_manager / newcomer / unknown
CREATE TABLE IF NOT EXISTS line_liff_users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  line_uid    TEXT NOT NULL UNIQUE,
  name        TEXT,
  emp_id      INTEGER REFERENCES employees(id),
  role        TEXT NOT NULL DEFAULT 'unknown',
  created_at  TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at  TEXT DEFAULT (datetime('now', 'localtime'))
);

-- 忘れ物報告テーブル（社員報告 + 客からの問い合わせ共用）
CREATE TABLE IF NOT EXISTS lost_item_reports (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  report_type       TEXT NOT NULL DEFAULT 'staff', -- 'staff'=社員報告 / 'customer'=客問い合わせ
  received_at       TEXT,   -- 受電時刻（例: "21:46"）
  vehicle_no        TEXT,   -- 車番
  employee_name     TEXT,   -- 乗務員氏名
  employee_emp_no   TEXT,   -- 乗務員社員番号
  employee_division INTEGER, -- 課
  employee_team     INTEGER, -- 班
  item_description  TEXT,   -- 忘れ物の内容
  pickup_location   TEXT,   -- 乗車地
  dropoff_location  TEXT,   -- 降車地
  customer_name     TEXT,   -- 客氏名（客問い合わせ時）
  customer_phone    TEXT,   -- 客電話番号
  return_method     TEXT,   -- 返却方法（着払い / 来社受け取り）
  notes             TEXT,   -- 備考
  status            TEXT DEFAULT 'open', -- 'open' / 'resolved'
  reported_by_uid   TEXT,   -- 報告者のLINE UID
  created_at        TEXT DEFAULT (datetime('now', 'localtime'))
);

-- 事故報告テーブル
CREATE TABLE IF NOT EXISTS accident_reports (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at          TEXT,   -- 受電時刻
  vehicle_no           TEXT,   -- 車番
  employee_name        TEXT,   -- 乗務員氏名
  employee_emp_no      TEXT,   -- 社員番号
  employee_division    INTEGER, -- 課
  employee_team        INTEGER, -- 班
  accident_type        TEXT,   -- 事故形態
  location             TEXT,   -- 事故発生場所
  car_status           TEXT,   -- 空車 / 実車 / 迎車
  substitute_requested INTEGER DEFAULT 0, -- 代車要請済みか (0/1)
  police_notified      INTEGER DEFAULT 0, -- 警察対応指示済みか (0/1)
  passenger_delivered  INTEGER DEFAULT 0, -- 乗客送り届け済みか (0/1)
  additional_info      TEXT,   -- 追加情報
  summary_text         TEXT,   -- 報告書まとめテキスト（LINEに送信した内容）
  status               TEXT DEFAULT 'open', -- 'open' / 'resolved'
  reported_by_uid      TEXT,
  created_at           TEXT DEFAULT (datetime('now', 'localtime'))
);

-- ===================================================
-- 既存連携者の自動移行
-- ※ migration_016_migrate.sql を別途実行してください
-- (instructors.line_uid は migration_008 が適用済みの環境でのみ機能)
-- ===================================================
