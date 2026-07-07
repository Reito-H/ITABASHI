-- migration_018: 報告対応者情報の追加
ALTER TABLE lost_item_reports ADD COLUMN resolved_by_uid  TEXT;
ALTER TABLE lost_item_reports ADD COLUMN resolved_by_name TEXT;
ALTER TABLE lost_item_reports ADD COLUMN resolved_at      TEXT;

ALTER TABLE accident_reports ADD COLUMN resolved_by_uid  TEXT;
ALTER TABLE accident_reports ADD COLUMN resolved_by_name TEXT;
ALTER TABLE accident_reports ADD COLUMN resolved_at      TEXT;
