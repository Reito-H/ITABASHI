-- ===================================================
-- migration_084: やることリストに「勤務種別ごとの勤務者チェックリスト」を追加
--   todo_worker_checks: その日その課で働く勤務者を勤務種別ごとに氏名検索で登録し、
--                        一人ずつ「やること完了」をチェックする。日付列で自然に日次リセットされる
--                        （todo_completions と同じ設計。work_type に共通マスタは無く自由入力）
-- ===================================================

CREATE TABLE IF NOT EXISTS todo_worker_checks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ka            INTEGER CHECK(ka BETWEEN 1 AND 4),  -- NULL = 当直
  date          TEXT NOT NULL,        -- YYYY-MM-DD
  work_type     TEXT NOT NULL,        -- 勤務種別ラベル（自由入力。例: 日勤A）
  employee_id   INTEGER REFERENCES employees(id),
  employee_name TEXT NOT NULL,        -- 追加時点の氏名スナップショット
  is_done       INTEGER NOT NULL DEFAULT 0,
  done_by       TEXT,
  done_at       TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_todo_worker_checks_date_ka ON todo_worker_checks(date, ka);
CREATE INDEX IF NOT EXISTS idx_todo_worker_checks_worktype ON todo_worker_checks(ka, work_type);
