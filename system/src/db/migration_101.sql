-- ===================================================
-- migration_101: アナウンスバー
-- 管理画面全ページの最上部に常時表示するお知らせテロップ。
-- 既存の「お知らせ配信」(announcements、ベルマーク通知)とは表示形態・用途が異なる
-- （常時表示のバー vs 都度確認するお知らせ一覧）ため、専用テーブルで独立管理する。
-- ===================================================

CREATE TABLE IF NOT EXISTS announcement_bars (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  message      TEXT NOT NULL,
  priority     TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'warning', 'critical')),
  expires_at   TEXT NOT NULL,  -- 'YYYY-MM-DDTHH:MM' 形式。この日時を過ぎると自動的に表示されなくなる
  is_active    INTEGER NOT NULL DEFAULT 1,  -- 期限前に手動でOFFにする場合に使う
  created_by   INTEGER,
  created_at   TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at   TEXT DEFAULT (datetime('now', 'localtime'))
);

-- アカウント単位の「一時非表示」記録。表示中のバーの×ボタンを押すとそのバーIDが記録され、
-- 同じバーは以後表示されなくなる（新しいバーが作られれば再度表示される）。
CREATE TABLE IF NOT EXISTS announcement_bar_dismissals (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  bar_id       INTEGER NOT NULL REFERENCES announcement_bars(id),
  admin_id     INTEGER NOT NULL,
  dismissed_at TEXT DEFAULT (datetime('now', 'localtime')),
  UNIQUE(bar_id, admin_id)
);
