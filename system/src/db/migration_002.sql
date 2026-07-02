-- migration_002: birth_date 追加 + スキーマ不整合の補完
-- 既存DBに対して実行すること（新規DBはschema.sqlで自動作成）

ALTER TABLE employees ADD COLUMN birth_date TEXT;
ALTER TABLE employees ADD COLUMN status TEXT DEFAULT 'training' CHECK(status IN ('training', 'completed', 'unassigned'));
ALTER TABLE employees ADD COLUMN interview_target INTEGER DEFAULT 0;
ALTER TABLE employees ADD COLUMN training_completed INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS login_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ip          TEXT,
  country     TEXT,
  city        TEXT,
  latitude    TEXT,
  longitude   TEXT,
  timezone    TEXT,
  user_agent  TEXT,
  logged_at   TEXT DEFAULT (datetime('now', 'localtime'))
);
