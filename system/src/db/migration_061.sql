-- ===================================================
-- migration_061: マニュアルBot機能の廃止 → 資料センターへ移行
--   マニュアルBot（チャット・FTS検索・LINEの「？質問」コマンド）と
--   チケット専用チャットBotを廃止し、PDF/Word/Excel等のファイルを
--   保存・閲覧できる「資料センター」（設定 → 資料センター）に置き換える。
--   既存マニュアルデータ（id=1、docx原本は非保存でテキストチャンクのみ）は
--   資料センターの1件としてテキスト形式で引き継ぐ。
-- ===================================================

CREATE TABLE IF NOT EXISTS resources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'その他',
  filename TEXT,          -- 元ファイル名（ファイル形式の場合のみ）
  r2_key TEXT,            -- R2オブジェクトキー（ファイル形式の場合のみ）
  mime_type TEXT,
  size_bytes INTEGER,
  content_text TEXT,      -- テキスト形式の資料（旧マニュアルBotデータの引き継ぎ用）
  uploaded_by TEXT,        -- アップロードした管理画面アカウント名
  created_at TEXT DEFAULT (datetime('now','+9 hours')),
  updated_at TEXT DEFAULT (datetime('now','+9 hours'))
);

-- 既存マニュアルデータをテキスト資料として引き継ぐ
INSERT INTO resources (title, category, content_text, uploaded_by, created_at)
SELECT
  m.title,
  'マニュアル',
  (SELECT GROUP_CONCAT('【' || COALESCE(mc.section, '') || '】' || char(10) || mc.content, char(10) || char(10) || '---' || char(10) || char(10))
   FROM manual_chunks mc WHERE mc.manual_id = m.id ORDER BY mc.chunk_order),
  '(旧マニュアルBotより移行)',
  m.created_at
FROM manuals m;

-- マニュアルBot関連テーブル・設定の削除
DROP TABLE IF EXISTS manual_chunks_fts;
DROP TABLE IF EXISTS manual_chunks;
DROP TABLE IF EXISTS manuals;
DROP TABLE IF EXISTS manual_chat_logs;
DELETE FROM system_settings WHERE key = 'manual_bot_enabled';
