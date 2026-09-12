-- 学習ノート（個人用ノート教材：タイトルごとにページ画像を保存しPDF出力できる機能）
-- ページ画像本体は R2 (STUDY_NOTES_BUCKET) に study-notes/<id>/page-XXXX.<ext> で保存し、
-- このテーブルにはタイトルとページ数のみ持つ（id_photo_batches と同じ方針）。
CREATE TABLE IF NOT EXISTS study_note_books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  page_count INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now','+9 hours')),
  updated_at TEXT DEFAULT (datetime('now','+9 hours'))
);
