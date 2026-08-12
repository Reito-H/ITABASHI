-- ===================================================
-- migration_085: 事故報告帳票の「確認」「日付」欄を手書きサインではなく直接入力できるようにする
--   confirm_name: 確認者氏名、confirm_date: 確認日（帳票下部のサイン欄に対応）
-- ===================================================

ALTER TABLE accident_reports ADD COLUMN confirm_name TEXT;
ALTER TABLE accident_reports ADD COLUMN confirm_date TEXT;
