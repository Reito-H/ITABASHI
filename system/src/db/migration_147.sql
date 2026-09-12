-- ===================================================
-- migration_147: ハッピーバースデーモード 発火時刻を「分単位」に対応
--
--   これまでは birthday_fire_hours（時のみ・0-23）で「毎時cronのその時刻に発火」だった。
--   分単位で指定したいという要望を受け、hour+minute のペアで持つ
--   birthday_fire_times を新設する。
--
--   ※ Cloudflare cron は毎時0分にしか回らないため、発火判定は
--     /api/birthday/active（クライアントが45秒ごとにポーリング）側で
--     「本日誕生日の対象者がいて、設定した時刻(hh:mm)を既に過ぎているか」を
--     その場で計算する方式に変更した。cron.ts 側の発火記録処理は廃止。
--     birthday_fire_events テーブルはもう使わないが、削除はせず残しておく。
-- ===================================================

CREATE TABLE IF NOT EXISTS birthday_fire_times (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  hour       INTEGER NOT NULL,            -- 0-23
  minute     INTEGER NOT NULL DEFAULT 0,  -- 0-59
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  UNIQUE(hour, minute)
);

-- 既存の発火時刻（時のみ）を「分=0」として引き継ぐ
INSERT OR IGNORE INTO birthday_fire_times (hour, minute)
  SELECT hour, 0 FROM birthday_fire_hours;
