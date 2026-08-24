-- ===================================================
-- migration_104: 退職者リスト（乗務員退職者名簿PDF取込）
--   ・employees.retirement_reason : 退職理由（PDFの「退社理由」列、空欄あり）
--   ・retiree_pdf_imports         : PDFアップロード履歴（監査ログ）
-- ===================================================

ALTER TABLE employees ADD COLUMN retirement_reason TEXT;

CREATE TABLE IF NOT EXISTS retiree_pdf_imports (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  file_name               TEXT,
  divisions               TEXT,
  matched_count           INTEGER DEFAULT 0,
  already_retired_count   INTEGER DEFAULT 0,
  unmatched_count         INTEGER DEFAULT 0,
  detail_json             TEXT,
  imported_by             TEXT,
  created_at              TEXT DEFAULT (datetime('now', 'localtime'))
);
