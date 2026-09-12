-- ===================================================
-- migration_135: 新人紹介カードに社員番号を紐づけ
-- 板橋ページ（イベント申し込み / ご意見ばん / アンケート）で、新人本人が
-- 社員番号を入力したとき「自己PRタイム」として一言コメント（新人紹介モニター表示用）を
-- 自分で入力できるようにするための、社員との紐づけ列。
-- 課は班から Math.ceil(team/2) で算出するため保存しない（feedback_division_team_mapping）
-- ===================================================

ALTER TABLE newcomer_intros ADD COLUMN emp_no TEXT;
CREATE INDEX IF NOT EXISTS idx_newcomer_intros_emp_no ON newcomer_intros (emp_no);
