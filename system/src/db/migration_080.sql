-- 報告センター帳票印刷ページの「追加備考」を他の項目と同じく自動保存できるようにする
-- （これまでは画面上に入力しても保存先が無く、離脱すると消えていた）

ALTER TABLE lost_item_reports ADD COLUMN print_notes TEXT;
ALTER TABLE accident_reports ADD COLUMN print_notes TEXT;
ALTER TABLE violation_reports ADD COLUMN print_notes TEXT;
ALTER TABLE general_reports ADD COLUMN print_notes TEXT;
