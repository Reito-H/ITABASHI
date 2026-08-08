-- ===================================================
-- migration_077: やることリスト機能を追加
--   todo_tasks: タスク定義。ka=1〜4は課ごとに独立したチェックリスト、ka=NULLは当直共通タスク
--   todo_completions: 日付ごとの完了状態（課ごと・当直共通ともに同じ仕組みで管理）
-- ===================================================

CREATE TABLE IF NOT EXISTS todo_tasks (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  ka                INTEGER CHECK(ka BETWEEN 1 AND 4),  -- NULL = 当直共通タスク
  title             TEXT NOT NULL,
  time_label        TEXT,               -- 表示用の時刻目安（自由記述。例 "12:00" "翌1:00"）
  weekdays          TEXT,               -- カンマ区切り 0=日〜6=土。NULL=毎日対象
  note              TEXT,               -- 注意書き
  note_day_of_month INTEGER CHECK(note_day_of_month BETWEEN 1 AND 31), -- この日だけnoteを強調表示
  sort_order        INTEGER NOT NULL DEFAULT 0,
  is_active         INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT DEFAULT (datetime('now','localtime')),
  updated_at        TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS todo_completions (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id  INTEGER NOT NULL REFERENCES todo_tasks(id),
  date     TEXT NOT NULL,     -- YYYY-MM-DD
  is_done  INTEGER NOT NULL DEFAULT 0,
  done_by  TEXT,
  done_at  TEXT,
  UNIQUE(task_id, date)
);

CREATE INDEX IF NOT EXISTS idx_todo_completions_date ON todo_completions(date);

-- 初期データ: 1〜4課それぞれに同じ8項目を複製（以後は課ごとに独立して編集可能）
INSERT INTO todo_tasks (ka, title, time_label, weekdays, note, note_day_of_month, sort_order) VALUES
 (1, 'B勤D勤顔挿し',       NULL,    NULL,        NULL, NULL, 10),
 (1, 'ナイト顔挿し',        NULL,    NULL,        NULL, NULL, 20),
 (1, 'H勤顔挿し',          NULL,    NULL,        NULL, NULL, 30),
 (1, '点検札を入れる',      NULL,    '0,1,2,3,4', NULL, NULL, 40),
 (1, '羽田定額確認',        NULL,    NULL,        NULL, NULL, 50),
 (1, '締め作業',           '12:00', NULL,        NULL, NULL, 60),
 (1, 'シフトチェック',      NULL,    NULL,        NULL, NULL, 70),
 (1, 'ホワイトボード記入',   '16:30', NULL,        NULL, NULL, 80),

 (2, 'B勤D勤顔挿し',       NULL,    NULL,        NULL, NULL, 10),
 (2, 'ナイト顔挿し',        NULL,    NULL,        NULL, NULL, 20),
 (2, 'H勤顔挿し',          NULL,    NULL,        NULL, NULL, 30),
 (2, '点検札を入れる',      NULL,    '0,1,2,3,4', NULL, NULL, 40),
 (2, '羽田定額確認',        NULL,    NULL,        NULL, NULL, 50),
 (2, '締め作業',           '12:00', NULL,        NULL, NULL, 60),
 (2, 'シフトチェック',      NULL,    NULL,        NULL, NULL, 70),
 (2, 'ホワイトボード記入',   '16:30', NULL,        NULL, NULL, 80),

 (3, 'B勤D勤顔挿し',       NULL,    NULL,        NULL, NULL, 10),
 (3, 'ナイト顔挿し',        NULL,    NULL,        NULL, NULL, 20),
 (3, 'H勤顔挿し',          NULL,    NULL,        NULL, NULL, 30),
 (3, '点検札を入れる',      NULL,    '0,1,2,3,4', NULL, NULL, 40),
 (3, '羽田定額確認',        NULL,    NULL,        NULL, NULL, 50),
 (3, '締め作業',           '12:00', NULL,        NULL, NULL, 60),
 (3, 'シフトチェック',      NULL,    NULL,        NULL, NULL, 70),
 (3, 'ホワイトボード記入',   '16:30', NULL,        NULL, NULL, 80),

 (4, 'B勤D勤顔挿し',       NULL,    NULL,        NULL, NULL, 10),
 (4, 'ナイト顔挿し',        NULL,    NULL,        NULL, NULL, 20),
 (4, 'H勤顔挿し',          NULL,    NULL,        NULL, NULL, 30),
 (4, '点検札を入れる',      NULL,    '0,1,2,3,4', NULL, NULL, 40),
 (4, '羽田定額確認',        NULL,    NULL,        NULL, NULL, 50),
 (4, '締め作業',           '12:00', NULL,        NULL, NULL, 60),
 (4, 'シフトチェック',      NULL,    NULL,        NULL, NULL, 70),
 (4, 'ホワイトボード記入',   '16:30', NULL,        NULL, NULL, 80);

-- 当直共通タスク（課の区別なく1本のリストを共有）
INSERT INTO todo_tasks (ka, title, time_label, weekdays, note, note_day_of_month, sort_order) VALUES
 (NULL, '工場入構作成',     NULL,    '1,2,3,4,5', NULL,               NULL, 10),
 (NULL, '点呼作成',        NULL,    NULL,        '安全宣言日に注意', 19,   20),
 (NULL, 'ALC機器チェック',  NULL,    NULL,        NULL,               NULL, 30),
 (NULL, '無事故走行距離',   NULL,    NULL,        NULL,               NULL, 40),
 (NULL, '示達事項交換',     NULL,    NULL,        NULL,               NULL, 50),
 (NULL, '構内点検',        NULL,    NULL,        NULL,               NULL, 60),
 (NULL, '着地！',          NULL,    NULL,        NULL,               NULL, 70),
 (NULL, 'シャッターを締める', '20:30', NULL,      NULL,               NULL, 80),
 (NULL, 'シャッターを開ける', '翌1:00', NULL,     NULL,               NULL, 90),
 (NULL, '当直日誌記入',     NULL,    NULL,        NULL,               NULL, 100),
 (NULL, '稼働表',          NULL,    NULL,        NULL,               NULL, 110),
 (NULL, '配車計画表',      NULL,    NULL,        NULL,               NULL, 120);
