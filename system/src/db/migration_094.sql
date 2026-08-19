-- ===================================================
-- migration_094: AI売上分析 — 賃金試算設定（成果手当の概算計算用、単一行）
-- 昼日勤務(duty_code='a')・夜日勤務('b')・隔日勤務('B'/'D'/'H') の3区分ごとに
-- 曜日別基準額(火〜金/土・月/日祝)と歩合率を持つ。デフォルト値は賃金規則PDFの
-- 読み取りに基づく暫定値であり、設定画面(/settings/wage-estimate)で必ず確認・修正する。
-- 対象は成果手当（歩合部分）の概算のみ。基本給・残業/深夜/公出手当等は含まない。
-- ===================================================

CREATE TABLE IF NOT EXISTS wage_estimate_settings (
  id                            INTEGER PRIMARY KEY DEFAULT 1,
  -- 昼日勤務（duty_code='a'）
  hiru_weekday_base_amount      INTEGER NOT NULL DEFAULT 18600,
  hiru_sat_mon_base_amount      INTEGER NOT NULL DEFAULT 16600,
  hiru_holiday_base_amount      INTEGER NOT NULL DEFAULT 14600,
  hiru_commission_rate          REAL    NOT NULL DEFAULT 0.55,
  -- 夜日勤務（duty_code='b'）
  yoru_weekday_base_amount      INTEGER NOT NULL DEFAULT 26500,
  yoru_sat_mon_base_amount      INTEGER NOT NULL DEFAULT 24000,
  yoru_holiday_base_amount      INTEGER NOT NULL DEFAULT 22500,
  yoru_commission_rate          REAL    NOT NULL DEFAULT 0.58,
  -- 隔日勤務（duty_code='B'/'D'/'H'）
  kakujitsu_weekday_base_amount INTEGER NOT NULL DEFAULT 40200,
  kakujitsu_sat_mon_base_amount INTEGER NOT NULL DEFAULT 36200,
  kakujitsu_holiday_base_amount INTEGER NOT NULL DEFAULT 32900,
  kakujitsu_commission_rate     REAL    NOT NULL DEFAULT 0.53,
  -- あと1組試算用（実績客単価が算出できない場合のフォールバック値）
  assumed_fare_per_ride         INTEGER NOT NULL DEFAULT 3000,
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);
INSERT OR IGNORE INTO wage_estimate_settings (id) VALUES (1);
