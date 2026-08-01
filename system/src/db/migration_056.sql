-- ===================================================
-- migration_056: マニュアルBotの稼働ON/OFFフラグ
--   system_settings.manual_bot_enabled = '0' で一時停止。
--   停止中は /api/manual-chat（管理画面チャットUI・LINEの「？質問」）が
--   停止メッセージを返す。チケット専用Bot（isTicketQuestion）は対象外で稼働継続。
--   ユーザー要望により、まず停止状態（'0'）で導入する。
-- ===================================================
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('manual_bot_enabled', '0');
