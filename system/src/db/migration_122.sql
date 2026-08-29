-- ===================================================
-- migration_122: 羽田空港定額タクシー エリア別運賃（便利ハブ「羽田空港定額」）
--
--   東京23区＋武蔵野市・三鷹市 について、羽田空港との定額運賃を
--     昼(5:00-22:00) / 深夜(22:00-翌5:00) × 通常 / 障がい者割引
--   の4値で持つ。地図（system/src/html/airport_map_paths.ts の SVG パス）を
--   金額でコロプレス色分けし、時間帯・障がい者割引で表示を切り替える。
--
--   閲覧は全管理画面アカウント共通（index.ts でページ権限チェックを免除）、
--   編集はフル権限アカウント（admins.permissions IS NULL）のみ許可する。
--
--   area_key は JISコード(N03_007)。airport_map_paths.ts の key と一致させること。
--   is_excluded = 1 は「定額対象外（メーター運賃）」。その場合 fare_* は NULL。
--   初期データは km（国際自動車）羽田空港定額タクシー公式ページ（2026-04時点）より転記。
--   金額は改定されうるため、公開後は原本との照合が必要。
-- ===================================================

CREATE TABLE IF NOT EXISTS airport_flat_fares (
  area_key            TEXT PRIMARY KEY,            -- JISコード(N03_007) 例 '13101'
  area_label          TEXT NOT NULL,               -- '千代田区'
  sort_order          INTEGER NOT NULL DEFAULT 0,
  is_excluded         INTEGER NOT NULL DEFAULT 0,  -- 1 = 定額対象外（メーター運賃）
  fare_day            INTEGER,                     -- 5:00-22:00 通常（円）
  fare_night          INTEGER,                     -- 22:00-翌5:00 深夜
  fare_day_disabled   INTEGER,                     -- 障がい者割引・昼
  fare_night_disabled INTEGER,                     -- 障がい者割引・深夜
  updated_at          TEXT DEFAULT (datetime('now','localtime')),
  updated_by          TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS airport_flat_notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  body       TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- 対象エリア（19）: 初期投入。既に1件でもあれば何もしない
INSERT INTO airport_flat_fares (area_key, area_label, sort_order, is_excluded, fare_day, fare_night, fare_day_disabled, fare_night_disabled)
SELECT column1, column2, column3, 0, column4, column5, column6, column7
FROM (VALUES
  ('13101', '千代田区',  1,  7600,  9000,  6800,  8100),
  ('13104', '新宿区',    2,  9000, 10700,  8100,  9600),
  ('13105', '文京区',    3,  9300, 10900,  8300,  9800),
  ('13106', '台東区',    4,  9100, 10800,  8100,  9700),
  ('13107', '墨田区',    5,  9100, 10700,  8100,  9600),
  ('13112', '世田谷区',  6,  8900, 10400,  8000,  9300),
  ('13113', '渋谷区',    7,  8500, 10000,  7600,  9000),
  ('13114', '中野区',    8,  9900, 11700,  8900, 10500),
  ('13115', '杉並区',    9, 10800, 12600,  9700, 11300),
  ('13116', '豊島区',   10, 11200, 13200, 10000, 11800),
  ('13117', '北区',     11, 11000, 13000,  9900, 11700),
  ('13118', '荒川区',   12, 10400, 12200,  9300, 10900),
  ('13119', '板橋区',   13, 12300, 14500, 11000, 13000),
  ('13120', '練馬区',   14, 12800, 15100, 11500, 13500),
  ('13121', '足立区',   15, 11100, 13100,  9900, 11700),
  ('13122', '葛飾区',   16, 11300, 13400, 10100, 12000),
  ('13123', '江戸川区', 17,  9000, 10500,  8100,  9400),
  ('13203', '武蔵野市', 18, 14000, 16500, 12600, 14800),
  ('13204', '三鷹市',   19, 13300, 15700, 11900, 14100)
) AS v
WHERE NOT EXISTS (SELECT 1 FROM airport_flat_fares);

-- 対象外エリア（6）: メーター運賃。fare_* は NULL
INSERT INTO airport_flat_fares (area_key, area_label, sort_order, is_excluded)
SELECT column1, column2, column3, 1
FROM (VALUES
  ('13103', '港区',   90),
  ('13102', '中央区', 91),
  ('13108', '江東区', 92),
  ('13109', '品川区', 93),
  ('13110', '目黒区', 94),
  ('13111', '大田区', 95)
) AS v
WHERE NOT EXISTS (SELECT 1 FROM airport_flat_fares WHERE area_key = v.column1);

-- 注記
INSERT INTO airport_flat_notes (body, sort_order)
SELECT column1, column2
FROM (VALUES
  ('対象外エリア（大田区・品川区・目黒区・港区・中央区・江東区）はメーター運賃となります。', 1),
  ('深夜料金（22:00〜翌5:00）は、運送の開始から終了までの時間がすべて深夜早朝時間帯に含まれる場合に適用されます。', 2),
  ('障がい者割引運賃は、ご乗車時に障がい者手帳またはそれに類するものをご提示いただく必要があります（運賃の1割引）。', 3),
  ('有料道路利用料・駐車料金等はお客さまのご負担となります。', 4),
  ('ご乗車の1時間以上前に事前のご予約が必要です。', 5)
) AS v
WHERE NOT EXISTS (SELECT 1 FROM airport_flat_notes);
