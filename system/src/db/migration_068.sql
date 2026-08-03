-- migration_068: 公式ICデータ(座標付き)との突き合わせによる網羅性の向上
-- ドラぷらのIC検索用データ(全国2,221件のIC/JCT、座標付き)を取得し、
-- 既存路線と機械的に突き合わせて『本当に抜けている』ICのみを抽出。
-- 抜けていたICの位置は、直近の既存(検証済み)ICとの区間を座標間の直線距離(haversine)で
-- 按分して算出した推定値(実際の道なり距離とは若干のズレがあり得る)。
-- 新規路線として「首都高1号上野線」を追加。

-- ===== 新規路線マスタ(首都高1号上野線) =====
INSERT INTO toll_roads (name, operator, rate_zone, formula, fixed_fare, fare_cap) SELECT '首都高1号上野線','shutoko','standard','shutoko',NULL,NULL WHERE NOT EXISTS (SELECT 1 FROM toll_roads WHERE name='首都高1号上野線');

-- ===== ノード追加(既存なら何もしない) =====
INSERT INTO toll_nodes (name, kind) SELECT 'みなとみらい', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = 'みなとみらい');
INSERT INTO toll_nodes (name, kind) SELECT '上矢部', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '上矢部');
INSERT INTO toll_nodes (name, kind) SELECT '上野', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '上野');
INSERT INTO toll_nodes (name, kind) SELECT '今井', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '今井');
INSERT INTO toll_nodes (name, kind) SELECT '佐原', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '佐原');
INSERT INTO toll_nodes (name, kind) SELECT '入谷', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '入谷');
INSERT INTO toll_nodes (name, kind) SELECT '別所(横浜横須賀道路)', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '別所(横浜横須賀道路)');
INSERT INTO toll_nodes (name, kind) SELECT '前橋南', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '前橋南');
INSERT INTO toll_nodes (name, kind) SELECT '壬生', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '壬生');
INSERT INTO toll_nodes (name, kind) SELECT '大網白里スマート', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '大網白里スマート');
INSERT INTO toll_nodes (name, kind) SELECT '太田藪塚', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '太田藪塚');
INSERT INTO toll_nodes (name, kind) SELECT '子安', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '子安');
INSERT INTO toll_nodes (name, kind) SELECT '守屋町', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '守屋町');
INSERT INTO toll_nodes (name, kind) SELECT '富里', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '富里');
INSERT INTO toll_nodes (name, kind) SELECT '山下町', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '山下町');
INSERT INTO toll_nodes (name, kind) SELECT '峰岡', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '峰岡');
INSERT INTO toll_nodes (name, kind) SELECT '嵐山小川', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '嵐山小川');
INSERT INTO toll_nodes (name, kind) SELECT '川上', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '川上');
INSERT INTO toll_nodes (name, kind) SELECT '市川中央', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '市川中央');
INSERT INTO toll_nodes (name, kind) SELECT '市川北(東京外環道)', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '市川北(東京外環道)');
INSERT INTO toll_nodes (name, kind) SELECT '市川南(東京外環道)', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '市川南(東京外環道)');
INSERT INTO toll_nodes (name, kind) SELECT '常盤台', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '常盤台');
INSERT INTO toll_nodes (name, kind) SELECT '日野', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '日野');
INSERT INTO toll_nodes (name, kind) SELECT '星川', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '星川');
INSERT INTO toll_nodes (name, kind) SELECT '昭和', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '昭和');
INSERT INTO toll_nodes (name, kind) SELECT '朝比奈', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '朝比奈');
INSERT INTO toll_nodes (name, kind) SELECT '本町(首都高速)', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '本町(首都高速)');
INSERT INTO toll_nodes (name, kind) SELECT '東神奈川', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '東神奈川');
INSERT INTO toll_nodes (name, kind) SELECT '松戸', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '松戸');
INSERT INTO toll_nodes (name, kind) SELECT '横浜公園', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '横浜公園');
INSERT INTO toll_nodes (name, kind) SELECT '横浜駅東口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '横浜駅東口');
INSERT INTO toll_nodes (name, kind) SELECT '汐入', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '汐入');
INSERT INTO toll_nodes (name, kind) SELECT '浅田', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '浅田');
INSERT INTO toll_nodes (name, kind) SELECT '浜川崎', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '浜川崎');
INSERT INTO toll_nodes (name, kind) SELECT '浦賀', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '浦賀');
INSERT INTO toll_nodes (name, kind) SELECT '港南台', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '港南台');
INSERT INTO toll_nodes (name, kind) SELECT '湾岸環八', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '湾岸環八');
INSERT INTO toll_nodes (name, kind) SELECT '石岡小美玉スマート', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '石岡小美玉スマート');
INSERT INTO toll_nodes (name, kind) SELECT '石橋', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '石橋');
INSERT INTO toll_nodes (name, kind) SELECT '神崎', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '神崎');
INSERT INTO toll_nodes (name, kind) SELECT '空港中央', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '空港中央');
INSERT INTO toll_nodes (name, kind) SELECT '綾瀬スマート', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '綾瀬スマート');
INSERT INTO toll_nodes (name, kind) SELECT '茂原北', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '茂原北');
INSERT INTO toll_nodes (name, kind) SELECT '茂原長柄スマート', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '茂原長柄スマート');
INSERT INTO toll_nodes (name, kind) SELECT '茨城町東', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '茨城町東');
INSERT INTO toll_nodes (name, kind) SELECT '茨城町西', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '茨城町西');
INSERT INTO toll_nodes (name, kind) SELECT '荻窪', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '荻窪');
INSERT INTO toll_nodes (name, kind) SELECT '藤塚', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '藤塚');
INSERT INTO toll_nodes (name, kind) SELECT '赤城', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '赤城');
INSERT INTO toll_nodes (name, kind) SELECT '金沢自然公園', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '金沢自然公園');
INSERT INTO toll_nodes (name, kind) SELECT '駒形(北関東道)', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '駒形(北関東道)');

-- ===== 路線への追加ノード位置(重複防止ガード付き) =====
-- 東名高速道路
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='東名高速道路'), (SELECT id FROM toll_nodes WHERE name='綾瀬スマート'), 29.0 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='東名高速道路') AND node_id=(SELECT id FROM toll_nodes WHERE name='綾瀬スマート'));

-- 東京外環自動車道
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='東京外環自動車道'), (SELECT id FROM toll_nodes WHERE name='松戸'), 34.3 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='東京外環自動車道') AND node_id=(SELECT id FROM toll_nodes WHERE name='松戸'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='東京外環自動車道'), (SELECT id FROM toll_nodes WHERE name='市川北(東京外環道)'), 37.1 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='東京外環自動車道') AND node_id=(SELECT id FROM toll_nodes WHERE name='市川北(東京外環道)'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='東京外環自動車道'), (SELECT id FROM toll_nodes WHERE name='市川中央'), 39.8 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='東京外環自動車道') AND node_id=(SELECT id FROM toll_nodes WHERE name='市川中央'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='東京外環自動車道'), (SELECT id FROM toll_nodes WHERE name='市川南(東京外環道)'), 43.0 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='東京外環自動車道') AND node_id=(SELECT id FROM toll_nodes WHERE name='市川南(東京外環道)'));

-- 東関東自動車道(近郊部)
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='東関東自動車道(近郊部)'), (SELECT id FROM toll_nodes WHERE name='富里'), 40.7 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='東関東自動車道(近郊部)') AND node_id=(SELECT id FROM toll_nodes WHERE name='富里'));

-- 常磐自動車道(標準部)
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='常磐自動車道(標準部)'), (SELECT id FROM toll_nodes WHERE name='石岡小美玉スマート'), 66.0 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='常磐自動車道(標準部)') AND node_id=(SELECT id FROM toll_nodes WHERE name='石岡小美玉スマート'));

-- 北関東自動車道
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='北関東自動車道'), (SELECT id FROM toll_nodes WHERE name='前橋南'), 3.4 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='北関東自動車道') AND node_id=(SELECT id FROM toll_nodes WHERE name='前橋南'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='北関東自動車道'), (SELECT id FROM toll_nodes WHERE name='駒形(北関東道)'), 7.9 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='北関東自動車道') AND node_id=(SELECT id FROM toll_nodes WHERE name='駒形(北関東道)'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='北関東自動車道'), (SELECT id FROM toll_nodes WHERE name='太田藪塚'), 20.0 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='北関東自動車道') AND node_id=(SELECT id FROM toll_nodes WHERE name='太田藪塚'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='北関東自動車道'), (SELECT id FROM toll_nodes WHERE name='壬生'), 76.3 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='北関東自動車道') AND node_id=(SELECT id FROM toll_nodes WHERE name='壬生'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='北関東自動車道'), (SELECT id FROM toll_nodes WHERE name='茨城町西'), 138.2 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='北関東自動車道') AND node_id=(SELECT id FROM toll_nodes WHERE name='茨城町西'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='北関東自動車道'), (SELECT id FROM toll_nodes WHERE name='茨城町東'), 145.1 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='北関東自動車道') AND node_id=(SELECT id FROM toll_nodes WHERE name='茨城町東'));

-- 関越自動車道(標準部)
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='関越自動車道(標準部)'), (SELECT id FROM toll_nodes WHERE name='嵐山小川'), 46.0 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='関越自動車道(標準部)') AND node_id=(SELECT id FROM toll_nodes WHERE name='嵐山小川'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='関越自動車道(標準部)'), (SELECT id FROM toll_nodes WHERE name='赤城'), 109.6 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='関越自動車道(標準部)') AND node_id=(SELECT id FROM toll_nodes WHERE name='赤城'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='関越自動車道(標準部)'), (SELECT id FROM toll_nodes WHERE name='昭和'), 117.9 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='関越自動車道(標準部)') AND node_id=(SELECT id FROM toll_nodes WHERE name='昭和'));

-- 圏央道
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='圏央道'), (SELECT id FROM toll_nodes WHERE name='神崎'), 185.4 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='圏央道') AND node_id=(SELECT id FROM toll_nodes WHERE name='神崎'));

-- 圏央道(木更津方面)
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='圏央道(木更津方面)'), (SELECT id FROM toll_nodes WHERE name='大網白里スマート'), 239.7 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='圏央道(木更津方面)') AND node_id=(SELECT id FROM toll_nodes WHERE name='大網白里スマート'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='圏央道(木更津方面)'), (SELECT id FROM toll_nodes WHERE name='茂原北'), 243.0 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='圏央道(木更津方面)') AND node_id=(SELECT id FROM toll_nodes WHERE name='茂原北'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='圏央道(木更津方面)'), (SELECT id FROM toll_nodes WHERE name='茂原長柄スマート'), 248.6 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='圏央道(木更津方面)') AND node_id=(SELECT id FROM toll_nodes WHERE name='茂原長柄スマート'));

-- 横浜新道
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='横浜新道'), (SELECT id FROM toll_nodes WHERE name='常盤台'), -3.2 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='横浜新道') AND node_id=(SELECT id FROM toll_nodes WHERE name='常盤台'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='横浜新道'), (SELECT id FROM toll_nodes WHERE name='峰岡'), -2.7 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='横浜新道') AND node_id=(SELECT id FROM toll_nodes WHERE name='峰岡'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='横浜新道'), (SELECT id FROM toll_nodes WHERE name='星川'), -2.0 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='横浜新道') AND node_id=(SELECT id FROM toll_nodes WHERE name='星川'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='横浜新道'), (SELECT id FROM toll_nodes WHERE name='藤塚'), -0.4 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='横浜新道') AND node_id=(SELECT id FROM toll_nodes WHERE name='藤塚'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='横浜新道'), (SELECT id FROM toll_nodes WHERE name='今井'), 2.3 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='横浜新道') AND node_id=(SELECT id FROM toll_nodes WHERE name='今井'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='横浜新道'), (SELECT id FROM toll_nodes WHERE name='川上'), 5.4 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='横浜新道') AND node_id=(SELECT id FROM toll_nodes WHERE name='川上'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='横浜新道'), (SELECT id FROM toll_nodes WHERE name='上矢部'), 8.9 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='横浜新道') AND node_id=(SELECT id FROM toll_nodes WHERE name='上矢部'));

-- 横浜横須賀道路
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='横浜横須賀道路'), (SELECT id FROM toll_nodes WHERE name='別所(横浜横須賀道路)'), 6.1 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='横浜横須賀道路') AND node_id=(SELECT id FROM toll_nodes WHERE name='別所(横浜横須賀道路)'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='横浜横須賀道路'), (SELECT id FROM toll_nodes WHERE name='日野'), 9.6 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='横浜横須賀道路') AND node_id=(SELECT id FROM toll_nodes WHERE name='日野'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='横浜横須賀道路'), (SELECT id FROM toll_nodes WHERE name='港南台'), 11.5 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='横浜横須賀道路') AND node_id=(SELECT id FROM toll_nodes WHERE name='港南台'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='横浜横須賀道路'), (SELECT id FROM toll_nodes WHERE name='朝比奈'), 15.5 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='横浜横須賀道路') AND node_id=(SELECT id FROM toll_nodes WHERE name='朝比奈'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='横浜横須賀道路'), (SELECT id FROM toll_nodes WHERE name='佐原'), 29.6 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='横浜横須賀道路') AND node_id=(SELECT id FROM toll_nodes WHERE name='佐原'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='横浜横須賀道路'), (SELECT id FROM toll_nodes WHERE name='浦賀'), 33.0 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='横浜横須賀道路') AND node_id=(SELECT id FROM toll_nodes WHERE name='浦賀'));

-- 横浜横須賀道路金沢支線
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='横浜横須賀道路金沢支線'), (SELECT id FROM toll_nodes WHERE name='金沢自然公園'), 1.0 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='横浜横須賀道路金沢支線') AND node_id=(SELECT id FROM toll_nodes WHERE name='金沢自然公園'));

-- 小田原厚木道路
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='小田原厚木道路'), (SELECT id FROM toll_nodes WHERE name='荻窪'), 1.6 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='小田原厚木道路') AND node_id=(SELECT id FROM toll_nodes WHERE name='荻窪'));

-- 西湘バイパス
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='西湘バイパス'), (SELECT id FROM toll_nodes WHERE name='石橋'), 17.6 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='西湘バイパス') AND node_id=(SELECT id FROM toll_nodes WHERE name='石橋'));

-- 首都高1号上野線
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高1号上野線'), (SELECT id FROM toll_nodes WHERE name='本町(首都高速)'), 0.0 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高1号上野線') AND node_id=(SELECT id FROM toll_nodes WHERE name='本町(首都高速)'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高1号上野線'), (SELECT id FROM toll_nodes WHERE name='上野'), 2.0 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高1号上野線') AND node_id=(SELECT id FROM toll_nodes WHERE name='上野'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高1号上野線'), (SELECT id FROM toll_nodes WHERE name='入谷'), 3.1 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高1号上野線') AND node_id=(SELECT id FROM toll_nodes WHERE name='入谷'));

-- 首都高神奈川1号横羽線
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高神奈川1号横羽線'), (SELECT id FROM toll_nodes WHERE name='浜川崎'), 4.7 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高神奈川1号横羽線') AND node_id=(SELECT id FROM toll_nodes WHERE name='浜川崎'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高神奈川1号横羽線'), (SELECT id FROM toll_nodes WHERE name='浅田'), 6.2 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高神奈川1号横羽線') AND node_id=(SELECT id FROM toll_nodes WHERE name='浅田'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高神奈川1号横羽線'), (SELECT id FROM toll_nodes WHERE name='汐入'), 7.2 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高神奈川1号横羽線') AND node_id=(SELECT id FROM toll_nodes WHERE name='汐入'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高神奈川1号横羽線'), (SELECT id FROM toll_nodes WHERE name='守屋町'), 10.6 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高神奈川1号横羽線') AND node_id=(SELECT id FROM toll_nodes WHERE name='守屋町'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高神奈川1号横羽線'), (SELECT id FROM toll_nodes WHERE name='子安'), 10.7 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高神奈川1号横羽線') AND node_id=(SELECT id FROM toll_nodes WHERE name='子安'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高神奈川1号横羽線'), (SELECT id FROM toll_nodes WHERE name='東神奈川'), 12.7 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高神奈川1号横羽線') AND node_id=(SELECT id FROM toll_nodes WHERE name='東神奈川'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高神奈川1号横羽線'), (SELECT id FROM toll_nodes WHERE name='横浜駅東口'), 14.4 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高神奈川1号横羽線') AND node_id=(SELECT id FROM toll_nodes WHERE name='横浜駅東口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高神奈川1号横羽線'), (SELECT id FROM toll_nodes WHERE name='みなとみらい'), 15.4 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高神奈川1号横羽線') AND node_id=(SELECT id FROM toll_nodes WHERE name='みなとみらい'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高神奈川1号横羽線'), (SELECT id FROM toll_nodes WHERE name='横浜公園'), 17.2 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高神奈川1号横羽線') AND node_id=(SELECT id FROM toll_nodes WHERE name='横浜公園'));

-- 首都高神奈川3号狩場線
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高神奈川3号狩場線'), (SELECT id FROM toll_nodes WHERE name='山下町'), 1.8 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高神奈川3号狩場線') AND node_id=(SELECT id FROM toll_nodes WHERE name='山下町'));

-- 首都高湾岸線
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高湾岸線'), (SELECT id FROM toll_nodes WHERE name='湾岸環八'), 31.7 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高湾岸線') AND node_id=(SELECT id FROM toll_nodes WHERE name='湾岸環八'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高湾岸線'), (SELECT id FROM toll_nodes WHERE name='空港中央'), 34.3 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高湾岸線') AND node_id=(SELECT id FROM toll_nodes WHERE name='空港中央'));


-- 首都高1号上野線は江戸橋JCTで都心環状線から分岐(Wikipediaで確認)。接続点として追加
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高1号上野線'), (SELECT id FROM toll_nodes WHERE name='江戸橋JCT'), -0.5 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高1号上野線') AND node_id=(SELECT id FROM toll_nodes WHERE name='江戸橋JCT'));
