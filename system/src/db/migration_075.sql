-- ===================================================
-- migration_075: 報告センターに「引き継ぎメモ」タブを追加
--   何でも自由に書けるセル形式（Excel風グリッド）のメモ。管理画面からのみ作成・編集。
--   grid_data はセルごとの文字・文字サイズ・色・背景色・太字をJSONでまとめて保持する。
-- ===================================================

CREATE TABLE IF NOT EXISTS handover_memos (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  title             TEXT NOT NULL DEFAULT '無題のメモ',
  grid_data         TEXT NOT NULL DEFAULT '{}',
  created_by_admin  TEXT,
  updated_by_admin  TEXT,
  created_at        TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at        TEXT DEFAULT (datetime('now', 'localtime'))
);
