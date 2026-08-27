-- migration_113: 勉強会募集 — 当日出席の消し込み（管理者が手動でチェック）
ALTER TABLE study_session_participants ADD COLUMN attended INTEGER NOT NULL DEFAULT 0;
