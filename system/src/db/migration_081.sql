-- ===================================================
-- migration_081: 車庫見取り図（紙の「車庫見取り図」をWeb化）
--   ・garage_slots      : 固定駐車マス（元Excelのセル結合＋色分け）の車番。値がある行のみ持つ（疎）
--   ・garage_markers    : スロープ前など固定マス外に自由配置する「車」マーカー（%座標）
--   ・garage_edit_logs  : 編集履歴
--   固定マスの座標・色・ラベル定義は html/garage_layout.ts に静的データとして持つ（DBには持たない）
-- ===================================================

CREATE TABLE IF NOT EXISTS garage_slots (
  section    TEXT NOT NULL,
  slot_key   TEXT NOT NULL,
  car_no     TEXT NOT NULL DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now','localtime')),
  updated_by TEXT,
  PRIMARY KEY (section, slot_key)
);

CREATE TABLE IF NOT EXISTS garage_markers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  section    TEXT NOT NULL,
  x          REAL NOT NULL DEFAULT 5,   -- コンテナ幅に対する%（左端）
  y          REAL NOT NULL DEFAULT 5,   -- コンテナ高さに対する%（上端）
  w          REAL NOT NULL DEFAULT 6,   -- %
  h          REAL NOT NULL DEFAULT 4,   -- %
  car_no     TEXT NOT NULL DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now','localtime')),
  updated_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_garage_markers_section ON garage_markers(section);

CREATE TABLE IF NOT EXISTS garage_edit_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id   INTEGER,
  admin_name TEXT,
  action     TEXT,
  target     TEXT,
  detail     TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 既存の制限付きアカウントにも車庫ページの閲覧・編集権限を一括付与（全アカウント共通で使う機能のため）
UPDATE admins SET permissions = (
  SELECT json_group_array(v) FROM (
    SELECT value AS v FROM json_each(admins.permissions)
    UNION ALL
    SELECT 'garage'
    UNION ALL
    SELECT 'garage.edit'
  )
) WHERE permissions IS NOT NULL AND json_valid(permissions)
  AND NOT EXISTS (SELECT 1 FROM json_each(admins.permissions) WHERE value = 'garage');
