-- ===================================================
-- migration_053: 枠(スロット)の月度をまたぐ同一性を追跡するslot_key
--   枠設定・担当者変更・社員管理照合での編集を、既に存在する将来の月度へ
--   自動伝播するために使う（意図的に変更しない限り同じ設定を使い続ける）。
--   新規に枠を作る際に生成し、月度コピー時(ensureKanchoPeriod)はそのまま引き継ぐ。
--   既存データは一度きりのバックフィル処理（前月度との構造一致を辿る）で
--   同一slot_keyを割り当てる。
-- ===================================================
ALTER TABLE kancho_members ADD COLUMN slot_key TEXT;
CREATE INDEX IF NOT EXISTS idx_kancho_members_slot_key ON kancho_members(slot_key);
