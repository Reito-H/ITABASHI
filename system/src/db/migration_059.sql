-- ===================================================
-- migration_059: 一般報告に「お客様からの着電」用の項目を追加
--   お客様名・電話番号を任意入力できるようにする。
-- ===================================================

ALTER TABLE general_reports ADD COLUMN customer_name  TEXT;
ALTER TABLE general_reports ADD COLUMN customer_phone TEXT;
