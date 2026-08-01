-- ===================================================
-- migration_058: 引き継ぎシート（課ごとの日次引き継ぎ）
--   板橋1〜4課、1日1枚。旧スタンドアロンアプリ「引き継ぎくん」
--   （hikitsugi.bentenclub.com）の構成・区画を踏襲して
--   ホシコン本体の機能として統合。データは新規開始（旧アプリの
--   D1データは移行しない）。班は使わず課単位のみ。
-- ===================================================
CREATE TABLE IF NOT EXISTS handover_sheets (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  division       INTEGER NOT NULL CHECK(division BETWEEN 1 AND 4),  -- 課(1〜4)
  date           TEXT NOT NULL,                     -- YYYY-MM-DD
  kabu_yotei     REAL,                               -- 稼働予定
  kabu_jisseki   REAL,                               -- 稼働実績
  douta          TEXT NOT NULL DEFAULT '未',         -- 動態 未/⭕
  main_content   TEXT NOT NULL DEFAULT '',           -- メイン引き継ぎ
  toka_content   TEXT NOT NULL DEFAULT '',           -- 当欠・理由
  jiko_content   TEXT NOT NULL DEFAULT '',           -- 事故車（contenteditable由来のHTML）
  tenken_content TEXT NOT NULL DEFAULT '',           -- 点検・車検・リコール（contenteditable由来のHTML）
  joshu_content  TEXT NOT NULL DEFAULT '',           -- 車両異常・修理予定（contenteditable由来のHTML）
  jomu_content   TEXT NOT NULL DEFAULT '',           -- 乗務希望
  updated_at     TEXT,
  updated_by     TEXT,
  UNIQUE (division, date)
);
CREATE INDEX IF NOT EXISTS idx_handover_sheets_date ON handover_sheets(date);

CREATE TABLE IF NOT EXISTS handover_edit_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id    INTEGER,
  admin_name  TEXT NOT NULL DEFAULT '',
  action      TEXT NOT NULL,       -- save / delete / next
  division    INTEGER,
  date        TEXT,
  created_at  TEXT DEFAULT (datetime('now', 'localtime'))
);
