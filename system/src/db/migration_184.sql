-- ===================================================
-- migration_184: ITABASHI BATTLE 2 — 景品発表の「演出の順番」を賞ごとに細かく決められるようにする
--   ib2_questions.seq = 'winner,prize,image,full' のようにカンマ区切り（「次を発表」1回で1つずつ出る）
--     winner=受賞者 / prize=景品の文 / image=画像 / full=画像だけを全画面に
--   空のときは従来どおり（points=1 なら 景品→受賞者、それ以外は 受賞者→景品。画像は景品の文と一緒）
--   最下位賞は「景品 → 受賞者 → 画像を全画面に」にしておく。
-- ===================================================
ALTER TABLE ib2_questions ADD COLUMN seq TEXT NOT NULL DEFAULT '';
UPDATE ib2_questions SET seq = 'prize,winner,full' WHERE prompt = '最下位賞' AND step_id IN (SELECT id FROM ib2_steps WHERE kind = 'prizes');
