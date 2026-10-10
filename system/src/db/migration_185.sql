-- ===================================================
-- migration_185: ITABASHI BATTLE 2 — 白い「講座スライド」（kind='formal'）で始める
--   まじめな勉強会のふり → 講座 第1部 → 参加受付（ここからバトル）の流れにする。
--   ・メニューの先頭に表紙「2026年度 新卒 繁忙期対策勉強会」を追加
--   ・既存の「講座 第1部」（タイトル型）を白い講座スライドにして2番目へ移動
--   すでに講座スライドがあるゲームには何もしない。
-- ===================================================
UPDATE ib2_steps SET sort_order = sort_order + 2 WHERE game_id IN (SELECT id FROM ib2_games WHERE is_active = 1) AND NOT EXISTS (SELECT 1 FROM ib2_steps s2 WHERE s2.game_id = ib2_steps.game_id AND s2.kind = 'formal');
UPDATE ib2_steps SET kind = 'formal', title = '繁忙期の売上と出番数', sort_order = 1, config = json_object('kicker', '講座 第1部', 'subtitle', '', 'body', '', 'footer', '') WHERE title = '講座 第1部' AND kind = 'title' AND game_id IN (SELECT id FROM ib2_games WHERE is_active = 1) AND NOT EXISTS (SELECT 1 FROM ib2_steps s2 WHERE s2.game_id = ib2_steps.game_id AND s2.kind = 'formal');
INSERT INTO ib2_steps (game_id, sort_order, kind, title, config) SELECT g.id, 0, 'formal', '2026年度 新卒 繁忙期対策勉強会', json_object('kicker', '', 'subtitle', '', 'body', '', 'footer', '') FROM ib2_games g WHERE g.is_active = 1 AND NOT EXISTS (SELECT 1 FROM ib2_steps s WHERE s.game_id = g.id AND s.kind = 'formal' AND s.sort_order = 0);
