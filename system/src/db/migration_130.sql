-- ===================================================
-- migration_130: アンケートの対象者指定
--
--   アンケートごとに「全員」か「選択した社員のみ」を選べるようにする。
--   選択した社員のみの場合、その社員番号だけが公開一覧・回答フォーム・回答APIで
--   そのアンケートにアクセスできる。
--
--   surveys.target_all = 1（既定）… 全員が対象
--                      = 0        … survey_targets に載っている emp_no のみ対象
--   （target_all=0 で survey_targets が空 = 誰にも表示されない）
-- ===================================================

ALTER TABLE surveys ADD COLUMN target_all INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS survey_targets (
  survey_id INTEGER NOT NULL REFERENCES surveys(id),
  emp_no    TEXT NOT NULL,
  PRIMARY KEY (survey_id, emp_no)
);
CREATE INDEX IF NOT EXISTS idx_survey_targets_emp ON survey_targets(emp_no);
