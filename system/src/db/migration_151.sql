-- ===================================================
-- migration_151: マニュアルモード機能の廃止
-- 管理画面のフローティング・クイックリンクバー機能を丸ごと削除したため、
-- migration_127 で作成したテーブルを削除する。
-- ===================================================

DROP TABLE IF EXISTS manual_mode_slots;
DROP TABLE IF EXISTS manual_mode_profiles;
