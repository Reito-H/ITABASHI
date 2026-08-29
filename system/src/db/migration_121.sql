-- migration_121: LINE無料枠(月200通)対策 — 一方的プッシュ送信をプル型へ置換
--
-- 背景: LINE公式アカウントの無料枠は月200通。応答メッセージ(reply/replyToken)は
--   カウント外だが、push / multicast はカウント対象で枠切れするとサイレント失敗する。
--   車番検索は reply なので生きているが、報告の返信・班長シフト通知が届かなくなっていた。
--
-- 対応:
--   (1) クイック報告モーダルの「LINE送信」= 担当者への multicast を廃止し、
--       report_notices に保存 → 「その他機能」LIFFページに宛先限定で貼り出す。
--   (2) 班長出勤通知(kancho_attendance)の毎日0時 multicast を停止。
--       代わりに「その他機能」LIFFページで今日/明日の出勤班長を見に行く方式へ。

-- (1) 報告連絡事項: クイック報告で選ばれた宛先(line_uid)にだけ表示される貼り出し項目
CREATE TABLE IF NOT EXISTS report_notices (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  report_type   TEXT,                       -- '忘れ物' | '事故' | '違反' | '一般'
  summary       TEXT NOT NULL,              -- 貼り出す本文(コピー対象)
  target_uids   TEXT NOT NULL DEFAULT '[]', -- 表示対象の line_uid の JSON 配列
  target_names  TEXT NOT NULL DEFAULT '[]', -- 表示用の宛先名の JSON 配列
  created_by    TEXT,                       -- 登録した管理者名
  created_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX IF NOT EXISTS idx_report_notices_created ON report_notices(created_at);

-- (2) 班長出勤通知の定時プッシュを停止(行が無ければ何もしない)
UPDATE notification_settings
SET is_enabled = 0, updated_at = datetime('now', 'localtime')
WHERE type = 'kancho_attendance';
