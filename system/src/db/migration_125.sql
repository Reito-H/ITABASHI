-- ===================================================
-- migration_125: 勉強会募集を「営業所ページ」化＋営業所へのご意見版
--
--   - 設定「勉強会募集」を担当営業所名（当面は板橋）に改名し、同ページに
--     「ご意見版」タブを追加する（サイドバー項目は増やさない）。
--   - 今後の全営業所対応に向け、この環境が代表する営業所を system_settings
--     の home_office_id に持たせる（既定 = offices.id 1 = 板橋営業所）。
--   - study_sessions / office_opinions に office_id を持たせる（当面は
--     home_office_id を書き込むだけ。一覧の絞り込みには未使用＝挙動不変）。
--   - office_opinions は乗務員からの意見箱。匿名チェックが入っても emp_no は
--     必ず保存し、管理画面では既定で伏せる（開示はフル権限のみ）。
-- ===================================================

-- 担当営業所（この環境が代表する営業所。offices.id を指す）
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('home_office_id', '1');

-- 勉強会に営業所を紐付け（将来の多営業所対応。既存分は板橋 = id 1 で埋める）
ALTER TABLE study_sessions ADD COLUMN office_id INTEGER;
UPDATE study_sessions SET office_id = 1 WHERE office_id IS NULL;

-- 営業所へのご意見版（乗務員の日頃の意見・要望の収集）
CREATE TABLE IF NOT EXISTS office_opinions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  office_id    INTEGER NOT NULL DEFAULT 1,
  emp_no       TEXT NOT NULL,                 -- 匿名希望でも必ず保存する
  is_anonymous INTEGER NOT NULL DEFAULT 0,    -- 1 = 投稿者が匿名を希望
  category     TEXT,                          -- 任意の分類（車両/設備/シフト など）
  content      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'open',  -- open = 未対応 / done = 対応済
  admin_note   TEXT,                          -- 管理側の対応メモ（乗務員には出さない）
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_office_opinions_office ON office_opinions(office_id, status, created_at);
