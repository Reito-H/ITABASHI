-- ===================================================
-- migration_142: admin（username='admin'）ログインの2段階認証
--   ・パスワードOKのあと、admin本人であることを「顔」または「スマホ(LINE)承認」で確認してから
--     セッションを発行する。カメラの無いPCは LINE承認、どちらも使えない時はバックアップコード。
--   ・締め出し防止のため、以下が全部そろって初めてゲートが有効になる（fail-open）:
--       auth_gate_enabled='1' かつ admin本人の顔登録あり かつ LINE連携済み かつ 未使用バックアップコードあり
--   ・緊急停止: 環境変数 AUTH_GATE_KILL_KEY を設定し
--       /{SECRET}/admin/login/verify/kill?key=... で auth_gate_enabled='0' に落とせる。
--   ・既存機能とはテーブル非共有の新規（login_challenges / admin_line_links / admin_backup_codes）。
-- ===================================================

-- 顔ベクトルを「どのadminアカウントが登録したか」で本人照合できるようにする（既存行はNULL）
ALTER TABLE face_auth_faces ADD COLUMN admin_id INTEGER;

-- adminアカウント ↔ 承認に使うLINEユーザーID
CREATE TABLE IF NOT EXISTS admin_line_links (
  admin_id     INTEGER PRIMARY KEY,
  line_user_id TEXT    NOT NULL,
  linked_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ログイン途中の「保留」状態（パスワードは通ったが第2要素待ち）。5分で失効。
CREATE TABLE IF NOT EXISTS login_challenges (
  token       TEXT    PRIMARY KEY,
  admin_id    INTEGER NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'pending',  -- pending | approved | consumed
  method      TEXT    NOT NULL DEFAULT '',         -- face | line | backup（成立した手段）
  face_tries  INTEGER NOT NULL DEFAULT 0,
  ip          TEXT    NOT NULL DEFAULT '',
  ua          TEXT    NOT NULL DEFAULT '',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  expires_at  TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_challenges_exp ON login_challenges(expires_at);

-- バックアップコード（発行時に平文を一度だけ表示。保存はハッシュのみ。1回使うと used_at が入る）
CREATE TABLE IF NOT EXISTS admin_backup_codes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id   INTEGER NOT NULL,
  code_hash  TEXT    NOT NULL,
  used_at    TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_admin_backup_codes_admin ON admin_backup_codes(admin_id);

-- ゲート設定（既定は無効・しきい値55%）
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('auth_gate_enabled', '0');
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('auth_gate_threshold', '55');
