-- ===================================================
-- migration_038: 報告対応履歴
--   忘れ物・事故・違反報告への操作（解決・再開・削除）を全て記録する。
--   削除された報告も「誰が・いつ・何を」消したかが残る。
-- ===================================================

CREATE TABLE IF NOT EXISTS report_action_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  report_kind TEXT NOT NULL,   -- 'lost_item' / 'accident' / 'violation'
  report_id   INTEGER NOT NULL,
  action      TEXT NOT NULL,   -- 'resolved' / 'reopened' / 'deleted'
  admin_name  TEXT NOT NULL,   -- 操作した管理画面アカウント名（サーバー側で確定）
  summary     TEXT,            -- 対象の概要スナップショット（削除後も内容がわかるように）
  created_at  TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_report_action_logs_kind_id
  ON report_action_logs (report_kind, report_id);
