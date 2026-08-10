-- ===================================================
-- migration_082: ドライバー報告
--   乗務社員についての気になる出来事（当欠・態度など）や個性・傾向を、日付ごとに記録する。
--   全権限アカウント（admins.permissions IS NULL）のみ閲覧・編集可（permissions.ts の
--   PATH_PERMISSIONS / PERMISSION_CATALOG に意図的に登録していない＝制限付きアカウントは
--   isPathAllowed で自動的に拒否される）。
-- ===================================================

CREATE TABLE IF NOT EXISTS driver_reports (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  emp_id           INTEGER NOT NULL REFERENCES employees(id),
  report_date      TEXT NOT NULL,
  category         TEXT NOT NULL DEFAULT 'その他' CHECK(category IN ('当欠', '態度・暴言', '苦情・トラブル', '個性・傾向', 'その他')),
  content          TEXT NOT NULL,
  created_by       INTEGER,
  created_by_name  TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_driver_reports_emp ON driver_reports(emp_id, report_date DESC);
CREATE INDEX IF NOT EXISTS idx_driver_reports_date ON driver_reports(report_date DESC);
