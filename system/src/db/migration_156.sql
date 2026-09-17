-- ===================================================
-- migration_156: 異常気象警報 注意喚起サイネージ
--
--   気象庁の異常気象警報が発令されたら、その警報の種類に応じた注意文言
--   （例:「低い場所の浸水に注意」等）を専用モニター画面に表示する。
--   運用は「発令されたら管理画面でON、解除されたらOFF」のシンプルな切り替え。
--   ONになっている警報を1件あたり約10秒で順番に自動表示する。
-- ===================================================

CREATE TABLE IF NOT EXISTS weather_notice_alerts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL DEFAULT '',   -- 警報名（例: 大雨警報）
  caution_text  TEXT NOT NULL DEFAULT '',   -- サイネージに表示する注意文言
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_active     INTEGER NOT NULL DEFAULT 0, -- 1=現在発令中（サイネージに表示する）
  created_at    TEXT DEFAULT (datetime('now','localtime')),
  updated_at    TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_weather_notice_alerts_order ON weather_notice_alerts(sort_order);

INSERT INTO weather_notice_alerts (name, caution_text, sort_order, is_active) VALUES
  ('大雨警報',           '強い雨により道路の冠水や視界不良のおそれがあります。低い場所の浸水、アンダーパス・地下道の通行には十分注意してください。', 0, 0),
  ('大雨洪水警報',       '河川の増水・氾濫のおそれがあります。冠水した道路へは絶対に進入せず、低い場所の浸水にも十分注意してください。', 1, 0),
  ('洪水警報',           '河川の氾濫・増水のおそれがあります。橋や堤防付近、低い土地の走行には十分注意してください。', 2, 0),
  ('大雨土砂災害危険警報', '土砂災害の危険が高まっています。山沿い・がけ付近での走行・待機は避けてください。', 3, 0),
  ('大雨危険警報',       '重大な災害の危険が差し迫っています。安全な場所での待機を最優先し、無理な運行は行わないでください。', 4, 0),
  ('暴風警報',           '強風による横転・飛来物に十分注意してください。高所・橋の上での運転は特に慎重に。', 5, 0),
  ('大雪警報',           '積雪・路面凍結によるスリップに十分注意してください。', 6, 0);
