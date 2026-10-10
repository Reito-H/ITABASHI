-- ===================================================
-- migration_181: ITABASHI BATTLE 2 — 新卒一人ひとりの記録をホシコンに残す
--   ib2_answers に「その時点の問題文・本人の答え・正解・結果」を丸ごと保存する列を足す
--   （あとで問題を直したり消したりしても、当日の記録はそのまま残る）。
--   correct: 1=正解 / 0=不正解 / 2=入賞（ピタリ賞の2〜3位など）/ -1=正誤なし（投票・質問箱）
--   voided : 1=リセットで無効にした記録（消さずに残す。記録画面には出さない）
--   これまでの記録（リハーサル分）は voided=1 にして、本番の記録と混ざらないようにする。
-- ===================================================
ALTER TABLE ib2_answers ADD COLUMN kind TEXT NOT NULL DEFAULT '';
ALTER TABLE ib2_answers ADD COLUMN step_title TEXT NOT NULL DEFAULT '';
ALTER TABLE ib2_answers ADD COLUMN name TEXT NOT NULL DEFAULT '';
ALTER TABLE ib2_answers ADD COLUMN prompt TEXT NOT NULL DEFAULT '';
ALTER TABLE ib2_answers ADD COLUMN answer_label TEXT NOT NULL DEFAULT '';
ALTER TABLE ib2_answers ADD COLUMN correct_label TEXT NOT NULL DEFAULT '';
ALTER TABLE ib2_answers ADD COLUMN note TEXT NOT NULL DEFAULT '';
ALTER TABLE ib2_answers ADD COLUMN likes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ib2_answers ADD COLUMN picked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ib2_answers ADD COLUMN voided INTEGER NOT NULL DEFAULT 0;
UPDATE ib2_answers SET voided = 1;
CREATE INDEX IF NOT EXISTS idx_ib2_answers_emp ON ib2_answers(emp_no);
