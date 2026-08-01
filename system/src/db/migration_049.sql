-- ===================================================
-- migration_049: 班長シフト 名簿・記号を月度別データに分離
--   名簿(kancho_members)・記号(kancho_shift_types)を year/month ごとに
--   独立させる。新しい月度を初めて開いたとき、直前の月度から自動コピー
--   する運用に変更するための土台（コピー処理はアプリ側で実施）。
--   既存データは今日時点の月度(2026年8月度)に割り当てる。
-- ===================================================

ALTER TABLE kancho_members ADD COLUMN year INTEGER NOT NULL DEFAULT 0;
ALTER TABLE kancho_members ADD COLUMN month INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_kancho_members_period ON kancho_members(year, month);
UPDATE kancho_members SET year = 2026, month = 8 WHERE year = 0;

-- kancho_shift_types は UNIQUE(code, section) があり、月度ごとに同じ記号を
-- 複製すると衝突するため UNIQUE(code, section, year, month) に変更する
-- （code は自由テキストでkancho_shifts側からのFK参照はないため、IDが
--   変わっても既存シフトデータへの影響はない）
CREATE TABLE kancho_shift_types_new (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  code             TEXT NOT NULL,
  label            TEXT NOT NULL DEFAULT '',
  color            TEXT NOT NULL DEFAULT '#e5e7eb',
  section          TEXT NOT NULL DEFAULT 'main',
  daily_required   INTEGER NOT NULL DEFAULT 0,
  count_in_summary INTEGER NOT NULL DEFAULT 0,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  is_active        INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT DEFAULT (datetime('now', 'localtime')),
  use_team_color   INTEGER NOT NULL DEFAULT 0,
  counts_as_work   INTEGER NOT NULL DEFAULT 0,
  counts_as_off    INTEGER NOT NULL DEFAULT 0,
  show_in_input    INTEGER NOT NULL DEFAULT 1,
  year             INTEGER NOT NULL DEFAULT 0,
  month            INTEGER NOT NULL DEFAULT 0,
  UNIQUE (code, section, year, month)
);

INSERT INTO kancho_shift_types_new
  (id, code, label, color, section, daily_required, count_in_summary, sort_order, is_active, created_at, use_team_color, counts_as_work, counts_as_off, show_in_input, year, month)
SELECT
  id, code, label, color, section, daily_required, count_in_summary, sort_order, is_active, created_at, use_team_color, counts_as_work, counts_as_off, show_in_input, 2026, 8
FROM kancho_shift_types;

DROP TABLE kancho_shift_types;
ALTER TABLE kancho_shift_types_new RENAME TO kancho_shift_types;
CREATE INDEX idx_kancho_types_period ON kancho_shift_types(year, month);
