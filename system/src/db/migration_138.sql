-- ===================================================
-- migration_138: 乗務員証 証明写真 — 保存の恒久化＋印刷シート同梱
--   ・id_photo_batches の自動削除(cron)をやめ、手動削除のみに変更（アプリ側の対応。DBは変更不要）。
--   ・保存時に生成したA4/Lの印刷シート（表裏の各ページ画像＋PDF）もR2に同梱するため、
--     一覧・呼び出し画面でシート有無/枚数を判定できる列を追加。
-- ===================================================

ALTER TABLE id_photo_batches ADD COLUMN has_sheets  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE id_photo_batches ADD COLUMN sheet_count INTEGER NOT NULL DEFAULT 0;

-- 既存行（旧仕様の30日期限）を恒久扱いに戻す
UPDATE id_photo_batches SET expires_at = '9999-12-31T00:00:00.000Z';
