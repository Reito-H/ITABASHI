-- ===================================================
-- migration_152: 点呼（仮眠室集合パワポのWeb化）機能の廃止
-- migration_132 で作成した点呼機能のテーブルを削除する。
-- 参照先(REFERENCES)がある順に削除: tenko_ideas → tenko_slides → tenko_media → tenko_decks
-- ===================================================

DROP TABLE IF EXISTS tenko_ideas;
DROP TABLE IF EXISTS tenko_slides;
DROP TABLE IF EXISTS tenko_media;
DROP TABLE IF EXISTS tenko_decks;
