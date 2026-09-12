-- ===================================================
-- migration_146: 秋の全国交通安全運動 手札（デザイン・印刷）
--
--   課長ミッション →「秋の全国交通安全運動 手札」で、A4横の手札を画面で編集し、
--   そのまま印刷（片面）できる。編集した文言は1行だけ保存し、次回も残る。
--   ・id は必ず 1（単一レコード）。
--   ・data_json に手札の全文言（見出し・6項目・スローガン・期間・表のラベル等）をJSONで保持。
--   集計テーブル（summer_safety_2026_*）とは無関係。ここは「配る手札そのもの」の版下だけ。
-- ===================================================

CREATE TABLE IF NOT EXISTS autumn_safety_2026_tefuda (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  data_json   TEXT NOT NULL DEFAULT '{}',
  updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

INSERT OR IGNORE INTO autumn_safety_2026_tefuda (id, data_json) VALUES (1, '{}');
