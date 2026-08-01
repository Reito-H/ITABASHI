-- ===================================================
-- migration_046: 一般報告にタイトル・区間（どこからどこへ）を追加
--   タイトルは自由入力（例: 「社内汚損報告」等）。既存データはNULLのまま扱う。
--   区間は「移動系」の報告（例: 送迎・回送中の出来事）を想定し、出発地→到着地を分けて持つ。
-- ===================================================

ALTER TABLE general_reports ADD COLUMN title      TEXT;
ALTER TABLE general_reports ADD COLUMN route_from TEXT;
ALTER TABLE general_reports ADD COLUMN route_to   TEXT;
