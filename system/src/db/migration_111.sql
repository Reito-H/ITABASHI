-- migration_111: 勉強会募集 — 参加取り消し・キャンセル回数によるペナルティ
--   cancel_count は直近のキャンセル回数（10回でペナルティ発動時に0へリセット）。
--   penalty_until が今日以降の間は新規申し込みを拒否する（キャンセル自体は制限しない）。
CREATE TABLE IF NOT EXISTS study_session_penalties (
  emp_no        TEXT PRIMARY KEY,
  cancel_count  INTEGER NOT NULL DEFAULT 0,
  penalty_until TEXT,
  updated_at    TEXT DEFAULT (datetime('now', 'localtime'))
);
