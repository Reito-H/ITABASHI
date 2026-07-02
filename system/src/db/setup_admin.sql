-- 管理者アカウント初期設定
-- パスワードは /admin/setup エンドポイントから設定すること

INSERT OR IGNORE INTO admins (username, password)
VALUES ('admin', 'CHANGE_ME_PLACEHOLDER');

-- 指導者データは管理画面（/admin/shift）から追加してください
-- 例:
-- INSERT OR IGNORE INTO instructors (name, role, sort_order) VALUES ('田中', '班長', 1);
-- INSERT OR IGNORE INTO instructors (name, role, sort_order) VALUES ('鈴木', 'コーチ', 2);
