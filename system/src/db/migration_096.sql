-- ===================================================
-- migration_096: AI売上分析 — 最低賃金者判定
-- 実労働時間（拘束時間－休憩時間、ホシコン形式CSVのみ）と、
-- 賃金試算設定への基本給I（区分別・本採用額の概算）・最低賃金時給の追加。
-- 最低賃金時給の初期値は暫定値。必ず設定画面(/settings/wage-estimate)で
-- 現行の地域別最低賃金に修正すること。
-- ===================================================

ALTER TABLE sales_records ADD COLUMN labor_hours REAL; -- 実労働時間（拘束時間－休憩時間、時間単位）

ALTER TABLE wage_estimate_settings ADD COLUMN hiru_base_salary      INTEGER NOT NULL DEFAULT 6900;  -- 昼日勤務 基本給I（1乗務あたり・本採用額）
ALTER TABLE wage_estimate_settings ADD COLUMN yoru_base_salary      INTEGER NOT NULL DEFAULT 6900;  -- 夜日勤務 基本給I（1乗務あたり・本採用額）
ALTER TABLE wage_estimate_settings ADD COLUMN kakujitsu_base_salary INTEGER NOT NULL DEFAULT 13800; -- 隔日勤務 基本給I（1乗務あたり・本採用額）
ALTER TABLE wage_estimate_settings ADD COLUMN minimum_wage_hourly   INTEGER NOT NULL DEFAULT 1200;  -- 最低賃金時給（暫定値。必ず現行法定額に更新すること）
