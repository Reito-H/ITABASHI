-- migration_067: 首都高湾岸線に舞浜・浦安・新木場・臨海副都心・千鳥町を追加
-- 公式CSV(料金所名称一覧)との突き合わせで判明した抜けのうち、
-- Wikipediaで正確な距離が確認できたものを追記する。

-- ===== ノード追加 =====
INSERT INTO toll_nodes (name, kind) SELECT '千鳥町出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '千鳥町出入口');
INSERT INTO toll_nodes (name, kind) SELECT '臨海副都心出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '臨海副都心出入口');
INSERT INTO toll_nodes (name, kind) SELECT '浦安出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '浦安出入口');
INSERT INTO toll_nodes (name, kind) SELECT '舞浜入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '舞浜入口');
INSERT INTO toll_nodes (name, kind) SELECT '新木場出入口', 'ic' WHERE NOT EXISTS (SELECT 1 FROM toll_nodes WHERE name = '新木場出入口');

-- ===== 追加ノード位置 =====
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高湾岸線'), (SELECT id FROM toll_nodes WHERE name='臨海副都心出入口'), 43.1 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高湾岸線') AND node_id=(SELECT id FROM toll_nodes WHERE name='臨海副都心出入口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高湾岸線'), (SELECT id FROM toll_nodes WHERE name='新木場出入口'), 49.0 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高湾岸線') AND node_id=(SELECT id FROM toll_nodes WHERE name='新木場出入口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高湾岸線'), (SELECT id FROM toll_nodes WHERE name='舞浜入口'), 53.7 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高湾岸線') AND node_id=(SELECT id FROM toll_nodes WHERE name='舞浜入口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高湾岸線'), (SELECT id FROM toll_nodes WHERE name='浦安出入口'), 55.7 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高湾岸線') AND node_id=(SELECT id FROM toll_nodes WHERE name='浦安出入口'));
INSERT INTO toll_road_points (road_id, node_id, km_position) SELECT (SELECT id FROM toll_roads WHERE name='首都高湾岸線'), (SELECT id FROM toll_nodes WHERE name='千鳥町出入口'), 59.6 WHERE NOT EXISTS (SELECT 1 FROM toll_road_points WHERE road_id=(SELECT id FROM toll_roads WHERE name='首都高湾岸線') AND node_id=(SELECT id FROM toll_nodes WHERE name='千鳥町出入口'));
