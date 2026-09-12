-- ===================================================
-- migration_137: 乗務員証 証明写真 — 作業一式の一時保存（30日で自動削除）
--
--   課長ミッション「乗務員証 証明写真」ページで、追加した写真・切り取り設定・
--   人物（課/班/氏名）・出力設定をまとめて1件（バッチ）として保存できるようにする。
--   画像本体は R2（benten-id-photos / binding ID_PHOTO_BUCKET）に
--   キー "<batch_id>/<index>.jpg" で置く（1600px以内へ縮小した元画像）。
--   保存から30日で毎時cron（handleCron → purgeExpiredIdPhotoBatches）が
--   R2オブジェクトとこの行の両方を削除する。手動削除ボタンもあり。
--   既存機能とはテーブル・APIを共有しない完全新規（id_photo_*）。
-- ===================================================

CREATE TABLE IF NOT EXISTS id_photo_batches (
  id            TEXT PRIMARY KEY,                               -- ランダムトークン（R2キーのprefixにも使う）
  label         TEXT NOT NULL DEFAULT '',                       -- 保存名（利用者が付ける）
  photo_count   INTEGER NOT NULL DEFAULT 0,
  settings_json TEXT NOT NULL DEFAULT '{}',                     -- 出力設定（用紙・面付け・綴じ・写真寸法mm・顔mm・余白mm）
  photos_json   TEXT NOT NULL DEFAULT '[]',                     -- 各写真のメタ（切り取り cx/cy/boxH/rot/off/zoom/crownY/chinY・natW/natH・人物）
  created_by    INTEGER,                                        -- admin_users.id
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  expires_at    TEXT NOT NULL                                   -- ISO。これを過ぎたら purge 対象
);

CREATE INDEX IF NOT EXISTS idx_id_photo_batches_expires ON id_photo_batches(expires_at);
