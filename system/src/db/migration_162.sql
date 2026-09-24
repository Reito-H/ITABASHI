-- ===================================================
-- migration_162: 引き継ぎシート専用「CM」ポップアップ（新機能の宣伝告知）
--   車両管理機能・当欠「＋」登録機能の利用促進のため、管理者が指定した時刻(1日複数回)に
--   引き継ぎシート画面だけへ固定文面のお知らせポップアップを表示する。
--   仕組みはハッピーバースデー（migration_147の birthday_fire_times）と同一:
--   「本日、設定時刻を過ぎたもののうち最新の1件」をクライアントがlocalStorageで
--   既読管理しながらポーリングして表示する。
-- ===================================================
CREATE TABLE IF NOT EXISTS cm_popup_fire_times (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  hour        INTEGER NOT NULL,
  minute      INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now', 'localtime')),
  UNIQUE(hour, minute)
);
