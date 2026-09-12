-- ===================================================
-- migration_140: アカウント権限のプリセット機能 ＋ 権限キーの追加/整理
--
--  1) permission_presets テーブルを新設。
--     「班長」「当直」など役割ごとの権限セットを保存しておき、アカウント権限編集画面から
--     ワンクリックで適用できるようにする。中身は settings/accounts のUIで作成・編集する。
--
--  2) これまで「全アカウント共通で表示」だった機能に、アカウント別の閲覧ON/OFF権限キーを付与:
--       benri（便利ハブ） / garage（車庫見取り図） / shuttle（シャトルバス）
--       signage（デジタルサイネージ） / cc-list（CC名簿）
--     いずれも編集は従来どおりフル権限アカウントのみ（.edit は使わない）。
--     既存の制限付きアカウントが従来見られていたものを見られなくならないよう、
--     permissions が設定済み（NULL でない）の全アカウントに上記5キーを追記する。
--
--  ※ 板橋ページのサブ機能（ヒヤリハット/アンケート/台本/ご意見版）と課長ミッションは、
--    permissions.ts 側で「親キー settings.study-sessions / staff でも通す」フォールバックを
--    入れるため、ここでのデータ移行は不要。
-- ===================================================

CREATE TABLE IF NOT EXISTS permission_presets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  permissions TEXT    NOT NULL DEFAULT '[]',   -- 許可キーのJSON配列（.edit を含む）
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 既存の制限付きアカウントに、新設の「閲覧ON/OFF」キーを追記
--   ・permissions が JSON配列として妥当なものだけを対象（json_valid でガード）
--   ・すでに同キーを持つ行は対象外（NOT LIKE ガード）
UPDATE admins SET permissions = json_insert(permissions, '$[#]', 'benri')
  WHERE permissions IS NOT NULL AND json_valid(permissions) AND permissions NOT LIKE '%"benri"%';
UPDATE admins SET permissions = json_insert(permissions, '$[#]', 'garage')
  WHERE permissions IS NOT NULL AND json_valid(permissions) AND permissions NOT LIKE '%"garage"%';
UPDATE admins SET permissions = json_insert(permissions, '$[#]', 'shuttle')
  WHERE permissions IS NOT NULL AND json_valid(permissions) AND permissions NOT LIKE '%"shuttle"%';
UPDATE admins SET permissions = json_insert(permissions, '$[#]', 'signage')
  WHERE permissions IS NOT NULL AND json_valid(permissions) AND permissions NOT LIKE '%"signage"%';
UPDATE admins SET permissions = json_insert(permissions, '$[#]', 'cc-list')
  WHERE permissions IS NOT NULL AND json_valid(permissions) AND permissions NOT LIKE '%"cc-list"%';
