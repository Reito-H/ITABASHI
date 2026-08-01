-- ===================================================
-- migration_054: 乗務員証挿しチェックの日付対応・サーバー保存
--   crew_card_checks: 「その日」の乗務員証挿し確認を誰がいつ行ったかを保存。
--   従来はクライアント側のみの状態（モーダルを閉じると消える）だったが、
--   日付ごとに引き継げるようにする。
-- ===================================================
CREATE TABLE IF NOT EXISTS crew_card_checks (
  member_id   INTEGER NOT NULL REFERENCES crew_shift_members(id),
  date        TEXT NOT NULL,
  checked_by  TEXT NOT NULL DEFAULT '',
  checked_at  TEXT DEFAULT (datetime('now', 'localtime')),
  PRIMARY KEY (member_id, date)
);
CREATE INDEX IF NOT EXISTS idx_crew_card_checks_date ON crew_card_checks(date);
