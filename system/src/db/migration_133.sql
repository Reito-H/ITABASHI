-- ===================================================
-- migration_133: デジタルサイネージ（営業所モニター用 周知スライド）
--
--   横16:9のスライドデッキを Benten 内で編集し、ブラウザのプレゼンモードで
--   営業所モニターに自動再生投影する。1周ぶんを webm 動画として書き出しも可。
--   最初のデッキは「生活道路の法定速度30km/h」（2026-09-01施行の周知・全11面）。
--
--   ページ  : /{SECRET}/admin/signage                （デッキ一覧）
--             /{SECRET}/admin/signage/:id            （編集・フル権限のみ）
--             /{SECRET}/admin/signage/:id/present    （投影・全画面・全アカウント）
--             /{SECRET}/admin/signage/:id/print      （回線断時の保険・1面1ページ）
--   API     : /{SECRET}/admin/api/signage/*          （書き込みはフル権限のみ）
--   権限    : 閲覧(present/print/一覧)は全アカウント（index.ts で権限チェック免除）／
--             編集はフル権限アカウント（admins.permissions IS NULL）のみ
--
--   既存機能とはテーブルを共有しない完全新規（signage_*）。点呼(tenko_*)とも別。
-- ===================================================

CREATE TABLE IF NOT EXISTS signage_decks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL DEFAULT 'サイネージ',
  seconds    REAL NOT NULL DEFAULT 7,            -- 1面の既定表示秒数（現場で上書き可）
  fx_mode    TEXT NOT NULL DEFAULT 'std',        -- 'std' | 'lux'（既定アニメーション）
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- デッキ内スライド。kind ごとに payload(JSON) の構造が変わる
--   title    … 表紙        { eyebrow, big, line, sub }
--   sign     … 標識1枚+一言 { eyebrow, value, tone:'red'|'grey', line, sub }
--   compare  … 標識2枚(60→30){ left_value,left_tone,left_cap, right_value,right_tone,right_cap, line }
--   bridge   … つなぎ       { eyebrow, line }
--   duo      … 条件2つ横並び { eyebrow, a_label,a_picto, b_label,b_picto }（picto: sign-slash|road-slash|road-plain|none）
--   road     … 道の図+一言  { eyebrow, line, picto:'slash'|'plain' }
--   alert    … 注意（黄地） { eyebrow, line, big, sub }
--   closing  … 締めの一言   { line, sub }
--   文言の軽量マークアップ: *赤字* / __黄下線__ / 改行そのまま
CREATE TABLE IF NOT EXISTS signage_slides (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  deck_id    INTEGER NOT NULL REFERENCES signage_decks(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  kind       TEXT NOT NULL,
  payload    TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_signage_slides_deck ON signage_slides(deck_id, sort_order);

-- ---- seed: 生活道路の法定速度30km/h（全11面）----
INSERT INTO signage_decks (id, title, seconds, fx_mode, sort_order, created_by)
VALUES (1, '生活道路の法定速度30km/h', 7, 'std', 0, 'system');

INSERT INTO signage_slides (deck_id, sort_order, kind, payload) VALUES
 (1,  0, 'title',   '{"eyebrow":"法改正のお知らせ","big":"9.1","line":"生活道路の法定速度が変わります","sub":"2026年9月1日 施行"}'),
 (1,  1, 'sign',    '{"eyebrow":"","value":"30","tone":"red","line":"生活道路は *時速30km*","sub":""}'),
 (1,  2, 'sign',    '{"eyebrow":"これまで","value":"60","tone":"grey","line":"標識がなければ 60km/h","sub":""}'),
 (1,  3, 'compare', '{"left_value":"60","left_tone":"grey","left_cap":"これまで","right_value":"30","right_tone":"red","right_cap":"9月1日から","line":"法定速度が *半分* に"}'),
 (1,  4, 'bridge',  '{"eyebrow":"対象になる道路","line":"2つの条件が\nそろう道"}'),
 (1,  5, 'duo',     '{"eyebrow":"対象になる条件","a_label":"速度の標識が\n*ない*","a_picto":"sign-slash","b_label":"道のまん中に\n__白線がない__","b_picto":"road-slash"}'),
 (1,  6, 'sign',    '{"eyebrow":"","value":"30","tone":"red","line":"＝ 住宅街の *細い道*","sub":""}'),
 (1,  7, 'road',    '{"eyebrow":"対象になりません","line":"中央線がある道は *今までどおり*","picto":"plain"}'),
 (1,  8, 'alert',   '{"eyebrow":"うっかり","line":"30km/h の道を、\nいつもの調子で走ると","big":"大幅な速度超過に","sub":"反則金では済まないことも"}'),
 (1,  9, 'sign',    '{"eyebrow":"","value":"30","tone":"red","line":"まず、*速度を落とす*","sub":"生活道路の30km/h　2026年9月1日スタート"}'),
 (1, 10, 'closing', '{"line":"その30キロが、\n*まちの安心*をつくる。","sub":"2026年9月1日 施行"}');
