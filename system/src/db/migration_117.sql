-- migration_117: 課長ミッション — 労供上申書 / 労供契約書作成依頼書 の自動生成に使うマスタ
--   ・kacho_masters      : 課長の氏名マスタ（フォームの「課長」「申請者」欄で選択・追加）
--   ・crew_labor_supply_info : 乗務員ごとの「所属労組」「始業終業時間」（動態表・売上DBに無い情報）

CREATE TABLE IF NOT EXISTS kacho_masters (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,            -- 例: 柴村　昌幸
  division    INTEGER,                  -- 主担当の課（1〜4）。未設定可
  role        TEXT,                     -- 例: 課長 / 所長 / 決裁者（任意）
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS crew_labor_supply_info (
  emp_id        INTEGER PRIMARY KEY REFERENCES employees(id),
  union_name    TEXT,                   -- 所属労組の略称（国労 / Km国際 / 自交 / ユニオン / 城東 / 全国際 等）
  start_hh      INTEGER,                -- 始業 時（24時間表記）
  start_mm      INTEGER,                -- 始業 分
  end_hh        INTEGER,                -- 終業 時
  end_mm        INTEGER,                -- 終業 分
  updated_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- よく使う課長名を初期投入（板橋2課の実データより。重複投入を避けるため件数0のときだけ）
INSERT INTO kacho_masters (name, division, role, sort_order)
SELECT '柴村　昌幸', 2, '課長', 10
WHERE NOT EXISTS (SELECT 1 FROM kacho_masters);
INSERT INTO kacho_masters (name, division, role, sort_order)
SELECT '原　義夫', NULL, '決裁者', 20
WHERE (SELECT COUNT(*) FROM kacho_masters) = 1;
