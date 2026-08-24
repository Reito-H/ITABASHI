-- ===================================================
-- migration_106: ハッピーバースデーモード テスト発火に対象者選択を追加
-- ===================================================

ALTER TABLE birthday_test_triggers ADD COLUMN celebrant_ids TEXT;
