-- migration_005: 面談記録テーブル + お知らせ配信テーブル

-- 面談記録（UIとAPIは実装済みだがテーブルが未作成）
CREATE TABLE IF NOT EXISTS interview_records (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  emp_id                   INTEGER NOT NULL REFERENCES employees(id),
  interview_date           TEXT NOT NULL,
  next_interview_date      TEXT,
  interviewer              TEXT,
  chk_mental_exp           INTEGER CHECK(chk_mental_exp BETWEEN 1 AND 3),
  chk_mental_exp_note      TEXT,
  chk_mental_stress        INTEGER CHECK(chk_mental_stress BETWEEN 1 AND 3),
  chk_mental_stress_note   TEXT,
  chk_mental_family        INTEGER CHECK(chk_mental_family BETWEEN 1 AND 3),
  chk_mental_family_note   TEXT,
  chk_life_sleep           INTEGER CHECK(chk_life_sleep BETWEEN 1 AND 3),
  chk_life_sleep_note      TEXT,
  chk_life_appetite        INTEGER CHECK(chk_life_appetite BETWEEN 1 AND 3),
  chk_life_appetite_note   TEXT,
  chk_life_health          INTEGER CHECK(chk_life_health BETWEEN 1 AND 3),
  chk_life_health_note     TEXT,
  chk_work_motivation      INTEGER CHECK(chk_work_motivation BETWEEN 1 AND 3),
  chk_work_motivation_note TEXT,
  chk_work_instructor      INTEGER CHECK(chk_work_instructor BETWEEN 1 AND 3),
  chk_work_instructor_note TEXT,
  chk_work_rules           INTEGER CHECK(chk_work_rules BETWEEN 1 AND 3),
  chk_work_rules_note      TEXT,
  chk_money                INTEGER CHECK(chk_money BETWEEN 1 AND 3),
  chk_money_note           TEXT,
  chk_relation             INTEGER CHECK(chk_relation BETWEEN 1 AND 3),
  chk_relation_note        TEXT,
  chk_appearance           INTEGER CHECK(chk_appearance BETWEEN 1 AND 3),
  chk_appearance_note      TEXT,
  chk_attendance           INTEGER CHECK(chk_attendance BETWEEN 1 AND 3),
  chk_attendance_note      TEXT,
  chk_future               INTEGER CHECK(chk_future BETWEEN 1 AND 3),
  chk_future_note          TEXT,
  concerns                 TEXT,
  followup_plan            TEXT,
  employee_comment         TEXT,
  created_at               TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at               TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_interview_records_emp  ON interview_records(emp_id);
CREATE INDEX IF NOT EXISTS idx_interview_records_date ON interview_records(interview_date);

-- お知らせ配信ログ
CREATE TABLE IF NOT EXISTS announcements (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  message     TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT 'all' CHECK(target_type IN ('all', 'entry_month', 'individual')),
  target_data TEXT,    -- entry_month: "YYYY-MM" / individual: カンマ区切りemp_id
  sent_count  INTEGER DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now', 'localtime'))
);
