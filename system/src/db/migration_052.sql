-- ===================================================
-- migration_052: 班長シフト グレー反映を行基準に変更
--   前任者リンク(prev_member_id、人単位)は廃止し、同じsection/team_color/
--   role/sort_orderの「行」で自動照合する方式に一本化する。
-- ===================================================

ALTER TABLE kancho_members DROP COLUMN prev_member_id;
