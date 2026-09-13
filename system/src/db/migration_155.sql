-- ===================================================
-- migration_155: SR（S.RIDE 迎車注文リスト）分析ページ
--
--   S.RIDE管理画面から書き出す「注文リストCSV」を取り込み、
--   どのエリアからよく呼ばれるか・同じ電話番号からの繰り返し利用がどれくらいあるか
--   を分析するための保管テーブル。
--   注文番号(order_no)をキーにUPSERTする（同じ注文が複数回のCSVに跨って
--   含まれる想定のため、取り込むたびに最新の状態で上書きする）。
--   pickup_area はクライアント側で迎車地の住所文字列から抽出した市区町村単位の
--   エリアキーで、集計をSQL側のGROUP BYだけで完結させるために事前計算して保存する
--   （地点単位の繰り返し検出は pickup_address をそのままGROUP BYすればよいため
--   別カラムは持たない）。
-- ===================================================

CREATE TABLE IF NOT EXISTS sr_orders (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no                TEXT NOT NULL UNIQUE,   -- 注文番号
  status                  TEXT,                   -- 実行状況
  dispatch_status         TEXT,                   -- 配車状況
  memo                    TEXT,
  customer_name           TEXT,                   -- お客様名
  member_type             TEXT,                   -- 会員種別
  phone                   TEXT,                   -- 電話番号
  source_type             TEXT,                   -- 依頼元種別（S.RIDEアプリ/Uber/DiDi/空欄=電話等）
  fare_type               TEXT,                   -- 料金種別
  fixed_route             TEXT,                   -- 事前確定ルート
  order_type              TEXT,                   -- 注文種別
  flat_fare_type          TEXT,                   -- 定額種別
  ordered_at              TEXT,                   -- 注文日時（YYYY-MM-DD HH:MM:SS に正規化）
  pickup_address          TEXT,                   -- 注文時の迎車地（住所そのまま、前後空白のみ除去）
  pickup_area             TEXT,                   -- 迎車地から抽出した市区町村単位のエリア
  pickup_detail           TEXT,                   -- 迎車地の付け場所
  destination             TEXT,                   -- 注文時の目的地
  order_memo1             TEXT,
  order_memo2             TEXT,
  substitute_request      TEXT,                   -- 代車要請
  accepted_at             TEXT,                   -- 了解日時
  eta_at                  TEXT,                   -- 到着予定日時
  arrived_at              TEXT,                   -- 現着日時
  arrived_point           TEXT,
  boarded_at              TEXT,                   -- 実車日時
  boarded_point           TEXT,
  dropped_at              TEXT,                   -- 降車日時
  dropped_point           TEXT,
  ride_minutes            INTEGER,                -- 乗車時間（分）
  radio_no                TEXT,
  plate_no                TEXT,
  car_type                TEXT,
  car_color               TEXT,
  driver_name             TEXT,
  driver_id               TEXT,
  group_name              TEXT,
  group_code              TEXT,
  company_name            TEXT,
  company_code            TEXT,
  office_name             TEXT,
  office_code             TEXT,
  door_no                 TEXT,
  individual_taxi_name    TEXT,
  arrived_message_at      TEXT,
  payment_method_ordered  TEXT,
  amount_collected        INTEGER,                -- 収受金額
  payment_method_actual   TEXT,
  fixed_fare              INTEGER,                -- 事前確定運賃
  highway_fee             INTEGER,                -- 高速代金
  cancelled_at            TEXT,
  cancel_reason           TEXT,
  cancel_fee_flag         TEXT,
  upload_batch_id         INTEGER,
  created_at              TEXT DEFAULT (datetime('now','localtime')),
  updated_at              TEXT DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_sr_orders_phone         ON sr_orders(phone);
CREATE INDEX IF NOT EXISTS idx_sr_orders_ordered_at    ON sr_orders(ordered_at);
CREATE INDEX IF NOT EXISTS idx_sr_orders_pickup_area   ON sr_orders(pickup_area);
CREATE INDEX IF NOT EXISTS idx_sr_orders_pickup_address ON sr_orders(pickup_address);

-- アップロード履歴（いつ・誰が・何件のCSVを取り込んだか）
CREATE TABLE IF NOT EXISTS sr_uploads (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  file_name    TEXT,
  uploaded_by  TEXT,
  row_count    INTEGER,
  total_after  INTEGER,   -- 取込完了時点での sr_orders 総件数
  uploaded_at  TEXT DEFAULT (datetime('now','localtime'))
);
