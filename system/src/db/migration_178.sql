-- ===================================================
-- migration_178: 星専用 引き継ぎシート
--   板橋1〜4課の引き継ぎシート（handover_sheets）とは完全に独立したデータ。
--   左列＝日次の引き継ぎ本文 / 右列＝時系列ToDo＋星のシフト＋予定メモの縦型カレンダー。
-- ===================================================

-- 日次の引き継ぎ本文（左列）
CREATE TABLE IF NOT EXISTS hoshi_sheets (
  date          TEXT PRIMARY KEY,              -- "YYYY-MM-DD"
  main_content  TEXT NOT NULL DEFAULT '',
  updated_at    TEXT DEFAULT (datetime('now', 'localtime')),
  updated_by    TEXT
);

-- 時系列ToDo（日付・時刻の早い順に表示。日付なしは末尾）
CREATE TABLE IF NOT EXISTS hoshi_todos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  due_date    TEXT,                            -- "YYYY-MM-DD"（NULL=日付なし）
  due_time    TEXT,                            -- "HH:MM"（NULL=時刻なし）
  content     TEXT NOT NULL DEFAULT '',
  done        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at  TEXT DEFAULT (datetime('now', 'localtime')),
  updated_by  TEXT
);
CREATE INDEX IF NOT EXISTS idx_hoshi_todos_due ON hoshi_todos(due_date, due_time);

-- 星のシフトの「引き継ぎシート内だけ」の上書き。班長シフト（kancho_shifts）には一切書き込まない。
-- 行が無い日は班長シフトの値をそのまま表示する。
CREATE TABLE IF NOT EXISTS hoshi_shift_overrides (
  date        TEXT PRIMARY KEY,
  code        TEXT NOT NULL DEFAULT '',        -- 空文字=「空欄」で上書き
  updated_at  TEXT DEFAULT (datetime('now', 'localtime')),
  updated_by  TEXT
);

-- 縦型カレンダーの予定メモ（1日1件の短いメモ）
CREATE TABLE IF NOT EXISTS hoshi_day_memos (
  date        TEXT PRIMARY KEY,
  content     TEXT NOT NULL DEFAULT '',
  updated_at  TEXT DEFAULT (datetime('now', 'localtime')),
  updated_by  TEXT
);
