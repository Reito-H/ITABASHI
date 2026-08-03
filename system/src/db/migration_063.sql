-- ===================================================
-- migration_063: サイドバー「要望欄」（ホシコン利用者からの要望・意見収集）
--   誰でも投稿できる要望フォームを追加し、収集結果は設定ページの
--   「要望欄（収集一覧）」からフル権限admin（permissions=NULL）のみ閲覧・対応できる。
-- ===================================================

CREATE TABLE IF NOT EXISTS feature_requests (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id    INTEGER NOT NULL REFERENCES admins(id),
  admin_name  TEXT NOT NULL,                      -- 投稿時のアカウント名スナップショット
  category    TEXT NOT NULL DEFAULT 'その他',      -- 機能追加 / 不具合 / 使いにくい点 / その他
  content     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT '未対応',      -- 未対応 / 確認済み / 対応済み
  created_at  TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at  TEXT DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX IF NOT EXISTS idx_feature_requests_admin ON feature_requests(admin_id);

-- 既存の制限付きアカウントにも「要望欄」をデフォルトで開放（誰でも投稿できるようにするため）
UPDATE admins SET permissions = (
  SELECT json_group_array(v) FROM (
    SELECT value AS v FROM json_each(admins.permissions)
    UNION ALL
    SELECT 'requests' WHERE NOT EXISTS (SELECT 1 FROM json_each(admins.permissions) WHERE value = 'requests')
    UNION ALL
    SELECT 'requests.edit' WHERE NOT EXISTS (SELECT 1 FROM json_each(admins.permissions) WHERE value = 'requests.edit')
  )
) WHERE permissions IS NOT NULL AND json_valid(permissions);
