-- 営業所マスタ（電話番号・住所など）
CREATE TABLE IF NOT EXISTS offices (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  short_name TEXT NOT NULL,
  phone      TEXT,
  address    TEXT,
  note       TEXT,
  sort_order INTEGER DEFAULT 0
);

INSERT OR IGNORE INTO offices (name, short_name, sort_order) VALUES
  ('国際自動車（城北）板橋営業所',   '板橋営業所', 1),
  ('国際自動車（世田谷）世田谷営業所', '世田谷営業所', 2),
  ('国際自動車（城南）羽田営業所',   '羽田営業所', 3),
  ('国際自動車（城東）台東営業所',   '台東営業所', 4),
  ('国際自動車（城西）三鷹営業所',   '三鷹営業所', 5),
  ('国際自動車（東雲）東雲営業所',   '東雲営業所', 6);
