-- 報告センター統合一覧のための基盤整備
-- (1) 事故報告に「乗車中のお客様」情報（乗客。事故相手 other_party_* とは別概念）を追加
-- (2) 4種の報告テーブル全てに、車番未入力時に使う4桁の案件ID(case_no)列を追加
-- (3) case_no発行専用の採番テーブル（4種別を横断してユニークな連番にする）

ALTER TABLE accident_reports ADD COLUMN customer_name TEXT;
ALTER TABLE accident_reports ADD COLUMN customer_phone TEXT;

ALTER TABLE lost_item_reports ADD COLUMN case_no TEXT;
ALTER TABLE accident_reports ADD COLUMN case_no TEXT;
ALTER TABLE violation_reports ADD COLUMN case_no TEXT;
ALTER TABLE general_reports ADD COLUMN case_no TEXT;

CREATE TABLE IF NOT EXISTS report_case_seq (
  id INTEGER PRIMARY KEY AUTOINCREMENT
);
