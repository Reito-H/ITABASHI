-- ===================================================
-- migration_032: 班長シフト 班色・斜め直・希望休・内勤班長対応
--   Excelの色ルールをシステム化:
--   ・班色（2人1組の班ごとの色。空白セル=昼日勤出勤も班色で塗る）
--   ・斜め直 = 斜体の「直」(14:00〜翌8:00)。直(9:00〜翌3:00)と別カウント
--   ・赤文字 = 希望休の反映
--   ・内勤班長のみシフト表に表示（乗務中の班長は名簿に残して非表示）
-- ===================================================

ALTER TABLE kancho_members ADD COLUMN team_color TEXT;                       -- 班色(#rrggbb)。NULL=なし
ALTER TABLE kancho_members ADD COLUMN is_indoor INTEGER NOT NULL DEFAULT 1;  -- 1=内勤班長(表に表示) / 0=乗務中(非表示)

ALTER TABLE kancho_shifts ADD COLUMN is_diagonal INTEGER NOT NULL DEFAULT 0; -- 斜め直(斜体表示)
ALTER TABLE kancho_shifts ADD COLUMN is_wish     INTEGER NOT NULL DEFAULT 0; -- 希望休の反映(赤文字表示)
ALTER TABLE kancho_shifts ADD COLUMN cell_color  TEXT;                       -- セル個別の色上書き(他班ヘルプ等)。NULL=自動

ALTER TABLE kancho_shift_types ADD COLUMN use_team_color INTEGER NOT NULL DEFAULT 0; -- 1=セル背景に班色を使う(直・遅・早)
ALTER TABLE kancho_shift_types ADD COLUMN counts_as_work INTEGER NOT NULL DEFAULT 0; -- 出勤数に含める
ALTER TABLE kancho_shift_types ADD COLUMN counts_as_off  INTEGER NOT NULL DEFAULT 0; -- 公休数に含める

UPDATE kancho_shift_types SET use_team_color = 1, counts_as_work = 1 WHERE code IN ('直', '遅', '早') AND section = 'main';
UPDATE kancho_shift_types SET counts_as_off = 1 WHERE code IN ('公', '指公', '夏');
UPDATE kancho_shift_types SET label = '当直 9:00〜翌3:00' WHERE code = '直' AND section = 'main';
UPDATE kancho_shift_types SET label = '遅番 10:00〜19:00' WHERE code = '遅' AND section = 'main';

-- 班色の初期割当（Excelの塗り分けを踏襲。名簿管理から変更可能）
UPDATE kancho_members SET team_color = '#00ff00' WHERE section = 'main' AND name IN ('船崎', '中野');   -- 黄緑
UPDATE kancho_members SET team_color = '#ffff00' WHERE section = 'main' AND name IN ('勇', '星');       -- 黄色
UPDATE kancho_members SET team_color = '#00ffff' WHERE section = 'main' AND name IN ('渡邊', '長嶺');   -- 水色
UPDATE kancho_members SET team_color = '#ff99cc' WHERE section = 'main' AND name IN ('矢嶋', '兼藤');   -- ピンク
