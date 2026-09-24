-- ===================================================
-- migration_165: 引き継ぎシート 名前候補の除外リスト
--   当欠・乗務希望欄の名前入力で社員名簿から候補を出す際（employee-suggest）、
--   同姓同名・読みが紛らわしい等で誤って選ばれてしまう人を課ごとに手動で除外できるようにする。
-- ===================================================
CREATE TABLE IF NOT EXISTS handover_name_suggest_exclusions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  division    INTEGER NOT NULL CHECK(division BETWEEN 1 AND 4),
  name        TEXT NOT NULL,
  created_at  TEXT DEFAULT (datetime('now', 'localtime')),
  created_by  TEXT,
  UNIQUE(division, name)
);
