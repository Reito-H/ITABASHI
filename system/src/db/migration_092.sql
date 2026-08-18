-- ===================================================
-- migration_092: 配車管理（乗務員シフトの新ビュー。自動配車の完全自動生成は対象外）
--   ・dispatch_shift_time_master    : 勤務記号ごとの出庫/定時帰庫/残業MAX時刻マスタ（同記号で複数出庫パターン可）
--   ・dispatch_assignments          : 配車データ本体。1レコード=車両×日付×勤務記号×1人
--       （H818.pdfの行粒度=日勤A/Bは別行、と一致。crew_shiftsのPK設計と同じ正規化方針）
--   ・dispatch_vehicle_daily_limits : 点検等による「当日の使用開始時刻」の例外（延長/終日不可/解除）のみ保持。
--       行が無い日はアプリ側で meter_inspections/shaken_records の期限日と照合し「8:00まで制限」を仮想適用する。
--   ・dispatch_remarks              : 日付×班の備考（PDF末尾(備考)欄 or 手入力）
--   ・dispatch_imports              : PDFアップロード履歴
--   ・dispatch_edit_logs            : 編集履歴
--   明番者/公休者/未割当者は新テーブルを作らず crew_shifts から都度計算する（月間シフトとの不整合を避けるため）。
--   担当車のA/B/C優先順位は新テーブルを作らず既存 tantosha_rows(p1/p2/r) を流用する。
--   課↔班は vehicle_teams と同じ方式（team=会社全体の実番号1-8のみ保持、課=Math.ceil(team/2)で導出）に統一。
-- ===================================================

CREATE TABLE IF NOT EXISTS dispatch_shift_time_master (
  id                        INTEGER PRIMARY KEY AUTOINCREMENT,
  shift_code                TEXT NOT NULL,              -- crew_shift_types.code と同じ記号空間（Ｈ/Ｄ/Ｂ/ａ/ｂ）
  variant_label             TEXT NOT NULL DEFAULT '',   -- 同記号で複数パターンある場合の識別名（例:'6:00出庫'）
  departure_time            TEXT NOT NULL,               -- 'HH:MM' 出庫時刻
  standard_return_time      TEXT NOT NULL,               -- 'HH:MM' 定時帰庫時刻
  return_days_offset        INTEGER NOT NULL DEFAULT 0,  -- 定時帰庫が出庫日から何日後か（隔勤は1=翌日）
  max_overtime_return_time  TEXT NOT NULL,               -- 'HH:MM' 残業MAX帰庫時刻
  overtime_days_offset      INTEGER NOT NULL DEFAULT 0,
  is_default                INTEGER NOT NULL DEFAULT 0,  -- 記号ごとに1件のみ1（未指定時に採用する既定パターン）
  sort_order                INTEGER NOT NULL DEFAULT 0,
  is_active                 INTEGER NOT NULL DEFAULT 1,
  updated_at                TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_dispatch_time_master_code ON dispatch_shift_time_master(shift_code, is_active);

CREATE TABLE IF NOT EXISTS dispatch_assignments (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  date           TEXT NOT NULL,                        -- 'YYYY-MM-DD'
  car_no         TEXT NOT NULL,                         -- vehicle_teams.car_no（未マスタ車両でも取込は許容）
  team           INTEGER NOT NULL,                      -- その日その配車票に記載されていた実班番号(1-8)
  shift_code     TEXT NOT NULL,                         -- crew_shift_types.code
  time_master_id INTEGER REFERENCES dispatch_shift_time_master(id), -- NULL=該当codeのis_default行を採用
  member_id      INTEGER REFERENCES crew_shift_members(id),          -- NULL=未割当
  note           TEXT NOT NULL DEFAULT '',              -- PDFの「変更」欄・手入力メモ
  updated_at     TEXT DEFAULT (datetime('now','localtime')),
  updated_by     TEXT,
  UNIQUE(date, car_no, shift_code)
);
CREATE INDEX IF NOT EXISTS idx_dispatch_assignments_date_team ON dispatch_assignments(date, team);
CREATE INDEX IF NOT EXISTS idx_dispatch_assignments_member_date ON dispatch_assignments(member_id, date);
CREATE INDEX IF NOT EXISTS idx_dispatch_assignments_car_date ON dispatch_assignments(car_no, date);

CREATE TABLE IF NOT EXISTS dispatch_vehicle_daily_limits (
  car_no      TEXT NOT NULL,
  date        TEXT NOT NULL,
  usable_from TEXT,                            -- 'HH:MM'。NULLかつis_blocked=0の行=明示的な「制限解除」
  is_blocked  INTEGER NOT NULL DEFAULT 0,       -- 1=終日使用不可
  source      TEXT NOT NULL DEFAULT 'manual',   -- 'manual_extend' / 'manual_block' / 'manual_clear'
  note        TEXT DEFAULT '',
  updated_at  TEXT DEFAULT (datetime('now','localtime')),
  updated_by  TEXT,
  PRIMARY KEY (car_no, date)
);

CREATE TABLE IF NOT EXISTS dispatch_remarks (
  date        TEXT NOT NULL,
  team        INTEGER NOT NULL,
  content     TEXT NOT NULL DEFAULT '',
  updated_at  TEXT DEFAULT (datetime('now','localtime')),
  updated_by  TEXT,
  PRIMARY KEY (date, team)
);

CREATE TABLE IF NOT EXISTS dispatch_imports (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  start_date        TEXT NOT NULL,
  end_date          TEXT NOT NULL,
  teams             TEXT NOT NULL DEFAULT '',     -- カンマ区切り班番号（例 '3,4'）
  file_name         TEXT,
  page_count        INTEGER DEFAULT 0,
  assignment_count  INTEGER DEFAULT 0,
  skipped_count     INTEGER DEFAULT 0,            -- emp_code/car_no不一致等で取り込めなかった件数
  imported_by       TEXT,
  created_at        TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS dispatch_edit_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id    INTEGER,
  admin_name  TEXT NOT NULL DEFAULT '',
  action      TEXT NOT NULL,     -- 'assignment' / 'limit' / 'remark' / 'time_master' / 'import'
  target      TEXT NOT NULL DEFAULT '',
  date        TEXT,
  old_value   TEXT,
  new_value   TEXT,
  created_at  TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_dispatch_edit_logs_created ON dispatch_edit_logs(created_at);

-- 勤務時間マスタ初期データ（構想書「3. 勤務区分と基本時間」に基づく実値。運用しながら設定画面で調整可能）
INSERT OR IGNORE INTO dispatch_shift_time_master
  (shift_code, variant_label, departure_time, standard_return_time, return_days_offset, max_overtime_return_time, overtime_days_offset, is_default, sort_order) VALUES
  ('ａ', '6:00出庫',  '06:00', '14:45', 0, '14:45', 0, 1, 10),
  ('ａ', '6:50出庫',  '06:50', '15:35', 0, '15:35', 0, 0, 11),
  ('ａ', '8:00出庫',  '08:00', '16:45', 0, '16:45', 0, 0, 12),
  ('ｂ', '18:00出庫', '18:00', '02:45', 1, '06:30', 1, 1, 20),
  ('ｂ', '19:00出庫', '19:00', '03:45', 1, '07:30', 1, 0, 21),
  ('Ｂ', '6:00出庫',  '06:00', '23:30', 0, '02:00', 1, 1, 30),
  ('Ｂ', '6:50出庫',  '06:50', '00:20', 1, '02:50', 1, 0, 31),
  ('Ｂ', '8:00出庫',  '08:00', '01:30', 1, '04:00', 1, 0, 32),
  ('Ｄ', '9:30出庫',  '09:30', '03:00', 1, '05:30', 1, 1, 40),
  ('Ｈ', '15:00出庫', '15:00', '08:30', 1, '11:00', 1, 1, 50),
  ('Ｈ', '16:00出庫', '16:00', '09:30', 1, '12:00', 1, 0, 51);
