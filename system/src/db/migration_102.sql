-- ===================================================
-- migration_102: ハッピーバースデーモード
-- 一部の人だけを対象に、誕生日当日に全ページへ演出をポップアップ表示する機能。
-- 社員管理(employees)とは独立（一部の人だけ祝う想定のため専用テーブルで管理）。
-- ===================================================

-- お祝い対象者（名前・誕生日・顔写真）
CREATE TABLE IF NOT EXISTS birthday_celebrants (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  birth_month   INTEGER NOT NULL,  -- 1-12
  birth_day     INTEGER NOT NULL,  -- 1-31
  photo_r2_key  TEXT,
  photo_mime_type TEXT,
  is_active     INTEGER NOT NULL DEFAULT 1,  -- 0なら演出対象から外す（削除せず一時停止したい場合用）
  created_at    TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at    TEXT DEFAULT (datetime('now', 'localtime'))
);

-- 発火時刻（複数登録可＝「回数」を表す。1エントリ=1日1回、その時刻のcronで発火）
CREATE TABLE IF NOT EXISTS birthday_fire_hours (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  hour       INTEGER NOT NULL UNIQUE,  -- 0-23
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

-- 発火実績（cronが該当時刻に本日誕生日の対象者を見つけたら1行作成。クライアントはポーリングでこれを検知して演出を再生する）
CREATE TABLE IF NOT EXISTS birthday_fire_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  event_date    TEXT NOT NULL,
  hour          INTEGER NOT NULL,
  celebrant_ids TEXT NOT NULL,  -- JSON配列
  created_at    TEXT DEFAULT (datetime('now', 'localtime')),
  UNIQUE(event_date, hour)
);
