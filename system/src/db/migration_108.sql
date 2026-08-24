-- ===================================================
-- migration_108: AI売上分析 — 気象庁データ取込用テーブル
--   対象: 東京（気象庁 prec_no=44 / block_no=47662）の日別実況データ
--   用途: 暦要因別営収分析に「雨天」「猛暑日」「冬日」を追加するため
-- ===================================================

CREATE TABLE IF NOT EXISTS weather_daily (
  date             TEXT PRIMARY KEY,   -- YYYY-MM-DD
  precipitation_mm REAL,               -- 日降水量合計(mm)。データなし(--)はNULL
  max_temp_c       REAL,               -- 最高気温(℃)
  min_temp_c       REAL,               -- 最低気温(℃)
  weather_day      TEXT,               -- 天気概況（昼 06:00-18:00）
  weather_night    TEXT,               -- 天気概況（夜 18:00-翌06:00）
  imported_at      TEXT DEFAULT (datetime('now', 'localtime'))
);
