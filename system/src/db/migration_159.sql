-- ===================================================
-- migration_159: シーズナル演出
-- ハロウィン・クリスマス・イースター・年末年始カウントダウン・謹賀新年の各期間に、
-- 管理画面全ページ（デジタルサイネージの一覧/編集/投影/印刷ページを除く）へ
-- 控えめな背景演出（隅の飾り＋たまに流れる落ち葉/雪）を表示する。
-- 既定の期間はコード側（src/utils/seasonal_dates.ts）で計算する。
-- イースターは移動祝日のためアノニマス・グレゴリオ暦アルゴリズムで毎年算出する。
-- 管理者はイベントごとにON/OFFと、期間の手動上書き（月日のみ＝年をまたいで毎年繰り返し適用）ができる。
-- ===================================================

CREATE TABLE IF NOT EXISTS seasonal_events (
  event_key             TEXT PRIMARY KEY,  -- 'halloween' | 'christmas' | 'easter' | 'year_end_countdown' | 'new_year'
  is_enabled             INTEGER NOT NULL DEFAULT 1,
  override_start_month   INTEGER,  -- 1-12。NULLなら既定計算を使う
  override_start_day     INTEGER,  -- 1-31
  override_end_month     INTEGER,
  override_end_day       INTEGER,
  updated_at              TEXT DEFAULT (datetime('now', 'localtime'))
);

INSERT OR IGNORE INTO seasonal_events (event_key) VALUES
  ('halloween'), ('christmas'), ('easter'), ('year_end_countdown'), ('new_year');
