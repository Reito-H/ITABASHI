-- ===================================================
-- migration_048: 班長シフト 当直禁忌ペア機能
--   新人班長フラグ（当直ペア自動禁止判定用。社員全体の「新人（研修中）」概念とは無関係）
--   と、相性等の個別理由で登録する禁忌ペアテーブルを追加。
-- ===================================================

ALTER TABLE kancho_members ADD COLUMN is_rookie INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS kancho_forbidden_pairs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id_a INTEGER NOT NULL REFERENCES kancho_members(id),
  member_id_b INTEGER NOT NULL REFERENCES kancho_members(id),
  reason      TEXT DEFAULT '',
  created_at  TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE(member_id_a, member_id_b)
);
