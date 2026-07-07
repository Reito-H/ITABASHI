-- migration_022: 点検スケジュール管理テーブル
CREATE TABLE IF NOT EXISTS inspection_schedules (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  year_month  TEXT NOT NULL,  -- 'YYYYMM' 例: '202407'
  ka          INTEGER NOT NULL CHECK(ka BETWEEN 1 AND 4),
  day         INTEGER NOT NULL CHECK(day BETWEEN 1 AND 31),
  han         INTEGER NOT NULL CHECK(han BETWEEN 1 AND 2),
  vehicle_num TEXT NOT NULL,
  type        TEXT NOT NULL CHECK(type IN ('inspect', 'shaken', 'bomb', 'sub', 'recall')),
  dep_time    TEXT,
  created_at  TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at  TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_inspection_ym_ka
  ON inspection_schedules(year_month, ka);

CREATE INDEX IF NOT EXISTS idx_inspection_ym_day
  ON inspection_schedules(year_month, day);
