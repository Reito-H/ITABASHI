-- 事故報告: 事故相手の名前・電話番号を追加
ALTER TABLE accident_reports ADD COLUMN other_party_name TEXT;
ALTER TABLE accident_reports ADD COLUMN other_party_phone TEXT;
