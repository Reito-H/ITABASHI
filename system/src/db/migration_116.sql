-- migration_116: 労共契約（65歳以降の契約形態）と契約更新アラートの対応記録
--   動態表（人事システムの社員動態表xlsx）取込で生年月日を確実に反映したうえで、
--   乗務社員が64→65歳になるタイミングで「労共契約」へ移行し、以後75歳まで毎年更新する。
--   ・contract_type: 現在の契約形態（NULL/'一般' = 通常、'労共' = 65〜75歳の労共契約）
--   ・contract_renewal_acks: 「この契約日ぶんの更新（or 労共移行）は対応済み」の記録。
--     UNIQUE(emp_id, contract_date) で同じ更新に二重の対応記録を作らない。
ALTER TABLE employees ADD COLUMN contract_type TEXT;

CREATE TABLE IF NOT EXISTS contract_renewal_acks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  emp_id        INTEGER NOT NULL REFERENCES employees(id),
  renewal_type  TEXT NOT NULL,          -- 'transition65'（労共移行） | 'annual'（毎年更新）
  contract_date TEXT NOT NULL,          -- YYYY-MM-DD  月度ベース（17日締め18日スタート）で算出した契約日
  birthday_date TEXT,                   -- YYYY-MM-DD  対象の誕生日
  acked_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  acked_by      TEXT,
  note          TEXT,
  UNIQUE(emp_id, contract_date)
);

CREATE INDEX IF NOT EXISTS idx_contract_renewal_acks_emp ON contract_renewal_acks(emp_id);
