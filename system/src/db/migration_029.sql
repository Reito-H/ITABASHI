-- ===================================================
-- migration_029: LINE利用状況ログ
-- Bot（webhook）とLIFF APIの利用を1イベント=1行で記録する。
-- 管理画面「LINE利用状況」（フル権限adminのみ）で集計表示する。
-- ===================================================

CREATE TABLE IF NOT EXISTS line_activity_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  line_uid   TEXT NOT NULL,
  channel    TEXT NOT NULL DEFAULT 'bot',  -- 'bot'=LINEトーク / 'liff'=LIFFアプリ
  event_type TEXT NOT NULL,                -- message / postback / follow / unfollow / api
  feature    TEXT,                         -- 車番検索 / 売上記録 / 忘れ物報告 など機能分類
  detail     TEXT,                         -- 入力テキスト・操作内容（先頭200文字）
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_line_activity_uid_created ON line_activity_logs(line_uid, created_at);
CREATE INDEX IF NOT EXISTS idx_line_activity_created ON line_activity_logs(created_at);
