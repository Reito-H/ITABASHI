-- Benten管理システム: 社員管理拡張フィールド追加
ALTER TABLE employees ADD COLUMN work_schedule TEXT;
ALTER TABLE employees ADD COLUMN start_time TEXT;
ALTER TABLE employees ADD COLUMN car_no TEXT;
ALTER TABLE employees ADD COLUMN enrollment_status TEXT NOT NULL DEFAULT '通常';
ALTER TABLE employees ADD COLUMN work_hours_type TEXT;
ALTER TABLE employees ADD COLUMN is_caution INTEGER NOT NULL DEFAULT 0;
ALTER TABLE employees ADD COLUMN is_sales_followup INTEGER NOT NULL DEFAULT 0;
ALTER TABLE employees ADD COLUMN problem_notes TEXT;
ALTER TABLE employees ADD COLUMN retirement_date TEXT;
