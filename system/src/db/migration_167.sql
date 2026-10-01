-- migration_167: 引き継ぎシート「当欠記録を見る」での誤判定修正機能
--   当欠・理由欄の自動判定（parseTokaLines）は、次の行に残った「値未入力の別の人の名前」を
--   誤って前の人の理由として拾ってしまうことがある。本文（toka_content）は書き換えず、
--   「当欠記録を見る」モーダル側だけで (1) 理由の直接編集 (2) 誤判定で紛れ込んだ名前を
--   正しい当欠エントリとして切り出す「これは名前でした」変換 ができるよう、
--   集計時にだけ適用する上書きレイヤーとしてこのテーブルを追加する。
CREATE TABLE IF NOT EXISTS handover_toka_corrections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  division INTEGER NOT NULL,
  date TEXT NOT NULL,
  target_name TEXT NOT NULL,
  target_value REAL NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  extra_name TEXT,
  extra_value REAL,
  extra_reason TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_handover_toka_corrections_date ON handover_toka_corrections(division, date);
