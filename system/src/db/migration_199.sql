-- ===================================================
-- migration_199: タクコン（TAXCON）CSV 自動連携
--   板橋PCの takcon-sync（共有フォルダ監視＋pull API）から、ホシコンが CSV を取りに行く方式。
--   ・takcon_sync_files : 取りに行った CSV 1件ごとの記録（元ファイルは R2 benten-documents の takcon/ 配下に保存）
--       status: queued（R2に保存済み・分割取込の途中）/ imported（取込済み）/ stored（保存のみ・取込未対応の種別）/ error（取込失敗。ack せず次回再試行）
--   ・takcon_sync_runs  : 実行ログ（cron 毎時＋手動「今すぐ取込」）
-- ===================================================
CREATE TABLE IF NOT EXISTS takcon_sync_files (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL UNIQUE,
  kind         TEXT NOT NULL,
  size         INTEGER,
  modified     TEXT,
  source       TEXT,
  r2_key       TEXT,
  status       TEXT NOT NULL,
  detail       TEXT,
  attempts     INTEGER NOT NULL DEFAULT 1,
  progress_line INTEGER NOT NULL DEFAULT 0,  -- 分割取込の進み（処理済み行数。ホシコン収集データ等の大きいCSV用）
  total_lines  INTEGER,
  fetched_at   TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at   TEXT DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX IF NOT EXISTS idx_takcon_files_status ON takcon_sync_files(status, fetched_at);

CREATE TABLE IF NOT EXISTS takcon_sync_runs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  trigger      TEXT NOT NULL,
  started_at   TEXT DEFAULT (datetime('now', 'localtime')),
  finished_at  TEXT,
  ok           INTEGER NOT NULL DEFAULT 0,
  pending      INTEGER,
  processed    INTEGER NOT NULL DEFAULT 0,
  imported     INTEGER NOT NULL DEFAULT 0,
  stored       INTEGER NOT NULL DEFAULT 0,
  errors       INTEGER NOT NULL DEFAULT 0,
  message      TEXT
);
