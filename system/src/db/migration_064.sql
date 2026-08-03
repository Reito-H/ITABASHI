-- migration_064: 高速道路料金計算（普通車・関東+群馬）
-- IC間料金を1件ずつ手入力するのではなく、IC/JCTをノード・区間をエッジとした
-- 道路網グラフとして持ち、NEXCO・首都高の公式距離比例計算式をアプリ側(toll_calc.ts)で
-- 再現する方式。テーブルは「路線マスタ」「ノード(IC/JCT)マスタ」「路線上のノード位置」
-- 「特例区間の固定/上書き料金」「見積もりログ」の5つ。

CREATE TABLE IF NOT EXISTS toll_roads (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,                          -- 例: '首都高5号池袋線', '関越自動車道'
  operator    TEXT NOT NULL,                           -- 'nexco_east' | 'nexco_central' | 'shutoko'
  rate_zone   TEXT NOT NULL DEFAULT 'standard',        -- 'standard' | 'metro'（NEXCO大都市近郊区間） | 'kenou'（圏央道。長距離逓減の対象外）
  formula     TEXT NOT NULL DEFAULT 'distance',        -- 'distance'(NEXCO系) | 'shutoko' | 'fixed'
  fixed_fare  INTEGER,                                 -- formula='fixed'の路線のみ使用（アクアライン等）
  fare_cap    INTEGER,                                 -- 区間限定利用時のみの上限料金（例: 中央道高井戸-八王子のETC630円）
  created_at  TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS toll_nodes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'ic',              -- 'ic' | 'jct'
  area_tag    TEXT,                                     -- 営業エリア(23区+三鷹+武蔵野)判定用の任意タグ
  created_at  TEXT DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX IF NOT EXISTS idx_toll_nodes_name ON toll_nodes(name);

-- 路線上でのノードの位置（起点からの距離km）。JCTは接続する路線数ぶん複数行を持つ
CREATE TABLE IF NOT EXISTS toll_road_points (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  road_id      INTEGER NOT NULL REFERENCES toll_roads(id),
  node_id      INTEGER NOT NULL REFERENCES toll_nodes(id),
  km_position  REAL NOT NULL,
  UNIQUE(road_id, node_id)
);
CREATE INDEX IF NOT EXISTS idx_toll_road_points_road ON toll_road_points(road_id);
CREATE INDEX IF NOT EXISTS idx_toll_road_points_node ON toll_road_points(node_id);

-- 特例区間（事業者をまたぐ乗継特例等、公式計算式では再現できない固定/上書き料金）
CREATE TABLE IF NOT EXISTS toll_overrides (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  from_node_id  INTEGER NOT NULL REFERENCES toll_nodes(id),
  to_node_id    INTEGER NOT NULL REFERENCES toll_nodes(id),
  fixed_fare    INTEGER NOT NULL,
  note          TEXT,
  created_at    TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS toll_calc_logs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id        INTEGER REFERENCES admins(id),
  from_node_id    INTEGER,
  to_node_id      INTEGER,
  distance_km     REAL,
  fare            INTEGER,
  night_discount  INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX IF NOT EXISTS idx_toll_calc_logs_admin ON toll_calc_logs(admin_id);

-- ============================================================
-- シードデータ（v1: 営業エリア(23区+三鷹+武蔵野)から関東主要路線＋関越道(群馬方面)まで）
-- 出典: NEXCO東日本公式「料金の額及び徴収期間の公告」、NEXCO中日本FAQ・公式ページ、
--       首都高速公式サイト、各路線の公開IC/JCT距離情報（要件定義時の調査に基づく）。
-- 注意点(既知の簡略化。将来より正確なデータに更新する際はこの点を踏まえること):
--   ・IC間距離は複数の情報源を突き合わせた概算値。10円単位の丸めがあるため実用上の影響は小さい想定。
--   ・京葉道路は本来ゾーン制(区間制)料金だが、v1ではNEXCO距離比例式(標準区間)で近似している。
--   ・アクアラインは平日ETC割引の800円固定のみ対応。土日祝の時間帯別料金は未対応。
--   ・首都高都心環状線(C1)は環状だが、ここでは環を閉じずに一本の鎖として登録している。
--   ・一部のJCT間距離(6号向島線の箱崎JCT、6号三郷線の三郷IC終端)は資料上の記載がなく推定値。
-- ============================================================

-- ===== 路線マスタ =====
INSERT INTO toll_roads (name, operator, rate_zone, formula, fixed_fare, fare_cap) VALUES
('首都高都心環状線',       'shutoko',      'standard', 'shutoko', NULL, NULL),
('首都高中央環状線',       'shutoko',      'standard', 'shutoko', NULL, NULL),
('首都高3号渋谷線',        'shutoko',      'standard', 'shutoko', NULL, NULL),
('首都高4号新宿線',        'shutoko',      'standard', 'shutoko', NULL, NULL),
('首都高5号池袋線',        'shutoko',      'standard', 'shutoko', NULL, NULL),
('首都高埼玉大宮線',       'shutoko',      'standard', 'shutoko', NULL, NULL),
('首都高川口線',           'shutoko',      'standard', 'shutoko', NULL, NULL),
('首都高6号向島線',        'shutoko',      'standard', 'shutoko', NULL, NULL),
('首都高6号三郷線',        'shutoko',      'standard', 'shutoko', NULL, NULL),
('首都高7号小松川線',      'shutoko',      'standard', 'shutoko', NULL, NULL),
('首都高9号深川線',        'shutoko',      'standard', 'shutoko', NULL, NULL),
('首都高1号羽田線',        'shutoko',      'standard', 'shutoko', NULL, NULL),
('首都高湾岸線',           'shutoko',      'standard', 'shutoko', NULL, NULL),
('東京外環自動車道',       'nexco_east',   'metro',    'distance', NULL, NULL),
('関越自動車道(近郊部)',   'nexco_east',   'metro',    'distance', NULL, NULL),
('関越自動車道(標準部)',   'nexco_east',   'standard', 'distance', NULL, NULL),
('東北自動車道(近郊部)',   'nexco_east',   'metro',    'distance', NULL, NULL),
('東北自動車道(標準部)',   'nexco_east',   'standard', 'distance', NULL, NULL),
('常磐自動車道(近郊部)',   'nexco_east',   'metro',    'distance', NULL, NULL),
('常磐自動車道(標準部)',   'nexco_east',   'standard', 'distance', NULL, NULL),
('東関東自動車道(起点部)', 'nexco_east',   'standard', 'distance', NULL, NULL),
('東関東自動車道(近郊部)', 'nexco_east',   'metro',    'distance', NULL, NULL),
('東関東自動車道(標準部)', 'nexco_east',   'standard', 'distance', NULL, NULL),
('中央自動車道(近郊部)',   'nexco_central','metro',    'distance', NULL, 630),
('中央自動車道(標準部)',   'nexco_central','standard', 'distance', NULL, NULL),
('圏央道',                 'nexco_east',   'kenou',    'distance', NULL, NULL),
('京葉道路',               'nexco_east',   'standard', 'distance', NULL, NULL),
('東京湾アクアライン連絡道', 'nexco_east', 'standard', 'fixed',    800,  NULL);

-- ===== ノード(IC/JCT)マスタ =====
INSERT INTO toll_nodes (name, kind) VALUES
('江戸橋JCT','jct'),('宝町出入口','ic'),('京橋JCT','jct'),('京橋出入口','ic'),('汐留JCT','jct'),
('浜崎橋JCT','jct'),('一ノ橋JCT','jct'),('谷町JCT','jct'),('三宅坂JCT','jct'),('竹橋JCT','jct'),('神田橋JCT','jct'),
('大井JCT','jct'),('五反田出入口','ic'),('大橋JCT','jct'),('西新宿JCT','jct'),('熊野町JCT','jct'),
('板橋JCT','jct'),('江北JCT','jct'),('小菅JCT','jct'),('堀切JCT','jct'),('小松川JCT','jct'),('葛西JCT','jct'),
('高樹町出入口','ic'),('渋谷出入口','ic'),('池尻出入口','ic'),('三軒茶屋出入口','ic'),('用賀出入口','ic'),
('外苑出入口','ic'),('代々木出入口','ic'),('新宿出入口','ic'),('高井戸IC','ic'),('初台出入口','ic'),('永福出入口','ic'),
('早稲田出口','ic'),('東池袋出入口','ic'),('高島平出入口','ic'),('戸田出入口','ic'),('美女木JCT','jct'),
('浦和南出入口','ic'),('浦和北出入口','ic'),('与野出入口','ic'),('与野JCT','jct'),
('加賀出入口','ic'),('新井宿出入口','ic'),('川口JCT','jct'),
('箱崎JCT','jct'),('両国JCT','jct'),('向島出入口','ic'),
('加平出入口','ic'),('八潮南出入口','ic'),('三郷出入口','ic'),('三郷IC','ic'),
('錦糸町出入口','ic'),('一之江出入口','ic'),
('福住出入口','ic'),('木場出入口','ic'),('塩浜入口','ic'),('辰巳JCT','jct'),
('芝浦JCT','jct'),('昭和島JCT','jct'),('羽田出入口','ic'),
('川崎浮島JCT','jct'),('東海JCT','jct'),('有明JCT','jct'),('東雲JCT','jct'),('高谷JCT','jct'),
('大泉JCT','jct'),('和光IC','ic'),('戸田西IC','ic'),('戸田東IC','ic'),('外環浦和IC','ic'),
('川口西IC','ic'),('川口中央IC','ic'),('川口東IC','ic'),('草加IC','ic'),('外環三郷西IC','ic'),
('三郷JCT','jct'),('三郷中央IC','ic'),('三郷南IC','ic'),
('所沢IC','ic'),('川越IC','ic'),('鶴ヶ島JCT','jct'),('東松山IC','ic'),
('花園IC','ic'),('本庄児玉IC','ic'),('高崎IC','ic'),('前橋IC','ic'),('渋川伊香保IC','ic'),('沼田IC','ic'),
('浦和IC','ic'),('岩槻IC','ic'),('久喜白岡JCT','jct'),('久喜IC','ic'),('加須IC','ic'),
('羽生IC','ic'),('館林IC','ic'),('佐野藤岡IC','ic'),('栃木IC','ic'),('鹿沼IC','ic'),('宇都宮IC','ic'),
('矢板IC','ic'),('西那須野塩原IC','ic'),('那須IC','ic'),
('流山IC','ic'),('柏IC','ic'),('谷和原IC','ic'),('谷田部IC','ic'),('つくばJCT','jct'),
('桜土浦IC','ic'),('土浦北IC','ic'),('千代田石岡IC','ic'),('岩間IC','ic'),('水戸IC','ic'),('那珂IC','ic'),('日立南太田IC','ic'),
('湾岸市川IC','ic'),('谷津船橋IC','ic'),('湾岸習志野IC','ic'),('湾岸千葉IC','ic'),('宮野木JCT','jct'),
('千葉北IC','ic'),('四街道IC','ic'),('佐倉IC','ic'),('酒々井IC','ic'),('成田IC','ic'),('成田JCT','jct'),
('大栄JCT','jct'),('大栄IC','ic'),('佐原香取IC','ic'),('潮来IC','ic'),
('調布IC','ic'),('国立府中IC','ic'),('八王子IC','ic'),('八王子JCT','jct'),
('相模湖IC','ic'),('上野原IC','ic'),('大月IC','ic'),('大月JCT','jct'),
('八王子西IC','ic'),('あきる野IC','ic'),('日の出IC','ic'),('青梅IC','ic'),('入間IC','ic'),('狭山日高IC','ic'),
('圏央鶴ヶ島IC','ic'),('坂戸IC','ic'),('川島IC','ic'),('桶川北本IC','ic'),('桶川加納IC','ic'),('白岡菖蒲IC','ic'),
('幸手IC','ic'),('五霞IC','ic'),('境古河IC','ic'),('坂東IC','ic'),('常総IC','ic'),
('つくば中央IC','ic'),('つくば牛久IC','ic'),('牛久阿見IC','ic'),('阿見東IC','ic'),
('稲敷IC','ic'),('稲敷東IC','ic'),('下総IC','ic'),
('千葉東JCT','jct'),('蘇我IC','ic'),('木更津金田IC','ic');

-- ===== 路線上のノード位置(km) =====

-- 首都高 都心環状線(C1)
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='首都高都心環状線'), (SELECT id FROM toll_nodes WHERE name='江戸橋JCT'), 0.2),
((SELECT id FROM toll_roads WHERE name='首都高都心環状線'), (SELECT id FROM toll_nodes WHERE name='宝町出入口'), 1.0),
((SELECT id FROM toll_roads WHERE name='首都高都心環状線'), (SELECT id FROM toll_nodes WHERE name='京橋JCT'), 1.2),
((SELECT id FROM toll_roads WHERE name='首都高都心環状線'), (SELECT id FROM toll_nodes WHERE name='京橋出入口'), 1.8),
((SELECT id FROM toll_roads WHERE name='首都高都心環状線'), (SELECT id FROM toll_nodes WHERE name='汐留JCT'), 3.6),
((SELECT id FROM toll_roads WHERE name='首都高都心環状線'), (SELECT id FROM toll_nodes WHERE name='浜崎橋JCT'), 4.5),
((SELECT id FROM toll_roads WHERE name='首都高都心環状線'), (SELECT id FROM toll_nodes WHERE name='一ノ橋JCT'), 6.8),
((SELECT id FROM toll_roads WHERE name='首都高都心環状線'), (SELECT id FROM toll_nodes WHERE name='谷町JCT'), 8.0),
((SELECT id FROM toll_roads WHERE name='首都高都心環状線'), (SELECT id FROM toll_nodes WHERE name='三宅坂JCT'), 10.4),
((SELECT id FROM toll_roads WHERE name='首都高都心環状線'), (SELECT id FROM toll_nodes WHERE name='竹橋JCT'), 12.5),
((SELECT id FROM toll_roads WHERE name='首都高都心環状線'), (SELECT id FROM toll_nodes WHERE name='神田橋JCT'), 13.5);

-- 首都高 中央環状線(C2)
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='首都高中央環状線'), (SELECT id FROM toll_nodes WHERE name='大井JCT'), 0.0),
((SELECT id FROM toll_roads WHERE name='首都高中央環状線'), (SELECT id FROM toll_nodes WHERE name='五反田出入口'), 6.0),
((SELECT id FROM toll_roads WHERE name='首都高中央環状線'), (SELECT id FROM toll_nodes WHERE name='大橋JCT'), 9.4),
((SELECT id FROM toll_roads WHERE name='首都高中央環状線'), (SELECT id FROM toll_nodes WHERE name='西新宿JCT'), 13.0),
((SELECT id FROM toll_roads WHERE name='首都高中央環状線'), (SELECT id FROM toll_nodes WHERE name='熊野町JCT'), 20.4),
((SELECT id FROM toll_roads WHERE name='首都高中央環状線'), (SELECT id FROM toll_nodes WHERE name='板橋JCT'), 21.4),
((SELECT id FROM toll_roads WHERE name='首都高中央環状線'), (SELECT id FROM toll_nodes WHERE name='江北JCT'), 27.9),
((SELECT id FROM toll_roads WHERE name='首都高中央環状線'), (SELECT id FROM toll_nodes WHERE name='小菅JCT'), 33.6),
((SELECT id FROM toll_roads WHERE name='首都高中央環状線'), (SELECT id FROM toll_nodes WHERE name='堀切JCT'), 34.8),
((SELECT id FROM toll_roads WHERE name='首都高中央環状線'), (SELECT id FROM toll_nodes WHERE name='小松川JCT'), 40.5),
((SELECT id FROM toll_roads WHERE name='首都高中央環状線'), (SELECT id FROM toll_nodes WHERE name='葛西JCT'), 46.9);

-- 首都高 3号渋谷線
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='首都高3号渋谷線'), (SELECT id FROM toll_nodes WHERE name='谷町JCT'), 0.0),
((SELECT id FROM toll_roads WHERE name='首都高3号渋谷線'), (SELECT id FROM toll_nodes WHERE name='高樹町出入口'), 1.7),
((SELECT id FROM toll_roads WHERE name='首都高3号渋谷線'), (SELECT id FROM toll_nodes WHERE name='渋谷出入口'), 3.2),
((SELECT id FROM toll_roads WHERE name='首都高3号渋谷線'), (SELECT id FROM toll_nodes WHERE name='大橋JCT'), 5.0),
((SELECT id FROM toll_roads WHERE name='首都高3号渋谷線'), (SELECT id FROM toll_nodes WHERE name='池尻出入口'), 5.6),
((SELECT id FROM toll_roads WHERE name='首都高3号渋谷線'), (SELECT id FROM toll_nodes WHERE name='三軒茶屋出入口'), 6.0),
((SELECT id FROM toll_roads WHERE name='首都高3号渋谷線'), (SELECT id FROM toll_nodes WHERE name='用賀出入口'), 11.7);

-- 首都高 4号新宿線
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='首都高4号新宿線'), (SELECT id FROM toll_nodes WHERE name='三宅坂JCT'), 0.0),
((SELECT id FROM toll_roads WHERE name='首都高4号新宿線'), (SELECT id FROM toll_nodes WHERE name='外苑出入口'), 2.5),
((SELECT id FROM toll_roads WHERE name='首都高4号新宿線'), (SELECT id FROM toll_nodes WHERE name='代々木出入口'), 4.7),
((SELECT id FROM toll_roads WHERE name='首都高4号新宿線'), (SELECT id FROM toll_nodes WHERE name='新宿出入口'), 5.5),
((SELECT id FROM toll_roads WHERE name='首都高4号新宿線'), (SELECT id FROM toll_nodes WHERE name='初台出入口'), 6.5),
((SELECT id FROM toll_roads WHERE name='首都高4号新宿線'), (SELECT id FROM toll_nodes WHERE name='永福出入口'), 9.9),
((SELECT id FROM toll_roads WHERE name='首都高4号新宿線'), (SELECT id FROM toll_nodes WHERE name='高井戸IC'), 12.4);

-- 首都高 5号池袋線
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='首都高5号池袋線'), (SELECT id FROM toll_nodes WHERE name='竹橋JCT'), 0.0),
((SELECT id FROM toll_roads WHERE name='首都高5号池袋線'), (SELECT id FROM toll_nodes WHERE name='早稲田出口'), 3.4),
((SELECT id FROM toll_roads WHERE name='首都高5号池袋線'), (SELECT id FROM toll_nodes WHERE name='東池袋出入口'), 6.2),
((SELECT id FROM toll_roads WHERE name='首都高5号池袋線'), (SELECT id FROM toll_nodes WHERE name='熊野町JCT'), 7.8),
((SELECT id FROM toll_roads WHERE name='首都高5号池袋線'), (SELECT id FROM toll_nodes WHERE name='板橋JCT'), 8.9),
((SELECT id FROM toll_roads WHERE name='首都高5号池袋線'), (SELECT id FROM toll_nodes WHERE name='高島平出入口'), 18.0),
((SELECT id FROM toll_roads WHERE name='首都高5号池袋線'), (SELECT id FROM toll_nodes WHERE name='戸田出入口'), 21.0),
((SELECT id FROM toll_roads WHERE name='首都高5号池袋線'), (SELECT id FROM toll_nodes WHERE name='美女木JCT'), 21.5);

-- 首都高 埼玉大宮線(S5)
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='首都高埼玉大宮線'), (SELECT id FROM toll_nodes WHERE name='美女木JCT'), 0.0),
((SELECT id FROM toll_roads WHERE name='首都高埼玉大宮線'), (SELECT id FROM toll_nodes WHERE name='浦和南出入口'), 1.5),
((SELECT id FROM toll_roads WHERE name='首都高埼玉大宮線'), (SELECT id FROM toll_nodes WHERE name='浦和北出入口'), 5.7),
((SELECT id FROM toll_roads WHERE name='首都高埼玉大宮線'), (SELECT id FROM toll_nodes WHERE name='与野出入口'), 7.8),
((SELECT id FROM toll_roads WHERE name='首都高埼玉大宮線'), (SELECT id FROM toll_nodes WHERE name='与野JCT'), 8.2);

-- 首都高 川口線(S1)
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='首都高川口線'), (SELECT id FROM toll_nodes WHERE name='江北JCT'), 0.0),
((SELECT id FROM toll_roads WHERE name='首都高川口線'), (SELECT id FROM toll_nodes WHERE name='加賀出入口'), 4.0),
((SELECT id FROM toll_roads WHERE name='首都高川口線'), (SELECT id FROM toll_nodes WHERE name='新井宿出入口'), 11.1),
((SELECT id FROM toll_roads WHERE name='首都高川口線'), (SELECT id FROM toll_nodes WHERE name='川口JCT'), 12.3);

-- 首都高 6号向島線
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='首都高6号向島線'), (SELECT id FROM toll_nodes WHERE name='江戸橋JCT'), 0.0),
((SELECT id FROM toll_roads WHERE name='首都高6号向島線'), (SELECT id FROM toll_nodes WHERE name='箱崎JCT'), 0.8),
((SELECT id FROM toll_roads WHERE name='首都高6号向島線'), (SELECT id FROM toll_nodes WHERE name='両国JCT'), 2.1),
((SELECT id FROM toll_roads WHERE name='首都高6号向島線'), (SELECT id FROM toll_nodes WHERE name='向島出入口'), 6.2),
((SELECT id FROM toll_roads WHERE name='首都高6号向島線'), (SELECT id FROM toll_nodes WHERE name='堀切JCT'), 9.5);

-- 首都高 6号三郷線
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='首都高6号三郷線'), (SELECT id FROM toll_nodes WHERE name='小菅JCT'), 0.0),
((SELECT id FROM toll_roads WHERE name='首都高6号三郷線'), (SELECT id FROM toll_nodes WHERE name='加平出入口'), 2.2),
((SELECT id FROM toll_roads WHERE name='首都高6号三郷線'), (SELECT id FROM toll_nodes WHERE name='八潮南出入口'), 5.2),
((SELECT id FROM toll_roads WHERE name='首都高6号三郷線'), (SELECT id FROM toll_nodes WHERE name='三郷出入口'), 10.2),
((SELECT id FROM toll_roads WHERE name='首都高6号三郷線'), (SELECT id FROM toll_nodes WHERE name='三郷IC'), 12.0);

-- 首都高 7号小松川線
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='首都高7号小松川線'), (SELECT id FROM toll_nodes WHERE name='両国JCT'), 0.0),
((SELECT id FROM toll_roads WHERE name='首都高7号小松川線'), (SELECT id FROM toll_nodes WHERE name='錦糸町出入口'), 2.3),
((SELECT id FROM toll_roads WHERE name='首都高7号小松川線'), (SELECT id FROM toll_nodes WHERE name='小松川JCT'), 6.6),
((SELECT id FROM toll_roads WHERE name='首都高7号小松川線'), (SELECT id FROM toll_nodes WHERE name='一之江出入口'), 8.4);

-- 首都高 9号深川線
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='首都高9号深川線'), (SELECT id FROM toll_nodes WHERE name='箱崎JCT'), 0.0),
((SELECT id FROM toll_roads WHERE name='首都高9号深川線'), (SELECT id FROM toll_nodes WHERE name='福住出入口'), 1.3),
((SELECT id FROM toll_roads WHERE name='首都高9号深川線'), (SELECT id FROM toll_nodes WHERE name='木場出入口'), 1.8),
((SELECT id FROM toll_roads WHERE name='首都高9号深川線'), (SELECT id FROM toll_nodes WHERE name='塩浜入口'), 3.1),
((SELECT id FROM toll_roads WHERE name='首都高9号深川線'), (SELECT id FROM toll_nodes WHERE name='辰巳JCT'), 5.6);

-- 首都高 1号羽田線
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='首都高1号羽田線'), (SELECT id FROM toll_nodes WHERE name='浜崎橋JCT'), 0.0),
((SELECT id FROM toll_roads WHERE name='首都高1号羽田線'), (SELECT id FROM toll_nodes WHERE name='芝浦JCT'), 0.5),
((SELECT id FROM toll_roads WHERE name='首都高1号羽田線'), (SELECT id FROM toll_nodes WHERE name='大井JCT'), 5.5),
((SELECT id FROM toll_roads WHERE name='首都高1号羽田線'), (SELECT id FROM toll_nodes WHERE name='昭和島JCT'), 9.7),
((SELECT id FROM toll_roads WHERE name='首都高1号羽田線'), (SELECT id FROM toll_nodes WHERE name='羽田出入口'), 12.5);

-- 首都高 湾岸線(B、川崎浮島JCT〜高谷JCTの区間のみ)
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='首都高湾岸線'), (SELECT id FROM toll_nodes WHERE name='川崎浮島JCT'), 29.5),
((SELECT id FROM toll_roads WHERE name='首都高湾岸線'), (SELECT id FROM toll_nodes WHERE name='東海JCT'), 38.6),
((SELECT id FROM toll_roads WHERE name='首都高湾岸線'), (SELECT id FROM toll_nodes WHERE name='大井JCT'), 41.1),
((SELECT id FROM toll_roads WHERE name='首都高湾岸線'), (SELECT id FROM toll_nodes WHERE name='有明JCT'), 44.9),
((SELECT id FROM toll_roads WHERE name='首都高湾岸線'), (SELECT id FROM toll_nodes WHERE name='東雲JCT'), 45.9),
((SELECT id FROM toll_roads WHERE name='首都高湾岸線'), (SELECT id FROM toll_nodes WHERE name='辰巳JCT'), 47.6),
((SELECT id FROM toll_roads WHERE name='首都高湾岸線'), (SELECT id FROM toll_nodes WHERE name='葛西JCT'), 50.9),
((SELECT id FROM toll_roads WHERE name='首都高湾岸線'), (SELECT id FROM toll_nodes WHERE name='高谷JCT'), 62.1);

-- 東京外環自動車道(大泉JCT〜三郷南IC。全線大都市近郊区間)
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='東京外環自動車道'), (SELECT id FROM toll_nodes WHERE name='大泉JCT'), 0.0),
((SELECT id FROM toll_roads WHERE name='東京外環自動車道'), (SELECT id FROM toll_nodes WHERE name='和光IC'), 3.2),
((SELECT id FROM toll_roads WHERE name='東京外環自動車道'), (SELECT id FROM toll_nodes WHERE name='戸田西IC'), 7.4),
((SELECT id FROM toll_roads WHERE name='東京外環自動車道'), (SELECT id FROM toll_nodes WHERE name='美女木JCT'), 8.3),
((SELECT id FROM toll_roads WHERE name='東京外環自動車道'), (SELECT id FROM toll_nodes WHERE name='戸田東IC'), 9.7),
((SELECT id FROM toll_roads WHERE name='東京外環自動車道'), (SELECT id FROM toll_nodes WHERE name='外環浦和IC'), 12.1),
((SELECT id FROM toll_roads WHERE name='東京外環自動車道'), (SELECT id FROM toll_nodes WHERE name='川口西IC'), 13.8),
((SELECT id FROM toll_roads WHERE name='東京外環自動車道'), (SELECT id FROM toll_nodes WHERE name='川口中央IC'), 16.6),
((SELECT id FROM toll_roads WHERE name='東京外環自動車道'), (SELECT id FROM toll_nodes WHERE name='川口JCT'), 17.5),
((SELECT id FROM toll_roads WHERE name='東京外環自動車道'), (SELECT id FROM toll_nodes WHERE name='川口東IC'), 18.8),
((SELECT id FROM toll_roads WHERE name='東京外環自動車道'), (SELECT id FROM toll_nodes WHERE name='草加IC'), 22.2),
((SELECT id FROM toll_roads WHERE name='東京外環自動車道'), (SELECT id FROM toll_nodes WHERE name='外環三郷西IC'), 28.2),
((SELECT id FROM toll_roads WHERE name='東京外環自動車道'), (SELECT id FROM toll_nodes WHERE name='三郷JCT'), 29.4),
((SELECT id FROM toll_roads WHERE name='東京外環自動車道'), (SELECT id FROM toll_nodes WHERE name='三郷中央IC'), 30.8),
((SELECT id FROM toll_roads WHERE name='東京外環自動車道'), (SELECT id FROM toll_nodes WHERE name='三郷南IC'), 33.5);

-- 関越自動車道 近郊部(大泉JCT〜東松山IC)
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='関越自動車道(近郊部)'), (SELECT id FROM toll_nodes WHERE name='大泉JCT'), 0.0),
((SELECT id FROM toll_roads WHERE name='関越自動車道(近郊部)'), (SELECT id FROM toll_nodes WHERE name='所沢IC'), 4.7),
((SELECT id FROM toll_roads WHERE name='関越自動車道(近郊部)'), (SELECT id FROM toll_nodes WHERE name='川越IC'), 19.0),
((SELECT id FROM toll_roads WHERE name='関越自動車道(近郊部)'), (SELECT id FROM toll_nodes WHERE name='鶴ヶ島JCT'), 20.2),
((SELECT id FROM toll_roads WHERE name='関越自動車道(近郊部)'), (SELECT id FROM toll_nodes WHERE name='東松山IC'), 38.4);

-- 関越自動車道 標準部(東松山IC〜沼田IC)
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='関越自動車道(標準部)'), (SELECT id FROM toll_nodes WHERE name='東松山IC'), 38.4),
((SELECT id FROM toll_roads WHERE name='関越自動車道(標準部)'), (SELECT id FROM toll_nodes WHERE name='花園IC'), 54.4),
((SELECT id FROM toll_roads WHERE name='関越自動車道(標準部)'), (SELECT id FROM toll_nodes WHERE name='本庄児玉IC'), 66.5),
((SELECT id FROM toll_roads WHERE name='関越自動車道(標準部)'), (SELECT id FROM toll_nodes WHERE name='高崎IC'), 82.9),
((SELECT id FROM toll_roads WHERE name='関越自動車道(標準部)'), (SELECT id FROM toll_nodes WHERE name='前橋IC'), 89.4),
((SELECT id FROM toll_roads WHERE name='関越自動車道(標準部)'), (SELECT id FROM toll_nodes WHERE name='渋川伊香保IC'), 102.4),
((SELECT id FROM toll_roads WHERE name='関越自動車道(標準部)'), (SELECT id FROM toll_nodes WHERE name='沼田IC'), 122.3);

-- 東北自動車道 近郊部(川口JCT〜加須IC)
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='東北自動車道(近郊部)'), (SELECT id FROM toll_nodes WHERE name='川口JCT'), 0.0),
((SELECT id FROM toll_roads WHERE name='東北自動車道(近郊部)'), (SELECT id FROM toll_nodes WHERE name='浦和IC'), 5.9),
((SELECT id FROM toll_roads WHERE name='東北自動車道(近郊部)'), (SELECT id FROM toll_nodes WHERE name='岩槻IC'), 12.8),
((SELECT id FROM toll_roads WHERE name='東北自動車道(近郊部)'), (SELECT id FROM toll_nodes WHERE name='久喜白岡JCT'), 20.7),
((SELECT id FROM toll_roads WHERE name='東北自動車道(近郊部)'), (SELECT id FROM toll_nodes WHERE name='久喜IC'), 28.5),
((SELECT id FROM toll_roads WHERE name='東北自動車道(近郊部)'), (SELECT id FROM toll_nodes WHERE name='加須IC'), 34.8);

-- 東北自動車道 標準部(加須IC〜那須IC)
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='東北自動車道(標準部)'), (SELECT id FROM toll_nodes WHERE name='加須IC'), 34.8),
((SELECT id FROM toll_roads WHERE name='東北自動車道(標準部)'), (SELECT id FROM toll_nodes WHERE name='羽生IC'), 36.0),
((SELECT id FROM toll_roads WHERE name='東北自動車道(標準部)'), (SELECT id FROM toll_nodes WHERE name='館林IC'), 50.5),
((SELECT id FROM toll_roads WHERE name='東北自動車道(標準部)'), (SELECT id FROM toll_nodes WHERE name='佐野藤岡IC'), 53.3),
((SELECT id FROM toll_roads WHERE name='東北自動車道(標準部)'), (SELECT id FROM toll_nodes WHERE name='栃木IC'), 70.9),
((SELECT id FROM toll_roads WHERE name='東北自動車道(標準部)'), (SELECT id FROM toll_nodes WHERE name='鹿沼IC'), 94.8),
((SELECT id FROM toll_roads WHERE name='東北自動車道(標準部)'), (SELECT id FROM toll_nodes WHERE name='宇都宮IC'), 98.4),
((SELECT id FROM toll_roads WHERE name='東北自動車道(標準部)'), (SELECT id FROM toll_nodes WHERE name='矢板IC'), 122.9),
((SELECT id FROM toll_roads WHERE name='東北自動車道(標準部)'), (SELECT id FROM toll_nodes WHERE name='西那須野塩原IC'), 140.9),
((SELECT id FROM toll_roads WHERE name='東北自動車道(標準部)'), (SELECT id FROM toll_nodes WHERE name='那須IC'), 156.0);

-- 常磐自動車道 近郊部(三郷IC〜谷田部IC)
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='常磐自動車道(近郊部)'), (SELECT id FROM toll_nodes WHERE name='三郷IC'), 0.0),
((SELECT id FROM toll_roads WHERE name='常磐自動車道(近郊部)'), (SELECT id FROM toll_nodes WHERE name='三郷JCT'), 3.7),
((SELECT id FROM toll_roads WHERE name='常磐自動車道(近郊部)'), (SELECT id FROM toll_nodes WHERE name='流山IC'), 10.2),
((SELECT id FROM toll_roads WHERE name='常磐自動車道(近郊部)'), (SELECT id FROM toll_nodes WHERE name='柏IC'), 15.4),
((SELECT id FROM toll_roads WHERE name='常磐自動車道(近郊部)'), (SELECT id FROM toll_nodes WHERE name='谷和原IC'), 29.7),
((SELECT id FROM toll_roads WHERE name='常磐自動車道(近郊部)'), (SELECT id FROM toll_nodes WHERE name='谷田部IC'), 34.7);

-- 常磐自動車道 標準部(谷田部IC〜日立南太田IC)
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='常磐自動車道(標準部)'), (SELECT id FROM toll_nodes WHERE name='谷田部IC'), 34.7),
((SELECT id FROM toll_roads WHERE name='常磐自動車道(標準部)'), (SELECT id FROM toll_nodes WHERE name='つくばJCT'), 35.8),
((SELECT id FROM toll_roads WHERE name='常磐自動車道(標準部)'), (SELECT id FROM toll_nodes WHERE name='桜土浦IC'), 46.1),
((SELECT id FROM toll_roads WHERE name='常磐自動車道(標準部)'), (SELECT id FROM toll_nodes WHERE name='土浦北IC'), 50.3),
((SELECT id FROM toll_roads WHERE name='常磐自動車道(標準部)'), (SELECT id FROM toll_nodes WHERE name='千代田石岡IC'), 60.7),
((SELECT id FROM toll_roads WHERE name='常磐自動車道(標準部)'), (SELECT id FROM toll_nodes WHERE name='岩間IC'), 72.5),
((SELECT id FROM toll_roads WHERE name='常磐自動車道(標準部)'), (SELECT id FROM toll_nodes WHERE name='水戸IC'), 85.2),
((SELECT id FROM toll_roads WHERE name='常磐自動車道(標準部)'), (SELECT id FROM toll_nodes WHERE name='那珂IC'), 101.4),
((SELECT id FROM toll_roads WHERE name='常磐自動車道(標準部)'), (SELECT id FROM toll_nodes WHERE name='日立南太田IC'), 117.3);

-- 東関東自動車道 起点部(高谷JCT〜湾岸市川IC。大都市近郊区間の手前)
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='東関東自動車道(起点部)'), (SELECT id FROM toll_nodes WHERE name='高谷JCT'), 0.0),
((SELECT id FROM toll_roads WHERE name='東関東自動車道(起点部)'), (SELECT id FROM toll_nodes WHERE name='湾岸市川IC'), 4.1);

-- 東関東自動車道 近郊部(湾岸市川IC〜成田IC)
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='東関東自動車道(近郊部)'), (SELECT id FROM toll_nodes WHERE name='湾岸市川IC'), 4.1),
((SELECT id FROM toll_roads WHERE name='東関東自動車道(近郊部)'), (SELECT id FROM toll_nodes WHERE name='谷津船橋IC'), 6.5),
((SELECT id FROM toll_roads WHERE name='東関東自動車道(近郊部)'), (SELECT id FROM toll_nodes WHERE name='湾岸習志野IC'), 7.9),
((SELECT id FROM toll_roads WHERE name='東関東自動車道(近郊部)'), (SELECT id FROM toll_nodes WHERE name='湾岸千葉IC'), 17.0),
((SELECT id FROM toll_roads WHERE name='東関東自動車道(近郊部)'), (SELECT id FROM toll_nodes WHERE name='宮野木JCT'), 17.8),
((SELECT id FROM toll_roads WHERE name='東関東自動車道(近郊部)'), (SELECT id FROM toll_nodes WHERE name='千葉北IC'), 23.9),
((SELECT id FROM toll_roads WHERE name='東関東自動車道(近郊部)'), (SELECT id FROM toll_nodes WHERE name='四街道IC'), 28.9),
((SELECT id FROM toll_roads WHERE name='東関東自動車道(近郊部)'), (SELECT id FROM toll_nodes WHERE name='佐倉IC'), 34.3),
((SELECT id FROM toll_roads WHERE name='東関東自動車道(近郊部)'), (SELECT id FROM toll_nodes WHERE name='酒々井IC'), 38.8),
((SELECT id FROM toll_roads WHERE name='東関東自動車道(近郊部)'), (SELECT id FROM toll_nodes WHERE name='成田IC'), 44.4);

-- 東関東自動車道 標準部(成田IC〜潮来IC)
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='東関東自動車道(標準部)'), (SELECT id FROM toll_nodes WHERE name='成田IC'), 44.4),
((SELECT id FROM toll_roads WHERE name='東関東自動車道(標準部)'), (SELECT id FROM toll_nodes WHERE name='成田JCT'), 49.9),
((SELECT id FROM toll_roads WHERE name='東関東自動車道(標準部)'), (SELECT id FROM toll_nodes WHERE name='大栄JCT'), 50.8),
((SELECT id FROM toll_roads WHERE name='東関東自動車道(標準部)'), (SELECT id FROM toll_nodes WHERE name='大栄IC'), 65.0),
((SELECT id FROM toll_roads WHERE name='東関東自動車道(標準部)'), (SELECT id FROM toll_nodes WHERE name='佐原香取IC'), 67.6),
((SELECT id FROM toll_roads WHERE name='東関東自動車道(標準部)'), (SELECT id FROM toll_nodes WHERE name='潮来IC'), 73.0);

-- 中央自動車道 近郊部(高井戸IC〜八王子IC。ETC上限630円)
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='中央自動車道(近郊部)'), (SELECT id FROM toll_nodes WHERE name='高井戸IC'), 0.0),
((SELECT id FROM toll_roads WHERE name='中央自動車道(近郊部)'), (SELECT id FROM toll_nodes WHERE name='調布IC'), 7.7),
((SELECT id FROM toll_roads WHERE name='中央自動車道(近郊部)'), (SELECT id FROM toll_nodes WHERE name='国立府中IC'), 17.0),
((SELECT id FROM toll_roads WHERE name='中央自動車道(近郊部)'), (SELECT id FROM toll_nodes WHERE name='八王子IC'), 25.8);

-- 中央自動車道 標準部(八王子IC〜大月JCT)
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='中央自動車道(標準部)'), (SELECT id FROM toll_nodes WHERE name='八王子IC'), 25.8),
((SELECT id FROM toll_roads WHERE name='中央自動車道(標準部)'), (SELECT id FROM toll_nodes WHERE name='八王子JCT'), 36.0),
((SELECT id FROM toll_roads WHERE name='中央自動車道(標準部)'), (SELECT id FROM toll_nodes WHERE name='相模湖IC'), 45.4),
((SELECT id FROM toll_roads WHERE name='中央自動車道(標準部)'), (SELECT id FROM toll_nodes WHERE name='上野原IC'), 50.3),
((SELECT id FROM toll_roads WHERE name='中央自動車道(標準部)'), (SELECT id FROM toll_nodes WHERE name='大月IC'), 70.4),
((SELECT id FROM toll_roads WHERE name='中央自動車道(標準部)'), (SELECT id FROM toll_nodes WHERE name='大月JCT'), 71.4);

-- 圏央道(八王子JCT〜大栄JCT。全線29.52円/km・長距離逓減の対象外)
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='圏央道'), (SELECT id FROM toll_nodes WHERE name='八王子JCT'), 38.2),
((SELECT id FROM toll_roads WHERE name='圏央道'), (SELECT id FROM toll_nodes WHERE name='八王子西IC'), 42.6),
((SELECT id FROM toll_roads WHERE name='圏央道'), (SELECT id FROM toll_nodes WHERE name='あきる野IC'), 47.8),
((SELECT id FROM toll_roads WHERE name='圏央道'), (SELECT id FROM toll_nodes WHERE name='日の出IC'), 49.8),
((SELECT id FROM toll_roads WHERE name='圏央道'), (SELECT id FROM toll_nodes WHERE name='青梅IC'), 58.5),
((SELECT id FROM toll_roads WHERE name='圏央道'), (SELECT id FROM toll_nodes WHERE name='入間IC'), 63.3),
((SELECT id FROM toll_roads WHERE name='圏央道'), (SELECT id FROM toll_nodes WHERE name='狭山日高IC'), 69.3),
((SELECT id FROM toll_roads WHERE name='圏央道'), (SELECT id FROM toll_nodes WHERE name='圏央鶴ヶ島IC'), 76.1),
((SELECT id FROM toll_roads WHERE name='圏央道'), (SELECT id FROM toll_nodes WHERE name='鶴ヶ島JCT'), 78.3),
((SELECT id FROM toll_roads WHERE name='圏央道'), (SELECT id FROM toll_nodes WHERE name='坂戸IC'), 83.5),
((SELECT id FROM toll_roads WHERE name='圏央道'), (SELECT id FROM toll_nodes WHERE name='川島IC'), 86.0),
((SELECT id FROM toll_roads WHERE name='圏央道'), (SELECT id FROM toll_nodes WHERE name='桶川北本IC'), 91.7),
((SELECT id FROM toll_roads WHERE name='圏央道'), (SELECT id FROM toll_nodes WHERE name='桶川加納IC'), 96.4),
((SELECT id FROM toll_roads WHERE name='圏央道'), (SELECT id FROM toll_nodes WHERE name='白岡菖蒲IC'), 102.5),
((SELECT id FROM toll_roads WHERE name='圏央道'), (SELECT id FROM toll_nodes WHERE name='久喜白岡JCT'), 105.8),
((SELECT id FROM toll_roads WHERE name='圏央道'), (SELECT id FROM toll_nodes WHERE name='幸手IC'), 114.3),
((SELECT id FROM toll_roads WHERE name='圏央道'), (SELECT id FROM toll_nodes WHERE name='五霞IC'), 118.5),
((SELECT id FROM toll_roads WHERE name='圏央道'), (SELECT id FROM toll_nodes WHERE name='境古河IC'), 125.4),
((SELECT id FROM toll_roads WHERE name='圏央道'), (SELECT id FROM toll_nodes WHERE name='坂東IC'), 134.5),
((SELECT id FROM toll_roads WHERE name='圏央道'), (SELECT id FROM toll_nodes WHERE name='常総IC'), 143.4),
((SELECT id FROM toll_roads WHERE name='圏央道'), (SELECT id FROM toll_nodes WHERE name='つくば中央IC'), 153.9),
((SELECT id FROM toll_roads WHERE name='圏央道'), (SELECT id FROM toll_nodes WHERE name='つくばJCT'), 158.2),
((SELECT id FROM toll_roads WHERE name='圏央道'), (SELECT id FROM toll_nodes WHERE name='つくば牛久IC'), 159.7),
((SELECT id FROM toll_roads WHERE name='圏央道'), (SELECT id FROM toll_nodes WHERE name='牛久阿見IC'), 165.8),
((SELECT id FROM toll_roads WHERE name='圏央道'), (SELECT id FROM toll_nodes WHERE name='阿見東IC'), 171.7),
((SELECT id FROM toll_roads WHERE name='圏央道'), (SELECT id FROM toll_nodes WHERE name='稲敷IC'), 177.7),
((SELECT id FROM toll_roads WHERE name='圏央道'), (SELECT id FROM toll_nodes WHERE name='稲敷東IC'), 183.7),
((SELECT id FROM toll_roads WHERE name='圏央道'), (SELECT id FROM toll_nodes WHERE name='下総IC'), 192.1),
((SELECT id FROM toll_roads WHERE name='圏央道'), (SELECT id FROM toll_nodes WHERE name='大栄JCT'), 198.0);

-- 京葉道路(宮野木JCT〜蘇我IC。ゾーン制料金をNEXCO距離比例式で近似)
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='京葉道路'), (SELECT id FROM toll_nodes WHERE name='宮野木JCT'), 21.0),
((SELECT id FROM toll_roads WHERE name='京葉道路'), (SELECT id FROM toll_nodes WHERE name='千葉東JCT'), 29.8),
((SELECT id FROM toll_roads WHERE name='京葉道路'), (SELECT id FROM toll_nodes WHERE name='蘇我IC'), 33.9);

-- 東京湾アクアライン連絡道(川崎浮島JCT〜木更津金田IC。平日ETC割引800円固定)
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='東京湾アクアライン連絡道'), (SELECT id FROM toll_nodes WHERE name='川崎浮島JCT'), 0.0),
((SELECT id FROM toll_roads WHERE name='東京湾アクアライン連絡道'), (SELECT id FROM toll_nodes WHERE name='木更津金田IC'), 15.1);
