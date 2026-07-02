-- migration_003: コーチ登録 + シフト3行構成（午前/午後/研修担当）
ALTER TABLE shift_entries ADD COLUMN entry_am TEXT;
ALTER TABLE shift_entries ADD COLUMN entry_pm TEXT;
ALTER TABLE shift_entries ADD COLUMN coach_id INTEGER REFERENCES coaches(id);

-- 既存データを新カラムに移行（entry_main → entry_am, entry_sub → entry_pm）
UPDATE shift_entries SET entry_am = entry_main WHERE entry_main IS NOT NULL AND entry_main NOT LIKE '午前:%';
UPDATE shift_entries SET entry_am = substr(entry_main, 4) WHERE entry_main LIKE '午前:%';
UPDATE shift_entries SET entry_pm = entry_sub WHERE entry_sub IS NOT NULL AND entry_sub NOT LIKE '午後:%';
UPDATE shift_entries SET entry_pm = substr(entry_sub, 4) WHERE entry_sub LIKE '午後:%';

CREATE TABLE IF NOT EXISTS coaches (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  is_active  INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0
);
