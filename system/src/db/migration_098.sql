-- ===================================================
-- migration_098: 新人紹介カード（事故モニターサイネージへの表示用）
-- 課は班から Math.ceil(team/2) で算出するため保存しない（feedback_division_team_mapping）
-- ===================================================

CREATE TABLE newcomer_intros (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  team INTEGER,                    -- 班（1〜8）。未所属もありうるためNULL許容
  comment TEXT,                    -- 一言コメント
  photo_r2_key TEXT,
  photo_mime_type TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
