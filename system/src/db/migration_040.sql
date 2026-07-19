-- ===================================================
-- migration_040: 違反報告に場所・走行状況を追加
--   住所 / 進行方向（どこから→どこへ）/ 乗車状態（空車・実車・迎車）/
--   実車・迎車時の代車要請の要否
-- ===================================================

ALTER TABLE violation_reports ADD COLUMN location TEXT;           -- 住所（違反発生場所）
ALTER TABLE violation_reports ADD COLUMN travel_from TEXT;        -- どこから
ALTER TABLE violation_reports ADD COLUMN travel_to TEXT;          -- どこへ進行中
ALTER TABLE violation_reports ADD COLUMN car_status TEXT;         -- '空車' / '実車' / '迎車'
ALTER TABLE violation_reports ADD COLUMN substitute_needed INTEGER; -- 代車要請の要否（1=必要/0=不要。実車・迎車時のみ）
