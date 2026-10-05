-- ===================================================
-- migration_174: ゲームアプリ「ITABASHI BATTLE 2」（新卒 繁忙期勉強会用）
--   ・ホシコンとは別画面のゲームアプリ。参加者（新卒）はログイン不要の秘密URL（BATTLE_PUBLIC_PATH）から社員番号で参加、
--     管理者画面・プロジェクター画面はホシコンのアカウントで入る（/admin/ib2）。
--   ・リアルタイム連動は Durable Object（BattleRoom）。進行状態は ib2_games.live_json に保存する。
--   ・既存テーブルとは非共有（ib2_*）。新卒名簿は employees から読み込むだけ（書き込まない）。
-- ===================================================

CREATE TABLE IF NOT EXISTS ib2_games (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  is_active   INTEGER NOT NULL DEFAULT 0,      -- 参加URLで開くゲーム（1件だけ）
  live_json   TEXT    NOT NULL DEFAULT '{}',   -- 進行状態（BattleRoom が保存）
  settings    TEXT    NOT NULL DEFAULT '{}',   -- オープニング曲・背景など
  created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 事前に決めるチーム分け（A〜D）。参加時に社員番号でここを引く
CREATE TABLE IF NOT EXISTS ib2_roster (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id     INTEGER NOT NULL,
  emp_no      TEXT    NOT NULL,
  name        TEXT    NOT NULL,
  team        TEXT    NOT NULL DEFAULT 'A',
  UNIQUE(game_id, emp_no)
);

-- 実際に参加した端末（再読込しても token で復帰）
CREATE TABLE IF NOT EXISTS ib2_players (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id     INTEGER NOT NULL,
  emp_no      TEXT    NOT NULL,
  name        TEXT    NOT NULL,
  team        TEXT    NOT NULL,
  token       TEXT    NOT NULL,
  joined_at   TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE(game_id, emp_no)
);
CREATE INDEX IF NOT EXISTS idx_ib2_players_token ON ib2_players(token);

CREATE TABLE IF NOT EXISTS ib2_teams (
  game_id     INTEGER NOT NULL,
  team        TEXT    NOT NULL,
  name        TEXT    NOT NULL DEFAULT '',
  leader_emp  TEXT    NOT NULL DEFAULT '',
  PRIMARY KEY (game_id, team)
);

-- 管理者が組むメニュー（ラウンド）。kind ごとに config(JSON) の中身が変わる
CREATE TABLE IF NOT EXISTS ib2_steps (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id     INTEGER NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  kind        TEXT    NOT NULL,                -- title|buzzer|choice|number|order|vote|qbox|ranking|timeattack|scoreboard
  title       TEXT    NOT NULL DEFAULT '',
  config      TEXT    NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_ib2_steps_game ON ib2_steps(game_id, sort_order);

-- ラウンド内の問題・項目
CREATE TABLE IF NOT EXISTS ib2_questions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  step_id     INTEGER NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  prompt      TEXT    NOT NULL DEFAULT '',
  image_id    INTEGER,                         -- ib2_media.id
  choices     TEXT    NOT NULL DEFAULT '[]',   -- 選択肢・並べ替え項目
  answer      TEXT    NOT NULL DEFAULT '',     -- 正解（選択肢番号・数値・並び順・解答文）
  points      INTEGER NOT NULL DEFAULT 10,
  time_limit  INTEGER NOT NULL DEFAULT 20,     -- 秒
  note        TEXT    NOT NULL DEFAULT ''      -- 解説（正解発表時に表示）
);
CREATE INDEX IF NOT EXISTS idx_ib2_questions_step ON ib2_questions(step_id, sort_order);

-- 得点の履歴（チーム得点＝合計）。手動加点もここ
CREATE TABLE IF NOT EXISTS ib2_scores (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id     INTEGER NOT NULL,
  team        TEXT    NOT NULL,
  delta       INTEGER NOT NULL,
  reason      TEXT    NOT NULL DEFAULT '',
  created_by  TEXT    NOT NULL DEFAULT '',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_ib2_scores_game ON ib2_scores(game_id);

-- 回答・投票・質問箱の記録（あとで振り返る用）
CREATE TABLE IF NOT EXISTS ib2_answers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id     INTEGER NOT NULL,
  step_id     INTEGER NOT NULL,
  question_id INTEGER,
  emp_no      TEXT    NOT NULL,
  team        TEXT    NOT NULL,
  answer      TEXT    NOT NULL DEFAULT '',
  correct     INTEGER NOT NULL DEFAULT 0,
  ms          INTEGER,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_ib2_answers_step ON ib2_answers(step_id);

-- 画像・曲（R2 DOCUMENTS_BUCKET の ib2/ 配下）
CREATE TABLE IF NOT EXISTS ib2_media (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT    NOT NULL,                -- image | audio
  r2_key      TEXT    NOT NULL,
  name        TEXT    NOT NULL DEFAULT '',
  mime        TEXT    NOT NULL DEFAULT '',
  size        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 車椅子タイムアタックの記録（管理者が入力 → ランキング表示）
CREATE TABLE IF NOT EXISTS ib2_timeattack (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  emp_no      TEXT    NOT NULL DEFAULT '',
  name        TEXT    NOT NULL,
  seconds     REAL    NOT NULL,
  note        TEXT    NOT NULL DEFAULT '',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
