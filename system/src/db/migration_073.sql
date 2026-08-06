-- ===================================================
-- migration_073: 便利機能（distance/toll reference tables）
--   紙の「⑤B高速道路会社負担・距離控除【両面印刷】」を左サイドバー「便利」から
--   閲覧できるようにするためのテーブル。
--   閲覧は全管理画面アカウント共通（index.tsでページ権限チェックを免除）、
--   編集はフル権限アカウント（admins.permissions IS NULL）のみ許可する。
--
--   benri_distance_groups/points: 距離控除一覧（距離控除一覧.xlsx）。路線ごとに
--   区間の地点名と起点からの累積距離(km)を並べたIC間距離の参照表。同じ路線名の
--   ブロックが複数存在する（方向違い・支線違いなど）。金額の列は元データに無い。
--   初期データはExcelから自動転記したもの。ラベルが元データに無いブロックは文脈から
--   命名し、noteに補足を入れている。表記ゆれ・誤りは想定されるため、公開後に原本との
--   目視照合が必要（他の紙帳票移行と同様の運用）。
-- ===================================================

CREATE TABLE IF NOT EXISTS benri_distance_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,                 -- 路線名（例: 東名, 圏央, 横横）
  note TEXT NOT NULL DEFAULT '',        -- 補足（方向・支線など）
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS benri_distance_points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES benri_distance_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                   -- IC・地点名
  km REAL NOT NULL DEFAULT 0,            -- 起点からの累積距離(km)
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_benri_distance_points_group ON benri_distance_points(group_id, sort_order);

CREATE TABLE IF NOT EXISTS benri_toll_rows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route_name TEXT NOT NULL,             -- 路線名
  section TEXT NOT NULL DEFAULT '',      -- 区間
  fee TEXT NOT NULL DEFAULT '',          -- 料金（"1,710" "〜1,300" 等テキストのまま保持）
  note TEXT NOT NULL DEFAULT '',          -- 備考
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 表下部の自由記述（帰路利用方法の注記等）。key='toll_footer' 固定の1行運用
CREATE TABLE IF NOT EXISTS benri_notes (
  key TEXT PRIMARY KEY,
  content TEXT NOT NULL DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);

-- ===== 距離控除一覧（distance_blocks.json より自動生成） =====
INSERT INTO benri_distance_groups (id, label, note, sort_order) VALUES (1, '横横', '', 10);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (1, '新保土ヶ谷', 0, 10);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (1, '狩場', 1.2, 20);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (1, '別所', 4.4, 30);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (1, '日野', 8.9, 40);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (1, '港南台', 10.5, 50);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (1, '釜利谷JCT', 12.7, 60);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (1, '朝比奈', 14.7, 70);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (1, '逗子', 20.3, 80);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (1, '横須賀', 22.6, 90);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (1, '衣笠', 27.8, 100);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (1, '佐原', 29.6, 110);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (1, '浦賀', 32.8, 120);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (1, '馬堀海岸', 33.9, 130);

INSERT INTO benri_distance_groups (id, label, note, sort_order) VALUES (2, '横横', '釜利谷JCT分岐（金沢支線）', 20);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (2, '釜利谷JCT', 0, 10);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (2, '金沢自然公園', 1, 20);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (2, '堀口能見台', 2.7, 30);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (2, '並木', 4.2, 40);

INSERT INTO benri_distance_groups (id, label, note, sort_order) VALUES (3, '第三', '', 30);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (3, '玉川', 0, 10);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (3, '京浜川崎', 2.5, 20);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (3, '都筑', 8.1, 30);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (3, '港北', 11.1, 40);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (3, '保土ヶ谷', 16.3, 50);

INSERT INTO benri_distance_groups (id, label, note, sort_order) VALUES (4, '横新', '', 40);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (4, '保土ヶ谷', 0, 10);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (4, '峰岡', 2.1, 20);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (4, '藤塚', 4.6, 30);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (4, '新保土ヶ谷', 5, 40);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (4, '今井', 6.3, 50);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (4, '川上', 7.7, 60);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (4, '上矢部', 9.7, 70);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (4, '戸塚', 10.4, 80);

INSERT INTO benri_distance_groups (id, label, note, sort_order) VALUES (5, '保バ', '', 50);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (5, '横浜町田', 10.7, 10);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (5, '上川井', 6.5, 20);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (5, '本村', 3.8, 30);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (5, '南本宿', 2.8, 40);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (5, '新桜ヶ丘', 0.9, 50);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (5, '新保土ヶ谷', 0, 60);

INSERT INTO benri_distance_groups (id, label, note, sort_order) VALUES (6, '保バ', '', 60);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (6, '横浜町田', 0, 10);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (6, '上川井', 1.7, 20);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (6, '下川井', 4.2, 30);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (6, '本村', 6.9, 40);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (6, '南本宿', 7.9, 50);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (6, '新桜ヶ丘', 9.8, 60);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (6, '新保土ヶ谷', 10.7, 70);

INSERT INTO benri_distance_groups (id, label, note, sort_order) VALUES (7, '小厚', '', 70);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (7, '厚木', 0, 10);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (7, '厚木西', 0, 20);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (7, '平塚', 7.7, 30);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (7, '大磯', 13.7, 40);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (7, '二宮', 17.2, 50);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (7, '小田原東', 24.3, 60);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (7, '荻窪', 29.2, 70);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (7, '小田原西', 30.9, 80);

INSERT INTO benri_distance_groups (id, label, note, sort_order) VALUES (8, '東名', '', 80);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (8, '東京', 0, 10);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (8, '東名川崎', 7.6, 20);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (8, '横浜青葉', 13.3, 30);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (8, '横浜町田', 19.7, 40);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (8, '綾瀬S', 28.8, 50);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (8, '海老名ＪＣＴ', 33.9, 60);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (8, '厚木', 35, 70);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (8, '秦野中井', 50.1, 80);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (8, '大井松田', 57.9, 90);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (8, '御殿場', 83.7, 100);

INSERT INTO benri_distance_groups (id, label, note, sort_order) VALUES (9, '圏央', '', 90);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (9, '茅ヶ崎JCT', 0, 10);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (9, '茅ヶ崎西', 2.1, 20);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (9, '茅ヶ崎海岸', 3.3, 30);

INSERT INTO benri_distance_groups (id, label, note, sort_order) VALUES (10, '圏央', '', 100);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (10, '寒川南', 7.5, 10);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (10, '寒川北', 5.4, 20);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (10, '厚木', 0, 30);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (10, '海老名', 1.9, 40);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (10, '寒川北', 5.4, 50);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (10, '圏央厚木', 6.8, 60);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (10, '相模原愛川', 12, 70);

INSERT INTO benri_distance_groups (id, label, note, sort_order) VALUES (11, '圏央', '茅ヶ崎JCT付近（藤沢方面）', 110);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (11, '藤沢', 5.4, 10);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (11, '茅ヶ崎中央', 0.2, 20);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (11, '茅ヶ崎JCT', 0, 30);

INSERT INTO benri_distance_groups (id, label, note, sort_order) VALUES (12, '八バ', '', 120);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (12, '打越', 0, 10);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (12, '中谷戸', 0.7, 20);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (12, '片倉', 2.1, 30);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (12, '鑓水', 3.5, 40);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (12, '相原', 4.6, 50);

INSERT INTO benri_distance_groups (id, label, note, sort_order) VALUES (13, '中央', '', 130);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (13, '高井戸', 0, 10);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (13, '調布', 7.7, 20);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (13, '稲城', 10, 30);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (13, '稲城大橋', 11.9, 40);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (13, '国立府中', 17, 50);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (13, '八王子', 25.8, 60);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (13, '八王子ＪＣＴ', 36, 70);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (13, '相模湖東', 42.4, 80);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (13, '相模湖', 45.4, 90);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (13, '上野原', 50.3, 100);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (13, '大月', 70.4, 110);

INSERT INTO benri_distance_groups (id, label, note, sort_order) VALUES (14, '圏央', '', 140);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (14, '高尾山', 2, 10);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (14, '八王子ＪＣＴ', 0, 20);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (14, '八王子西', 4.4, 30);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (14, 'あきる野', 9.6, 40);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (14, '日の出', 11.6, 50);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (14, '青梅', 20.3, 60);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (14, '入間', 25.1, 70);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (14, '狭山日高', 31.1, 80);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (14, '圏央鶴ヶ島', 37.9, 90);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (14, '鶴ヶ島ＪＣＴ', 40.1, 100);

INSERT INTO benri_distance_groups (id, label, note, sort_order) VALUES (15, '関越', '', 150);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (15, '練馬', 0, 10);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (15, '大泉ＪＣＴ', 0.8, 20);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (15, '所沢', 9.4, 30);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (15, '三芳S', 13.9, 40);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (15, '川越', 21.2, 50);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (15, '鶴ヶ島ＪＣＴ', 27.8, 60);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (15, '鶴ヶ島', 29.6, 70);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (15, '坂戸西スマート', 32.5, 80);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (15, '東松山', 39.4, 90);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (15, '嵐山小川', 47.4, 100);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (15, '花園', 56.1, 110);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (15, '本庄児玉', 69.6, 120);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (15, '藤岡ＪＣＴ', 78.6, 130);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (15, '高崎ＪＣＴ', 84.6, 140);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (15, '高崎', 87, 150);

INSERT INTO benri_distance_groups (id, label, note, sort_order) VALUES (16, '圏央', '', 160);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (16, '入間', 15, 10);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (16, '狭山日高', 9, 20);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (16, '圏央鶴ヶ島', 2.2, 30);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (16, '鶴ヶ島ＪＣＴ', 0, 40);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (16, '坂戸', 5.2, 50);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (16, '川島', 7.7, 60);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (16, '桶川北本', 13.4, 70);

INSERT INTO benri_distance_groups (id, label, note, sort_order) VALUES (17, '北関', '高崎JCT〜伊勢崎', 170);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (17, '高崎ＪＣＴ', 0, 10);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (17, '前橋南', 3, 20);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (17, '駒形', 7.5, 30);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (17, '波志江スマート', 11.7, 40);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (17, '伊勢崎', 14.5, 50);

INSERT INTO benri_distance_groups (id, label, note, sort_order) VALUES (18, '上信', '', 180);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (18, '吉井', 11.2, 10);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (18, '藤岡', 1.8, 20);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (18, '藤岡ＪＣＴ', 0, 30);

INSERT INTO benri_distance_groups (id, label, note, sort_order) VALUES (19, '東北', '', 190);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (19, '川口ＪＣＴ', 0, 10);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (19, '浦和', 3.2, 20);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (19, '岩槻', 10.5, 30);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (19, '蓮田スマート', 18.1, 40);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (19, '久喜白岡ＪＣＴ', 24.1, 50);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (19, '久喜', 25.5, 60);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (19, '加須', 33.4, 70);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (19, '羽生', 39.4, 80);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (19, '館林', 46, 90);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (19, '佐野藤岡', 55, 100);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (19, '佐野スマート', 57.9, 110);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (19, '岩船JCT', 61.8, 120);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (19, '栃木', 72.7, 130);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (19, '栃木都賀JCT', 75.4, 140);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (19, '鹿沼', 91.5, 150);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (19, '宇都宮', 103, 160);

INSERT INTO benri_distance_groups (id, label, note, sort_order) VALUES (20, '圏央', '', 200);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (20, '桶川北本', 14.1, 10);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (20, '桶川加納', 9.4, 20);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (20, '白岡菖蒲', 3.3, 30);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (20, '久喜白岡ＪＣＴ', 0, 40);

INSERT INTO benri_distance_groups (id, label, note, sort_order) VALUES (21, '北関', '伊勢崎〜佐野田沼', 210);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (21, '伊勢崎', 39.9, 10);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (21, '太田藪塚', 34.5, 20);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (21, '太田桐生', 23.9, 30);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (21, '足利', 13.6, 40);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (21, '佐野田沼', 5.3, 50);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (21, '岩船JCT', 0, 60);

INSERT INTO benri_distance_groups (id, label, note, sort_order) VALUES (22, '北関', '栃木都賀JCT〜宇都宮上三川', 220);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (22, '栃木都賀JCT', 0, 10);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (22, '都賀', 3.8, 20);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (22, '壬生', 10.1, 30);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (22, '宇都宮上三川', 18.5, 40);

INSERT INTO benri_distance_groups (id, label, note, sort_order) VALUES (23, '外環', '外回り', 230);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (23, '大泉', 0, 10);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (23, '和光', 3.4, 20);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (23, '和光北', 5.5, 30);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (23, '戸田西', 7.6, 40);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (23, '美女木ＪＣＴ', 8.5, 50);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (23, '川口西', 14, 60);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (23, '川口ＪＣＴ', 17.6, 70);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (23, '草加', 22.4, 80);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (23, '外環三郷西', 28.4, 90);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (23, '三郷ＪＣＴ', 29.6, 100);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (23, '三郷南', 33.7, 110);

INSERT INTO benri_distance_groups (id, label, note, sort_order) VALUES (24, '外環', '内回り', 240);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (24, '三郷南', 0, 10);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (24, '三郷ＪＣＴ', 4.1, 20);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (24, '草加', 11.3, 30);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (24, '川口東', 14.7, 40);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (24, '川口ＪＣＴ', 16.1, 50);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (24, '川口中央', 16.9, 60);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (24, '外環浦和', 21.4, 70);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (24, '戸田東', 23.8, 80);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (24, '美女木ＪＣＴ', 25.2, 90);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (24, '和光北', 28.2, 100);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (24, '和光', 30.3, 110);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (24, '大泉', 33.7, 120);

INSERT INTO benri_distance_groups (id, label, note, sort_order) VALUES (25, '常磐', '', 250);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (25, '三郷JCT', 0, 10);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (25, '流山', 6.6, 20);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (25, '柏', 10.8, 30);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (25, '谷和原', 19.1, 40);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (25, '谷田部', 30.3, 50);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (25, 'つくばＪＣＴ', 34.6, 60);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (25, '桜土浦', 38.7, 70);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (25, '土浦北', 46.6, 80);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (25, '千代田石岡', 54.7, 90);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (25, '石岡小美玉ｽﾏｰﾄ', 60.9, 100);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (25, '岩間', 69.1, 110);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (25, '友部SAｽﾏｰﾄ', 72.8, 120);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (25, '友部JCT', 73.9, 130);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (25, '水戸', 82, 140);

INSERT INTO benri_distance_groups (id, label, note, sort_order) VALUES (26, '圏央', '', 260);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (26, '久喜白岡ＪＣＴ', 0, 10);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (26, '幸手', 8.5, 20);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (26, '五霞', 12.7, 30);

INSERT INTO benri_distance_groups (id, label, note, sort_order) VALUES (27, '圏央', '', 270);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (27, 'つくば中央', 4.3, 10);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (27, 'つくばＪＣＴ', 0, 20);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (27, 'つくば牛久', 1.5, 30);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (27, '牛久阿見', 7.6, 40);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (27, '阿見東', 13.5, 50);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (27, '稲敷', 19.5, 60);

INSERT INTO benri_distance_groups (id, label, note, sort_order) VALUES (28, '北関', '', 280);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (28, '宇都宮上三川', 47.8, 10);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (28, '真岡', 26, 20);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (28, '桜川筑西', 25.4, 30);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (28, '笠間西', 16.5, 40);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (28, '友部', 7.4, 50);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (28, '友部JCT', 0, 60);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (28, '茨城町西', 4.1, 70);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (28, '茨城空港北', 15.1, 80);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (28, '茨城町東', 10.9, 90);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (28, '水戸南', 14.3, 100);

INSERT INTO benri_distance_groups (id, label, note, sort_order) VALUES (29, '東関道', '上り', 290);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (29, '宮野木ＪＣＴ', 0, 10);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (29, '千葉北', 2.1, 20);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (29, '四街道', 7.9, 30);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (29, '佐倉', 13.3, 40);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (29, '酒々井', 20.3, 50);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (29, '富里', 22.8, 60);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (29, '成田', 28.2, 70);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (29, '大栄', 39.9, 80);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (29, '佐原香取', 49.2, 90);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (29, '潮来', 57.8, 100);

INSERT INTO benri_distance_groups (id, label, note, sort_order) VALUES (30, '湾岸', '', 300);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (30, '湾岸市川', 0, 10);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (30, '谷津船橋', 5.5, 20);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (30, '湾岸習志野', 7.9, 30);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (30, '宮野木ＪＣＴ', 16.7, 40);

INSERT INTO benri_distance_groups (id, label, note, sort_order) VALUES (31, '湾岸', '新空港（成田）方面', 310);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (31, '新空港', 32.1, 10);

INSERT INTO benri_distance_groups (id, label, note, sort_order) VALUES (32, '京葉', '', 320);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (32, '篠崎', 0, 10);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (32, '市川', 2, 20);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (32, '原木', 4.6, 30);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (32, '船橋', 5.9, 40);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (32, '花輪', 9.6, 50);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (32, '幕張', 13.3, 60);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (32, '武石', 15.9, 70);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (32, '宮野木ＪＣＴ', 19.4, 80);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (32, '穴川', 21.9, 90);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (32, '穴川東', 23.8, 100);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (32, '貝塚', 25, 110);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (32, '千葉東ＪＣＴ', 27.8, 120);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (32, '松が丘', 29.1, 130);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (32, '蘇我', 32.1, 140);

INSERT INTO benri_distance_groups (id, label, note, sort_order) VALUES (33, '東金', '上りのみ', 330);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (33, '千葉東ＪＣＴ', 0, 10);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (33, '大宮', 3.2, 20);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (33, '高田', 7.5, 30);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (33, '中野', 11.4, 40);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (33, '山田', 13.9, 50);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (33, '東金', 16.1, 60);

INSERT INTO benri_distance_groups (id, label, note, sort_order) VALUES (34, '圏央', '', 340);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (34, '木更津ＪＣＴ', 50, 10);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (34, '木更津東', 42.9, 20);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (34, '市原鶴舞', 30.4, 30);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (34, '茂原長南', 21.6, 40);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (34, '茂原北', 10.9, 50);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (34, '東金', 0, 60);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (34, '山武成東', 8.7, 70);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (34, '松尾横芝', 16.1, 80);

INSERT INTO benri_distance_groups (id, label, note, sort_order) VALUES (35, '圏央', '', 350);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (35, '浮島', 23.7, 10);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (35, '木更津金田', 8.6, 20);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (35, '袖ケ浦', 4.7, 30);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (35, '木更津ＪＣＴ', 0, 40);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (35, '木更津東', 7.1, 50);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (35, '市原鶴舞', 19.6, 60);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (35, '茂原長南', 28.4, 70);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (35, '茂原北', 39.1, 80);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (35, '東金', 50, 90);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (35, '山武成東', 58.7, 100);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (35, '松尾横芝', 66.1, 110);

INSERT INTO benri_distance_groups (id, label, note, sort_order) VALUES (36, '館山', '', 360);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (36, '蘇我', 0, 10);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (36, '市原', 9.6, 20);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (36, '姉崎袖ケ浦', 19.6, 30);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (36, '木更津北', 26.6, 40);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (36, '木更津ＪＣＴ', 28.4, 50);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (36, '木更津南ＪＣＴ', 32.3, 60);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (36, '君津', 36.3, 70);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (36, '君津スマート', 40.6, 80);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (36, '富津中央', 45.5, 90);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (36, '富津竹岡', 53, 100);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (36, '富津金谷', 57.1, 110);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (36, '鋸南保田', 60.8, 120);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (36, '鋸南富山', 64, 130);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (36, '富浦', 72.2, 140);

INSERT INTO benri_distance_groups (id, label, note, sort_order) VALUES (37, '館山', '木更津南JCT分岐', 370);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (37, '木更津南ＪＣＴ', 0, 10);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (37, '木更津南', 4.3, 20);

INSERT INTO benri_distance_groups (id, label, note, sort_order) VALUES (38, 'アクア', '', 380);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (38, '浮島', 0, 10);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (38, '木更津金田', 15.1, 20);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (38, '袖ケ浦', 19, 30);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (38, '木更津ＪＣＴ', 23.7, 40);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (38, '木更津南ＪＣＴ', 27.6, 50);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (38, '君津', 31.6, 60);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (38, '君津スマート', 35.9, 70);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (38, '富津中央', 40.8, 80);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (38, '富津竹岡', 48.3, 90);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (38, '富津金谷', 52.4, 100);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (38, '鋸南保田', 56.1, 110);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (38, '鋸南富山', 59.3, 120);
INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (38, '富浦', 67.5, 130);

-- ===== 高速道路帰路会社負担路線一覧（PDF「⑤B高速道路会社負担・距離控除」2019年4月1日現在 より転記） =====
INSERT INTO benri_toll_rows (route_name, section, fee, note, sort_order) VALUES
 ('東名高速道路', '秦野中井～東京料金所', '1,710', '', 10),
 ('東名高速道路', '圏央厚木～海老名JCT～東京料金所', '1,390', '圏央道', 20),
 ('東名高速道路', '寒川南～海老名JCT～東京料金所', '1,420', '圏央道', 30),
 ('小田原・厚木道路', '大磯～厚木料金所', '370', '', 40),
 ('第三京浜国道', '全線', '390', '', 50),
 ('横浜新道', '全線', '320', '', 60),
 ('首都高速神奈川線', '全線', '～1,300', '湾岸線は湾岸環八・1号線は羽田迄を会社負担と致します。', 70),
 ('横浜・横須賀道路', '馬堀海岸～狩場', '970', '', 80),
 ('東京湾アクアライン', '全線', '800', '', 90),
 ('東京湾アクアライン', '君津～アクアライン', '1,520', '館山道', 100),
 ('東京湾アクアライン', '姉ヶ崎～アクアライン', '1,550', '館山道', 110),
 ('東京湾アクアライン', '木更津東～アクアライン', '1,340', '館山道', 120),
 ('中央自動車道', '八王子～三鷹料金所', '630', '', 130),
 ('関越自動車道', '東松山～新座料金所', '1,440', '', 140),
 ('関越自動車道', '狭山日高・川島（圏央道）～新座料金所', '1,280', '', 150),
 ('東北自動車道', '加須～浦和料金所', '1,090', '', 160),
 ('東北自動車道', '白岡菖蒲～久喜白岡JCT～浦和料金所', '790', '圏央道', 170),
 ('東北自動車道', '幸手～久喜白岡JCT～浦和料金所', '960', '圏央道', 180),
 ('首都高速埼玉新都心線・埼玉大宮線', '全線', '～1,300', '※首都高速5号線に抜けた場合／※外環道からの接続は適用外', 190),
 ('常磐自動車道', '桜土浦～三郷料金所', '1,240', '', 200),
 ('常磐自動車道', 'つくば中央～つくばJCT～三郷料金所', '1,130', '圏央道', 210),
 ('常磐自動車道', '牛久阿見～つくばJCT～三郷料金所', '1,250', '圏央道', 220),
 ('京葉道路経由', '蘇我～篠崎', '760', '', 230),
 ('京葉道路経由', '姉ヶ崎袖ヶ浦（館山自動車道）～篠崎', '1,410', '', 240),
 ('京葉道路経由', '山田（東金道路）～篠崎', '1,040', '', 250),
 ('東関東自動車道経由', '姉ヶ崎袖ヶ浦（館山自動車道）～湾岸市川', '1,550', '', 260),
 ('東関東自動車道経由', '山田（東金道路）～湾岸市川', '1,180', '', 270),
 ('東関東自動車道', '新空港（成田）～湾岸市川料金所', '1,750', '東関東道', 280),
 ('東関東自動車道', '新空港（成田）～篠崎', '1,590', '京葉道経由', 290),
 ('首都高速道路', '東北道継続・川口本線料金所～都内', '～1,300', '（下記①参照）', 300),
 ('首都高速道路', '常磐道継続・八潮料金所～都内', '～1,300', '（下記②参照）', 310),
 ('首都高速道路', '三郷IC～都内', '～1,300', '（下記②参照）', 320);

INSERT INTO benri_notes (key, content) VALUES ('toll_footer',
'＊東北道継続～首都高、常磐道継続～首都高は、東京外環経由での帰路負担はありません。

①東北自動車道の浦和IC以北から川口本線料金所を通過し、そのまま首都高速東京川口線に進入した場合、首都高速東京線通行料（～1,300円）を全線会社負担とする。

②首都高速三郷ランプから、および常磐自動車道の流山IC以北から八潮本線料金所を通過し、そのまま首都高速東京三郷線に進入した場合、首都高速東京線通行料（～1,300円）を全線会社負担とする。');
