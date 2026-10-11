-- ===================================================
-- migration_186: 期間限定 オリジナルTシャツ注文
--   共有URL（ログイン不要）で 社員番号（ない人は名前）→ サイズ を登録する。
--   詳細設定（タイトル・説明・サイズ・締切・受付ON/OFF・注文の修正/削除）は admin アカウントのみ。
-- ===================================================
CREATE TABLE IF NOT EXISTS tshirt_settings (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  title       TEXT NOT NULL DEFAULT 'オリジナルTシャツ注文',
  description TEXT NOT NULL DEFAULT '',
  sizes       TEXT NOT NULL DEFAULT '["S","M","L","XL","XXL"]',  -- JSON配列（表示順）
  deadline    TEXT NOT NULL DEFAULT '',                           -- 'YYYY-MM-DDTHH:MM'（空=締切なし）
  is_open     INTEGER NOT NULL DEFAULT 1,
  updated_at  TEXT DEFAULT (datetime('now','localtime'))
);
INSERT OR IGNORE INTO tshirt_settings (id) VALUES (1);

CREATE TABLE IF NOT EXISTS tshirt_orders (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  emp_no     TEXT NOT NULL DEFAULT '',   -- 社員番号で登録した人のみ。名前で登録した人は ''
  name       TEXT NOT NULL,
  size       TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tshirt_orders_emp ON tshirt_orders(emp_no) WHERE emp_no <> '';
