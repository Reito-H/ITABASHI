-- ===================================================
-- migration_123: 定額タクシーを複数目的地対応にする（羽田／成田／ディズニー）
--
--   migration_122 で作った airport_flat_fares / airport_flat_notes を
--   目的地(destination)ごとに持てるよう作り替える。
--     destination: 'haneda'（羽田空港）/ 'narita'（成田空港）/ 'tdr'（東京ディズニーリゾート）
--   ページは /benri/airport のまま。目的地は画面上のボタンで切替（全目的地を一度に読み込む）。
--
--   ★このマイグレーションはテーブル作り替えを含むため「1回だけ」実行する。
--     途中で失敗した場合は D1 が自動でロールバックするので、原因を直して再実行すること。
--
--   閲覧は全管理画面アカウント共通（index.ts でページ権限チェックを免除）、
--   編集はフル権限アカウント（admins.permissions IS NULL）のみ。
--   初期データは km（国際自動車）各定額タクシー公式ページ（2026-04時点）より転記。改定されうるため要照合。
--   成田の「港区 台場地区 / 品川区 東八潮地区」の別料金（¥21,000）は地図に描けないため注記で補足する。
-- ===================================================

-- ---- airport_flat_fares を (destination, area_key) 複合主キーに作り替え ----
DROP TABLE IF EXISTS airport_flat_fares_old;
ALTER TABLE airport_flat_fares RENAME TO airport_flat_fares_old;

CREATE TABLE airport_flat_fares (
  destination         TEXT NOT NULL DEFAULT 'haneda',  -- 'haneda' | 'narita' | 'tdr'
  area_key            TEXT NOT NULL,                    -- JISコード(N03_007) 例 '13101'
  area_label          TEXT NOT NULL,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  is_excluded         INTEGER NOT NULL DEFAULT 0,       -- 1 = 定額対象外（メーター運賃）
  fare_day            INTEGER,
  fare_night          INTEGER,
  fare_day_disabled   INTEGER,
  fare_night_disabled INTEGER,
  updated_at          TEXT DEFAULT (datetime('now','localtime')),
  updated_by          TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (destination, area_key)
);

INSERT INTO airport_flat_fares
  (destination, area_key, area_label, sort_order, is_excluded, fare_day, fare_night, fare_day_disabled, fare_night_disabled, updated_at, updated_by)
SELECT 'haneda', area_key, area_label, sort_order, is_excluded, fare_day, fare_night, fare_day_disabled, fare_night_disabled, updated_at, updated_by
FROM airport_flat_fares_old;

DROP TABLE airport_flat_fares_old;

-- ---- airport_flat_notes に destination を追加（作り替え）----
DROP TABLE IF EXISTS airport_flat_notes_old;
ALTER TABLE airport_flat_notes RENAME TO airport_flat_notes_old;

CREATE TABLE airport_flat_notes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  destination TEXT NOT NULL DEFAULT 'haneda',
  body        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

INSERT INTO airport_flat_notes (destination, body, sort_order)
SELECT 'haneda', body, sort_order FROM airport_flat_notes_old;

DROP TABLE airport_flat_notes_old;

-- ================= 成田空港（narita） =================
-- 対象外なし（23区＋武蔵野・三鷹 全域）。港区/品川区は主料金（台場・東八潮を除く額）を採用。
INSERT INTO airport_flat_fares (destination, area_key, area_label, sort_order, is_excluded, fare_day, fare_night, fare_day_disabled, fare_night_disabled)
SELECT 'narita', column1, column2, column3, 0, column4, column5, column6, column7
FROM (VALUES
  ('13101', '千代田区',  1, 26000, 30000, 23400, 27000),
  ('13102', '中央区',    2, 26000, 30000, 23400, 27000),
  ('13103', '港区',      3, 28000, 33000, 25200, 29700),
  ('13104', '新宿区',    4, 28000, 33000, 25200, 29700),
  ('13105', '文京区',    5, 26000, 30000, 23400, 27000),
  ('13106', '台東区',    6, 26000, 30000, 23400, 27000),
  ('13107', '墨田区',    7, 21000, 25000, 18900, 22500),
  ('13108', '江東区',    8, 21000, 25000, 18900, 22500),
  ('13109', '品川区',    9, 28000, 33000, 25200, 29700),
  ('13110', '目黒区',   10, 28000, 33000, 25200, 29700),
  ('13111', '大田区',   11, 28000, 33000, 25200, 29700),
  ('13112', '世田谷区', 12, 30000, 36000, 27000, 32400),
  ('13113', '渋谷区',   13, 28000, 33000, 25200, 29700),
  ('13114', '中野区',   14, 30000, 36000, 27000, 32400),
  ('13115', '杉並区',   15, 30000, 36000, 27000, 32400),
  ('13116', '豊島区',   16, 28000, 33000, 25200, 29700),
  ('13117', '北区',     17, 28000, 33000, 25200, 29700),
  ('13118', '荒川区',   18, 26000, 30000, 23400, 27000),
  ('13119', '板橋区',   19, 30000, 36000, 27000, 32400),
  ('13120', '練馬区',   20, 30000, 36000, 27000, 32400),
  ('13121', '足立区',   21, 26000, 30000, 23400, 27000),
  ('13122', '葛飾区',   22, 21000, 25000, 18900, 22500),
  ('13123', '江戸川区', 23, 21000, 25000, 18900, 22500),
  ('13203', '武蔵野市', 24, 30000, 36000, 27000, 32400),
  ('13204', '三鷹市',   25, 30000, 36000, 27000, 32400)
) AS v
WHERE NOT EXISTS (SELECT 1 FROM airport_flat_fares WHERE destination = 'narita');

INSERT INTO airport_flat_notes (destination, body, sort_order)
SELECT 'narita', column1, column2
FROM (VALUES
  ('乗車地または降車地のいずれかが東京23区・武蔵野市・三鷹市の場合にご利用いただけます。', 1),
  ('港区の台場地区、品川区の東八潮地区は ¥21,000（深夜 ¥25,000／障がい者割引 昼¥18,900・深夜¥22,500）です。', 2),
  ('深夜料金（22:00〜翌5:00）は、運送の開始から終了までの時間がすべて深夜早朝時間帯に含まれる場合に適用されます。', 3),
  ('障がい者割引運賃は、ご乗車時に障がい者手帳またはそれに類するものをご提示いただく必要があります（運賃の1割引）。', 4),
  ('有料道路利用料・駐車料金等はお客さまのご負担となります。', 5),
  ('都内発は乗車の1時間以上前、成田空港発は3時間以上前までの事前予約が必要です。', 6)
) AS v
WHERE NOT EXISTS (SELECT 1 FROM airport_flat_notes WHERE destination = 'narita');

-- ================= 東京ディズニーリゾート（tdr） =================
-- 対象は西側12エリアのみ。東側13区は対象外。
INSERT INTO airport_flat_fares (destination, area_key, area_label, sort_order, is_excluded, fare_day, fare_night, fare_day_disabled, fare_night_disabled)
SELECT 'tdr', column1, column2, column3, 0, column4, column5, column6, column7
FROM (VALUES
  ('13104', '新宿区',    1,  9000, 10500,  8100,  9400),
  ('13110', '目黒区',    2,  9000, 10500,  8100,  9400),
  ('13112', '世田谷区',  3, 10000, 11500,  9000, 10300),
  ('13113', '渋谷区',    4,  9000, 10500,  8100,  9400),
  ('13114', '中野区',    5, 10000, 11500,  9000, 10300),
  ('13115', '杉並区',    6, 10000, 11500,  9000, 10300),
  ('13116', '豊島区',    7,  9000, 10500,  8100,  9400),
  ('13117', '北区',      8,  9000, 10500,  8100,  9400),
  ('13119', '板橋区',    9, 10000, 11500,  9000, 10300),
  ('13120', '練馬区',   10, 10000, 11500,  9000, 10300),
  ('13203', '武蔵野市', 11, 13500, 16000, 12100, 14400),
  ('13204', '三鷹市',   12, 13500, 16000, 12100, 14400)
) AS v
WHERE NOT EXISTS (SELECT 1 FROM airport_flat_fares WHERE destination = 'tdr');

INSERT INTO airport_flat_fares (destination, area_key, area_label, sort_order, is_excluded)
SELECT 'tdr', column1, column2, column3, 1
FROM (VALUES
  ('13101', '千代田区', 13),
  ('13102', '中央区',   14),
  ('13103', '港区',     15),
  ('13109', '品川区',   16),
  ('13105', '文京区',   17),
  ('13106', '台東区',   18),
  ('13107', '墨田区',   19),
  ('13108', '江東区',   20),
  ('13111', '大田区',   21),
  ('13118', '荒川区',   22),
  ('13121', '足立区',   23),
  ('13122', '葛飾区',   24),
  ('13123', '江戸川区', 25)
) AS v
WHERE NOT EXISTS (SELECT 1 FROM airport_flat_fares WHERE destination = 'tdr' AND area_key = v.column1);

INSERT INTO airport_flat_notes (destination, body, sort_order)
SELECT 'tdr', column1, column2
FROM (VALUES
  ('サービス対象エリアは、新宿区・目黒区・世田谷区・渋谷区・中野区・杉並区・豊島区・北区・板橋区・練馬区・武蔵野市・三鷹市です。', 1),
  ('千代田区・中央区・港区・品川区・文京区・台東区・墨田区・江東区・大田区・荒川区・足立区・葛飾区・江戸川区はサービス対象外です。', 2),
  ('深夜料金（22:00〜翌5:00）は、運送の開始から終了までの時間がすべて深夜早朝時間帯に含まれる場合に適用されます。', 3),
  ('障がい者割引運賃は、ご乗車時に障がい者手帳またはそれに類するもの（ミライロID等）をご提示いただく必要があります（運賃の1割引）。', 4),
  ('有料道路利用料・駐車料金等はお客さまのご負担となります。', 5),
  ('事前予約が必要です。', 6)
) AS v
WHERE NOT EXISTS (SELECT 1 FROM airport_flat_notes WHERE destination = 'tdr');
