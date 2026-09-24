-- ===================================================
-- migration_161: 引き継ぎシート 当欠・理由欄の「＋」登録機能
--   従来の当欠・理由欄はフリー入力のテキスト（handover_sheets.toka_content）のみで、
--   理由は本文中の文章として推測抽出していた（admin_handover.tsのparseTokaLines）。
--   「＋」ボタンから名前・数値・理由をフォーム入力した分は、本文には「名前 -1.0」のみを
--   追記し（欄が理由の文章で縦に伸びないように）、理由はこのテーブルに構造化して保存する。
--   本文の対応行が編集・削除されると、以後の集計では自動的に対象外になる
--   （このテーブル単独では集計せず、必ず本文の当欠行と突き合わせて使う）。
-- ===================================================
CREATE TABLE IF NOT EXISTS handover_toka_entries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  division    INTEGER NOT NULL CHECK(division BETWEEN 1 AND 4),
  date        TEXT NOT NULL,                     -- YYYY-MM-DD
  name        TEXT NOT NULL,
  value       REAL NOT NULL,                     -- 当欠数（常に負数。例: -1.0 / -0.5）
  reason      TEXT NOT NULL DEFAULT '',
  created_at  TEXT DEFAULT (datetime('now', 'localtime')),
  created_by  TEXT
);
CREATE INDEX IF NOT EXISTS idx_handover_toka_entries_div_date ON handover_toka_entries(division, date);
