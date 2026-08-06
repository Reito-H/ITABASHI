-- 引き継ぎシート: 右カラムの表示セクションをカスタマイズ可能にする
-- 既存5項目（当欠・理由/事故車/点検・車検・リコール/車両異常・修理予定/乗務希望）を
-- 「特別枠」として課ごとに初期投入し、以後は改名・並び替え・高さ変更・表示切替ができるようにする。
-- 追加されるカスタム枠は素のテキスト欄（入力補助なし）として handover_section_content に保存する。

CREATE TABLE IF NOT EXISTS handover_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  division INTEGER NOT NULL CHECK(division BETWEEN 1 AND 4),
  section_key TEXT NOT NULL,           -- 特別枠: toka/jiko/tenken/joshu/jomu、カスタム枠: custom_<ランダム8桁>
  kind TEXT NOT NULL DEFAULT 'custom',  -- 'special' | 'custom'
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  height_size TEXT NOT NULL DEFAULT 'normal', -- small/normal/large/xlarge
  is_active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT,
  UNIQUE(division, section_key)
);

CREATE TABLE IF NOT EXISTS handover_section_content (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  updated_at TEXT,
  updated_by TEXT,
  UNIQUE(section_id, date)
);
CREATE INDEX IF NOT EXISTS idx_ho_section_content_date ON handover_section_content(date);

-- 既存5項目を課ごとに「特別枠」として初期投入。height_sizeは現行CSSのmin-heightに合わせる
-- （tenken=small(80px)、joshu=large(160px)、他はnormal(120px)）。
INSERT OR IGNORE INTO handover_sections (division, section_key, kind, label, sort_order, height_size) VALUES
(1,'toka','special','当欠・理由',0,'normal'), (1,'jiko','special','事故車',1,'normal'),
(1,'tenken','special','点検・車検・リコール',2,'small'), (1,'joshu','special','車両異常・修理予定',3,'large'),
(1,'jomu','special','乗務希望',4,'normal'),
(2,'toka','special','当欠・理由',0,'normal'), (2,'jiko','special','事故車',1,'normal'),
(2,'tenken','special','点検・車検・リコール',2,'small'), (2,'joshu','special','車両異常・修理予定',3,'large'),
(2,'jomu','special','乗務希望',4,'normal'),
(3,'toka','special','当欠・理由',0,'normal'), (3,'jiko','special','事故車',1,'normal'),
(3,'tenken','special','点検・車検・リコール',2,'small'), (3,'joshu','special','車両異常・修理予定',3,'large'),
(3,'jomu','special','乗務希望',4,'normal'),
(4,'toka','special','当欠・理由',0,'normal'), (4,'jiko','special','事故車',1,'normal'),
(4,'tenken','special','点検・車検・リコール',2,'small'), (4,'joshu','special','車両異常・修理予定',3,'large'),
(4,'jomu','special','乗務希望',4,'normal');
