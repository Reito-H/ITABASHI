-- ===================================================
-- migration_132: 点呼（仮眠室集合パワポ）のWeb化
--
--   当直が毎日作っている「仮眠室集合パワポ（点呼）」を、Benten内のスライドデッキとして
--   組み立て → ブラウザのプレゼンモードで仮眠室のモニターに投影できるようにする。
--
--   ページ  : /{SECRET}/admin/tenko                （一覧）
--             /{SECRET}/admin/tenko/:id/edit        （編集）
--             /{SECRET}/admin/tenko/:id/present     （プレゼン投影・全画面）
--             /{SECRET}/admin/tenko/:id/print       （回線断時の保険・印刷/PDF）
--             /{SECRET}/admin/tenko/library         （唱和など使い回し画像の管理）
--   API     : /{SECRET}/admin/api/tenko/*
--   権限    : tenko（閲覧・プレゼン） / tenko.edit（作成・編集）
--
--   既存機能とはテーブルを共有しない完全新規（tenko_*）。
--   アップロード素材（画像/動画/PDF）は R2 の benten-tenko バケットに置く。
-- ===================================================

-- 1日分の点呼デッキ。表紙の定型項目（確認者・天候・気温・一言）はデッキ自身に持たせる
CREATE TABLE IF NOT EXISTS tenko_decks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  deck_date   TEXT NOT NULL,                                  -- 'YYYY-MM-DD' その点呼の日付
  title       TEXT NOT NULL DEFAULT '点呼',
  confirmer   TEXT NOT NULL DEFAULT '',                       -- 確認者
  weather     TEXT NOT NULL DEFAULT '',                       -- 天候（気象庁予報から自動、手直し可）
  temp_max    TEXT NOT NULL DEFAULT '',                       -- 最高気温
  temp_min    TEXT NOT NULL DEFAULT '',                       -- 最低気温
  headline    TEXT NOT NULL DEFAULT '',                       -- 表紙の一言（重点事項）
  status      TEXT NOT NULL DEFAULT 'draft',                  -- draft=作成中 / ready=投影OK
  created_by  TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_tenko_decks_date ON tenko_decks(deck_date DESC);

-- デッキ内のスライド。kind ごとに payload(JSON) の構造が変わる
--   cover     … 表紙（payloadは未使用。デッキの日付/確認者/天候/一言から描画）
--   notice    … 連絡スライド { heading, bullets:[...] }
--   message   … 大文字メッセージ { text, sub, accent:'red'|'blue'|'yellow' }
--   image     … 画像1枚 { media_id, caption, fit:'contain'|'cover' }
--   video     … 動画 { media_id, caption }
--   pdf       … PDF { media_id }
--   accident  … 先月の事故件数（ホシコン事故モニターを同一オリジンで埋め込み。payloadは未使用）
--   library   … 唱和などの完成画像（ライブラリ素材） { media_id }
--   freeform  … 自由配置 { bg, boxes:[ {type:'text'|'image', x,y,w,h, ...} ] }（x/y/w/h は 16:9 キャンバスの%）
CREATE TABLE IF NOT EXISTS tenko_slides (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  deck_id     INTEGER NOT NULL REFERENCES tenko_decks(id),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  kind        TEXT NOT NULL,
  payload     TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_tenko_slides_deck ON tenko_slides(deck_id, sort_order);

-- アップロード素材（画像/動画/PDF）。is_library=1 は日替わりで選べる使い回し素材（唱和など）
CREATE TABLE IF NOT EXISTS tenko_media (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  r2_key      TEXT NOT NULL,
  kind        TEXT NOT NULL,                                  -- image / video / pdf
  filename    TEXT NOT NULL DEFAULT '',
  mime_type   TEXT NOT NULL DEFAULT '',
  size_bytes  INTEGER NOT NULL DEFAULT 0,
  is_library  INTEGER NOT NULL DEFAULT 0,
  label       TEXT NOT NULL DEFAULT '',                       -- ライブラリ素材の表示名
  sort_order  INTEGER NOT NULL DEFAULT 0,
  uploaded_by TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_tenko_media_library ON tenko_media(is_library, sort_order, id);

-- ネタ箱。管理者が「今日の点呼に入れて」というネタを随時投入し、当直が取捨選択してスライド化する
CREATE TABLE IF NOT EXISTS tenko_ideas (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  body         TEXT NOT NULL DEFAULT '',
  media_id     INTEGER REFERENCES tenko_media(id),
  status       TEXT NOT NULL DEFAULT 'open',                  -- open / used / dismissed
  submitted_by TEXT NOT NULL DEFAULT '',
  used_deck_id INTEGER REFERENCES tenko_decks(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  used_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_tenko_ideas_status ON tenko_ideas(status, created_at DESC);
