-- migration_109: 定期点検表 — 車両使用不可期間の注記
--   代替等で車両が長期間使えない期間を、日ごとの点検予定とは別に記録する
--   画面表示のみ（印刷帳票には反映しない）
CREATE TABLE IF NOT EXISTS inspection_unavailable (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  year_month  TEXT NOT NULL,  -- 'YYYYMM' 例: '202609'
  ka          INTEGER NOT NULL CHECK(ka BETWEEN 1 AND 4),
  vehicle_num TEXT NOT NULL,
  start_day   INTEGER NOT NULL CHECK(start_day BETWEEN 1 AND 31),
  end_day     INTEGER NOT NULL CHECK(end_day BETWEEN 1 AND 31),
  memo        TEXT,
  created_at  TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at  TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_inspection_unavailable_ym_ka
  ON inspection_unavailable(year_month, ka);
