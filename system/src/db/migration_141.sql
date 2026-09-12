-- ===================================================
-- migration_141: 顔認証（検証用スタンドアロン）
--   ・左サイドバーの新タブ「顔認証」＝ /face-auth（カメラで登録済みの顔と照合し、
--     一致度%としきい値を調整して精度を体感する検証ページ）。
--   ・設定サブページ /settings/face-auth ＝ 顔の登録（撮影→128次元の特徴ベクトルへ変換→保存）。
--   ・顔写真そのものは保存しない。保存するのは特徴ベクトル（数値128個のJSON配列）だけ。
--   ・顔認識モデル（@vladmandic/face-api）は jsdelivr CDN から読み込む（無料・鍵不要）。
--     照合はすべてブラウザ内で完結する。サーバーは特徴ベクトルの保存/取得のみ。
--   ・権限キー face-auth（閲覧＝照合テスト） / face-auth.edit（登録・削除）。
--     既存機能とはテーブル非共有の完全新規（face_auth_*）。
-- ===================================================

CREATE TABLE IF NOT EXISTS face_auth_faces (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  label         TEXT    NOT NULL UNIQUE,          -- 表示名（管理者名など・手入力）
  descriptor    TEXT    NOT NULL,                 -- JSON: 長さ128の数値配列（L2正規化済み）
  sample_count  INTEGER NOT NULL DEFAULT 1,       -- 平均に使ったフレーム数
  created_by    TEXT    NOT NULL DEFAULT '',      -- 登録操作をした管理者のusername
  created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_face_auth_faces_label ON face_auth_faces(label);
