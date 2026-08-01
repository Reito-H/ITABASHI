-- ===================================================
-- migration_060: 報告センターから「LINEを介さずブラウザで直接報告」できるようにする
--   reported_by_uid（LINE UID）に加えて、管理画面から直接登録した場合の
--   登録者（管理者アカウント名）を別カラムで持つ。両方NULLなら旧データ。
-- ===================================================

ALTER TABLE lost_item_reports  ADD COLUMN reported_by_admin TEXT;
ALTER TABLE accident_reports   ADD COLUMN reported_by_admin TEXT;
ALTER TABLE violation_reports  ADD COLUMN reported_by_admin TEXT;
ALTER TABLE general_reports    ADD COLUMN reported_by_admin TEXT;
