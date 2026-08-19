-- ===================================================
-- migration_093: AI売上分析 — sales_records に日次の出庫・帰庫時刻を追加
-- CSVインポート（cols[7]出庫時刻・cols[8]帰庫時刻）はこれまで employees.start_time /
-- employees.avg_return_time への複数日平均・1人1件上書きにのみ使われていた。
-- 帰庫時間ランキング等の日次分析のため、行ごとの時刻も sales_records に保存する。
-- 過去分の遡及復元は行わない（今後のCSV取込分から蓄積）。
-- ===================================================

ALTER TABLE sales_records ADD COLUMN start_time TEXT;  -- 'HH:MM' 出庫時刻
ALTER TABLE sales_records ADD COLUMN return_time TEXT; -- 'HH:MM' 帰庫時刻
