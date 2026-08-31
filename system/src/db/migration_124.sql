-- ===================================================
-- migration_124: 管理者公休予定表（2026年度版レイアウト）
--
--   既存の「班長シフト」(kancho_*) とは別の新機能。サイドバー「管理者公休表」。
--   元Excel: 「2026年度・管理者公休予定表.xlsx」の月度シート＋別シート2枚を再現する。
--
--   月度 = 前月11日〜当月10日（固定。班長シフトや税務の月度設定 period_settings とは無関係）
--   ページ  : /{SECRET}/admin/kanri-kobo（グリッド）  /kanri-kobo/print（印刷用）
--   API     : /{SECRET}/admin/api/kanri-kobo/*（編集系は kanri-kobo.edit が必要）
--   権限キー: kanri-kobo（閲覧） / kanri-kobo.edit（編集）
--     ・専用ログインアカウントは作らない。フル権限(admins.permissions IS NULL)は自動で閲覧＋編集可。
--     ・既存の制限アカウントは kanri-kobo 未付与なので既定では非表示（サイドバーに出ない）。
--
--   ブロック(kk_members.block):
--     kanai = 課内職員（○/公/指公 中心）
--     kanri = 管理者（○/公/指公/直/明/有 ＋ ア/土日/祝 集計あり）
--     job   = JOB当月 / JOB次月（2行固定運用を想定）
--     sub2  = ②職員（加藤・小林・安藤・髙橋。○のみ）
-- ===================================================

-- 名簿（月度ごとに独立。新しい月度は「前月度から複製」ボタンでコピーする）
CREATE TABLE IF NOT EXISTS kk_members (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  year        INTEGER NOT NULL,
  month       INTEGER NOT NULL,
  block       TEXT NOT NULL,                 -- kanai / kanri / job / sub2
  name        TEXT NOT NULL,
  abbr        TEXT,                          -- アサヒ担当行の略称照合用（例: 神﨑→神）。空なら名前の先頭1字
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT DEFAULT (datetime('now','localtime')),
  updated_at  TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_kk_members_period ON kk_members(year, month);

-- 記号マスタ（月度共通。テキスト保存なのでマスタ削除後もセル表示は残る）
CREATE TABLE IF NOT EXISTS kk_shift_types (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  code           TEXT NOT NULL UNIQUE,
  label          TEXT NOT NULL DEFAULT '',
  color          TEXT NOT NULL DEFAULT '#e5e7eb',
  counts_as_work INTEGER NOT NULL DEFAULT 0,  -- 出勤列に加算（○有特不直明早）
  counts_as_off  INTEGER NOT NULL DEFAULT 0,  -- 公休列に加算（公）
  is_shitei      INTEGER NOT NULL DEFAULT 0,  -- 指公列に加算（指公）
  sort_order     INTEGER NOT NULL DEFAULT 0,
  is_active      INTEGER NOT NULL DEFAULT 1
);

-- セル（1メンバー1日1件）
CREATE TABLE IF NOT EXISTS kk_cells (
  member_id   INTEGER NOT NULL REFERENCES kk_members(id),
  date        TEXT NOT NULL,                 -- "YYYY-MM-DD"
  code        TEXT NOT NULL,
  updated_at  TEXT DEFAULT (datetime('now','localtime')),
  updated_by  TEXT,
  PRIMARY KEY (member_id, date)
);
CREATE INDEX IF NOT EXISTS idx_kk_cells_date ON kk_cells(date);

-- アサヒ担当（1日1名。元Excelの「アサヒ」行）
CREATE TABLE IF NOT EXISTS kk_asahi (
  year   INTEGER NOT NULL,
  month  INTEGER NOT NULL,
  date   TEXT NOT NULL,
  name   TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (year, month, date)
);

-- 日別イベント注記（元Excelの最下段の日付別メモ行）
CREATE TABLE IF NOT EXISTS kk_day_notes (
  year    INTEGER NOT NULL,
  month   INTEGER NOT NULL,
  date    TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (year, month, date)
);

-- 月度メモ
--   kind: 'note'（特記事項・複数行1件） / 'holidays'（祝日の日付。JSON配列 ["YYYY-MM-DD",...]）
--         / 'toitsu_rotation'（当直回数シートのローテ順テキスト・1件）
CREATE TABLE IF NOT EXISTS kk_memos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  year       INTEGER NOT NULL,
  month      INTEGER NOT NULL,
  kind       TEXT NOT NULL,
  content    TEXT NOT NULL DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_kk_memos_period ON kk_memos(year, month);

-- 土日責任者シート（月度内の各日について種別ごとに担当者）
--   kind: 'resp'=土日責任者 / 'akake'=当直明け担当 / 'chinshime'=賃締フラグ(name='1')
CREATE TABLE IF NOT EXISTS kk_weekend_resp (
  year   INTEGER NOT NULL,
  month  INTEGER NOT NULL,
  date   TEXT NOT NULL,
  kind   TEXT NOT NULL,
  name   TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (year, month, date, kind)
);

-- 当直回数シート（人 × 年月マトリクス。年度をまたぐ集計表なので月度縛りなし）
--   ym: "YYYY-MM"。特別行として "prev"（前年度合計）を許容する
CREATE TABLE IF NOT EXISTS kk_toitsu_counts (
  person     TEXT NOT NULL,
  ym         TEXT NOT NULL,
  cnt        INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (person, ym)
);

-- 編集履歴
CREATE TABLE IF NOT EXISTS kk_edit_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_name  TEXT NOT NULL DEFAULT '',
  action      TEXT NOT NULL,                 -- cell / member / type / asahi / daynote / memo / weekend / toitsu / import
  target      TEXT NOT NULL DEFAULT '',
  date        TEXT,
  old_value   TEXT,
  new_value   TEXT,
  created_at  TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_kk_logs_created ON kk_edit_logs(created_at);

-- 記号マスタ初期データ（元Excelの実データに出現する記号から）
INSERT OR IGNORE INTO kk_shift_types (code, label, color, counts_as_work, counts_as_off, is_shitei, sort_order) VALUES
  ('○',   '出勤',                  '#ffffff', 1, 0, 0, 10),
  ('公',   '公休',                  '#e5e7eb', 0, 1, 0, 20),
  ('指公', '指定公休',              '#e9d5ff', 0, 0, 1, 30),
  ('有',   '有給休暇',              '#bbf7d0', 1, 0, 0, 40),
  ('直',   '当直',                  '#c7d2fe', 1, 0, 0, 50),
  ('明',   '当直明け',              '#bfdbfe', 1, 0, 0, 60),
  ('不',   '出勤扱い（営業所不在）', '#fde68a', 1, 0, 0, 70),
  ('特',   '特別休暇',              '#fed7aa', 1, 0, 0, 80),
  ('早',   '早出',                  '#fecaca', 1, 0, 0, 90),
  ('講',   '講習',                  '#ddd6fe', 0, 0, 0, 100),
  ('祝',   '祝日',                  '#fef08a', 0, 0, 0, 110);
