-- ===================================================
-- migration_131: アンケート回答を「1社員1回答（上書き）」に
--
--   これまで survey_responses は何度でも追加できたが、今後は
--   同じアンケート × 同じ社員番号は1件だけ（再送信は上書き）にする。
--   （DB制約は既存の重複データで貼れないため、アプリ側で upsert する）
--   再訪時に前回の回答をフォームへ復元するため、更新時刻を持たせる。
-- ===================================================

ALTER TABLE survey_responses ADD COLUMN updated_at TEXT;
UPDATE survey_responses SET updated_at = created_at WHERE updated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_survey_responses_emp ON survey_responses(survey_id, emp_no);
