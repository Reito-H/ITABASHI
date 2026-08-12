-- ===================================================
-- migration_088: 2026年メーター管理台帳（正）とvehicle_teamsの車番→班対応を照合し、ズレを修正
--   1563: 3班→4班に修正。186/161/5246: 台帳にはあるがDBに未登録だったため追加
-- ===================================================

UPDATE vehicle_teams SET team = 4 WHERE car_no = '1563';
INSERT OR REPLACE INTO vehicle_teams (car_no, team) VALUES ('186', 5);
INSERT OR REPLACE INTO vehicle_teams (car_no, team) VALUES ('161', 6);
INSERT OR REPLACE INTO vehicle_teams (car_no, team) VALUES ('5246', 6);
