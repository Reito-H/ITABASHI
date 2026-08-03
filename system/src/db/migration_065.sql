-- migration_065: 高速道路料金計算 データ拡張(首都高全線+神奈川/千葉/北関東/上信越)
-- ユーザーからの指摘(首都高の出入口が網羅されていない)を受け、関東圏で追加収集した
-- ネットワークデータを追記する。migration_064は本番適用済みのため変更せず、
-- 新規ノード/区間は全て「既存なら何もしない」形の追記のみを行う(再実行しても安全)。
-- 既知の簡略化: 九十九里有料道路・東金九十九里有料道路はETC非対応のため対象外。
-- 圏央道の大栄JCT~松尾横芝IC間は2026年8月時点で未開通のため、松尾横芝IC以東は
-- 別路線「圏央道(木更津方面)」として独立させ、大栄JCTとは接続しない形にしている。
-- 保土ヶ谷バイパスは無料の自動車専用道路のため fixed_fare=0 として扱う。

-- ===== 新規路線マスタ =====
INSERT INTO toll_roads (name, operator, rate_zone, formula, fixed_fare, fare_cap) VALUES
('首都高2号目黒線', 'shutoko', 'standard', 'shutoko', NULL, NULL),
('首都高10号晴海線', 'shutoko', 'standard', 'shutoko', NULL, NULL),
('首都高11号台場線', 'shutoko', 'standard', 'shutoko', NULL, NULL),
('首都高埼玉新都心線', 'shutoko', 'standard', 'shutoko', NULL, NULL),
('首都高神奈川1号横羽線', 'shutoko', 'standard', 'shutoko', NULL, NULL),
('首都高神奈川2号三ツ沢線', 'shutoko', 'standard', 'shutoko', NULL, NULL),
('首都高神奈川3号狩場線', 'shutoko', 'standard', 'shutoko', NULL, NULL),
('首都高神奈川5号大黒線', 'shutoko', 'standard', 'shutoko', NULL, NULL),
('首都高神奈川6号川崎線', 'shutoko', 'standard', 'shutoko', NULL, NULL),
('首都高神奈川7号横浜北線', 'shutoko', 'standard', 'shutoko', NULL, NULL),
('首都高神奈川7号横浜北西線', 'shutoko', 'standard', 'shutoko', NULL, NULL),
('北関東自動車道', 'nexco_east', 'standard', 'distance', NULL, NULL),
('上信越自動車道', 'nexco_east', 'standard', 'distance', NULL, NULL),
('東名高速道路', 'nexco_central', 'standard', 'distance', NULL, NULL),
('横浜新道', 'nexco_east', 'standard', 'distance', NULL, NULL),
('保土ヶ谷バイパス', 'other', 'standard', 'fixed', 0, NULL),
('横浜横須賀道路', 'nexco_east', 'standard', 'distance', NULL, NULL),
('横浜横須賀道路金沢支線', 'nexco_east', 'standard', 'distance', NULL, NULL),
('西湘バイパス', 'nexco_central', 'standard', 'distance', NULL, NULL),
('小田原厚木道路', 'nexco_central', 'standard', 'distance', NULL, NULL),
('館山自動車道', 'nexco_east', 'standard', 'distance', NULL, NULL),
('富津館山道路', 'nexco_east', 'standard', 'distance', NULL, NULL),
('新空港自動車道', 'nexco_east', 'standard', 'distance', NULL, NULL),
('千葉東金道路', 'nexco_east', 'standard', 'distance', NULL, NULL),
('圏央道(木更津方面)', 'nexco_east', 'kenou', 'distance', NULL, NULL);

-- ===== ノード(IC/JCT)追加(既存なら何もしない) =====
INSERT INTO toll_nodes (name, kind) SELECT '一ノ橋JCT', 'jct' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '一ノ橋JCT');
INSERT INTO toll_nodes (name, kind) SELECT '天現寺出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '天現寺出入口');
INSERT INTO toll_nodes (name, kind) SELECT '目黒出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '目黒出入口');
INSERT INTO toll_nodes (name, kind) SELECT '荏原出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '荏原出入口');
INSERT INTO toll_nodes (name, kind) SELECT '戸越出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '戸越出入口');
INSERT INTO toll_nodes (name, kind) SELECT '晴海出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '晴海出入口');
INSERT INTO toll_nodes (name, kind) SELECT '豊洲出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '豊洲出入口');
INSERT INTO toll_nodes (name, kind) SELECT '東雲JCT', 'jct' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '東雲JCT');
INSERT INTO toll_nodes (name, kind) SELECT '芝浦JCT', 'jct' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '芝浦JCT');
INSERT INTO toll_nodes (name, kind) SELECT '台場出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '台場出入口');
INSERT INTO toll_nodes (name, kind) SELECT '有明JCT', 'jct' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '有明JCT');
INSERT INTO toll_nodes (name, kind) SELECT '与野JCT', 'jct' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '与野JCT');
INSERT INTO toll_nodes (name, kind) SELECT '新都心西出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '新都心西出入口');
INSERT INTO toll_nodes (name, kind) SELECT '新都心出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '新都心出入口');
INSERT INTO toll_nodes (name, kind) SELECT 'さいたま見沼出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = 'さいたま見沼出入口');
INSERT INTO toll_nodes (name, kind) SELECT '羽田出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '羽田出入口');
INSERT INTO toll_nodes (name, kind) SELECT '大師出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '大師出入口');
INSERT INTO toll_nodes (name, kind) SELECT '大師JCT', 'jct' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '大師JCT');
INSERT INTO toll_nodes (name, kind) SELECT '生麦JCT', 'jct' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '生麦JCT');
INSERT INTO toll_nodes (name, kind) SELECT '生麦出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '生麦出入口');
INSERT INTO toll_nodes (name, kind) SELECT '金港JCT', 'jct' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '金港JCT');
INSERT INTO toll_nodes (name, kind) SELECT '横浜駅西口出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '横浜駅西口出入口');
INSERT INTO toll_nodes (name, kind) SELECT '三ツ沢出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '三ツ沢出入口');
INSERT INTO toll_nodes (name, kind) SELECT '保土ヶ谷IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '保土ヶ谷IC');
INSERT INTO toll_nodes (name, kind) SELECT '本牧JCT', 'jct' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '本牧JCT');
INSERT INTO toll_nodes (name, kind) SELECT '新山下出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '新山下出入口');
INSERT INTO toll_nodes (name, kind) SELECT '石川町JCT', 'jct' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '石川町JCT');
INSERT INTO toll_nodes (name, kind) SELECT '阪東橋出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '阪東橋出入口');
INSERT INTO toll_nodes (name, kind) SELECT '花之木出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '花之木出入口');
INSERT INTO toll_nodes (name, kind) SELECT '永田出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '永田出入口');
INSERT INTO toll_nodes (name, kind) SELECT '狩場JCT', 'jct' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '狩場JCT');
INSERT INTO toll_nodes (name, kind) SELECT '大黒JCT', 'jct' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '大黒JCT');
INSERT INTO toll_nodes (name, kind) SELECT '川崎浮島JCT', 'jct' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '川崎浮島JCT');
INSERT INTO toll_nodes (name, kind) SELECT '殿町出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '殿町出入口');
INSERT INTO toll_nodes (name, kind) SELECT '岸谷生麦出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '岸谷生麦出入口');
INSERT INTO toll_nodes (name, kind) SELECT '馬場出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '馬場出入口');
INSERT INTO toll_nodes (name, kind) SELECT '新横浜出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '新横浜出入口');
INSERT INTO toll_nodes (name, kind) SELECT '横浜港北JCT', 'jct' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '横浜港北JCT');
INSERT INTO toll_nodes (name, kind) SELECT '横浜青葉JCT', 'jct' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '横浜青葉JCT');
INSERT INTO toll_nodes (name, kind) SELECT '高崎JCT', 'jct' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '高崎JCT');
INSERT INTO toll_nodes (name, kind) SELECT '伊勢崎IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '伊勢崎IC');
INSERT INTO toll_nodes (name, kind) SELECT '太田桐生IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '太田桐生IC');
INSERT INTO toll_nodes (name, kind) SELECT '足利IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '足利IC');
INSERT INTO toll_nodes (name, kind) SELECT '佐野田沼IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '佐野田沼IC');
INSERT INTO toll_nodes (name, kind) SELECT '岩舟JCT', 'jct' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '岩舟JCT');
INSERT INTO toll_nodes (name, kind) SELECT '栃木都賀JCT', 'jct' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '栃木都賀JCT');
INSERT INTO toll_nodes (name, kind) SELECT '宇都宮上三川IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '宇都宮上三川IC');
INSERT INTO toll_nodes (name, kind) SELECT '真岡IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '真岡IC');
INSERT INTO toll_nodes (name, kind) SELECT '桜川筑西IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '桜川筑西IC');
INSERT INTO toll_nodes (name, kind) SELECT '笠間西IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '笠間西IC');
INSERT INTO toll_nodes (name, kind) SELECT '友部IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '友部IC');
INSERT INTO toll_nodes (name, kind) SELECT '友部JCT', 'jct' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '友部JCT');
INSERT INTO toll_nodes (name, kind) SELECT '水戸南IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '水戸南IC');
INSERT INTO toll_nodes (name, kind) SELECT '藤岡JCT', 'jct' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '藤岡JCT');
INSERT INTO toll_nodes (name, kind) SELECT '吉井IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '吉井IC');
INSERT INTO toll_nodes (name, kind) SELECT '富岡IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '富岡IC');
INSERT INTO toll_nodes (name, kind) SELECT '下仁田IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '下仁田IC');
INSERT INTO toll_nodes (name, kind) SELECT '松井田妙義IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '松井田妙義IC');
INSERT INTO toll_nodes (name, kind) SELECT '碓氷軽井沢IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '碓氷軽井沢IC');
INSERT INTO toll_nodes (name, kind) SELECT '用賀出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '用賀出入口');
INSERT INTO toll_nodes (name, kind) SELECT '東名川崎IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '東名川崎IC');
INSERT INTO toll_nodes (name, kind) SELECT '横浜町田IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '横浜町田IC');
INSERT INTO toll_nodes (name, kind) SELECT '海老名JCT', 'jct' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '海老名JCT');
INSERT INTO toll_nodes (name, kind) SELECT '厚木IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '厚木IC');
INSERT INTO toll_nodes (name, kind) SELECT '秦野中井IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '秦野中井IC');
INSERT INTO toll_nodes (name, kind) SELECT '大井松田IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '大井松田IC');
INSERT INTO toll_nodes (name, kind) SELECT '新保土ヶ谷IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '新保土ヶ谷IC');
INSERT INTO toll_nodes (name, kind) SELECT '戸塚終点', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '戸塚終点');
INSERT INTO toll_nodes (name, kind) SELECT '釜利谷JCT', 'jct' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '釜利谷JCT');
INSERT INTO toll_nodes (name, kind) SELECT '逗子IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '逗子IC');
INSERT INTO toll_nodes (name, kind) SELECT '横須賀IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '横須賀IC');
INSERT INTO toll_nodes (name, kind) SELECT '衣笠IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '衣笠IC');
INSERT INTO toll_nodes (name, kind) SELECT '馬堀海岸IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '馬堀海岸IC');
INSERT INTO toll_nodes (name, kind) SELECT '堀口能見台IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '堀口能見台IC');
INSERT INTO toll_nodes (name, kind) SELECT '並木IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '並木IC');
INSERT INTO toll_nodes (name, kind) SELECT '大磯東IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '大磯東IC');
INSERT INTO toll_nodes (name, kind) SELECT '西湘二宮IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '西湘二宮IC');
INSERT INTO toll_nodes (name, kind) SELECT '橘IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '橘IC');
INSERT INTO toll_nodes (name, kind) SELECT '国府津IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '国府津IC');
INSERT INTO toll_nodes (name, kind) SELECT '酒匂IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '酒匂IC');
INSERT INTO toll_nodes (name, kind) SELECT '小田原IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '小田原IC');
INSERT INTO toll_nodes (name, kind) SELECT '早川IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '早川IC');
INSERT INTO toll_nodes (name, kind) SELECT '小田原西IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '小田原西IC');
INSERT INTO toll_nodes (name, kind) SELECT '箱根口IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '箱根口IC');
INSERT INTO toll_nodes (name, kind) SELECT '小田原東IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '小田原東IC');
INSERT INTO toll_nodes (name, kind) SELECT '二宮IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '二宮IC');
INSERT INTO toll_nodes (name, kind) SELECT '大磯IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '大磯IC');
INSERT INTO toll_nodes (name, kind) SELECT '平塚IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '平塚IC');
INSERT INTO toll_nodes (name, kind) SELECT '伊勢原IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '伊勢原IC');
INSERT INTO toll_nodes (name, kind) SELECT '厚木西IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '厚木西IC');
INSERT INTO toll_nodes (name, kind) SELECT '千葉南JCT', 'jct' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '千葉南JCT');
INSERT INTO toll_nodes (name, kind) SELECT '市原IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '市原IC');
INSERT INTO toll_nodes (name, kind) SELECT '姉崎袖ケ浦IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '姉崎袖ケ浦IC');
INSERT INTO toll_nodes (name, kind) SELECT '木更津北IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '木更津北IC');
INSERT INTO toll_nodes (name, kind) SELECT '木更津JCT', 'jct' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '木更津JCT');
INSERT INTO toll_nodes (name, kind) SELECT '君津IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '君津IC');
INSERT INTO toll_nodes (name, kind) SELECT '富津中央IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '富津中央IC');
INSERT INTO toll_nodes (name, kind) SELECT '富津竹岡IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '富津竹岡IC');
INSERT INTO toll_nodes (name, kind) SELECT '富津金谷IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '富津金谷IC');
INSERT INTO toll_nodes (name, kind) SELECT '鋸南保田IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '鋸南保田IC');
INSERT INTO toll_nodes (name, kind) SELECT '鋸南富山IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '鋸南富山IC');
INSERT INTO toll_nodes (name, kind) SELECT '富浦IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '富浦IC');
INSERT INTO toll_nodes (name, kind) SELECT '成田JCT', 'jct' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '成田JCT');
INSERT INTO toll_nodes (name, kind) SELECT '新空港IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '新空港IC');
INSERT INTO toll_nodes (name, kind) SELECT '千葉東JCT', 'jct' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '千葉東JCT');
INSERT INTO toll_nodes (name, kind) SELECT '大宮IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '大宮IC');
INSERT INTO toll_nodes (name, kind) SELECT '高田IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '高田IC');
INSERT INTO toll_nodes (name, kind) SELECT '中野IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '中野IC');
INSERT INTO toll_nodes (name, kind) SELECT '山田IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '山田IC');
INSERT INTO toll_nodes (name, kind) SELECT '東金JCT', 'jct' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '東金JCT');
INSERT INTO toll_nodes (name, kind) SELECT '松尾横芝IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '松尾横芝IC');
INSERT INTO toll_nodes (name, kind) SELECT '山武成東IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '山武成東IC');
INSERT INTO toll_nodes (name, kind) SELECT '茂原長南IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '茂原長南IC');
INSERT INTO toll_nodes (name, kind) SELECT '市原鶴舞IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '市原鶴舞IC');
INSERT INTO toll_nodes (name, kind) SELECT '木更津東IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '木更津東IC');
INSERT INTO toll_nodes (name, kind) SELECT '茅ヶ崎JCT', 'jct' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '茅ヶ崎JCT');
INSERT INTO toll_nodes (name, kind) SELECT '寒川南IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '寒川南IC');
INSERT INTO toll_nodes (name, kind) SELECT '寒川北IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '寒川北IC');
INSERT INTO toll_nodes (name, kind) SELECT '海老名南JCT', 'jct' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '海老名南JCT');
INSERT INTO toll_nodes (name, kind) SELECT '海老名IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '海老名IC');
INSERT INTO toll_nodes (name, kind) SELECT '圏央厚木IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '圏央厚木IC');
INSERT INTO toll_nodes (name, kind) SELECT '厚木PA', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '厚木PA');
INSERT INTO toll_nodes (name, kind) SELECT '相模原愛川IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '相模原愛川IC');
INSERT INTO toll_nodes (name, kind) SELECT '相模原IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '相模原IC');
INSERT INTO toll_nodes (name, kind) SELECT '高尾山IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '高尾山IC');
INSERT INTO toll_nodes (name, kind) SELECT '三芳SIC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '三芳SIC');
INSERT INTO toll_nodes (name, kind) SELECT '鶴ヶ島IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '鶴ヶ島IC');
INSERT INTO toll_nodes (name, kind) SELECT '坂戸西SIC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '坂戸西SIC');
INSERT INTO toll_nodes (name, kind) SELECT '蓮田SIC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '蓮田SIC');
INSERT INTO toll_nodes (name, kind) SELECT '篠崎IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '篠崎IC');
INSERT INTO toll_nodes (name, kind) SELECT '京葉JCT', 'jct' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '京葉JCT');
INSERT INTO toll_nodes (name, kind) SELECT '原木IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '原木IC');
INSERT INTO toll_nodes (name, kind) SELECT '船橋IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '船橋IC');
INSERT INTO toll_nodes (name, kind) SELECT '花輪IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '花輪IC');
INSERT INTO toll_nodes (name, kind) SELECT '幕張IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '幕張IC');
INSERT INTO toll_nodes (name, kind) SELECT '武石IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '武石IC');
INSERT INTO toll_nodes (name, kind) SELECT '穴川IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '穴川IC');
INSERT INTO toll_nodes (name, kind) SELECT '貝塚IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '貝塚IC');
INSERT INTO toll_nodes (name, kind) SELECT '松ヶ丘IC', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '松ヶ丘IC');
INSERT INTO toll_nodes (name, kind) SELECT '幸浦出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '幸浦出入口');
INSERT INTO toll_nodes (name, kind) SELECT '杉田出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '杉田出入口');
INSERT INTO toll_nodes (name, kind) SELECT '磯子出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '磯子出入口');
INSERT INTO toll_nodes (name, kind) SELECT '三渓園出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '三渓園出入口');
INSERT INTO toll_nodes (name, kind) SELECT '東扇島出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '東扇島出入口');

-- ===== 新規路線のノード位置 =====
-- 首都高2号目黒線
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='首都高2号目黒線'), (SELECT id FROM toll_nodes WHERE name='一ノ橋JCT'), 0.0),
((SELECT id FROM toll_roads WHERE name='首都高2号目黒線'), (SELECT id FROM toll_nodes WHERE name='天現寺出入口'), 1.8),
((SELECT id FROM toll_roads WHERE name='首都高2号目黒線'), (SELECT id FROM toll_nodes WHERE name='目黒出入口'), 3.6),
((SELECT id FROM toll_roads WHERE name='首都高2号目黒線'), (SELECT id FROM toll_nodes WHERE name='荏原出入口'), 5.8),
((SELECT id FROM toll_roads WHERE name='首都高2号目黒線'), (SELECT id FROM toll_nodes WHERE name='戸越出入口'), 5.9);

-- 首都高10号晴海線
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='首都高10号晴海線'), (SELECT id FROM toll_nodes WHERE name='晴海出入口'), 0.0),
((SELECT id FROM toll_roads WHERE name='首都高10号晴海線'), (SELECT id FROM toll_nodes WHERE name='豊洲出入口'), 1.2),
((SELECT id FROM toll_roads WHERE name='首都高10号晴海線'), (SELECT id FROM toll_nodes WHERE name='東雲JCT'), 2.7);

-- 首都高11号台場線
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='首都高11号台場線'), (SELECT id FROM toll_nodes WHERE name='芝浦JCT'), 0.0),
((SELECT id FROM toll_roads WHERE name='首都高11号台場線'), (SELECT id FROM toll_nodes WHERE name='台場出入口'), 2.3),
((SELECT id FROM toll_roads WHERE name='首都高11号台場線'), (SELECT id FROM toll_nodes WHERE name='有明JCT'), 3.9);

-- 首都高埼玉新都心線
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='首都高埼玉新都心線'), (SELECT id FROM toll_nodes WHERE name='与野JCT'), 0.0),
((SELECT id FROM toll_roads WHERE name='首都高埼玉新都心線'), (SELECT id FROM toll_nodes WHERE name='新都心西出入口'), 1.3),
((SELECT id FROM toll_roads WHERE name='首都高埼玉新都心線'), (SELECT id FROM toll_nodes WHERE name='新都心出入口'), 2.6),
((SELECT id FROM toll_roads WHERE name='首都高埼玉新都心線'), (SELECT id FROM toll_nodes WHERE name='さいたま見沼出入口'), 5.8);

-- 首都高神奈川1号横羽線
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='首都高神奈川1号横羽線'), (SELECT id FROM toll_nodes WHERE name='羽田出入口'), 0.0),
((SELECT id FROM toll_roads WHERE name='首都高神奈川1号横羽線'), (SELECT id FROM toll_nodes WHERE name='大師出入口'), 0.4),
((SELECT id FROM toll_roads WHERE name='首都高神奈川1号横羽線'), (SELECT id FROM toll_nodes WHERE name='大師JCT'), 0.7),
((SELECT id FROM toll_roads WHERE name='首都高神奈川1号横羽線'), (SELECT id FROM toll_nodes WHERE name='生麦JCT'), 9.1),
((SELECT id FROM toll_roads WHERE name='首都高神奈川1号横羽線'), (SELECT id FROM toll_nodes WHERE name='生麦出入口'), 9.7);

-- 首都高神奈川2号三ツ沢線
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='首都高神奈川2号三ツ沢線'), (SELECT id FROM toll_nodes WHERE name='金港JCT'), 0.0),
((SELECT id FROM toll_roads WHERE name='首都高神奈川2号三ツ沢線'), (SELECT id FROM toll_nodes WHERE name='横浜駅西口出入口'), 0.6),
((SELECT id FROM toll_roads WHERE name='首都高神奈川2号三ツ沢線'), (SELECT id FROM toll_nodes WHERE name='三ツ沢出入口'), 1.8),
((SELECT id FROM toll_roads WHERE name='首都高神奈川2号三ツ沢線'), (SELECT id FROM toll_nodes WHERE name='保土ヶ谷IC'), 2.3);

-- 首都高神奈川3号狩場線
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='首都高神奈川3号狩場線'), (SELECT id FROM toll_nodes WHERE name='本牧JCT'), 0.0),
((SELECT id FROM toll_roads WHERE name='首都高神奈川3号狩場線'), (SELECT id FROM toll_nodes WHERE name='新山下出入口'), 1.5),
((SELECT id FROM toll_roads WHERE name='首都高神奈川3号狩場線'), (SELECT id FROM toll_nodes WHERE name='石川町JCT'), 2.3),
((SELECT id FROM toll_roads WHERE name='首都高神奈川3号狩場線'), (SELECT id FROM toll_nodes WHERE name='阪東橋出入口'), 4.5),
((SELECT id FROM toll_roads WHERE name='首都高神奈川3号狩場線'), (SELECT id FROM toll_nodes WHERE name='花之木出入口'), 5.1),
((SELECT id FROM toll_roads WHERE name='首都高神奈川3号狩場線'), (SELECT id FROM toll_nodes WHERE name='永田出入口'), 6.5),
((SELECT id FROM toll_roads WHERE name='首都高神奈川3号狩場線'), (SELECT id FROM toll_nodes WHERE name='狩場JCT'), 8.6);

-- 首都高神奈川5号大黒線
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='首都高神奈川5号大黒線'), (SELECT id FROM toll_nodes WHERE name='大黒JCT'), 0.0),
((SELECT id FROM toll_roads WHERE name='首都高神奈川5号大黒線'), (SELECT id FROM toll_nodes WHERE name='生麦JCT'), 4.6);

-- 首都高神奈川6号川崎線
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='首都高神奈川6号川崎線'), (SELECT id FROM toll_nodes WHERE name='川崎浮島JCT'), 0.0),
((SELECT id FROM toll_roads WHERE name='首都高神奈川6号川崎線'), (SELECT id FROM toll_nodes WHERE name='殿町出入口'), 3.5),
((SELECT id FROM toll_roads WHERE name='首都高神奈川6号川崎線'), (SELECT id FROM toll_nodes WHERE name='大師JCT'), 5.5);

-- 首都高神奈川7号横浜北線
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='首都高神奈川7号横浜北線'), (SELECT id FROM toll_nodes WHERE name='生麦JCT'), 0.0),
((SELECT id FROM toll_roads WHERE name='首都高神奈川7号横浜北線'), (SELECT id FROM toll_nodes WHERE name='岸谷生麦出入口'), 0.8),
((SELECT id FROM toll_roads WHERE name='首都高神奈川7号横浜北線'), (SELECT id FROM toll_nodes WHERE name='馬場出入口'), 3.7),
((SELECT id FROM toll_roads WHERE name='首都高神奈川7号横浜北線'), (SELECT id FROM toll_nodes WHERE name='新横浜出入口'), 7.0),
((SELECT id FROM toll_roads WHERE name='首都高神奈川7号横浜北線'), (SELECT id FROM toll_nodes WHERE name='横浜港北JCT'), 8.2);

-- 首都高神奈川7号横浜北西線
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='首都高神奈川7号横浜北西線'), (SELECT id FROM toll_nodes WHERE name='横浜港北JCT'), 0.0),
((SELECT id FROM toll_roads WHERE name='首都高神奈川7号横浜北西線'), (SELECT id FROM toll_nodes WHERE name='横浜青葉JCT'), 7.1);

-- 北関東自動車道
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='北関東自動車道'), (SELECT id FROM toll_nodes WHERE name='高崎JCT'), 0.0),
((SELECT id FROM toll_roads WHERE name='北関東自動車道'), (SELECT id FROM toll_nodes WHERE name='伊勢崎IC'), 14.5),
((SELECT id FROM toll_roads WHERE name='北関東自動車道'), (SELECT id FROM toll_nodes WHERE name='太田桐生IC'), 30.5),
((SELECT id FROM toll_roads WHERE name='北関東自動車道'), (SELECT id FROM toll_nodes WHERE name='足利IC'), 40.8),
((SELECT id FROM toll_roads WHERE name='北関東自動車道'), (SELECT id FROM toll_nodes WHERE name='佐野田沼IC'), 49.1),
((SELECT id FROM toll_roads WHERE name='北関東自動車道'), (SELECT id FROM toll_nodes WHERE name='岩舟JCT'), 54.4),
((SELECT id FROM toll_roads WHERE name='北関東自動車道'), (SELECT id FROM toll_nodes WHERE name='栃木都賀JCT'), 68.0),
((SELECT id FROM toll_roads WHERE name='北関東自動車道'), (SELECT id FROM toll_nodes WHERE name='宇都宮上三川IC'), 86.5),
((SELECT id FROM toll_roads WHERE name='北関東自動車道'), (SELECT id FROM toll_nodes WHERE name='真岡IC'), 94.0),
((SELECT id FROM toll_roads WHERE name='北関東自動車道'), (SELECT id FROM toll_nodes WHERE name='桜川筑西IC'), 108.9),
((SELECT id FROM toll_roads WHERE name='北関東自動車道'), (SELECT id FROM toll_nodes WHERE name='笠間西IC'), 117.8),
((SELECT id FROM toll_roads WHERE name='北関東自動車道'), (SELECT id FROM toll_nodes WHERE name='友部IC'), 126.9),
((SELECT id FROM toll_roads WHERE name='北関東自動車道'), (SELECT id FROM toll_nodes WHERE name='友部JCT'), 134.3),
((SELECT id FROM toll_roads WHERE name='北関東自動車道'), (SELECT id FROM toll_nodes WHERE name='水戸南IC'), 148.6);

-- 上信越自動車道
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='上信越自動車道'), (SELECT id FROM toll_nodes WHERE name='藤岡JCT'), 0.0),
((SELECT id FROM toll_roads WHERE name='上信越自動車道'), (SELECT id FROM toll_nodes WHERE name='吉井IC'), 11.2),
((SELECT id FROM toll_roads WHERE name='上信越自動車道'), (SELECT id FROM toll_nodes WHERE name='富岡IC'), 20.1),
((SELECT id FROM toll_roads WHERE name='上信越自動車道'), (SELECT id FROM toll_nodes WHERE name='下仁田IC'), 26.8),
((SELECT id FROM toll_roads WHERE name='上信越自動車道'), (SELECT id FROM toll_nodes WHERE name='松井田妙義IC'), 37.5),
((SELECT id FROM toll_roads WHERE name='上信越自動車道'), (SELECT id FROM toll_nodes WHERE name='碓氷軽井沢IC'), 52.5);

-- 東名高速道路
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='東名高速道路'), (SELECT id FROM toll_nodes WHERE name='用賀出入口'), 0.0),
((SELECT id FROM toll_roads WHERE name='東名高速道路'), (SELECT id FROM toll_nodes WHERE name='東名川崎IC'), 7.6),
((SELECT id FROM toll_roads WHERE name='東名高速道路'), (SELECT id FROM toll_nodes WHERE name='横浜青葉JCT'), 13.3),
((SELECT id FROM toll_roads WHERE name='東名高速道路'), (SELECT id FROM toll_nodes WHERE name='横浜町田IC'), 19.7),
((SELECT id FROM toll_roads WHERE name='東名高速道路'), (SELECT id FROM toll_nodes WHERE name='海老名JCT'), 33.9),
((SELECT id FROM toll_roads WHERE name='東名高速道路'), (SELECT id FROM toll_nodes WHERE name='厚木IC'), 35.0),
((SELECT id FROM toll_roads WHERE name='東名高速道路'), (SELECT id FROM toll_nodes WHERE name='秦野中井IC'), 50.1),
((SELECT id FROM toll_roads WHERE name='東名高速道路'), (SELECT id FROM toll_nodes WHERE name='大井松田IC'), 57.9);

-- 横浜新道
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='横浜新道'), (SELECT id FROM toll_nodes WHERE name='保土ヶ谷IC'), 0.0),
((SELECT id FROM toll_roads WHERE name='横浜新道'), (SELECT id FROM toll_nodes WHERE name='新保土ヶ谷IC'), 4.5),
((SELECT id FROM toll_roads WHERE name='横浜新道'), (SELECT id FROM toll_nodes WHERE name='戸塚終点'), 10.1);

-- 保土ヶ谷バイパス
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='保土ヶ谷バイパス'), (SELECT id FROM toll_nodes WHERE name='新保土ヶ谷IC'), 0.0),
((SELECT id FROM toll_roads WHERE name='保土ヶ谷バイパス'), (SELECT id FROM toll_nodes WHERE name='横浜町田IC'), 10.2);

-- 横浜横須賀道路
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='横浜横須賀道路'), (SELECT id FROM toll_nodes WHERE name='新保土ヶ谷IC'), 0.0),
((SELECT id FROM toll_roads WHERE name='横浜横須賀道路'), (SELECT id FROM toll_nodes WHERE name='狩場JCT'), 1.2),
((SELECT id FROM toll_roads WHERE name='横浜横須賀道路'), (SELECT id FROM toll_nodes WHERE name='釜利谷JCT'), 12.9),
((SELECT id FROM toll_roads WHERE name='横浜横須賀道路'), (SELECT id FROM toll_nodes WHERE name='逗子IC'), 20.3),
((SELECT id FROM toll_roads WHERE name='横浜横須賀道路'), (SELECT id FROM toll_nodes WHERE name='横須賀IC'), 22.5),
((SELECT id FROM toll_roads WHERE name='横浜横須賀道路'), (SELECT id FROM toll_nodes WHERE name='衣笠IC'), 27.8),
((SELECT id FROM toll_roads WHERE name='横浜横須賀道路'), (SELECT id FROM toll_nodes WHERE name='馬堀海岸IC'), 34.0);

-- 横浜横須賀道路金沢支線
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='横浜横須賀道路金沢支線'), (SELECT id FROM toll_nodes WHERE name='釜利谷JCT'), 0.0),
((SELECT id FROM toll_roads WHERE name='横浜横須賀道路金沢支線'), (SELECT id FROM toll_nodes WHERE name='堀口能見台IC'), 2.9),
((SELECT id FROM toll_roads WHERE name='横浜横須賀道路金沢支線'), (SELECT id FROM toll_nodes WHERE name='並木IC'), 4.2);

-- 西湘バイパス
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='西湘バイパス'), (SELECT id FROM toll_nodes WHERE name='大磯東IC'), 0.0),
((SELECT id FROM toll_roads WHERE name='西湘バイパス'), (SELECT id FROM toll_nodes WHERE name='西湘二宮IC'), 6.1),
((SELECT id FROM toll_roads WHERE name='西湘バイパス'), (SELECT id FROM toll_nodes WHERE name='橘IC'), 8.9),
((SELECT id FROM toll_roads WHERE name='西湘バイパス'), (SELECT id FROM toll_nodes WHERE name='国府津IC'), 11.6),
((SELECT id FROM toll_roads WHERE name='西湘バイパス'), (SELECT id FROM toll_nodes WHERE name='酒匂IC'), 14.1),
((SELECT id FROM toll_roads WHERE name='西湘バイパス'), (SELECT id FROM toll_nodes WHERE name='小田原IC'), 15.7),
((SELECT id FROM toll_roads WHERE name='西湘バイパス'), (SELECT id FROM toll_nodes WHERE name='早川IC'), 18.3),
((SELECT id FROM toll_roads WHERE name='西湘バイパス'), (SELECT id FROM toll_nodes WHERE name='小田原西IC'), 19.5),
((SELECT id FROM toll_roads WHERE name='西湘バイパス'), (SELECT id FROM toll_nodes WHERE name='箱根口IC'), 20.8);

-- 小田原厚木道路
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='小田原厚木道路'), (SELECT id FROM toll_nodes WHERE name='小田原西IC'), 0.0),
((SELECT id FROM toll_roads WHERE name='小田原厚木道路'), (SELECT id FROM toll_nodes WHERE name='小田原東IC'), 6.7),
((SELECT id FROM toll_roads WHERE name='小田原厚木道路'), (SELECT id FROM toll_nodes WHERE name='二宮IC'), 13.8),
((SELECT id FROM toll_roads WHERE name='小田原厚木道路'), (SELECT id FROM toll_nodes WHERE name='大磯IC'), 17.2),
((SELECT id FROM toll_roads WHERE name='小田原厚木道路'), (SELECT id FROM toll_nodes WHERE name='平塚IC'), 23.2),
((SELECT id FROM toll_roads WHERE name='小田原厚木道路'), (SELECT id FROM toll_nodes WHERE name='伊勢原IC'), 26.8),
((SELECT id FROM toll_roads WHERE name='小田原厚木道路'), (SELECT id FROM toll_nodes WHERE name='厚木西IC'), 30.8),
((SELECT id FROM toll_roads WHERE name='小田原厚木道路'), (SELECT id FROM toll_nodes WHERE name='厚木IC'), 31.7);

-- 館山自動車道
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='館山自動車道'), (SELECT id FROM toll_nodes WHERE name='千葉南JCT'), 35.7),
((SELECT id FROM toll_roads WHERE name='館山自動車道'), (SELECT id FROM toll_nodes WHERE name='市原IC'), 43.7),
((SELECT id FROM toll_roads WHERE name='館山自動車道'), (SELECT id FROM toll_nodes WHERE name='姉崎袖ケ浦IC'), 53.7),
((SELECT id FROM toll_roads WHERE name='館山自動車道'), (SELECT id FROM toll_nodes WHERE name='木更津北IC'), 60.6),
((SELECT id FROM toll_roads WHERE name='館山自動車道'), (SELECT id FROM toll_nodes WHERE name='木更津JCT'), 62.5),
((SELECT id FROM toll_roads WHERE name='館山自動車道'), (SELECT id FROM toll_nodes WHERE name='君津IC'), 70.4),
((SELECT id FROM toll_roads WHERE name='館山自動車道'), (SELECT id FROM toll_nodes WHERE name='富津中央IC'), 79.7),
((SELECT id FROM toll_roads WHERE name='館山自動車道'), (SELECT id FROM toll_nodes WHERE name='富津竹岡IC'), 87.2);

-- 富津館山道路
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='富津館山道路'), (SELECT id FROM toll_nodes WHERE name='富津竹岡IC'), 87.2),
((SELECT id FROM toll_roads WHERE name='富津館山道路'), (SELECT id FROM toll_nodes WHERE name='富津金谷IC'), 91.3),
((SELECT id FROM toll_roads WHERE name='富津館山道路'), (SELECT id FROM toll_nodes WHERE name='鋸南保田IC'), 95.0),
((SELECT id FROM toll_roads WHERE name='富津館山道路'), (SELECT id FROM toll_nodes WHERE name='鋸南富山IC'), 98.2),
((SELECT id FROM toll_roads WHERE name='富津館山道路'), (SELECT id FROM toll_nodes WHERE name='富浦IC'), 106.3);

-- 新空港自動車道
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='新空港自動車道'), (SELECT id FROM toll_nodes WHERE name='成田JCT'), 0.0),
((SELECT id FROM toll_roads WHERE name='新空港自動車道'), (SELECT id FROM toll_nodes WHERE name='新空港IC'), 3.9);

-- 千葉東金道路
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='千葉東金道路'), (SELECT id FROM toll_nodes WHERE name='千葉東JCT'), 0.0),
((SELECT id FROM toll_roads WHERE name='千葉東金道路'), (SELECT id FROM toll_nodes WHERE name='大宮IC'), 3.2),
((SELECT id FROM toll_roads WHERE name='千葉東金道路'), (SELECT id FROM toll_nodes WHERE name='高田IC'), 7.5),
((SELECT id FROM toll_roads WHERE name='千葉東金道路'), (SELECT id FROM toll_nodes WHERE name='中野IC'), 11.4),
((SELECT id FROM toll_roads WHERE name='千葉東金道路'), (SELECT id FROM toll_nodes WHERE name='山田IC'), 13.9),
((SELECT id FROM toll_roads WHERE name='千葉東金道路'), (SELECT id FROM toll_nodes WHERE name='東金JCT'), 16.1);

-- 圏央道(木更津方面)
INSERT INTO toll_road_points (road_id, node_id, km_position) VALUES
((SELECT id FROM toll_roads WHERE name='圏央道(木更津方面)'), (SELECT id FROM toll_nodes WHERE name='松尾横芝IC'), 216.1),
((SELECT id FROM toll_roads WHERE name='圏央道(木更津方面)'), (SELECT id FROM toll_nodes WHERE name='山武成東IC'), 223.5),
((SELECT id FROM toll_roads WHERE name='圏央道(木更津方面)'), (SELECT id FROM toll_nodes WHERE name='東金JCT'), 232.2),
((SELECT id FROM toll_roads WHERE name='圏央道(木更津方面)'), (SELECT id FROM toll_nodes WHERE name='茂原長南IC'), 253.8),
((SELECT id FROM toll_roads WHERE name='圏央道(木更津方面)'), (SELECT id FROM toll_nodes WHERE name='市原鶴舞IC'), 262.6),
((SELECT id FROM toll_roads WHERE name='圏央道(木更津方面)'), (SELECT id FROM toll_nodes WHERE name='木更津東IC'), 275.1),
((SELECT id FROM toll_roads WHERE name='圏央道(木更津方面)'), (SELECT id FROM toll_nodes WHERE name='木更津JCT'), 282.2);

-- ===== 既存路線への追加ノード位置(重複防止ガード付き) =====
-- 圏央道
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='圏央道'), (SELECT id FROM toll_nodes WHERE name='茅ヶ崎JCT'), 0.0 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='圏央道') AND node_id=(SELECT id FROM toll_nodes WHERE name='茅ヶ崎JCT'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='圏央道'), (SELECT id FROM toll_nodes WHERE name='寒川南IC'), 1.9 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='圏央道') AND node_id=(SELECT id FROM toll_nodes WHERE name='寒川南IC'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='圏央道'), (SELECT id FROM toll_nodes WHERE name='寒川北IC'), 5.1 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='圏央道') AND node_id=(SELECT id FROM toll_nodes WHERE name='寒川北IC'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='圏央道'), (SELECT id FROM toll_nodes WHERE name='海老名南JCT'), 7.9 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='圏央道') AND node_id=(SELECT id FROM toll_nodes WHERE name='海老名南JCT'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='圏央道'), (SELECT id FROM toll_nodes WHERE name='海老名JCT'), 9.4 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='圏央道') AND node_id=(SELECT id FROM toll_nodes WHERE name='海老名JCT'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='圏央道'), (SELECT id FROM toll_nodes WHERE name='海老名IC'), 11.3 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='圏央道') AND node_id=(SELECT id FROM toll_nodes WHERE name='海老名IC'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='圏央道'), (SELECT id FROM toll_nodes WHERE name='圏央厚木IC'), 16.2 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='圏央道') AND node_id=(SELECT id FROM toll_nodes WHERE name='圏央厚木IC'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='圏央道'), (SELECT id FROM toll_nodes WHERE name='厚木PA'), 17.3 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='圏央道') AND node_id=(SELECT id FROM toll_nodes WHERE name='厚木PA'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='圏央道'), (SELECT id FROM toll_nodes WHERE name='相模原愛川IC'), 21.4 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='圏央道') AND node_id=(SELECT id FROM toll_nodes WHERE name='相模原愛川IC'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='圏央道'), (SELECT id FROM toll_nodes WHERE name='相模原IC'), 30.3 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='圏央道') AND node_id=(SELECT id FROM toll_nodes WHERE name='相模原IC'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='圏央道'), (SELECT id FROM toll_nodes WHERE name='高尾山IC'), 36.2 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='圏央道') AND node_id=(SELECT id FROM toll_nodes WHERE name='高尾山IC'));

-- 関越自動車道(近郊部)
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='関越自動車道(近郊部)'), (SELECT id FROM toll_nodes WHERE name='三芳SIC'), 13.9 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='関越自動車道(近郊部)') AND node_id=(SELECT id FROM toll_nodes WHERE name='三芳SIC'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='関越自動車道(近郊部)'), (SELECT id FROM toll_nodes WHERE name='鶴ヶ島IC'), 29.6 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='関越自動車道(近郊部)') AND node_id=(SELECT id FROM toll_nodes WHERE name='鶴ヶ島IC'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='関越自動車道(近郊部)'), (SELECT id FROM toll_nodes WHERE name='坂戸西SIC'), 32.5 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='関越自動車道(近郊部)') AND node_id=(SELECT id FROM toll_nodes WHERE name='坂戸西SIC'));

-- 関越自動車道(標準部)
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='関越自動車道(標準部)'), (SELECT id FROM toll_nodes WHERE name='藤岡JCT'), 78.6 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='関越自動車道(標準部)') AND node_id=(SELECT id FROM toll_nodes WHERE name='藤岡JCT'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='関越自動車道(標準部)'), (SELECT id FROM toll_nodes WHERE name='高崎JCT'), 84.6 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='関越自動車道(標準部)') AND node_id=(SELECT id FROM toll_nodes WHERE name='高崎JCT'));

-- 東北自動車道(近郊部)
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='東北自動車道(近郊部)'), (SELECT id FROM toll_nodes WHERE name='蓮田SIC'), 16.8 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='東北自動車道(近郊部)') AND node_id=(SELECT id FROM toll_nodes WHERE name='蓮田SIC'));

-- 東北自動車道(標準部)
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='東北自動車道(標準部)'), (SELECT id FROM toll_nodes WHERE name='岩舟JCT'), 61.8 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='東北自動車道(標準部)') AND node_id=(SELECT id FROM toll_nodes WHERE name='岩舟JCT'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='東北自動車道(標準部)'), (SELECT id FROM toll_nodes WHERE name='栃木都賀JCT'), 75.4 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='東北自動車道(標準部)') AND node_id=(SELECT id FROM toll_nodes WHERE name='栃木都賀JCT'));

-- 常磐自動車道(標準部)
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='常磐自動車道(標準部)'), (SELECT id FROM toll_nodes WHERE name='友部JCT'), 73.9 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='常磐自動車道(標準部)') AND node_id=(SELECT id FROM toll_nodes WHERE name='友部JCT'));

-- 京葉道路
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='京葉道路'), (SELECT id FROM toll_nodes WHERE name='篠崎IC'), 2.7 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='京葉道路') AND node_id=(SELECT id FROM toll_nodes WHERE name='篠崎IC'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='京葉道路'), (SELECT id FROM toll_nodes WHERE name='京葉JCT'), 3.9 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='京葉道路') AND node_id=(SELECT id FROM toll_nodes WHERE name='京葉JCT'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='京葉道路'), (SELECT id FROM toll_nodes WHERE name='原木IC'), 6.6 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='京葉道路') AND node_id=(SELECT id FROM toll_nodes WHERE name='原木IC'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='京葉道路'), (SELECT id FROM toll_nodes WHERE name='船橋IC'), 7.9 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='京葉道路') AND node_id=(SELECT id FROM toll_nodes WHERE name='船橋IC'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='京葉道路'), (SELECT id FROM toll_nodes WHERE name='花輪IC'), 11.5 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='京葉道路') AND node_id=(SELECT id FROM toll_nodes WHERE name='花輪IC'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='京葉道路'), (SELECT id FROM toll_nodes WHERE name='幕張IC'), 15.2 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='京葉道路') AND node_id=(SELECT id FROM toll_nodes WHERE name='幕張IC'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='京葉道路'), (SELECT id FROM toll_nodes WHERE name='武石IC'), 17.9 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='京葉道路') AND node_id=(SELECT id FROM toll_nodes WHERE name='武石IC'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='京葉道路'), (SELECT id FROM toll_nodes WHERE name='穴川IC'), 23.8 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='京葉道路') AND node_id=(SELECT id FROM toll_nodes WHERE name='穴川IC'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='京葉道路'), (SELECT id FROM toll_nodes WHERE name='貝塚IC'), 27.4 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='京葉道路') AND node_id=(SELECT id FROM toll_nodes WHERE name='貝塚IC'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='京葉道路'), (SELECT id FROM toll_nodes WHERE name='松ヶ丘IC'), 31.1 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='京葉道路') AND node_id=(SELECT id FROM toll_nodes WHERE name='松ヶ丘IC'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='京葉道路'), (SELECT id FROM toll_nodes WHERE name='千葉南JCT'), 35.7 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='京葉道路') AND node_id=(SELECT id FROM toll_nodes WHERE name='千葉南JCT'));

-- 首都高湾岸線
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高湾岸線'), (SELECT id FROM toll_nodes WHERE name='幸浦出入口'), 0.9 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高湾岸線') AND node_id=(SELECT id FROM toll_nodes WHERE name='幸浦出入口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高湾岸線'), (SELECT id FROM toll_nodes WHERE name='杉田出入口'), 4.0 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高湾岸線') AND node_id=(SELECT id FROM toll_nodes WHERE name='杉田出入口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高湾岸線'), (SELECT id FROM toll_nodes WHERE name='磯子出入口'), 6.1 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高湾岸線') AND node_id=(SELECT id FROM toll_nodes WHERE name='磯子出入口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高湾岸線'), (SELECT id FROM toll_nodes WHERE name='三渓園出入口'), 10.9 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高湾岸線') AND node_id=(SELECT id FROM toll_nodes WHERE name='三渓園出入口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高湾岸線'), (SELECT id FROM toll_nodes WHERE name='本牧JCT'), 14.3 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高湾岸線') AND node_id=(SELECT id FROM toll_nodes WHERE name='本牧JCT'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高湾岸線'), (SELECT id FROM toll_nodes WHERE name='大黒JCT'), 17.4 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高湾岸線') AND node_id=(SELECT id FROM toll_nodes WHERE name='大黒JCT'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高湾岸線'), (SELECT id FROM toll_nodes WHERE name='東扇島出入口'), 25.0 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高湾岸線') AND node_id=(SELECT id FROM toll_nodes WHERE name='東扇島出入口'));

