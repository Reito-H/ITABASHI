-- migration_019: 退職候補除外フラグ・班長フラグの追加
ALTER TABLE employees ADD COLUMN exclude_retirement_candidate INTEGER NOT NULL DEFAULT 0;
ALTER TABLE employees ADD COLUMN is_hanchyo INTEGER NOT NULL DEFAULT 0;
