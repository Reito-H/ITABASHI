-- ===================================================
-- migration_194: 台本「繁忙期対策勉強会 2026」に、ハンドブック解説・TTC知識集・新卒教材集から使える 16 枚をコピーして 47 枚に拡張
--   ・酔客対応シミュレーション／泥酔客の乗車拒否Q&A／酔客への聞き方Q&A／忘れ物対応リレー／付け待ちvs流しディベート
--   ・恵比寿駅西口 優良乗り場／東京駅八重洲口乗り場／渋谷駅西口乗り場
--   ・銀座乗車禁止地区（とは・規制日時・年末も規制Q&A・2026年版地図・銀座1号乗り場）→ 仮の銀座スライドは削除
--   ・教材集デッキは本番で「繁忙期勉強会 教材集」に改名されているため両方の名前で探す。
--   ・コピー元のデッキは変更しない。画像はコピー元と同じR2キーを参照。すでに拡張済みなら何もしない。
-- ===================================================

-- まだ拡張していないときだけ（目印: 「乗車禁止地区とは」がデッキ内に無い）
DELETE FROM daihon_slides WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND sort_order = 28 AND title = '銀座 乗車禁止地区（乗禁）' AND NOT EXISTS (SELECT 1 FROM daihon_slides x WHERE x.deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND x.title = '乗車禁止地区とは');
UPDATE daihon_slides SET sort_order = sort_order + 1000 WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND sort_order < 1000 AND NOT EXISTS (SELECT 1 FROM daihon_slides x WHERE x.deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND x.title = '乗車禁止地区とは');
UPDATE daihon_slides SET sort_order = 0 WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND sort_order = 1000;
UPDATE daihon_slides SET sort_order = 1 WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND sort_order = 1001;
UPDATE daihon_slides SET sort_order = 2 WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND sort_order = 1002;
UPDATE daihon_slides SET sort_order = 3 WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND sort_order = 1003;
UPDATE daihon_slides SET sort_order = 4 WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND sort_order = 1004;
UPDATE daihon_slides SET sort_order = 5 WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND sort_order = 1005;
UPDATE daihon_slides SET sort_order = 6 WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND sort_order = 1006;
UPDATE daihon_slides SET sort_order = 7 WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND sort_order = 1007;
UPDATE daihon_slides SET sort_order = 8 WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND sort_order = 1008;
UPDATE daihon_slides SET sort_order = 9 WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND sort_order = 1009;
UPDATE daihon_slides SET sort_order = 10 WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND sort_order = 1010;
UPDATE daihon_slides SET sort_order = 11 WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND sort_order = 1011;
UPDATE daihon_slides SET sort_order = 12 WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND sort_order = 1012;
UPDATE daihon_slides SET sort_order = 13 WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND sort_order = 1013;
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, hidden, ref_page, quiz, links)
SELECT (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026'), 14, layout, accent, title, subtitle, body, notes, images, 0, ref_page, quiz, links FROM daihon_slides
WHERE deck_id = (SELECT id FROM daihon_decks WHERE title IN ('年末年始勉強会 教材集','繁忙期勉強会 教材集') ORDER BY id LIMIT 1) AND sort_order = 27 AND NOT EXISTS (SELECT 1 FROM daihon_slides x WHERE x.deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND x.sort_order = 14);
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, hidden, ref_page, quiz, links)
SELECT (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026'), 15, layout, accent, title, subtitle, body, notes, images, 0, ref_page, quiz, links FROM daihon_slides
WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説') AND sort_order = 13 AND NOT EXISTS (SELECT 1 FROM daihon_slides x WHERE x.deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND x.sort_order = 15);
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, hidden, ref_page, quiz, links)
SELECT (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026'), 16, layout, accent, title, subtitle, body, notes, images, 0, ref_page, quiz, links FROM daihon_slides
WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説') AND sort_order = 14 AND NOT EXISTS (SELECT 1 FROM daihon_slides x WHERE x.deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND x.sort_order = 16);
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, hidden, ref_page, quiz, links)
SELECT (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026'), 17, layout, accent, title, subtitle, body, notes, images, 0, ref_page, quiz, links FROM daihon_slides
WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説') AND sort_order = 34 AND NOT EXISTS (SELECT 1 FROM daihon_slides x WHERE x.deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND x.sort_order = 17);
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, hidden, ref_page, quiz, links)
SELECT (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026'), 18, layout, accent, title, subtitle, body, notes, images, 0, ref_page, quiz, links FROM daihon_slides
WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説') AND sort_order = 35 AND NOT EXISTS (SELECT 1 FROM daihon_slides x WHERE x.deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND x.sort_order = 18);
UPDATE daihon_slides SET sort_order = 19 WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND sort_order = 1014;
UPDATE daihon_slides SET sort_order = 20 WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND sort_order = 1015;
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, hidden, ref_page, quiz, links)
SELECT (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026'), 21, layout, accent, title, subtitle, body, notes, images, 0, ref_page, quiz, links FROM daihon_slides
WHERE deck_id = (SELECT id FROM daihon_decks WHERE title IN ('年末年始勉強会 教材集','繁忙期勉強会 教材集') ORDER BY id LIMIT 1) AND sort_order = 28 AND NOT EXISTS (SELECT 1 FROM daihon_slides x WHERE x.deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND x.sort_order = 21);
UPDATE daihon_slides SET sort_order = 22 WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND sort_order = 1016;
UPDATE daihon_slides SET sort_order = 23 WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND sort_order = 1017;
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, hidden, ref_page, quiz, links)
SELECT (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026'), 24, layout, accent, title, subtitle, body, notes, images, 0, ref_page, quiz, links FROM daihon_slides
WHERE deck_id = (SELECT id FROM daihon_decks WHERE title IN ('年末年始勉強会 教材集','繁忙期勉強会 教材集') ORDER BY id LIMIT 1) AND sort_order = 38 AND NOT EXISTS (SELECT 1 FROM daihon_slides x WHERE x.deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND x.sort_order = 24);
UPDATE daihon_slides SET sort_order = 25 WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND sort_order = 1018;
UPDATE daihon_slides SET sort_order = 26 WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND sort_order = 1019;
UPDATE daihon_slides SET sort_order = 27 WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND sort_order = 1020;
UPDATE daihon_slides SET sort_order = 28 WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND sort_order = 1021;
UPDATE daihon_slides SET sort_order = 29 WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND sort_order = 1022;
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, hidden, ref_page, quiz, links)
SELECT (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026'), 30, layout, accent, title, subtitle, body, notes, images, 0, ref_page, quiz, links FROM daihon_slides
WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = '東京タクシーセンター 知識集') AND sort_order = 32 AND NOT EXISTS (SELECT 1 FROM daihon_slides x WHERE x.deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND x.sort_order = 30);
UPDATE daihon_slides SET sort_order = 31 WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND sort_order = 1023;
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, hidden, ref_page, quiz, links)
SELECT (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026'), 32, layout, accent, title, subtitle, body, notes, images, 0, ref_page, quiz, links FROM daihon_slides
WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説') AND sort_order = 55 AND NOT EXISTS (SELECT 1 FROM daihon_slides x WHERE x.deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND x.sort_order = 32);
UPDATE daihon_slides SET sort_order = 33 WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND sort_order = 1024;
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, hidden, ref_page, quiz, links)
SELECT (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026'), 34, layout, accent, title, subtitle, body, notes, images, 0, ref_page, quiz, links FROM daihon_slides
WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説') AND sort_order = 68 AND NOT EXISTS (SELECT 1 FROM daihon_slides x WHERE x.deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND x.sort_order = 34);
UPDATE daihon_slides SET sort_order = 35 WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND sort_order = 1025;
UPDATE daihon_slides SET sort_order = 36 WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND sort_order = 1026;
UPDATE daihon_slides SET sort_order = 37 WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND sort_order = 1027;
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, hidden, ref_page, quiz, links)
SELECT (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026'), 38, layout, accent, title, subtitle, body, notes, images, 0, ref_page, quiz, links FROM daihon_slides
WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説') AND sort_order = 43 AND NOT EXISTS (SELECT 1 FROM daihon_slides x WHERE x.deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND x.sort_order = 38);
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, hidden, ref_page, quiz, links)
SELECT (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026'), 39, layout, accent, title, subtitle, body, notes, images, 0, ref_page, quiz, links FROM daihon_slides
WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説') AND sort_order = 45 AND NOT EXISTS (SELECT 1 FROM daihon_slides x WHERE x.deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND x.sort_order = 39);
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, hidden, ref_page, quiz, links)
SELECT (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026'), 40, layout, accent, title, subtitle, body, notes, images, 0, ref_page, quiz, links FROM daihon_slides
WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説') AND sort_order = 46 AND NOT EXISTS (SELECT 1 FROM daihon_slides x WHERE x.deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND x.sort_order = 40);
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, hidden, ref_page, quiz, links)
SELECT (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026'), 41, layout, accent, title, subtitle, body, notes, images, 0, ref_page, quiz, links FROM daihon_slides
WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説') AND sort_order = 47 AND NOT EXISTS (SELECT 1 FROM daihon_slides x WHERE x.deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND x.sort_order = 41);
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, hidden, ref_page, quiz, links)
SELECT (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026'), 42, layout, accent, title, subtitle, body, notes, images, 0, ref_page, quiz, links FROM daihon_slides
WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = '東京タクシーセンター 知識集') AND sort_order = 36 AND NOT EXISTS (SELECT 1 FROM daihon_slides x WHERE x.deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND x.sort_order = 42);
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, hidden, ref_page, quiz, links)
SELECT (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026'), 43, layout, accent, title, subtitle, body, notes, images, 0, ref_page, quiz, links FROM daihon_slides
WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説') AND sort_order = 56 AND NOT EXISTS (SELECT 1 FROM daihon_slides x WHERE x.deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND x.sort_order = 43);
UPDATE daihon_slides SET sort_order = 44 WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND sort_order = 1029;
UPDATE daihon_slides SET sort_order = 45 WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND sort_order = 1030;
UPDATE daihon_slides SET sort_order = 46 WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND sort_order = 1031;
UPDATE daihon_slides SET body = '0:00｜導入（10分）' || char(10) || '0:10｜年末年始、日本人は何をしている？（15分）' || char(10) || '0:25｜繁忙期の街とお客様・酔っぱらい対応（25分）' || char(10) || '0:50｜流しとつけ待ち、どっちがいい？（10分）' || char(10) || '1:00｜エリア攻略 恵比寿・東京駅・渋谷（20分）' || char(10) || '1:20｜銀座乗禁・給料明細・まとめ（10分）' WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026') AND sort_order = 2 AND title = 'タイムテーブル';
