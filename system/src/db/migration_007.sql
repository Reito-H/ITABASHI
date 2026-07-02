-- migration_007: 班長・指導者データ初期登録
-- ※ すでに登録済みの場合はスキップされます

INSERT OR IGNORE INTO instructors (name, role, is_active, sort_order) VALUES
  ('松本班長', '4課 新人教育', 1, 1),
  ('按田',     '内勤',         1, 2),
  ('星班長',   '新人教育',     1, 3);
