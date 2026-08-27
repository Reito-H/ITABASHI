-- migration_110: 勉強会募集
--   紙ベースで募っていた勉強会の参加登録を、専用URL/QR経由の掲示板形式に置き換える。
--   1勉強会=単一日時。複数の勉強会が並び、参加者は社員番号入力後に一覧から選んで参加登録する。
--   定員は capacity（0=無制限）で、残数はAPI側で都度算出する（自動締切は保存せず判定のみ）。
--   is_closed は管理者による早期の手動締切用。
CREATE TABLE IF NOT EXISTS study_sessions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT NOT NULL,
  date          TEXT NOT NULL,   -- 'YYYY-MM-DD'
  start_time    TEXT,            -- 'HH:MM'
  end_time      TEXT,            -- 'HH:MM'
  location      TEXT,            -- 集合場所
  contact_name  TEXT,            -- 担当
  capacity      INTEGER NOT NULL DEFAULT 0 CHECK(capacity >= 0),
  note          TEXT,
  is_closed     INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at    TEXT DEFAULT (datetime('now', 'localtime'))
);

-- 同一勉強会への再登録は上書き更新のみ許可（重複レコードを作らない）
CREATE TABLE IF NOT EXISTS study_session_participants (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  INTEGER NOT NULL REFERENCES study_sessions(id),
  emp_no      TEXT NOT NULL,
  created_at  TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at  TEXT DEFAULT (datetime('now', 'localtime')),
  UNIQUE(session_id, emp_no)
);

CREATE INDEX IF NOT EXISTS idx_study_sessions_date ON study_sessions(date);
CREATE INDEX IF NOT EXISTS idx_study_session_participants_session ON study_session_participants(session_id);
