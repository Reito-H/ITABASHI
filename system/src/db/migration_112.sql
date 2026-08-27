-- migration_112: 勉強会募集 — 対象者フィールド追加（ポスターに表示）
ALTER TABLE study_sessions ADD COLUMN target_audience TEXT;
