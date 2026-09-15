# S.RIDE 管理画面（web.sride.taxi）API調査メモ

`web.sride.taxi.har`（2026-09-15採取、ユーザー: k-yamashita@km-group.jp）を解析した結果。
S.RIDEタクシー配車の管理画面（国際自動車 板橋営業所アカウント）が内部で叩いているAPIをドキュメント化したもの。

既存の[[SR（S.RIDE迎車分析）]]機能は「注文リストCSVを手動ダウンロード→アップロード」方式だが、
このAPIが使えれば自動取込（定期バッチ）に置き換えられる可能性がある。ただし下記の注意点を参照。

## ⚠️ 注意事項

- **非公式・無許可のAPI**。S.RIDE側が外部連携用として公開しているものではなく、管理画面(SPA)が内部的に呼んでいるエンドポイントを観測しただけ。利用規約・アクセス許可の確認なしに本番の定期バッチ等に組み込むのは避けること。
- レスポンスには**乗客氏名・電話番号・乗降住所・ドライバー氏名**等の個人情報が含まれる。取り扱いは要注意（保存する場合は既存のSR機能同様、社内限定・パスワード保護必須）。
- HARファイル自体にログインパスワードが平文で記録されていた（ブラウザの開発者ツールでHARを保存すると認証情報もそのまま残る）。**このHARファイルは取り扱いに注意し、不要になったら削除を推奨**。
- 認証はCookieベースのセッション（後述）。APIキー等の長期利用向け認証手段は確認できなかった。

## 全体構成

| ホスト | 役割 |
|---|---|
| `web.sride.taxi` | 管理画面本体（Next.js） |
| `api.sride.taxi` | バックエンドAPI（Spring Boot + Spring Security OAuth2 Client） |
| `auth.sride.jp` | 認証基盤（Keycloak、realm: `bs-web-user`） |

## 認証フロー（Keycloak OAuth2 Authorization Code + セッションCookie）

ブラウザでログインすると以下の順でリダイレクトが連鎖する（すべてHARで確認済み）。

```
1. GET  https://api.sride.taxi/v2/redirect/manager
   → 302 Location: /oauth2/authorization/keycloak

2. GET  https://api.sride.taxi/oauth2/authorization/keycloak
   → 302 Location: https://auth.sride.jp/auth/realms/bs-web-user/protocol/openid-connect/auth
                    ?response_type=code&client_id=manager&scope=openid
                    &state=...&redirect_uri=https://api.sride.taxi/login/oauth2/code/keycloak&nonce=...

3. GET  https://auth.sride.jp/auth/realms/bs-web-user/protocol/openid-connect/auth?...
   → 200 ログインフォームHTML
     フォームの <form action="..."> に session_code / execution / client_id / tab_id / client_data が
     クエリパラメータとして埋め込まれている（HTMLエンティティ &amp; なので unescape必須）

4. POST <form action のURL>
   Content-Type: application/x-www-form-urlencoded
   Body: username=<メールアドレス>&password=<パスワード>&credentialId=
   → 302 Location: https://api.sride.taxi/login/oauth2/code/keycloak?state=...&session_state=...&iss=...&code=...
   （このレスポンスでKEYCLOAK_IDENTITY / KEYCLOAK_SESSION Cookieがセットされる）

5. GET  https://api.sride.taxi/login/oauth2/code/keycloak?...code=...
   → 302 Location: /v2/redirect/manager
   （SESSION Cookieがセットされる = Spring側のログインセッション確立）

6. GET  https://api.sride.taxi/v2/redirect/manager
   → 302 Location: https://web.sride.taxi
   （XSRF-TOKEN Cookieがセットされる）
```

**実機検証で判明した注意点**: ステップ5のリダイレクト先は必ずしも`/v2/redirect/manager`になるとは限らない
（`/`など別のパスに着地し、そこが404になることがある）。`SESSION` Cookie自体はステップ5でも正しく更新されて
おり認証自体は成功しているので、**着地先が`https://web.sride.taxi`でなければ、`/v2/redirect/manager`に
もう一度GETし直せばよい**（2回目はSESSION Cookieが認証済み状態なので即座に`https://web.sride.taxi`へ302される）。
検証スクリプト（`scripts/sride_api/verify_sride_api.py`）はこのリトライを組み込み済みで、実際にログイン〜
注文データ取得まで動作確認できている。

以降のAPI呼び出しは `Cookie: SESSION=...; XSRF-TOKEN=...` を付与するだけでよい（観測できたのはGETのみで、
`X-XSRF-TOKEN` ヘッダーの送信は確認できなかった。POST系エンドポイントがあれば別途XSRF対策が必要になる可能性あり）。

2段階目以降は多要素認証等は要求されていない（ID/パスワードのみ、Keycloakの通常ログインフォーム）。

## エンドポイント一覧（`api.sride.taxi`）

いずれも `Origin: https://web.sride.taxi` からのCORSリクエスト。レスポンスヘッダーで
`Access-Control-Allow-Origin: https://web.sride.taxi` かつ `Access-Control-Allow-Credentials: true` が
返っており、Cookie送信が前提のAPI設計。

### GET /v2/auth/userinfo

ログイン中アカウントの本人情報。

```json
{
  "sub": "60536ac5-45ee-4a63-afb4-df5477a96e8c",
  "email_verified": true,
  "preferred_username": "k-yamashita@km-group.jp",
  "email": "k-yamashita@km-group.jp"
}
```

### GET /v2/order/accounts

アカウント検索。クエリ:

| パラメータ | 例 | 説明 |
|---|---|---|
| `email_keyword` | `k-yamashita@km-group.jp` | メールアドレス部分一致検索 |
| `include_organization` | `true` | 組織情報を含めるか |
| `include_relation_all_type` | `true` | 関連情報を全種別含めるか |

```json
{
  "totalCount": 1,
  "page": 1,
  "count": 50,
  "totalPages": 1,
  "data": [
    {
      "account_id": "60536ac5-45ee-4a63-afb4-df5477a96e8c",
      "status": 1,
      "account_name": "山下　桂",
      "email": "k-yamashita@km-group.jp",
      "role": 2,
      "permissions": [],
      "version": 1,
      "affiliations": [
        {
          "organization_code": "S0003",
          "company_code": "000006",
          "company_id": "000006_000004",
          "sales_office_id": "000006_000004_000001",
          "type": 1
        },
        {
          "organization_code": "S0003",
          "company_code": "000006",
          "company_id": "000006_000004",
          "sales_office_id": "000006_000004_000001",
          "type": 0
        }
      ]
    }
  ]
}
```

### GET /v2/order/orders

注文一覧（画面の「注文リスト」タブに対応、ページング付き）。

クエリパラメータ（HARで確認できた組み合わせのみ。他にもある可能性あり）:

| パラメータ | 必須 | 例 | 説明 |
|---|---|---|---|
| `page` | ○ | `1` | ページ番号（1始まり） |
| `sort` | ○ | `desc` | ソート順（`desc`のみ観測。`asc`は未確認） |
| `order_date_from` | ○ | `2026-09-15T00:00` | 検索開始日時（ローカルタイム、URLエンコードで`:`→`%3A`） |
| `order_date_to` | ○ | `2026-09-15T23:59` | 検索終了日時 |
| `order_statuses` | △ | 空文字 | ステータス絞り込み。HARでは常に空文字（未絞り込み）で送信されており、有効な値は不明 |
| `radio_no` | 任意 | `5353` | 無線番号（車両番号）での絞り込み |
| `passenger_tel` | 任意 | `09036340103` | 乗客電話番号での絞り込み |

1ページ = 50件固定（`count: 50`）。

レスポンス例（個人情報はマスク済み）:

```json
{
  "totalCount": 2553,
  "page": 1,
  "count": 50,
  "totalPages": 52,
  "data": [
    {
      "order_date": "2026-09-15T19:18:30",
      "order_type": "01",
      "order_status": "2",
      "car_dispatch_status": "7",
      "radio_no": "1989",
      "passenger_name": "***",
      "passenger_tel": "***",
      "departure_address": "東京都新宿区新宿３丁目１７－２",
      "order_no": "20260915M00099288846",
      "driver_name": "***",
      "actual_fare": 3700.0,
      "payment_method": "5",
      "company_name": "kmグループ",
      "company_code": "000006",
      "sub_company_name": "国際自動車株式会社 T2（板橋）",
      "company_id": "000006_000004",
      "sales_office_name": "板橋営業所",
      "sales_office_id": "000006_000004_000001",
      "has_order_memo": false,
      "settlement_type": "5"
    }
  ]
}
```

フィールド19種（一覧表示用の簡易セット。詳細はCSVの方が列が多い）:
`order_date, order_type, order_status, car_dispatch_status, radio_no, passenger_name,
passenger_tel, departure_address, order_no, driver_name, actual_fare, payment_method,
company_name, company_code, sub_company_name, company_id, sales_office_name,
sales_office_id, has_order_memo, settlement_type`

### GET /v2/order/orders/csv

上記と同じ検索条件でCSV一括ダウンロード（`order_statuses`, `order_date_from`, `order_date_to`, 
`radio_no`, `passenger_tel` 等、`orders`と同じクエリパラメータを受け付ける。`page`指定は無し＝全件）。
`Content-Type: text/csv`。既存のSR機能が読み込んでいる「注文リストCSV」と同一フォーマット、51列。

列の一覧（左から順）:

```
実行状況, 配車状況, メモ, お客様名, 会員種別, 電話番号, 注文番号, 依頼元種別, 料金種別,
事前確定ルート, 注文種別, 定額種別, 注文日時, 注文時の迎車地, 迎車地の付け場所, 注文時の目的地,
注文メモ1, 注文メモ2, 代車要請, 了解日時, 到着予定日時, 現着日時, 現着地点, 実車日時, 実車地点,
降車日時, 降車地点, 乗車時間（分）, 無線番号, ナンバープレート, 車種, 車色, ドライバー名,
ドライバーID, グループ名, グループコード, 会社名, 会社コード, 営業所名, 営業所コード, ドア番号,
個人タクシー名, 現着メッセージ送信日時, 注文時の支払方法, 収受金額, 実際の支払方法, 事前確定運賃,
高速代金, キャンセル日時, キャンセル理由, キャンセル料発生
```

## コード値の対応（CSVと`orders`のJSONを注文番号で突合して確認できた範囲）

HARに含まれていた実データの範囲でしか確認できていないため、**未確認の値は不明**として扱うこと。

### `order_type`（注文種別）

| 値 | 意味 |
|---|---|
| `01` | 即時配車 |
| `02` | 日時指定 |

### `order_status`（実行状況）

| 値 | 意味 | 確認状況 |
|---|---|---|
| `2` | 完了 | CSVと突合し確認済み |
| `1`, `3`, `5` | 不明（一覧APIでは観測できたがCSV側に対応データなし。進行中/キャンセル系の可能性） | 未確認 |

### `car_dispatch_status`（配車状況）

| 値 | 意味 | 確認状況 |
|---|---|---|
| `7` | 支払完了 | CSVと突合し確認済み |
| `2`,`3`,`4`,`5`,`9`,`11` | 不明（配車中/迎車中/キャンセル等の途中状態の可能性） | 未確認 |

### `payment_method`（注文時の支払方法）

| 値 | 意味 |
|---|---|
| `0` | 車内支払 |
| `1` | アプリ支払（クレカ） |
| `3` | アプリ支払（Apple Pay） |
| `5` | 後席決済（PayPay/R Pay/auPay/d払い等 ─ 詳細は`settlement_type`で細分） |
| `7` | アプリ支払（S.RIDE Biz） |
| `10` | アプリ支払（PayPay） |
| `15` | アプリ支払（Uber） |
| `6`, `14` | 不明 |

### `settlement_type`（実際の支払方法）

| 値 | 意味 |
|---|---|
| `-1` | アプリ決済 or 車内支払（`payment_method`側で決済手段が確定しているケース） |
| `3` | 後席決済(R Pay) |
| `5` | 後席決済(PayPay) |
| `7` | 後席決済(d払い) |
| `9` | 後席決済(auPay) |
| `0` | 不明 |

## 未調査・未確認の点

- 注文詳細ページ（`/manager/orders/detail/?orderNo=...`）を開いたときのAPI呼び出しはHARに含まれていなかった（Next.jsのRSCペイロードにはクエリパラメータのみで、詳細データ取得のfetchは記録されず）。詳細データ用の専用APIがあるかは未確認。
- `settlements`（決済）・`masters`（マスタ）・`internal`ページのAPIは、HAR中ではページ遷移（HEADリクエストのprefetch）のみで実データ取得の記録なし。
- ページング以外の並び替え・絞り込みオプション（`order_statuses`の有効値など）は未確認。
