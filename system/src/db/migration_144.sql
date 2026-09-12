-- ===================================================
-- migration_144: 統合デジタルサイネージ（ログイン不要の固定URL）
--
--   デジタルサイネージ(migration_133)を拡張し、ログイン不要で開ける固定URL
--     {SIGNAGE_PUBLIC_PATH}  （config.ts）
--   を1本追加する。Fire TV 等の常時表示端末にはこのURLだけ設定すればよい。
--   このURLが再生する中身＝ signage_decks.is_monitor = 1 を付けたデッキ1つ。
--   印を別デッキに付け替えても、URL自体は今後ずっと変わらない。
--
--   あわせてスライド種別に2つ追加（新規テーブルは作らない）:
--     'newcomers' … 新人紹介カード（写真・氏名・課/班・ひとこと）を1人1面で自動送り
--                    実データは newcomer_intros をそのまま参照
--     'accidents' … 今月の事故件数ボード（総数・前月比・課別・ピーク時間帯）
--                    実データは accident_records をそのまま参照
--   どちらも payload は見出し等の軽い設定のみ。表示のたびにサーバーが最新値を読む。
-- ===================================================

ALTER TABLE signage_decks ADD COLUMN is_monitor INTEGER NOT NULL DEFAULT 0;

-- 既定では並び順が先頭のデッキ（＝初期デッキ「生活道路の法定速度30km/h」）を
-- モニター対象にしておく。あとから /signage 一覧画面でいつでも変更できる。
UPDATE signage_decks
   SET is_monitor = 1
 WHERE id = (SELECT id FROM signage_decks ORDER BY sort_order, id LIMIT 1);
