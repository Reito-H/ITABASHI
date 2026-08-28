-- migration_119: 労供上申書の「課長コメント」を社員ごとに保存し、次回出力時に流用する
--   前回と同じ社員の上申書を作るとき、前回入力した課長コメントを自動で引き継ぐ。
CREATE TABLE IF NOT EXISTS joshinsho_comments (
  emp_id      INTEGER PRIMARY KEY REFERENCES employees(id),
  comment     TEXT,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
