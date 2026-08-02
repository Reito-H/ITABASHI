-- ===================================================
-- migration_062: LINE登録用QRコード（ロール指定QR + 班長・指導者個別QR）
-- ===================================================

CREATE TABLE IF NOT EXISTS line_reg_qrcodes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  token         TEXT NOT NULL UNIQUE,
  target_type   TEXT NOT NULL,              -- 'role' | 'instructor'
  role          TEXT,                       -- target_type='role' の場合。line_liff_users.role と同じ語彙
  instructor_id INTEGER REFERENCES instructors(id), -- target_type='instructor' の場合
  is_used       INTEGER DEFAULT 0,          -- instructor型のみ使用後1（role型は常に0のまま・失効管理は expires_at のみ）
  used_at       TEXT,
  expires_at    TEXT NOT NULL,
  created_by    TEXT,                       -- 発行した管理者名
  created_at    TEXT DEFAULT (datetime('now', 'localtime'))
);
