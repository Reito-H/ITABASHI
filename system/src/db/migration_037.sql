-- ===================================================
-- migration_037: 班長シフト 「明」廃止 + 入力ボタン表示設定
--   ・「明」記号は使わない（非＝明け扱い）。既存データは非に変換して記号を削除
--   ・show_in_input: 入力モーダルのプリセットボタンに表示するかを記号ごとに設定可能に
-- ===================================================

ALTER TABLE kancho_shift_types ADD COLUMN show_in_input INTEGER NOT NULL DEFAULT 1;

UPDATE kancho_shifts SET code = '非' WHERE code = '明';
DELETE FROM kancho_shift_types WHERE code = '明';
