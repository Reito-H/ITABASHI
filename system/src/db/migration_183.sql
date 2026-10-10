-- ===================================================
-- migration_183: ITABASHI BATTLE 2 — 「打ち上げ会場の発表」（kind='announce'）をメニューの最後に追加
--   予告の文 → 「発表する！」で画像・動画つきで発表。会場名・画像・動画は管理画面「メニュー」で設定する。
--   すでに発表ラウンドが入っているゲームには何もしない。
-- ===================================================
INSERT INTO ib2_steps (game_id, sort_order, kind, title, config) SELECT g.id, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM ib2_steps WHERE game_id = g.id), 'announce', '打ち上げ会場の発表', json_object('teaser', '最後に…' || char(10) || '本日の打ち上げ会場を発表します！', 'reveal', '', 'body', '', 'bgm', 'builtin:battle') FROM ib2_games g WHERE g.is_active = 1 AND NOT EXISTS (SELECT 1 FROM ib2_steps s WHERE s.game_id = g.id AND s.kind = 'announce');
