-- ===================================================
-- migration_016_migrate: 既存連携者を line_liff_users に移行
-- 前提: migration_008 (instructors.line_uid) が適用済みであること
-- 本番環境で migration_016.sql 実行後に実行すること
-- ===================================================

-- instructors（LINE連携済み）→ 運行管理者
INSERT OR IGNORE INTO line_liff_users (line_uid, name, role, created_at)
SELECT line_uid, name, 'operations_manager', datetime('now', 'localtime')
FROM instructors WHERE line_uid IS NOT NULL AND line_uid != '';

-- vehicle_search_admins → 車番管理者
INSERT OR IGNORE INTO line_liff_users (line_uid, name, role, created_at)
SELECT line_uid, name, 'vehicle_manager', datetime('now', 'localtime')
FROM vehicle_search_admins WHERE line_uid IS NOT NULL AND line_uid != '';

-- line_users（新人）→ 新人（emp_idも引き継ぐ）
INSERT OR IGNORE INTO line_liff_users (line_uid, name, emp_id, role, created_at)
SELECT lu.line_uid, COALESCE(e.name, ''), lu.emp_id, 'newcomer', datetime('now', 'localtime')
FROM line_users lu LEFT JOIN employees e ON lu.emp_id = e.id;
