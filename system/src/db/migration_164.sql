-- ハッピーバースデーモード: 顔写真の表示位置（トリミング位置）・拡大率の調整機能を追加
-- photo_offset_x / photo_offset_y は object-position のパーセンテージ（0-100、中央=50）
-- photo_scale は拡大率（1.0 = 等倍）
ALTER TABLE birthday_celebrants ADD COLUMN photo_offset_x REAL NOT NULL DEFAULT 50;
ALTER TABLE birthday_celebrants ADD COLUMN photo_offset_y REAL NOT NULL DEFAULT 50;
ALTER TABLE birthday_celebrants ADD COLUMN photo_scale REAL NOT NULL DEFAULT 1;
