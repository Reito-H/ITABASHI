-- ===================================================
-- migration_191: ホシコンパズル（暇つぶし用 3マッチパズル × 味方チーム × 敵バトル）
--   公開ページ {PUZZLE_PATH}（ログイン不要）で 社員番号 or ニックネーム で参戦し、
--   味方キャラ3人を選んで敵を順番に倒す。管理は 設定 → バトル設定（settings.puzzle）。
--   味方キャラの写真はバースデーモード（birthday_celebrants）から R2 の puzzle/ 配下へ「コピー」して別管理にする
--   （バースデー側の写真を消しても影響しない）。既存テーブルは一切変更しない。
-- ===================================================

CREATE TABLE IF NOT EXISTS puzzle_settings (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  title           TEXT    NOT NULL DEFAULT 'ホシコンパズル',
  is_open         INTEGER NOT NULL DEFAULT 1,     -- 0=受付停止（ページは「準備中」表示）
  team_size       INTEGER NOT NULL DEFAULT 3,     -- 味方チームの人数
  enemy_interval  INTEGER NOT NULL DEFAULT 3,     -- 敵が何手ごとに攻撃してくるか
  updated_at      TEXT DEFAULT (datetime('now','localtime'))
);
INSERT OR IGNORE INTO puzzle_settings (id) VALUES (1);

-- 参戦者。社員番号がある人は emp_no で同一人物判定、ない人はニックネームで判定
CREATE TABLE IF NOT EXISTS puzzle_players (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  emp_no         TEXT    NOT NULL DEFAULT '',   -- 社員番号で参戦した人のみ。ニックネームだけの人は ''
  real_name      TEXT    NOT NULL DEFAULT '',   -- employees.name（社員番号で参戦した人のみ。管理画面の確認用）
  nickname       TEXT    NOT NULL,              -- ランキングに出す名前（全員でユニーク）
  token          TEXT    NOT NULL,              -- 端末に保存する合言葉（URLには出さない）
  created_at     TEXT DEFAULT (datetime('now','localtime')),
  last_played_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_puzzle_players_emp   ON puzzle_players(emp_no) WHERE emp_no <> '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_puzzle_players_nick  ON puzzle_players(nickname);
CREATE UNIQUE INDEX IF NOT EXISTS idx_puzzle_players_token ON puzzle_players(token);

-- 味方キャラ（社員の写真）。element: fire/water/wood/light/dark
CREATE TABLE IF NOT EXISTS puzzle_allies (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT    NOT NULL,              -- ゲームに出す表示名（初期値はバースデーの名前）
  source_celebrant INTEGER,                      -- 取り込み元 birthday_celebrants.id（再取込で重複させないため）
  photo_r2_key     TEXT,                         -- puzzle/ally/… にコピーした写真
  photo_mime       TEXT,
  photo_offset_x   REAL    NOT NULL DEFAULT 50,
  photo_offset_y   REAL    NOT NULL DEFAULT 50,
  photo_scale      REAL    NOT NULL DEFAULT 1,
  hp               INTEGER NOT NULL DEFAULT 100,
  atk              INTEGER NOT NULL DEFAULT 10,
  element          TEXT    NOT NULL DEFAULT 'fire',
  is_active        INTEGER NOT NULL DEFAULT 1,   -- 0=ゲームに出さない
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT DEFAULT (datetime('now','localtime')),
  updated_at       TEXT DEFAULT (datetime('now','localtime'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_puzzle_allies_src ON puzzle_allies(source_celebrant) WHERE source_celebrant IS NOT NULL;

-- 敵キャラ（画像アップロード）。sort_order の順にステージとして出てくる
CREATE TABLE IF NOT EXISTS puzzle_enemies (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL,
  photo_r2_key TEXT,
  photo_mime   TEXT,
  hp           INTEGER NOT NULL DEFAULT 300,
  atk          INTEGER NOT NULL DEFAULT 30,
  element      TEXT    NOT NULL DEFAULT 'fire',
  is_active    INTEGER NOT NULL DEFAULT 1,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT DEFAULT (datetime('now','localtime')),
  updated_at   TEXT DEFAULT (datetime('now','localtime'))
);

-- 1プレイごとの結果（ランキングは player ごとの最高 score）
CREATE TABLE IF NOT EXISTS puzzle_scores (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id      INTEGER NOT NULL,
  stages_cleared INTEGER NOT NULL DEFAULT 0,
  stages_total   INTEGER NOT NULL DEFAULT 0,
  hp_left        INTEGER NOT NULL DEFAULT 0,     -- 終了時の残りHP（%）
  moves          INTEGER NOT NULL DEFAULT 0,
  cleared        INTEGER NOT NULL DEFAULT 0,     -- 1=全ステージクリア
  score          INTEGER NOT NULL DEFAULT 0,     -- サーバー側で計算
  team           TEXT    NOT NULL DEFAULT '[]',  -- 使った味方 id の JSON 配列
  created_at     TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_puzzle_scores_player ON puzzle_scores(player_id, score DESC);
