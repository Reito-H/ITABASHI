-- migration_120: シャトルバス時刻表
--   営業所 ⇄ 北赤羽駅 / 東武練馬駅 を1台のバスが連続で往復する時刻表。
--   画面(/admin/shuttle)で「時刻表どおりの推定現在位置」と次便を表示する。
--   閲覧は全アカウント、編集はフル権限アカウント(admins.permissions IS NULL)のみ（ルート側で判定）。
--   時刻は 'HH:MM'（24時間・ゼロ埋め）。目的地への到着時刻は元表に無いため depart_dest（折返発）を到着とみなす。
CREATE TABLE IF NOT EXISTS shuttle_trips (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  destination   TEXT NOT NULL,              -- '北赤羽駅' | '東武練馬駅'
  depart_office TEXT NOT NULL,              -- 営業所 発  'HH:MM'
  depart_dest   TEXT NOT NULL,              -- 折返（目的地）発  'HH:MM'  ※目的地着はこの時刻とみなす
  arrive_office TEXT NOT NULL,              -- 営業所 着  'HH:MM'
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 写真の時刻表（KM GROUP 2021.11/1〜）を初期投入。すでに1件でもあれば何もしない
INSERT INTO shuttle_trips (destination, depart_office, depart_dest, arrive_office)
SELECT column1, column2, column3, column4
FROM (VALUES
  ('北赤羽駅',  '05:40', '05:55', '06:10'),
  ('北赤羽駅',  '06:10', '06:25', '06:33'),
  ('東武練馬駅', '06:33', '06:45', '06:55'),
  ('北赤羽駅',  '07:00', '07:15', '07:30'),
  ('北赤羽駅',  '07:35', '07:45', '08:00'),
  ('北赤羽駅',  '08:05', '08:15', '08:30'),
  ('北赤羽駅',  '08:40', '08:50', '09:00'),
  ('北赤羽駅',  '09:00', '09:10', '09:20'),
  ('北赤羽駅',  '10:20', '10:35', '10:45'),
  ('北赤羽駅',  '10:55', '11:10', '11:20'),
  ('北赤羽駅',  '11:25', '11:35', '11:45'),
  ('北赤羽駅',  '12:00', '12:10', '12:20'),
  ('北赤羽駅',  '12:25', '12:35', '12:45'),
  ('東武練馬駅', '12:50', '13:00', '13:10'),
  ('北赤羽駅',  '13:10', '13:20', '13:30'),
  ('北赤羽駅',  '13:35', '13:45', '13:55'),
  ('北赤羽駅',  '14:10', '14:20', '14:30'),
  ('北赤羽駅',  '14:30', '14:45', '14:55'),
  ('東武練馬駅', '16:50', '17:00', '17:15'),
  ('北赤羽駅',  '17:15', '17:35', '17:45'),
  ('北赤羽駅',  '17:55', '18:10', '18:20')
) AS v
WHERE NOT EXISTS (SELECT 1 FROM shuttle_trips);
