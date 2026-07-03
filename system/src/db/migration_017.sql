-- フォームセッション（ワンタイムURL認証）
CREATE TABLE IF NOT EXISTS form_sessions (
  token      TEXT PRIMARY KEY,
  line_uid   TEXT NOT NULL,
  form_type  TEXT NOT NULL, -- 'lost-item' / 'accident'
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);
