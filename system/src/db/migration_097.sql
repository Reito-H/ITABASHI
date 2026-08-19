-- ===================================================
-- migration_097: AI売上分析 — 公出閾値分割・深夜手当/残業手当の概算
-- 隔日勤務は月11乗務、日勤（昼日/夜日）は月22乗務を超えた部分が「公出」扱いとなり、
-- 成果手当は別の基準額表・歩合率で計算される（賃金規則PDFより確認）。
-- 深夜時間・残業時間はホシコン形式CSVのみ取得可能。
-- 服務手当・能率手当・残業の段階分け(25%/50%)・法定内外区分は省略した概算計算。
-- ===================================================

ALTER TABLE sales_records ADD COLUMN night_hours REAL;    -- 深夜時間
ALTER TABLE sales_records ADD COLUMN overtime_hours REAL; -- 残業時間

-- 公出（隔日11乗務・日勤22乗務を超えた部分）用の基準額・歩合率
-- 隔日勤務(火～金38,000円/土月34,000円/日祝30,500円・歩合率0.52)はPDFで確認済みの確定値。
-- 昼日・夜日はPDF読み取りに基づく暫定値のため、設定画面で必ず確認・修正すること。
ALTER TABLE wage_estimate_settings ADD COLUMN hiru_kokyu_weekday_base_amount      INTEGER NOT NULL DEFAULT 16100;
ALTER TABLE wage_estimate_settings ADD COLUMN hiru_kokyu_sat_mon_base_amount      INTEGER NOT NULL DEFAULT 14600;
ALTER TABLE wage_estimate_settings ADD COLUMN hiru_kokyu_holiday_base_amount      INTEGER NOT NULL DEFAULT 14600;
ALTER TABLE wage_estimate_settings ADD COLUMN hiru_kokyu_commission_rate         REAL    NOT NULL DEFAULT 0.46;
ALTER TABLE wage_estimate_settings ADD COLUMN yoru_kokyu_weekday_base_amount      INTEGER NOT NULL DEFAULT 22300;
ALTER TABLE wage_estimate_settings ADD COLUMN yoru_kokyu_sat_mon_base_amount      INTEGER NOT NULL DEFAULT 20200;
ALTER TABLE wage_estimate_settings ADD COLUMN yoru_kokyu_holiday_base_amount      INTEGER NOT NULL DEFAULT 18500;
ALTER TABLE wage_estimate_settings ADD COLUMN yoru_kokyu_commission_rate         REAL    NOT NULL DEFAULT 0.50;
ALTER TABLE wage_estimate_settings ADD COLUMN kakujitsu_kokyu_weekday_base_amount INTEGER NOT NULL DEFAULT 38000;
ALTER TABLE wage_estimate_settings ADD COLUMN kakujitsu_kokyu_sat_mon_base_amount INTEGER NOT NULL DEFAULT 34000;
ALTER TABLE wage_estimate_settings ADD COLUMN kakujitsu_kokyu_holiday_base_amount INTEGER NOT NULL DEFAULT 30500;
ALTER TABLE wage_estimate_settings ADD COLUMN kakujitsu_kokyu_commission_rate    REAL    NOT NULL DEFAULT 0.52;
