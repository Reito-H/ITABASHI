-- シフト編集ロック（同時編集防止）
CREATE TABLE IF NOT EXISTS shift_edit_locks (
  year       INTEGER NOT NULL,
  month      INTEGER NOT NULL,
  admin_id   INTEGER NOT NULL,
  admin_name TEXT NOT NULL,
  locked_at  TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (year, month)
);
