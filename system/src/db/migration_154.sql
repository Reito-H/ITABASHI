-- ===================================================
-- migration_154: 顔認証機能・adminログイン2段階認証（第二パスワード/バックアップコード含む）の全廃止
--
--   検証用スタンドアロンだった「顔認証」（/face-auth・/settings/face-auth）と、
--   それに相乗りする形で作った admin ログインの2段階認証（顔 / 第二パスワード / バックアップコード）
--   の仕組みを丸ごと撤去する。今後 admin もパスワードのみでログインする。
-- ===================================================

DROP TABLE IF EXISTS login_challenges;
DROP TABLE IF EXISTS admin_backup_codes;
DROP TABLE IF EXISTS admin_line_links;
DROP TABLE IF EXISTS face_auth_faces;

DELETE FROM system_settings WHERE key IN (
  'auth_gate_enabled',
  'auth_gate_threshold',
  'auth_gate_second_pw_hash'
);
