-- =============================================
-- migration_027: アカウント別ページ権限 + itabashi2 アカウント追加
-- permissions: 許可ページのJSON配列。NULL = 全ページアクセス可（既存adminは変更なし）
-- =============================================

ALTER TABLE admins ADD COLUMN permissions TEXT;

-- itabashi2: ホーム・社員管理・社員絞り込み検索・報告一覧・車両検索・点検管理
--            設定は 忘れ物報告・事故報告・営業所・チュートリアル・システムステータス のみ
INSERT OR IGNORE INTO admins (username, password, permissions)
VALUES (
  'itabashi2',
  'v2:408e1655663e4f9f22f65a9d71102317:3eb3f4285db2adafe636accc071da54a859038393d4a8af9b589f679a6658c16',
  '["home","staff","staff-search","events","vehicles","inspection","settings","settings.lost-items","settings.accidents","settings.offices","settings.tutorial","settings.status"]'
);
