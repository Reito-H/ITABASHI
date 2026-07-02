-- migration_011: 班長・指導者に車番検索権限フラグを追加

ALTER TABLE instructors ADD COLUMN can_vehicle_search INTEGER NOT NULL DEFAULT 0;
