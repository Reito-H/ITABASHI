-- ===================================================
-- migration_090: 事故モニター強制更新フラグ
--   設定ページから「強制更新」を押すと system_settings を更新し、
--   モニター画面（別デバイス）側は短い間隔でこの値をポーリングして自動リロードする。
-- ===================================================

INSERT OR IGNORE INTO system_settings (key, value) VALUES ('accidents_monitor_force_refresh_at', '');
