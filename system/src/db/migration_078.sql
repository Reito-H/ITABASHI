-- ===================================================
-- migration_078: Web内お知らせ（ベルマーク）に個人単位の削除（非表示）機能を追加
--   dismissed_at: 既読にした本人だけがベルの一覧から消せる（announcements本体・配信履歴・他アカウントの表示には影響しない）
-- ===================================================

ALTER TABLE admin_announcement_reads ADD COLUMN dismissed_at TEXT;
