-- 動線収集（匿名）: 管理画面のページ遷移ログ。layout.ts の NAV_LOG_SCRIPT が送信し、
-- 設定 → 管理者項目 →「動線分析」(admin_nav_insights.ts) で集計する。
-- アカウントとは紐付けない（admin_id は持たない）。visit_id はタブごとの使い捨てID。
-- 保存期間は180日（cron.ts で古い行を削除）。
CREATE TABLE IF NOT EXISTS nav_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  visit_id   TEXT    NOT NULL,          -- タブごとの使い捨てID（1回の利用内の流れを追う用）
  seq        INTEGER NOT NULL,          -- そのタブ内で何ページ目か
  page       TEXT    NOT NULL,          -- 開いたページ（管理画面パス以下・数字IDは:idに置換・tabクエリのみ保持）
  title      TEXT,                      -- ページタイトル（集計画面の表示名）
  from_page  TEXT,                      -- 直前のページ（タブ内の最初のページはNULL）
  via        TEXT    NOT NULL,          -- 来た経路: sidebar / portal / header / page / back / reload / other / direct
  dwell_ms   INTEGER NOT NULL DEFAULT 0, -- 滞在時間（ページを離れる/タブを隠すまで。上限4時間）
  clicks     INTEGER NOT NULL DEFAULT 0, -- ページ内のクリック回数
  device     TEXT    NOT NULL DEFAULT 'pc', -- pc / sp
  created_at TEXT    NOT NULL DEFAULT (datetime('now','+9 hours'))  -- 日本時間（D1のlocaltimeはUTCのため明示）
);
CREATE INDEX IF NOT EXISTS idx_nav_events_created ON nav_events(created_at);
CREATE INDEX IF NOT EXISTS idx_nav_events_visit ON nav_events(visit_id, seq);
