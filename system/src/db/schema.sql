-- =============================================
-- 新人離職防止システム DBスキーマ
-- =============================================

-- 管理者
CREATE TABLE IF NOT EXISTS admins (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  username    TEXT NOT NULL UNIQUE,
  password    TEXT NOT NULL,
  created_at  TEXT DEFAULT (datetime('now', 'localtime'))
);

-- セッション
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  admin_id    INTEGER NOT NULL REFERENCES admins(id),
  expires_at  TEXT NOT NULL,
  created_at  TEXT DEFAULT (datetime('now', 'localtime'))
);

-- ログイン失敗記録（ブルートフォース対策）
CREATE TABLE IF NOT EXISTS login_attempts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ip          TEXT NOT NULL,
  failed_at   TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 社員マスタ
CREATE TABLE IF NOT EXISTS employees (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  emp_no              TEXT NOT NULL UNIQUE,
  name                TEXT NOT NULL,
  name_kana           TEXT,
  division            INTEGER CHECK(division BETWEEN 1 AND 4),
  team                INTEGER,
  locker_no           TEXT,
  phone               TEXT,
  entry_type          TEXT DEFAULT '新卒' CHECK(entry_type IN ('新卒', 'キャリア', '縁故')),
  hire_date           TEXT,
  first_duty_date     TEXT,
  birth_date          TEXT,
  seq_no              INTEGER,
  status              TEXT DEFAULT 'training' CHECK(status IN ('training', 'completed', 'unassigned')),
  interview_target    INTEGER DEFAULT 0,
  training_completed  INTEGER DEFAULT 0,
  is_active           INTEGER DEFAULT 1,
  created_at          TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at          TEXT DEFAULT (datetime('now', 'localtime'))
);

-- シフトエントリ（1人3行: entry_am=午前, entry_pm=午後, coach_id=研修担当）
CREATE TABLE IF NOT EXISTS shift_entries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  emp_id      INTEGER NOT NULL REFERENCES employees(id),
  date        TEXT NOT NULL,
  entry_am    TEXT,
  entry_pm    TEXT,
  coach_id    INTEGER REFERENCES coaches(id),
  entry_main  TEXT,  -- 旧列（後方互換）
  entry_sub   TEXT,  -- 旧列（後方互換）
  created_at  TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at  TEXT DEFAULT (datetime('now', 'localtime')),
  UNIQUE(emp_id, date)
);

-- コーチ（研修担当）マスタ
CREATE TABLE IF NOT EXISTS coaches (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  is_active  INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0
);

-- 指導者マスタ
CREATE TABLE IF NOT EXISTS instructors (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  role        TEXT,
  is_active   INTEGER DEFAULT 1,
  sort_order  INTEGER DEFAULT 0
);

-- 指導者スケジュール
CREATE TABLE IF NOT EXISTS instructor_schedules (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  instructor_id INTEGER NOT NULL REFERENCES instructors(id),
  date          TEXT NOT NULL,
  entry         TEXT,
  note          TEXT,
  created_at    TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at    TEXT DEFAULT (datetime('now', 'localtime')),
  UNIQUE(instructor_id, date)
);

-- 新卒Info
CREATE TABLE IF NOT EXISTS new_employee_info (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  emp_id          INTEGER NOT NULL UNIQUE REFERENCES employees(id),
  hobbies         TEXT,
  favorite_food   TEXT,
  alcohol         TEXT CHECK(alcohol IN ('飲む', '飲まない', '機会があれば')),
  alcohol_note    TEXT,
  driving_skill   TEXT CHECK(driving_skill IN ('A', 'B', 'C', 'D', 'E')),
  driving_note    TEXT,
  mental_status   TEXT CHECK(mental_status IN ('安定', '注意', '要フォロー', '危険')),
  mental_note     TEXT,
  other_notes     TEXT,
  updated_at      TEXT DEFAULT (datetime('now', 'localtime'))
);

-- 招待コード（LINE紐付け用）
CREATE TABLE IF NOT EXISTS invite_codes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL UNIQUE,
  emp_id      INTEGER REFERENCES employees(id),
  is_used     INTEGER DEFAULT 0,
  used_at     TEXT,
  expires_at  TEXT NOT NULL,
  created_at  TEXT DEFAULT (datetime('now', 'localtime'))
);

-- LINEユーザー
CREATE TABLE IF NOT EXISTS line_users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  line_uid    TEXT NOT NULL UNIQUE,
  emp_id      INTEGER REFERENCES employees(id),
  linked_at   TEXT DEFAULT (datetime('now', 'localtime'))
);

-- 売上記録
CREATE TABLE IF NOT EXISTS sales_records (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  emp_id       INTEGER NOT NULL REFERENCES employees(id),
  date         TEXT NOT NULL,
  amount       INTEGER NOT NULL DEFAULT 0,
  ride_count   INTEGER,
  distance_km  INTEGER,
  period_year  INTEGER,
  period_month INTEGER,
  created_at   TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at   TEXT DEFAULT (datetime('now', 'localtime')),
  UNIQUE(emp_id, date)
);

-- 嫌なこと報告
CREATE TABLE IF NOT EXISTS bad_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  emp_id      INTEGER NOT NULL REFERENCES employees(id),
  category    TEXT NOT NULL CHECK(category IN ('クレーマー', '交通トラブル', '社内の出来事', 'その他')),
  content     TEXT NOT NULL,
  feeling     TEXT,
  admin_memo  TEXT,
  created_at  TEXT DEFAULT (datetime('now', 'localtime'))
);

-- アンケート配信ログ
CREATE TABLE IF NOT EXISTS survey_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  url         TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK(target_type IN ('all', 'individual')),
  target_data TEXT,
  sent_at     TEXT DEFAULT (datetime('now', 'localtime'))
);

-- LINE会話ステート（ボットフロー管理）
CREATE TABLE IF NOT EXISTS line_conv_states (
  line_uid    TEXT PRIMARY KEY,
  state       TEXT NOT NULL DEFAULT 'idle',
  data        TEXT,
  updated_at  TEXT DEFAULT (datetime('now', 'localtime'))
);

-- 月度設定（月ごとの締め日・開始日）
CREATE TABLE IF NOT EXISTS period_settings (
  month      INTEGER PRIMARY KEY CHECK(month BETWEEN 1 AND 12),
  close_day  INTEGER NOT NULL DEFAULT 17,
  start_day  INTEGER NOT NULL DEFAULT 18
);

-- ログイン履歴
CREATE TABLE IF NOT EXISTS login_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ip          TEXT,
  country     TEXT,
  city        TEXT,
  latitude    TEXT,
  longitude   TEXT,
  timezone    TEXT,
  user_agent  TEXT,
  logged_at   TEXT DEFAULT (datetime('now', 'localtime'))
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_shift_entries_emp_date ON shift_entries(emp_id, date);
CREATE INDEX IF NOT EXISTS idx_shift_entries_date ON shift_entries(date);
CREATE INDEX IF NOT EXISTS idx_sales_records_emp_date ON sales_records(emp_id, date);
CREATE INDEX IF NOT EXISTS idx_sales_records_period ON sales_records(period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_bad_events_emp ON bad_events(emp_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time ON login_attempts(ip, failed_at);
