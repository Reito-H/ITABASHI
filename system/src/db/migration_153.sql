-- ===================================================
-- migration_153: ベンテンクラブシフト機能の廃止（会員ロールごと完全撤去）
--
--   「ベンテンクラブ シフト」機能そのものに加え、それを使うために作った
--   「ベンテンクラブ会員」「ベンテンクラブシフトマスター」というLINE会員種別（ロール）自体も
--   全廃止する。既存に登録済みの会員がいた場合、その人たちは今後どの機能からも
--   認識されなくなるため、role を 'unknown'（権限不明者と同じ扱い）へ戻す。
--   line_uid の連携自体は解除しない（再度「LINE連携」から登録し直せる）。
-- ===================================================

UPDATE line_liff_users
   SET role = 'unknown', updated_at = datetime('now', 'localtime')
 WHERE role IN ('benten_member', 'benten_shift_master');

DELETE FROM notification_settings WHERE type = 'benten_shift_daily';

-- 参照先(REFERENCES)がある順に削除
DROP TABLE IF EXISTS benten_shifts;
DROP TABLE IF EXISTS benten_members;
DROP TABLE IF EXISTS benten_shift_types;
DROP TABLE IF EXISTS benten_groups;
DROP TABLE IF EXISTS benten_schedule_ranges;
DROP TABLE IF EXISTS benten_config;
