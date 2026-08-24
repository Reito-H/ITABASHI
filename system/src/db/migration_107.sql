-- ===================================================
-- migration_107: 総合新人管理の改良
--   - employeesに新人登録フラグ・種別・新卒年度を追加し、既存社員は一括解除
--   - 嫌なこと報告機能(bad_events)を完全撤去
-- ===================================================

-- newcomer_type はアプリ側（api/employees.ts の PUT /:id/newcomer）で 'normal'|'shinsotsu' を検証する。
-- SQLiteの ALTER TABLE ADD COLUMN は CHECK制約を付けられないため、ここでは付与しない。
ALTER TABLE employees ADD COLUMN is_newcomer INTEGER DEFAULT 0;
ALTER TABLE employees ADD COLUMN newcomer_type TEXT;
ALTER TABLE employees ADD COLUMN graduate_year INTEGER;

UPDATE employees SET is_newcomer = 0, newcomer_type = NULL, graduate_year = NULL;

DROP TABLE IF EXISTS bad_events;
DELETE FROM notification_settings WHERE type = 'bad_event_alert';
