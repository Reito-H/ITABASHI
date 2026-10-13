-- ===================================================
-- migration_197: 配車コンソール（km-operator 新UIのホシコン組み込み）
--   km-operator への自動ログインで得たセッション（Cookie・X-CLTFT-Token・ログインユーザー情報）を
--   Worker 側で使い回すための保存先。1行だけ使う（id=1）。ブラウザには渡さない。
-- ===================================================
CREATE TABLE IF NOT EXISTS km_console_session (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  cookies TEXT NOT NULL DEFAULT '{}',
  token TEXT,
  user_json TEXT,
  logged_in_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);
