-- LINE会話ステートマシン用テーブル
CREATE TABLE IF NOT EXISTS line_conv_states (
  line_uid    TEXT PRIMARY KEY,
  state       TEXT NOT NULL DEFAULT 'idle',
  data        TEXT,
  updated_at  TEXT DEFAULT (datetime('now', 'localtime'))
);
