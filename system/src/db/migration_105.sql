-- ===================================================
-- migration_105: ハッピーバースデーモード 表示対象アカウント選択 + テスト発火
-- ===================================================

-- 演出を表示するアカウント（ホワイトリスト）。ここに登録されたアカウントだけ実際の誕生日ポップアップが表示される
CREATE TABLE IF NOT EXISTS birthday_enabled_admins (
  admin_id   INTEGER PRIMARY KEY REFERENCES admins(id),
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

-- テスト発火。指定アカウントに対して1件だけ保留し、そのアカウントの次回ポーリングで日時に関わらず消費・表示される
CREATE TABLE IF NOT EXISTS birthday_test_triggers (
  admin_id   INTEGER PRIMARY KEY REFERENCES admins(id),
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);
