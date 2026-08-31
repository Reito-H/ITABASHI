-- ===================================================
-- migration_127: マニュアルモード（ブラウザごとのフローティング・クイックリンクバー）
--
--   管理画面の全ページ下部中央に常時表示するフローティングバー。
--   すぐに開きたいページを最大 2行×10マス（=20個）まで登録し、
--   各マスは「1文字ラベル」で表示、クリックでそのページへ遷移する。
--
--   同じ管理アカウントを複数人で共有している運用があるため、マスの内容は
--   「登録者（プロフィール）」単位で持つ。どの登録者のバーを使うかは
--   設定ページ /{SECRET}/admin/settings/manual-mode で選び、その選択は
--   各ブラウザの localStorage（キー: mm_active_profile_id）に保存する。
--   「表示しない」選択も可能（その場合バーは出ない）。
--
--   ページ      : /{SECRET}/admin/settings/manual-mode   （権限: settings ＝設定を開ける人全員）
--   管理API     : /{SECRET}/admin/api/manual-mode/*       （同上・ページ権限で自動ガード）
--   表示用API   : /api/manual-mode/*                      （ログイン必須・ページ権限は免除）
--
--   既存の study_sessions 系・handover 系・その他機能とは一切テーブルを共有しない完全新規。
-- ===================================================

-- 登録者（プロフィール）。1人 = 1バー分のマス集合
CREATE TABLE IF NOT EXISTS manual_mode_profiles (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,                              -- 表示名（自由入力・重複可）
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- マス。position は 0..19（0-9=1行目, 10-19=2行目）。保存時に 0 から詰め直す
CREATE TABLE IF NOT EXISTS manual_mode_slots (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL REFERENCES manual_mode_profiles(id),
  position   INTEGER NOT NULL,
  label      TEXT NOT NULL,                              -- 1文字（バーに表示）
  title      TEXT NOT NULL DEFAULT '',                   -- ホバー時のフル名称
  href       TEXT NOT NULL,                              -- 遷移先（例: /{SECRET}/admin/handover）
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_mm_slots_profile ON manual_mode_slots(profile_id, position);
