-- migration_114: 勉強会募集 — 参加者からの要望（受けたい勉強会テーマなどのアンケート）
CREATE TABLE IF NOT EXISTS study_session_requests (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  emp_no      TEXT NOT NULL,
  content     TEXT NOT NULL,
  created_at  TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_study_session_requests_created ON study_session_requests(created_at);
