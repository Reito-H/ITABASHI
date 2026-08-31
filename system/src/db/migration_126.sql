-- ===================================================
-- migration_126: 調整機能（調整さん風の日程調整）
--
--   設定トップ「調整」カード → 専用サブページ /{SECRET}/admin/settings/chosei
--   管理者が「調整」を作成すると 32桁トークン付きの共有URLが1本だけ発行される。
--   回答者は共有URLを開き、社員番号を入力（employees と照合）して
--   各日程候補に ○(o)/△(t)/×(x) とコメントを1件登録する（再回答は上書き）。
--
--   共有URL  : {CHOSEI_PATH}/<token>          （接頭辞は config.ts の CHOSEI_PATH）
--   公開API  : /api/public/chosei/<token>/*    （認証なし・社員番号照合のみ）
--   管理API  : /{SECRET}/admin/api/chosei/*    （権限: settings.chosei / .edit）
--   権限キー : settings.chosei（閲覧） / settings.chosei.edit（編集）
--     ・専用ログインアカウントは作らない。フル権限(admins.permissions IS NULL)は自動で閲覧＋編集可。
--
--   study_sessions 系テーブルとは一切共有しない完全新規テーブル。
-- ===================================================

-- 調整本体（1件 = 1共有URL）
CREATE TABLE IF NOT EXISTS chosei_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  token        TEXT NOT NULL UNIQUE,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  contact_name TEXT NOT NULL DEFAULT '',
  is_closed    INTEGER NOT NULL DEFAULT 0,      -- 1 = 手動で受付終了
  created_by   TEXT NOT NULL DEFAULT '',        -- 作成した管理アカウント名
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 日程候補（自由記入の行）
CREATE TABLE IF NOT EXISTS chosei_options (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id   INTEGER NOT NULL REFERENCES chosei_events(id),
  label      TEXT NOT NULL,                     -- 例: "7/1(火) 19:00〜"
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_chosei_options_event ON chosei_options(event_id, sort_order);

-- 回答者（1調整 × 1社員番号で upsert）
CREATE TABLE IF NOT EXISTS chosei_responses (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id   INTEGER NOT NULL REFERENCES chosei_events(id),
  emp_no     TEXT NOT NULL,
  name       TEXT NOT NULL DEFAULT '',          -- 回答時点の employees.name を控える
  comment    TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE(event_id, emp_no)
);
CREATE INDEX IF NOT EXISTS idx_chosei_responses_event ON chosei_responses(event_id);

-- 各候補への回答（○/△/×）
CREATE TABLE IF NOT EXISTS chosei_answers (
  response_id INTEGER NOT NULL REFERENCES chosei_responses(id),
  option_id   INTEGER NOT NULL REFERENCES chosei_options(id),
  mark        TEXT NOT NULL DEFAULT 'x',        -- o=○ / t=△ / x=×
  PRIMARY KEY (response_id, option_id)
);
