-- マニュアル管理テーブル
CREATE TABLE IF NOT EXISTS manuals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  filename TEXT,
  created_at TEXT DEFAULT (datetime('now','+9 hours'))
);

-- マニュアルチャンクテーブル
CREATE TABLE IF NOT EXISTS manual_chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  manual_id INTEGER NOT NULL REFERENCES manuals(id) ON DELETE CASCADE,
  section TEXT,
  content TEXT NOT NULL,
  chunk_order INTEGER NOT NULL DEFAULT 0
);

-- FTS5仮想テーブル（日本語全文検索）
CREATE VIRTUAL TABLE IF NOT EXISTS manual_chunks_fts USING fts5(
  content,
  section,
  content='manual_chunks',
  content_rowid='id',
  tokenize='unicode61 remove_diacritics 1'
);

-- FTS同期トリガー
CREATE TRIGGER IF NOT EXISTS manual_chunks_ai AFTER INSERT ON manual_chunks BEGIN
  INSERT INTO manual_chunks_fts(rowid, content, section) VALUES (new.id, new.content, new.section);
END;
CREATE TRIGGER IF NOT EXISTS manual_chunks_ad AFTER DELETE ON manual_chunks BEGIN
  INSERT INTO manual_chunks_fts(manual_chunks_fts, rowid, content, section) VALUES ('delete', old.id, old.content, old.section);
END;

-- チャット履歴
CREATE TABLE IF NOT EXISTS manual_chat_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL DEFAULT 'admin',  -- 'admin' or 'line'
  line_user_id TEXT,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now','+9 hours'))
);
