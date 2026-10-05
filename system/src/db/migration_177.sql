-- ===================================================
-- migration_177: ITABASHI BATTLE 2 — 参加受付・チーム発表・代表者決めをメニュー（FLOW）の項目にする
--   これまで固定の順番で先頭に付いていた3つを、メニューの先頭に普通の項目として入れる。
--   既に入っているゲームには何もしない（2回流しても重複しない）。
-- ===================================================
UPDATE ib2_steps SET sort_order = sort_order + 3 WHERE game_id IN (SELECT id FROM ib2_games WHERE is_active = 1) AND NOT EXISTS (SELECT 1 FROM ib2_steps s2 WHERE s2.game_id = ib2_steps.game_id AND s2.kind = 'lobby');
INSERT INTO ib2_steps (game_id, sort_order, kind, title, config) SELECT g.id, v.o, v.k, v.t, '{}' FROM ib2_games g, (SELECT 0 AS o, 'lobby' AS k, '参加受付' AS t UNION ALL SELECT 1, 'reveal', 'チーム発表' UNION ALL SELECT 2, 'setup', '代表者・チーム名決め') v WHERE g.is_active = 1 AND NOT EXISTS (SELECT 1 FROM ib2_steps s2 WHERE s2.game_id = g.id AND s2.kind = 'lobby');
