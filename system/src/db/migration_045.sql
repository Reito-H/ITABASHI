-- ===================================================
-- migration_045: 乗務員シフト（月間勤務予定表PDFのWeb化）+ 夏季稼働計画対実績
--   ・crew_shift_members  : PDFに載る乗務員名簿（emp_code=社員コードで一意）
--   ・crew_shift_types    : 勤務記号マスタ（隔勤=Ｈ/Ｄ/Ｂ・日勤=ａ/ｂ・公休・指定公休・内勤）
--       count_weight: 夏季稼働集計で1人あたりに数える重み（隔勤=1.0 / 日勤A・B=0.5 / それ以外=0）
--   ・crew_shifts          : 1メンバー1日1件（PDF取込 or 手修正）
--   ・crew_shift_imports   : PDFアップロード履歴（同一期間は上書き更新のログ）
--   ・crew_shift_edit_logs : 編集履歴
--   ・summer_report_periods/daily : 「夏季稼働・有給予定入力」Excelの再現。
--       見込み行（日勤A/B・隔勤）はcrew_shiftsから毎回自動計算するため保存しない。
--       実績・有給予定・前年実績など、PDFから読み取れない値のみ手入力欄として保持。
-- ===================================================

CREATE TABLE IF NOT EXISTS crew_shift_members (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  emp_code    TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  car_no      TEXT,
  division    TEXT NOT NULL DEFAULT '板橋2課',
  team        INTEGER NOT NULL,
  is_active   INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at  TEXT DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX IF NOT EXISTS idx_crew_shift_members_team ON crew_shift_members(division, team);

CREATE TABLE IF NOT EXISTS crew_shift_types (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT NOT NULL UNIQUE,
  label         TEXT NOT NULL DEFAULT '',
  color         TEXT NOT NULL DEFAULT '#e5e7eb',
  category      TEXT NOT NULL DEFAULT 'other',  -- kakukin / nikkin_a / nikkin_b / off / other
  count_weight  REAL NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_active     INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS crew_shifts (
  member_id   INTEGER NOT NULL REFERENCES crew_shift_members(id),
  date        TEXT NOT NULL,                    -- "YYYY-MM-DD"
  code        TEXT NOT NULL,
  updated_at  TEXT DEFAULT (datetime('now', 'localtime')),
  updated_by  TEXT,                             -- 管理者ユーザー名 or 'pdf-import'
  PRIMARY KEY (member_id, date)
);
CREATE INDEX IF NOT EXISTS idx_crew_shifts_date ON crew_shifts(date);

CREATE TABLE IF NOT EXISTS crew_shift_imports (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  division      TEXT NOT NULL,
  team          INTEGER,                        -- NULL = PDF内の複数班をまとめて取込
  start_date    TEXT NOT NULL,
  end_date      TEXT NOT NULL,
  file_name     TEXT,
  member_count  INTEGER DEFAULT 0,
  cell_count    INTEGER DEFAULT 0,
  imported_by   TEXT,
  created_at    TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS crew_shift_edit_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id    INTEGER,
  admin_name  TEXT NOT NULL DEFAULT '',
  action      TEXT NOT NULL,                    -- shift / import / member
  target      TEXT NOT NULL DEFAULT '',
  date        TEXT,
  old_value   TEXT,
  new_value   TEXT,
  created_at  TEXT DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX IF NOT EXISTS idx_crew_shift_logs_created ON crew_shift_edit_logs(created_at);

CREATE TABLE IF NOT EXISTS summer_report_periods (
  id                          INTEGER PRIMARY KEY AUTOINCREMENT,
  fiscal_year                 INTEGER NOT NULL,
  division                    TEXT NOT NULL DEFAULT '板橋2課',
  start_date                  TEXT NOT NULL,
  end_date                    TEXT NOT NULL,
  vehicle_count               INTEGER DEFAULT 0,   -- 台数（休車・特殊要因除）
  target_paid_users           INTEGER,             -- 有給予定※対象期間の取得者人数
  working_headcount_forecast  INTEGER,             -- 月末見込実働人員
  input_name                  TEXT DEFAULT '',
  updated_at                  TEXT DEFAULT (datetime('now', 'localtime')),
  UNIQUE (fiscal_year, division)
);

CREATE TABLE IF NOT EXISTS summer_report_daily (
  period_id               INTEGER NOT NULL REFERENCES summer_report_periods(id),
  date                    TEXT NOT NULL,
  nikkin_a_actual         REAL,
  nikkin_b_actual         REAL,
  kakukin_actual          REAL,
  paid_leave_planned_days REAL,
  paid_leave_actual_days  REAL,
  last_year_nikkin_a      REAL,
  last_year_nikkin_b      REAL,
  last_year_kakukin       REAL,
  PRIMARY KEY (period_id, date)
);

-- 記号マスタ初期データ（PDFの記号に準拠。Ｈ/Ｄ/Ｂは隔勤のローテーション班で色分けのみ用途が異なる）
INSERT OR IGNORE INTO crew_shift_types (code, label, color, category, count_weight, sort_order) VALUES
  ('Ｈ', '隔勤（H番）', '#c7d2fe', 'kakukin',  1.0, 10),
  ('Ｄ', '隔勤（D番）', '#a5b4fc', 'kakukin',  1.0, 11),
  ('Ｂ', '隔勤（B番）', '#93c5fd', 'kakukin',  1.0, 12),
  ('ａ', '日勤Ａ',      '#bbf7d0', 'nikkin_a', 0.5, 20),
  ('ｂ', '日勤Ｂ',      '#86efac', 'nikkin_b', 0.5, 21),
  ('公', '公休',        '#e5e7eb', 'off',      0,   30),
  ('指', '指定公休',    '#e9d5ff', 'off',      0,   31),
  ('内', '内勤',        '#fde68a', 'other',    0,   40);
