-- ===================================================
-- migration_136: 板橋イベント — カテゴリー（公演／勉強会など）と「回（公演回）」対応
--   ・1イベント = 複数の「回（slot）」。回ごとに時刻・定員を持ち、参加登録も回単位。
--   ・1人が同一イベントの複数の回に登録できる（UNIQUE は session_id + emp_no + slot_id）。
--   ・カテゴリーは管理画面で自由に追加・並べ替え・改名できるマスター。
--   ・既存イベントは「回1つ」に自動移行し、従来どおり動かす。
--   ※このマイグレーションは一度だけ流す前提（study_session_participants を作り直すため冪等ではない）。
-- ===================================================

-- 1. カテゴリーマスター
CREATE TABLE IF NOT EXISTS study_session_categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now', 'localtime'))
);
INSERT INTO study_session_categories (name, sort_order)
  SELECT '公演', 10 WHERE NOT EXISTS (SELECT 1 FROM study_session_categories);
INSERT INTO study_session_categories (name, sort_order)
  SELECT '勉強会', 20 WHERE NOT EXISTS (SELECT 1 FROM study_session_categories WHERE name = '勉強会');

ALTER TABLE study_sessions ADD COLUMN category_id INTEGER;

-- 対象者の絞り込み条件（JSON）。null または {"mode":"all"} は全員。
--   {"mode":"conditions", tenure_max_months, tenure_min_months, entry_types:[], newcomers_only, emp_nos:[]}
--   条件は指定されたものを AND で判定（社員番号を書いた場合はその番号のみ）。
ALTER TABLE study_sessions ADD COLUMN eligibility_json TEXT;

-- 2. 回（slot）: イベントごとの開催回。時刻・定員は回が持つ
CREATE TABLE IF NOT EXISTS study_session_slots (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  INTEGER NOT NULL REFERENCES study_sessions(id),
  slot_order  INTEGER NOT NULL DEFAULT 0,
  label       TEXT,
  start_time  TEXT,
  end_time    TEXT,
  capacity    INTEGER NOT NULL DEFAULT 0 CHECK(capacity >= 0),
  created_at  TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at  TEXT DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX IF NOT EXISTS idx_study_session_slots_session ON study_session_slots(session_id);

-- 既存イベントを「回1つ」に移行（回がまだ無いイベントだけ）
INSERT INTO study_session_slots (session_id, slot_order, label, start_time, end_time, capacity)
  SELECT s.id, 0, NULL, s.start_time, s.end_time, s.capacity
  FROM study_sessions s
  WHERE NOT EXISTS (SELECT 1 FROM study_session_slots x WHERE x.session_id = s.id);

-- 3. 参加者を回単位に付け替え（UNIQUE を貼り替えるため作り直し）
ALTER TABLE study_session_participants ADD COLUMN slot_id INTEGER;
UPDATE study_session_participants
  SET slot_id = (
    SELECT s.id FROM study_session_slots s
    WHERE s.session_id = study_session_participants.session_id
    ORDER BY s.slot_order, s.id LIMIT 1
  )
  WHERE slot_id IS NULL;

DROP TABLE IF EXISTS study_session_participants_old;
ALTER TABLE study_session_participants RENAME TO study_session_participants_old;
CREATE TABLE study_session_participants (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  INTEGER NOT NULL REFERENCES study_sessions(id),
  slot_id     INTEGER NOT NULL REFERENCES study_session_slots(id),
  emp_no      TEXT NOT NULL,
  attended    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at  TEXT DEFAULT (datetime('now', 'localtime')),
  UNIQUE(session_id, emp_no, slot_id)
);
INSERT INTO study_session_participants (id, session_id, slot_id, emp_no, attended, created_at, updated_at)
  SELECT id, session_id, slot_id, emp_no, attended, created_at, updated_at
  FROM study_session_participants_old
  WHERE slot_id IS NOT NULL;
DROP TABLE study_session_participants_old;
CREATE INDEX IF NOT EXISTS idx_study_session_participants_session ON study_session_participants(session_id);
CREATE INDEX IF NOT EXISTS idx_study_session_participants_slot ON study_session_participants(slot_id);
