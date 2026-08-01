-- ===================================================
-- migration_050: 希望休フォーム 全面リニューアル
--   班長名簿に社員番号を追加（社員マスタemployeesとは別IDのまま、
--   emp_noで直接紐づけて本人確認に使う）。
--   募集期間・対象月度・送信権限・その他要望欄のテーブルを新設。
-- ===================================================

ALTER TABLE kancho_members ADD COLUMN emp_no TEXT;

CREATE TABLE kancho_wish_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  target_year  INTEGER NOT NULL DEFAULT 0,
  target_month INTEGER NOT NULL DEFAULT 0,
  open_from    TEXT,
  open_until   TEXT,
  updated_at   TEXT DEFAULT (datetime('now', 'localtime'))
);
INSERT INTO kancho_wish_settings (id) VALUES (1);

-- 希望休の提出があった際にLINEで即時通知する送信権限者
-- (kancho_notify_optinと同型・別用途。ロール制限なし)
CREATE TABLE kancho_wish_notify_optin (
  line_uid   TEXT PRIMARY KEY,
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

-- その他要望欄（班長ごとに最新内容のみ保持）
CREATE TABLE kancho_wish_remarks (
  member_id  INTEGER PRIMARY KEY REFERENCES kancho_members(id),
  content    TEXT DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now', 'localtime'))
);
