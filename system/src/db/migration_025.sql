-- ===================================================
-- migration_025: ベンテンクラブ シフト管理
-- 旧Bentenシフト(Next.js+Firebase)の機能をD1に移植
-- 新ロール: benten_member / benten_shift_master（line_liff_users.role に追加。スキーマ変更不要）
-- ===================================================

-- グループ（シフト表の列グループ）
CREATE TABLE IF NOT EXISTS benten_groups (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  color         TEXT NOT NULL DEFAULT '#1e3a5f',
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT DEFAULT (datetime('now', 'localtime'))
);

-- シフト種別（スタンプ）
CREATE TABLE IF NOT EXISTS benten_shift_types (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT NOT NULL UNIQUE,          -- 例: "H", "D", "B", "休"
  label         TEXT NOT NULL,                 -- 例: "H勤"
  color         TEXT NOT NULL DEFAULT '#2563eb',  -- セル背景色
  text_color    TEXT NOT NULL DEFAULT '#ffffff',  -- セル文字色
  is_absent     INTEGER NOT NULL DEFAULT 0,    -- 1なら出勤者コメントに含めない
  triggers_ake  INTEGER NOT NULL DEFAULT 0,    -- 1なら翌日を自動で明けにする（会員のauto_akeと併用）
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT DEFAULT (datetime('now', 'localtime'))
);

-- 会員
CREATE TABLE IF NOT EXISTS benten_members (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  line_uid      TEXT UNIQUE,                   -- line_liff_users.line_uid と紐付け（NULL=未連携）
  name          TEXT NOT NULL,
  group_id      INTEGER REFERENCES benten_groups(id),
  is_indoor     INTEGER NOT NULL DEFAULT 0,    -- 内勤フラグ（シフト表で黄色列）
  auto_ake      INTEGER NOT NULL DEFAULT 0,    -- 明け自動設定フラグ
  display_order INTEGER NOT NULL DEFAULT 0,
  allowed_codes TEXT,                          -- 入力可能なシフト種別コードのJSON配列。NULL=全て可
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at    TEXT DEFAULT (datetime('now', 'localtime'))
);

-- シフト（1会員1日1件）
CREATE TABLE IF NOT EXISTS benten_shifts (
  member_id     INTEGER NOT NULL REFERENCES benten_members(id),
  date          TEXT NOT NULL,                 -- "YYYY-MM-DD"
  shift_type_id INTEGER REFERENCES benten_shift_types(id),  -- NULL=明け
  is_ake        INTEGER NOT NULL DEFAULT 0,
  input_by_uid  TEXT,
  updated_at    TEXT DEFAULT (datetime('now', 'localtime')),
  PRIMARY KEY (member_id, date)
);
CREATE INDEX IF NOT EXISTS idx_benten_shifts_date ON benten_shifts(date);

-- 表示期間（created_at降順で最新が適用中）
CREATE TABLE IF NOT EXISTS benten_schedule_ranges (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  label      TEXT NOT NULL,                    -- 例: "8月度予定"
  start_date TEXT NOT NULL,                    -- "YYYY-MM-DD"
  end_date   TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

-- ベンテン設定（LINEグループIDなどのkey-value）
CREATE TABLE IF NOT EXISTS benten_config (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TEXT DEFAULT (datetime('now', 'localtime'))
);

-- 日次LINE自動送信（既存cronの仕組みに載せる。初期は無効・管理画面から有効化）
-- ※ cronは毎時0分実行のため send_minute は 0 にすること
-- （migration_008未適用のローカル環境でも通るよう IF NOT EXISTS で定義）
CREATE TABLE IF NOT EXISTS notification_settings (
  type           TEXT PRIMARY KEY,
  send_hour      INTEGER NOT NULL DEFAULT 8,
  send_minute    INTEGER NOT NULL DEFAULT 0,
  is_enabled     INTEGER NOT NULL DEFAULT 1,
  last_sent_date TEXT,
  updated_at     TEXT DEFAULT (datetime('now', 'localtime'))
);
INSERT OR IGNORE INTO notification_settings (type, send_hour, send_minute, is_enabled) VALUES
  ('benten_shift_daily', 7, 0, 0);

-- デフォルトのシフト種別
INSERT OR IGNORE INTO benten_shift_types (code, label, color, text_color, is_absent, triggers_ake, display_order) VALUES
  ('H',  'H勤',  '#2563eb', '#ffffff', 0, 1, 1),
  ('D',  'D勤',  '#059669', '#ffffff', 0, 1, 2),
  ('B',  'B勤',  '#d97706', '#ffffff', 0, 1, 3),
  ('休', '公休', '#9ca3af', '#ffffff', 1, 0, 4),
  ('有', '有給', '#ec4899', '#ffffff', 1, 0, 5);
