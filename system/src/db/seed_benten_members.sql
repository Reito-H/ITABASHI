-- ベンテンクラブ 初期データ（出典: 弁天5月度予定 4.19時点.pdf）
-- グループ: 板橋班長(3名) / 板橋(9名) / 羽田・三信・陸王・コンドル(各1名)
-- 追加シフト種別: G勤・日勤・遅番・当直（PDFで使用されている記号）

-- グループ（PDFの列順）
INSERT INTO benten_groups (name, color, display_order) VALUES
  ('板橋班長', '#16a34a', 1),
  ('板橋',     '#1e3a5f', 2),
  ('羽田',     '#0891b2', 3),
  ('三信',     '#7c3aed', 4),
  ('陸王',     '#ec4899', 5),
  ('コンドル', '#d97706', 6);

-- 追加シフト種別（H/D/B/休/有はmigration_025で投入済み）
INSERT OR IGNORE INTO benten_shift_types (code, label, color, text_color, is_absent, triggers_ake, display_order) VALUES
  ('G',  'G勤',  '#0d9488', '#ffffff', 0, 1, 6),
  ('日', '日勤', '#16a34a', '#ffffff', 0, 0, 7),
  ('遅', '遅番', '#ea580c', '#ffffff', 0, 0, 8),
  ('当', '当直', '#b91c1c', '#ffffff', 0, 1, 9);

-- 既存の1件（LINE登録で自動作成された「平尾　言生」）をPDF表記に正規化して班長へ
UPDATE benten_members SET
  name = '平尾言生',
  group_id = (SELECT id FROM benten_groups WHERE name = '板橋班長'),
  display_order = 1,
  updated_at = datetime('now', 'localtime')
WHERE id = 1 AND name = '平尾　言生';

-- 残り15名（PDFの列順に display_order 2〜16）
INSERT INTO benten_members (name, group_id, display_order) VALUES
  ('星莉斗',   (SELECT id FROM benten_groups WHERE name = '板橋班長'), 2),
  ('鈴木琢真', (SELECT id FROM benten_groups WHERE name = '板橋班長'), 3),
  ('神田歩夢', (SELECT id FROM benten_groups WHERE name = '板橋'), 4),
  ('中山颯斗', (SELECT id FROM benten_groups WHERE name = '板橋'), 5),
  ('坂本龍也', (SELECT id FROM benten_groups WHERE name = '板橋'), 6),
  ('中野敬太', (SELECT id FROM benten_groups WHERE name = '板橋'), 7),
  ('山本元太', (SELECT id FROM benten_groups WHERE name = '板橋'), 8),
  ('小藤一輝', (SELECT id FROM benten_groups WHERE name = '板橋'), 9),
  ('齋藤渓河', (SELECT id FROM benten_groups WHERE name = '板橋'), 10),
  ('山口康太', (SELECT id FROM benten_groups WHERE name = '板橋'), 11),
  ('井口翔成', (SELECT id FROM benten_groups WHERE name = '板橋'), 12),
  ('黒川達志', (SELECT id FROM benten_groups WHERE name = '羽田'), 13),
  ('島村力',   (SELECT id FROM benten_groups WHERE name = '三信'), 14),
  ('鈴木悠世', (SELECT id FROM benten_groups WHERE name = '陸王'), 15),
  ('大澤文武', (SELECT id FROM benten_groups WHERE name = 'コンドル'), 16);
