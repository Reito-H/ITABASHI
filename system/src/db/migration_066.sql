-- migration_066: 首都高 既存路線の出入口を追加補完
-- ユーザー指摘(「中台」「空港西」などが抜けている)を受け、前回調査済みだったが
-- 未反映だった出入口データをすべて追記する。新規調査は行わず、既存の調査結果を
-- 漏れなく反映することが目的。migration_064/065同様、既存なら何もしない追記形式。

-- ===== ノード追加(既存なら何もしない) =====
INSERT INTO toll_nodes (name, kind) SELECT '新富町出口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '新富町出口');
INSERT INTO toll_nodes (name, kind) SELECT '銀座出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '銀座出入口');
INSERT INTO toll_nodes (name, kind) SELECT '汐留出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '汐留出入口');
INSERT INTO toll_nodes (name, kind) SELECT '芝公園出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '芝公園出入口');
INSERT INTO toll_nodes (name, kind) SELECT '飯倉出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '飯倉出入口');
INSERT INTO toll_nodes (name, kind) SELECT '霞が関出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '霞が関出入口');
INSERT INTO toll_nodes (name, kind) SELECT '代官町出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '代官町出入口');
INSERT INTO toll_nodes (name, kind) SELECT '北の丸出口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '北の丸出口');
INSERT INTO toll_nodes (name, kind) SELECT '神田橋出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '神田橋出入口');
INSERT INTO toll_nodes (name, kind) SELECT '中環大井南出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '中環大井南出入口');
INSERT INTO toll_nodes (name, kind) SELECT '富ヶ谷出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '富ヶ谷出入口');
INSERT INTO toll_nodes (name, kind) SELECT '初台南出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '初台南出入口');
INSERT INTO toll_nodes (name, kind) SELECT '中野長者橋出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '中野長者橋出入口');
INSERT INTO toll_nodes (name, kind) SELECT '西池袋出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '西池袋出入口');
INSERT INTO toll_nodes (name, kind) SELECT '高松入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '高松入口');
INSERT INTO toll_nodes (name, kind) SELECT '新板橋出口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '新板橋出口');
INSERT INTO toll_nodes (name, kind) SELECT '滝野川入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '滝野川入口');
INSERT INTO toll_nodes (name, kind) SELECT '王子南出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '王子南出入口');
INSERT INTO toll_nodes (name, kind) SELECT '王子北出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '王子北出入口');
INSERT INTO toll_nodes (name, kind) SELECT '扇大橋出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '扇大橋出入口');
INSERT INTO toll_nodes (name, kind) SELECT '千住新橋出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '千住新橋出入口');
INSERT INTO toll_nodes (name, kind) SELECT '小菅出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '小菅出入口');
INSERT INTO toll_nodes (name, kind) SELECT '四つ木出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '四つ木出入口');
INSERT INTO toll_nodes (name, kind) SELECT '平井大橋出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '平井大橋出入口');
INSERT INTO toll_nodes (name, kind) SELECT '船堀橋出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '船堀橋出入口');
INSERT INTO toll_nodes (name, kind) SELECT '清新町出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '清新町出入口');
INSERT INTO toll_nodes (name, kind) SELECT '幡ヶ谷出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '幡ヶ谷出入口');
INSERT INTO toll_nodes (name, kind) SELECT '一ツ橋出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '一ツ橋出入口');
INSERT INTO toll_nodes (name, kind) SELECT '西神田出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '西神田出入口');
INSERT INTO toll_nodes (name, kind) SELECT '飯田橋出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '飯田橋出入口');
INSERT INTO toll_nodes (name, kind) SELECT '護国寺出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '護国寺出入口');
INSERT INTO toll_nodes (name, kind) SELECT '北池袋出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '北池袋出入口');
INSERT INTO toll_nodes (name, kind) SELECT '板橋本町出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '板橋本町出入口');
INSERT INTO toll_nodes (name, kind) SELECT '中台出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '中台出入口');
INSERT INTO toll_nodes (name, kind) SELECT '戸田南出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '戸田南出入口');
INSERT INTO toll_nodes (name, kind) SELECT '芝浦出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '芝浦出入口');
INSERT INTO toll_nodes (name, kind) SELECT '勝島出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '勝島出入口');
INSERT INTO toll_nodes (name, kind) SELECT '鈴ヶ森出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '鈴ヶ森出入口');
INSERT INTO toll_nodes (name, kind) SELECT '平和島出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '平和島出入口');
INSERT INTO toll_nodes (name, kind) SELECT '空港西出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '空港西出入口');
INSERT INTO toll_nodes (name, kind) SELECT '駒形出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '駒形出入口');
INSERT INTO toll_nodes (name, kind) SELECT '堤通出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '堤通出入口');
INSERT INTO toll_nodes (name, kind) SELECT '八潮出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '八潮出入口');
INSERT INTO toll_nodes (name, kind) SELECT '小松川出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '小松川出入口');
INSERT INTO toll_nodes (name, kind) SELECT '枝川出口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '枝川出口');
INSERT INTO toll_nodes (name, kind) SELECT '鹿浜橋出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '鹿浜橋出入口');
INSERT INTO toll_nodes (name, kind) SELECT '鹿浜橋入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '鹿浜橋入口');
INSERT INTO toll_nodes (name, kind) SELECT '東領家出口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '東領家出口');
INSERT INTO toll_nodes (name, kind) SELECT '足立入谷出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '足立入谷出入口');
INSERT INTO toll_nodes (name, kind) SELECT '新郷出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '新郷出入口');
INSERT INTO toll_nodes (name, kind) SELECT '安行出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '安行出入口');

-- ===== 既存路線への追加ノード位置(重複防止ガード付き) =====
-- 首都高都心環状線
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高都心環状線'), (SELECT id FROM toll_nodes WHERE name='新富町出口'), 1.9 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高都心環状線') AND node_id=(SELECT id FROM toll_nodes WHERE name='新富町出口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高都心環状線'), (SELECT id FROM toll_nodes WHERE name='銀座出入口'), 2.2 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高都心環状線') AND node_id=(SELECT id FROM toll_nodes WHERE name='銀座出入口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高都心環状線'), (SELECT id FROM toll_nodes WHERE name='汐留出入口'), 3.4 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高都心環状線') AND node_id=(SELECT id FROM toll_nodes WHERE name='汐留出入口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高都心環状線'), (SELECT id FROM toll_nodes WHERE name='芝公園出入口'), 5.4 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高都心環状線') AND node_id=(SELECT id FROM toll_nodes WHERE name='芝公園出入口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高都心環状線'), (SELECT id FROM toll_nodes WHERE name='飯倉出入口'), 7.4 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高都心環状線') AND node_id=(SELECT id FROM toll_nodes WHERE name='飯倉出入口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高都心環状線'), (SELECT id FROM toll_nodes WHERE name='霞が関出入口'), 9.0 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高都心環状線') AND node_id=(SELECT id FROM toll_nodes WHERE name='霞が関出入口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高都心環状線'), (SELECT id FROM toll_nodes WHERE name='代官町出入口'), 11.8 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高都心環状線') AND node_id=(SELECT id FROM toll_nodes WHERE name='代官町出入口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高都心環状線'), (SELECT id FROM toll_nodes WHERE name='北の丸出口'), 12.2 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高都心環状線') AND node_id=(SELECT id FROM toll_nodes WHERE name='北の丸出口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高都心環状線'), (SELECT id FROM toll_nodes WHERE name='神田橋出入口'), 13.1 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高都心環状線') AND node_id=(SELECT id FROM toll_nodes WHERE name='神田橋出入口'));

-- 首都高中央環状線
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高中央環状線'), (SELECT id FROM toll_nodes WHERE name='中環大井南出入口'), 1.2 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高中央環状線') AND node_id=(SELECT id FROM toll_nodes WHERE name='中環大井南出入口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高中央環状線'), (SELECT id FROM toll_nodes WHERE name='富ヶ谷出入口'), 11.4 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高中央環状線') AND node_id=(SELECT id FROM toll_nodes WHERE name='富ヶ谷出入口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高中央環状線'), (SELECT id FROM toll_nodes WHERE name='初台南出入口'), 11.8 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高中央環状線') AND node_id=(SELECT id FROM toll_nodes WHERE name='初台南出入口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高中央環状線'), (SELECT id FROM toll_nodes WHERE name='中野長者橋出入口'), 14.7 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高中央環状線') AND node_id=(SELECT id FROM toll_nodes WHERE name='中野長者橋出入口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高中央環状線'), (SELECT id FROM toll_nodes WHERE name='西池袋出入口'), 18.5 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高中央環状線') AND node_id=(SELECT id FROM toll_nodes WHERE name='西池袋出入口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高中央環状線'), (SELECT id FROM toll_nodes WHERE name='高松入口'), 20.1 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高中央環状線') AND node_id=(SELECT id FROM toll_nodes WHERE name='高松入口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高中央環状線'), (SELECT id FROM toll_nodes WHERE name='新板橋出口'), 22.3 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高中央環状線') AND node_id=(SELECT id FROM toll_nodes WHERE name='新板橋出口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高中央環状線'), (SELECT id FROM toll_nodes WHERE name='滝野川入口'), 22.4 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高中央環状線') AND node_id=(SELECT id FROM toll_nodes WHERE name='滝野川入口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高中央環状線'), (SELECT id FROM toll_nodes WHERE name='王子南出入口'), 25.4 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高中央環状線') AND node_id=(SELECT id FROM toll_nodes WHERE name='王子南出入口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高中央環状線'), (SELECT id FROM toll_nodes WHERE name='王子北出入口'), 26.1 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高中央環状線') AND node_id=(SELECT id FROM toll_nodes WHERE name='王子北出入口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高中央環状線'), (SELECT id FROM toll_nodes WHERE name='扇大橋出入口'), 28.4 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高中央環状線') AND node_id=(SELECT id FROM toll_nodes WHERE name='扇大橋出入口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高中央環状線'), (SELECT id FROM toll_nodes WHERE name='千住新橋出入口'), 31.4 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高中央環状線') AND node_id=(SELECT id FROM toll_nodes WHERE name='千住新橋出入口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高中央環状線'), (SELECT id FROM toll_nodes WHERE name='小菅出入口'), 34.1 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高中央環状線') AND node_id=(SELECT id FROM toll_nodes WHERE name='小菅出入口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高中央環状線'), (SELECT id FROM toll_nodes WHERE name='四つ木出入口'), 35.7 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高中央環状線') AND node_id=(SELECT id FROM toll_nodes WHERE name='四つ木出入口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高中央環状線'), (SELECT id FROM toll_nodes WHERE name='平井大橋出入口'), 38.3 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高中央環状線') AND node_id=(SELECT id FROM toll_nodes WHERE name='平井大橋出入口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高中央環状線'), (SELECT id FROM toll_nodes WHERE name='船堀橋出入口'), 42.2 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高中央環状線') AND node_id=(SELECT id FROM toll_nodes WHERE name='船堀橋出入口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高中央環状線'), (SELECT id FROM toll_nodes WHERE name='清新町出入口'), 44.4 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高中央環状線') AND node_id=(SELECT id FROM toll_nodes WHERE name='清新町出入口'));

-- 首都高4号新宿線
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高4号新宿線'), (SELECT id FROM toll_nodes WHERE name='幡ヶ谷出入口'), 6.8 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高4号新宿線') AND node_id=(SELECT id FROM toll_nodes WHERE name='幡ヶ谷出入口'));

-- 首都高5号池袋線
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高5号池袋線'), (SELECT id FROM toll_nodes WHERE name='一ツ橋出入口'), 0.1 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高5号池袋線') AND node_id=(SELECT id FROM toll_nodes WHERE name='一ツ橋出入口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高5号池袋線'), (SELECT id FROM toll_nodes WHERE name='西神田出入口'), 0.6 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高5号池袋線') AND node_id=(SELECT id FROM toll_nodes WHERE name='西神田出入口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高5号池袋線'), (SELECT id FROM toll_nodes WHERE name='飯田橋出入口'), 2.2 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高5号池袋線') AND node_id=(SELECT id FROM toll_nodes WHERE name='飯田橋出入口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高5号池袋線'), (SELECT id FROM toll_nodes WHERE name='護国寺出入口'), 4.5 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高5号池袋線') AND node_id=(SELECT id FROM toll_nodes WHERE name='護国寺出入口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高5号池袋線'), (SELECT id FROM toll_nodes WHERE name='北池袋出入口'), 7.5 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高5号池袋線') AND node_id=(SELECT id FROM toll_nodes WHERE name='北池袋出入口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高5号池袋線'), (SELECT id FROM toll_nodes WHERE name='板橋本町出入口'), 9.5 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高5号池袋線') AND node_id=(SELECT id FROM toll_nodes WHERE name='板橋本町出入口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高5号池袋線'), (SELECT id FROM toll_nodes WHERE name='中台出入口'), 12.9 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高5号池袋線') AND node_id=(SELECT id FROM toll_nodes WHERE name='中台出入口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高5号池袋線'), (SELECT id FROM toll_nodes WHERE name='戸田南出入口'), 18.8 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高5号池袋線') AND node_id=(SELECT id FROM toll_nodes WHERE name='戸田南出入口'));

-- 首都高1号羽田線
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高1号羽田線'), (SELECT id FROM toll_nodes WHERE name='芝浦出入口'), 1.7 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高1号羽田線') AND node_id=(SELECT id FROM toll_nodes WHERE name='芝浦出入口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高1号羽田線'), (SELECT id FROM toll_nodes WHERE name='勝島出入口'), 6.9 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高1号羽田線') AND node_id=(SELECT id FROM toll_nodes WHERE name='勝島出入口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高1号羽田線'), (SELECT id FROM toll_nodes WHERE name='鈴ヶ森出入口'), 7.5 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高1号羽田線') AND node_id=(SELECT id FROM toll_nodes WHERE name='鈴ヶ森出入口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高1号羽田線'), (SELECT id FROM toll_nodes WHERE name='平和島出入口'), 9.1 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高1号羽田線') AND node_id=(SELECT id FROM toll_nodes WHERE name='平和島出入口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高1号羽田線'), (SELECT id FROM toll_nodes WHERE name='空港西出入口'), 11.3 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高1号羽田線') AND node_id=(SELECT id FROM toll_nodes WHERE name='空港西出入口'));

-- 首都高6号向島線
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高6号向島線'), (SELECT id FROM toll_nodes WHERE name='駒形出入口'), 4.0 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高6号向島線') AND node_id=(SELECT id FROM toll_nodes WHERE name='駒形出入口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高6号向島線'), (SELECT id FROM toll_nodes WHERE name='堤通出入口'), 7.5 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高6号向島線') AND node_id=(SELECT id FROM toll_nodes WHERE name='堤通出入口'));

-- 首都高6号三郷線
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高6号三郷線'), (SELECT id FROM toll_nodes WHERE name='八潮出入口'), 7.1 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高6号三郷線') AND node_id=(SELECT id FROM toll_nodes WHERE name='八潮出入口'));

-- 首都高7号小松川線
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高7号小松川線'), (SELECT id FROM toll_nodes WHERE name='小松川出入口'), 7.0 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高7号小松川線') AND node_id=(SELECT id FROM toll_nodes WHERE name='小松川出入口'));

-- 首都高9号深川線
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高9号深川線'), (SELECT id FROM toll_nodes WHERE name='枝川出口'), 3.6 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高9号深川線') AND node_id=(SELECT id FROM toll_nodes WHERE name='枝川出口'));

-- 首都高川口線
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高川口線'), (SELECT id FROM toll_nodes WHERE name='鹿浜橋出入口'), 1.4 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高川口線') AND node_id=(SELECT id FROM toll_nodes WHERE name='鹿浜橋出入口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高川口線'), (SELECT id FROM toll_nodes WHERE name='鹿浜橋入口'), 2.6 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高川口線') AND node_id=(SELECT id FROM toll_nodes WHERE name='鹿浜橋入口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高川口線'), (SELECT id FROM toll_nodes WHERE name='東領家出口'), 3.7 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高川口線') AND node_id=(SELECT id FROM toll_nodes WHERE name='東領家出口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高川口線'), (SELECT id FROM toll_nodes WHERE name='足立入谷出入口'), 6.0 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高川口線') AND node_id=(SELECT id FROM toll_nodes WHERE name='足立入谷出入口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高川口線'), (SELECT id FROM toll_nodes WHERE name='新郷出入口'), 6.8 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高川口線') AND node_id=(SELECT id FROM toll_nodes WHERE name='新郷出入口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高川口線'), (SELECT id FROM toll_nodes WHERE name='安行出入口'), 8.7 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高川口線') AND node_id=(SELECT id FROM toll_nodes WHERE name='安行出入口'));

