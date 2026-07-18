-- ===================================================
-- migration_031: 班長シフト（管理者公休予定表のWeb化）
--   + アカウント別権限の閲覧/編集分離（<key>.edit）
--   + 統括管理者・班長シフト管理者アカウント追加
-- ===================================================

-- 班長シフト メンバー名簿（社員マスタとは独立の専用名簿）
-- section: 'main'=班長シフト表 / 's1'=下段①表 / 's2'=下段②表
CREATE TABLE IF NOT EXISTS kancho_members (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  role        TEXT,                             -- 昼日勤班長 / 終業班長 / 教育班長 / 研修課出向 / 職員当直（mainのみ）
  section     TEXT NOT NULL DEFAULT 'main',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at  TEXT DEFAULT (datetime('now', 'localtime'))
);

-- シフト記号マスタ
-- section: 'main'=班長表用 / 'sub'=①②表用 / 'all'=両方
-- daily_required: 日別必要人数（遅=1・直=2 のチェック行に使用。0=チェックなし）
-- count_in_summary: 1なら右側の回数集計列に表示（公・直・遅）
CREATE TABLE IF NOT EXISTS kancho_shift_types (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  code             TEXT NOT NULL,
  label            TEXT NOT NULL DEFAULT '',    -- 凡例表示用（例: 当直 9:00〜27:00）
  color            TEXT NOT NULL DEFAULT '#e5e7eb',
  section          TEXT NOT NULL DEFAULT 'main',
  daily_required   INTEGER NOT NULL DEFAULT 0,
  count_in_summary INTEGER NOT NULL DEFAULT 0,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  is_active        INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT DEFAULT (datetime('now', 'localtime')),
  UNIQUE (code, section)
);

-- シフト（1メンバー1日1件。記号はテキスト保存＝マスタ削除後も表示が残る）
CREATE TABLE IF NOT EXISTS kancho_shifts (
  member_id   INTEGER NOT NULL REFERENCES kancho_members(id),
  date        TEXT NOT NULL,                    -- "YYYY-MM-DD"
  code        TEXT NOT NULL,
  updated_at  TEXT DEFAULT (datetime('now', 'localtime')),
  updated_by  TEXT,                             -- 管理者ユーザー名 or 'excel-import'
  PRIMARY KEY (member_id, date)
);
CREATE INDEX IF NOT EXISTS idx_kancho_shifts_date ON kancho_shifts(date);

-- 月度ごとのメモ（kind: 'tokki'=特記事項（1件・複数行） / 'kibou'=希望休（名前ごとに1件））
CREATE TABLE IF NOT EXISTS kancho_memos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  year        INTEGER NOT NULL,
  month       INTEGER NOT NULL,
  kind        TEXT NOT NULL,
  title       TEXT NOT NULL DEFAULT '',         -- kibou: 名前
  content     TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX IF NOT EXISTS idx_kancho_memos_period ON kancho_memos(year, month);

-- 編集履歴
CREATE TABLE IF NOT EXISTS kancho_edit_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id    INTEGER,
  admin_name  TEXT NOT NULL DEFAULT '',
  action      TEXT NOT NULL,                    -- shift / member / type / memo
  target      TEXT NOT NULL DEFAULT '',         -- メンバー名・記号など
  date        TEXT,                             -- shift変更の対象日
  old_value   TEXT,
  new_value   TEXT,
  created_at  TEXT DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX IF NOT EXISTS idx_kancho_logs_created ON kancho_edit_logs(created_at);

-- 記号マスタ初期データ（Excelの凡例に準拠）
INSERT OR IGNORE INTO kancho_shift_types (code, label, color, section, daily_required, count_in_summary, sort_order) VALUES
  ('公',   '公休',                    '#e5e7eb', 'all',  0, 1, 10),
  ('直',   '当直 9:00〜27:00',        '#c7d2fe', 'main', 2, 1, 20),
  ('非',   '非番',                    '#f9fafb', 'main', 0, 0, 30),
  ('遅',   '遅番 10:00〜19:00',       '#fde68a', 'main', 1, 1, 40),
  ('早',   '早番',                    '#bbf7d0', 'main', 0, 0, 50),
  ('明',   '明け',                    '#bfdbfe', 'main', 0, 0, 60),
  ('指公', '指定公休',                '#e9d5ff', 'all',  0, 0, 70),
  ('採',   '採用課出向',              '#fbcfe8', 'main', 0, 0, 80),
  ('夏',   '夏季休暇',                '#fed7aa', 'main', 0, 0, 90),
  ('M',    'M',                       '#fecaca', 'main', 0, 0, 100),
  ('○',   '出勤（責任者の日）',      '#f0fdf4', 'sub',  0, 0, 110);

-- ①②表メンバー初期データ（メイン表のメンバーはExcelインポートで登録）
INSERT OR IGNORE INTO kancho_members (name, role, section, sort_order) VALUES
  ('神﨑',   NULL, 's1', 10),
  ('𣘺本',   NULL, 's1', 20),
  ('鈴木',   NULL, 's1', 30),
  ('片岡',   NULL, 's1', 40),
  ('田中',   NULL, 's1', 50),
  ('小林',   NULL, 's2', 10),
  ('安藤',   NULL, 's2', 20),
  ('髙橋',   NULL, 's2', 30);

-- 既存の制限付きアカウントに <key>.edit を付与（従来の挙動を維持するためのバックフィル。
-- 以後、非GETリクエストには <key>.edit が必要になる）
UPDATE admins SET permissions = (
  SELECT json_group_array(v) FROM (
    SELECT value AS v FROM json_each(admins.permissions)
    UNION ALL
    SELECT value || '.edit' FROM json_each(admins.permissions) WHERE value NOT LIKE '%.edit'
  )
) WHERE permissions IS NOT NULL AND json_valid(permissions);

-- 統括管理者（全権限）・班長シフト管理者（班長シフトの閲覧＋編集のみ）
INSERT OR IGNORE INTO admins (username, password, permissions) VALUES
  ('toukatsu', 'v2:5e32c1465a0dc341017b8a7d81b1cbc4:4cdf0829f7cbab4795d85a7a288af136edcf2f0760250a65815e831ec92f54b6', NULL),
  ('kancho',   'v2:73113f1fa163854960f51dfb7ab60659:ddb25a78cae7989c53df6b9be6cc16d8a093e0729ff5b262b5a5bb8611804a51', '["kancho-shift","kancho-shift.edit"]');
