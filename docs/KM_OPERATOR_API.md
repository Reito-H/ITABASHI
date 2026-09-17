# km-operator（国際自動車グループ 配車オペレーター画面）HAR解析メモ

`~/Downloads/スマタク/km-operator.smartaxicenter.com*.har`（4ファイル、2026-09-16採取）＋ `~/Downloads/km-operator.smartaxicenter.com5/6.har`（同日、ログイン込みで追加採取）を解析した結果。

**目的は途中で変わっている**: 当初は「セキュリティ的にどうか」という調査だったが、現在は「このAPIを使って弁天クラブ/ホシコン側に、より高速・モダンな検索UI（特に乗車・降車地点のピンデータ収集）を組み込む」実装調査が目的。

## 1. これは何のシステム？（超ざっくり説明）

一言でいうと、**タクシー会社のオペレーター（配車係）が使う「配車オペレーションセンターの画面」** です。板橋タクシーの管理画面が「社員の勤怠・シフト・報告」を扱うのに対し、こちらは「今どこにタクシーが何台待機していて、どのお客様からどんな配車依頼（伝票・チケットと呼ばれる）が来ていて、誰に割り当てるか」をリアルタイムに管理する専用システムです。

- 運営会社: **国際自動車（km）グループ**（板橋営業所を含む首都圏大手タクシー会社）
- ドメイン: `km-operator.smartaxicenter.com` → 製品名はおそらく「スマートタクシーセンター」
- 見た目: 古典的なサーバーサイドHTML＋jQuery＋一部Vue.jsという、比較的レガシーな作り（今どきのSPAではない）
- 画面例（HARに含まれていたもの）:
  - 「営業情報」（`HSHS0062`）— 地図上にタクシー乗り場・待機台数・配車状況を表示
  - 「走行軌跡」（`HSHS0109`）— 車両のGPS走行履歴を地図表示
  - 「伝票」（`HSHS1000`）— 配車依頼（チケット）の一覧・検索・処理
  - 「ログイン画面」（`HSHS0199`）

イメージとしては「Uber Eatsの配達員管理画面」のタクシー版、と考えると分かりやすいです。お客様→電話やアプリで配車依頼→オペレーターがこの画面で空車を探して割り当てる、という業務を支えています。

## 2. システム構成

| ホスト | 役割 |
|---|---|
| `km-operator.smartaxicenter.com` | 配車オペレーター画面本体（サーバーサイドレンダリングのJava製Webアプリ） |
| `js.zmaps-api.com` / `web.zmaps-api.com` | ZENRIN（地図大手）の地図APIサービス（住所検索・地図描画） |
| `cgi.e-map.ne.jp`（設定値として参照） | ZENRINの経路探索CGI（ルート検索。今回のHARには実際の呼び出しは含まれず） |
| `km-msg.smartaxicenter.com` / `km-msg-trails.smartaxicenter.com` | 車載器との通信・走行軌跡データ用（設定値として存在。今回のHARには直接の通信は含まれず） |

技術的には「JavaのWebアプリケーションサーバー（Tomcat系）＋jQuery」という、いわゆる業務システムの伝統的な構成です。板橋タクシーのようなCloudflare Workers製のモダンな構成とは対照的です。

**km-operatorは日本国外IPからのアクセスを遮断している**（板橋タクシー本体の`requireJapan`ミドルウェアと同種の制限と推測。このリポジトリの開発サンドボックスから直接curlしたところ、一般のインターネット疎通は問題ないのに`km-operator.smartaxicenter.com`だけタイムアウトした）。

## 3. ログイン・認証の仕組み（解明済み）

想定より単純な作りだった。

```
1) GET  /kmx/HS/HSHS/HSHS0199.do
   → ログイン画面。この時点でサーバーが JSESSIONID / CFSESSIONID を発行する（Set-Cookie）。

2) POST /kmx/api/v1/auth/login
   Content-Type: application/json
   X-Requested-With: XMLHttpRequest
   Cookie: (1)で受け取ったJSESSIONID等を送る

   Body: {"loginName":"itabashi1","password":"1111"}

   Response 200:
   {"isSuccess":true,"pageId":"HSHS1000","windowName":"dispatch_screen", ...}
```

- ログイン成功時、**新しいSet-Cookieは発行されない**（(1)で発行済みの同じセッションIDが「認証済み」状態に切り替わるだけ）。つまりCookieジャーを1つ保持したまま「①ログイン画面GET→②ログインPOST→③以降のAPIをそのCookieで呼ぶ」という3ステップだけで自動ログインが組める。
- CSRFトークンや追加の署名は不要そうで、パスワードさえ分かればシンプルなHTTPクライアントで再現できる。
- Cloudflare Workers側から直接ログイン代行する場合、Workersの実行リージョンが日本国外だとブロックされる可能性がある点は要検証（Workersのリクエストは通常エッジ拠点から出るため、日本国内エッジ経由になるかは確認が必要）。

セッションCookie一覧（認証後に使われるもの）:

| Cookie名 | 役割（推定） | HttpOnly | Secure |
|---|---|---|---|
| `JSESSIONID` | Javaアプリの標準セッションID（実質的なログイン状態そのもの） | ❌ **なし** | ❌ **なし** |
| `CFSESSIONID` | 独自セッション（用途不明） | ✅ あり | ✅ あり |
| `X-CLTFT-Token` | 独自トークン（ページ遷移ごとに値が変わる。CSRF対策的なものと推測） | ❌ なし | ❌ なし |
| `AWSALB` / `AWSALBCORS` | AWSロードバランサーの振り分け用（セキュリティ上の意味はほぼ無い） | ❌ なし | 片方のみあり |

APIリクエストには `X-Requested-With: XMLHttpRequest` ヘッダーが付くのみで、CSRFトークンをリクエストボディやヘッダーに個別に載せている様子は確認できなかった。

### ⚠️ 重要な補足（2026-09-16、自前クライアント実装で判明）: `X-CLTFT-Token`はヘッダーとCookieの両方に必要

`scripts/km_pins_collector/collect.py`（Python製の自前HTTPクライアント）で実装した際、**`X-CLTFT-Token`をリクエストヘッダーだけに付けると、アプリ本体ではなくAWS側の入口で`401 Unauthorized`（`WWW-Authenticate: Bearer realm=""`という素っ気ないエラー）になる**ことが判明した。

実際のブラウザは、ログイン後の各API応答に含まれる`X-CLTFT-Token`レスポンスヘッダーの値を、**次のリクエストで(1)`X-CLTFT-Token`リクエストヘッダーとして送ると同時に、(2)`Cookie: X-CLTFT-Token=<同じ値>`としても送っている**（`cf-base.js`の`TokenManager`が`document.cookie`にも書き込んでいるため）。ヘッダーだけ・Cookieだけでは通らず、**両方に同じ値を載せる必要がある**。

自前クライアントを実装する場合の正しい手順:
1. ログイン画面GET → JSESSIONID等のCookie発行
2. `POST /api/v1/auth/login` → 成功すると応答ヘッダーに`X-CLTFT-Token: Token.Default=<uuid>`が付く
3. 実画面を1回GET（例: `HSHS9999.do?pageId=HSHS0062`）→ 深掘り不要だが念のため踏んでおくと安全
4. 以降の全APIコールで、直前の応答から得た`X-CLTFT-Token`の値を、**リクエストヘッダーとCookieの両方**に同じ値でセットする。各応答は新しい`X-CLTFT-Token`を返すので、毎回更新して次のリクエストに使う（回転式トークン）。

### 検証用アカウント（⚠️ユーザー確認の上で記録・テスト領域中心）

- ログインID: `itabashi1`
- パスワード: `1111`
- 本運用開始時にパスワードは変更予定とのこと。**本番用パスワードに切り替わったら、この値は古い記録として無効になる**ので、実装時は現在の値を別途確認すること。
- 実装で実際に使う際は、板橋タクシー本体の他の秘密情報と同様に`wrangler secret put`で保存し、コード・ドキュメントには平文で残さない運用とする（このファイルへの記載はユーザーの明示的な許可により例外的に残している）。

## 4. 主なAPIエンドポイント（`/kmx/api/v1/`配下）

すべてセッションCookieがあれば呼び出せる社内向けAPI（外部公開されたAPIドキュメントは無し＝非公式扱いの調査結果）。

### 4-1. 実際に呼び出しを観測できたもの

| パス | メソッド | 説明 |
|---|---|---|
| `auth/login` | POST | ログイン |
| `SessionEnsure` | GET | セッション生存確認（数十秒おきに自動ポーリング） |
| `tickets/get_init_display_data` | GET | 画面初期表示用の大きな設定データ一式（要注意、5章参照） |
| `map_searches/get_taxi_stand` | GET | タクシー乗り場ごとの待機台数・位置情報 |
| `map_searches/get_map_search_info` | GET | 地図検索の初期設定 |
| `map_searches/get_vehicle_point` | GET | **車両のリアルタイム位置**（`wirelessLineNumber`指定。要注意、7-4章参照） |
| `map_vehicles/get_vehicle_info` | GET | **車両・乗務員の詳細情報**（`vehicleId`指定。氏名・携帯番号含む。要注意） |
| `ticket_notices/get_waiting_ticket_count` 等9種 | GET | 「配車待ち件数」等の通知バッジ更新用 |
| `sos_accepts/check` | GET | 緊急通報（SOS）の受信有無チェック |
| `car_types/search` `colors/search` `makers/search` `grade_types/search` `customer_ranks/search` `offices/search` `products/search` `product_types/search` `system_types/search` `running_paths/search` | GET | 画面のプルダウン用マスタデータ取得 |

### 4-2. 伝票・ピンデータ関連（2026-09-16 実際のレスポンスで確認済み）

| パス | メソッド | 用途 |
|---|---|---|
| `ticket_searches/search` | **GET**（POSTではなくクエリ文字列） | 伝票検索。日時範囲・種別・ステータス等50項目近い検索条件をクエリパラメータで渡す。結果一覧には`departureAddress`/`destinationAddress`（住所テキストのみ、**緯度経度は含まれない**）、顧客名(かな)・電話番号・オペレーター名等を返す |
| `tickets/get` | GET | 伝票1件の詳細取得（`ticketNumber`指定）。**`dispatchTicket`オブジェクト内に`departureLatitude`/`departureLongitude`/`destinationLatitude`/`destinationLongitude`が実際に入っている＝ピンデータの実体はここ** |
| `tickets/get_usage_history` | GET | 指定顧客(`customerId`)の**過去の乗車履歴を配列で返す**。1件ごとに乗車日時・乗車地点・降車地点の緯度経度・使用車両・乗務員名まで含む。**1回の顧客紐付けで複数件の乗降ピンがまとめて取れるため、ピンデータの一括収集に最も効率的** |
| `tickets/search_customer` | GET | 顧客検索（`originalId`等で1名を特定）。氏名・電話番号・メールアドレス・生年月日・性別・「よく使う地点」(`favoritePoints`、緯度経度付き)・家族関係メモ等、**非常に機微な個人情報を含む** |
| `tickets/search_dispatch_info` | GET | 配車状況の真偽フラグのみ（`hasNotCanceled`/`dispatchCompleted`） |
| `map_vehicles/get_map_vehicle` | GET | 伝票に紐づく車両の地図表示用情報（`ticketNumber`指定。テスト操作時は空応答） |
| `tickets/fixed_charge_product_search` | GET | 定額商品検索（緯度経度or配車先idのいずれか必須、というバリデーションメッセージのみ確認） |
| `tickets/create_ticket` / `tickets/update` | POST（未観測、JS参照のみ） | 伝票の新規作成・更新（＝実配車操作。今回のUIでは使わない想定） |
| `find_and_dispatchs/confirm` / `map_vehicles/dispatch_request` | POST（未観測、JS参照のみ） | 配車確定・配車依頼送信 |

**⚠️重要: `ticket_searches/search`の一覧結果には緯度経度が含まれない。** ピンデータを集めるには「①`ticket_searches/search`で該当期間の`ticketNumber`一覧を取得→②各`ticketNumber`ごとに`tickets/get`（または該当顧客の`customerId`で`tickets/get_usage_history`）を呼んで緯度経度を取得」という2段階の実装が必要。

## 5. 「ピンデータ（乗車・降車地点）」のフィールド名

client側JS（`ticket.js` / `ticket-common.js` / `dispatch-ticket.js` / `ticket-detail-panel.js`）の解析から、伝票データ内に以下のフィールドが存在することを確認。

| フィールド名 | 意味（推定） |
|---|---|
| `departureLatitude` / `departureLongitude` | 出発地点＝乗車地点の緯度経度 |
| `destinationLatitude` / `destinationLongitude` | 目的地＝降車地点の緯度経度 |
| `bywayLatitude` / `bywayLongitude` | 経由地点の緯度経度 |
| `stopLatitude` / `stopLongitude` | （`ticket.js`のみに存在。経由の停車地点と推測） |

## 6. 発見した設定値・認証情報（外部サービス連携用、⚠️テスト値としてユーザー確認済み）

`tickets/get_init_display_data` のレスポンス（会社設定データ）に、以下の外部連携用の認証情報が**そのままJSONで**含まれていた。ブラウザ（JavaScript）から丸見えの状態。

```json
{
  "zenrinKey": "ZHhKiHEb5v5uIldMV5Jar2iBGcc6NLmj7A9wc9Or",
  "zntCid": "01117409201001",
  "zntUid": "1kcin71f",
  "zntPassword": "rhsk5c3v",
  "zdcCgiKy": "70nQhP9jlgYvBinA8vBUnAlf9JmgBPBwjguzDVnggvBsnQpyuCngojB1nQGr8tmgorFcng3P78oQivC3lx189llgjL5JmxH89RnR485qmh08CAnAKn0vngTnFWngsv4NoQ3v4YmhG8ArmxlzT5",
  "wirelessLineCgiUser": "no_use",
  "wirelessLineCgiPassword": "no_use",
  "apkId": "no_use",
  "apkPassword": "no_use"
}
```

- `zenrinKey`（ZENRIN地図APIキー）は`Authorization: "referer"`運用（アクセス元URLで制限する方式）になっているため、クライアント側に露出する設計自体はZENRIN公式の想定通りと考えられる。
- `zntUid`/`zntPassword`（`1kcin71f`/`rhsk5c3v`）と`zdcCgiKy`は、ZENRINの経路探索CGIサービスへのログイン認証情報そのものに見える。本来サーバー側だけで保持すべき値がクライアントJSONに含まれていた。
- `wirelessLineCgiUser/Password`・`apkId/Password`は値が`"no_use"`で、この会社では該当機能未使用のため実害なし。

## 7. 車両位置API（⚠️実データ・個人情報を含む点に注意）

`map_searches/get_vehicle_point` と `map_vehicles/get_vehicle_info` は、テスト値ではなく**実際に稼働中の乗務員の情報**を返していた。

```json
// get_vehicle_point?wirelessLineNumber=5353
{"vehicleId":"2929","latitude":"35.65722","longitude":"139.69597","status":"3","bearing":"209","firstName":"太路","lastName":"土井"}

// get_vehicle_info?vehicleId=2929
{"officeName":"国際自動車（城北）板橋営業所","status":"回送","driverName":"土井 太路","mobileNumber":"08054767567","carInfo":"水素クラウン　黒","shift":"隔勤","openedAt":"2026/09/16 09:35:00","expectedClosedAt":"2026/09/17 06:05:00"}
```

**乗務員個人の氏名・携帯電話番号がAPIレスポンスにそのまま含まれる。** 新UIを作る際は以下のどちらかの対応が必要:
- (a) この種のデータはログを含め弁天クラブ側に保存しない
- (b) 保存する場合は用途を「現在地表示」等の必要最小限に絞り、閲覧権限を管理者相当に限定する

**ピンデータ（乗車・降車地点）の大量収集を目的とするなら、個人を特定できる氏名・電話番号は集計時に除外し、地点の緯度経度＋日時＋（必要なら匿名化した伝票ID）だけを保存する設計を推奨。**

## 8. セキュリティ所見まとめ（重要度順・参考情報として）

1. **【中〜高】外部サービス認証情報のクライアント露出**（6章）— ZENRINルート検索の`zntUid`/`zntPassword`/`zdcCgiKy`が、サーバー内部で完結すべき認証情報にもかかわらずブラウザに丸ごと送信されている。
2. **【中】セッションCookie（`JSESSIONID`）に`HttpOnly`/`Secure`フラグが無い** — XSS脆弱性が1つでもあればセッション乗っ取りのリスク。
3. **【低〜中】CSRFトークンの実装が弱い可能性** — `X-CLTFT-Token`がCookieのみで管理されており、個別提示している形跡が無い。
4. **【中】乗務員個人情報のAPI露出**（7章）— 氏名・携帯電話番号がAPIレスポンスに平文で含まれる。
5. **【参考】ログインパスワードが極めて弱い**（`itabashi1`/`1111`、4桁数字のみ）— 本番運用前に強化が必要（ユーザーへ既に口頭で伝達済み）。

## 9. 顧客個人情報の露出（⚠️実データで確認・最重要の設計上の注意点）

`tickets/get`・`tickets/get_usage_history`・`tickets/search_customer`を実際の伝票番号で呼び出したところ、テスト値ではなく**実在の顧客の個人情報がそのまま返ってきた**（氏名・かな・電話番号・メールアドレス・生年月日・性別・自宅等の「よく使う地点」の緯度経度・家族関係を示すメモ・介護施設など機微な属性を推測させる住所、等）。実際の値はこのドキュメントには記録していない（実在人物の個人情報を平文でリポジトリに残さないため）。

**2026-09-16 ユーザー判断: 氏名等の個人情報は保存してよい。** 既存のSR分析（[[project_sr_sride_analysis]]）側で実際の顧客名を扱っているため、今回のピンデータ収集でも同じ方針で統一する。以下の懸念点は、今後アクセス権限まわりを検討する際の参考情報として残す:

- 氏名・電話番号・建物名（`departureBuildingName`等、介護施設・病院等の利用者属性を示唆しうる）を保存する場合、閲覧権限はSR分析等の既存の機微情報ページと同水準（限定された管理者権限）に揃えることを推奨。
- 9-2章の`trip_infos/search`の方は、そもそも流し営業分には氏名フィールドが存在しないため、配車由来のトリップのみ氏名が付随する点は実装時に留意。

## 9-2. `trip_infos/search`（営業情報画面）— 配車以外も含む全乗降データ（2026-09-16 実データで確認済み・本命）

「営業情報」画面（`HSHS0062`）が使っているAPI。**配車依頼（電話・アプリ経由）だけでなく、流し営業（街で手を挙げて乗るタイプ）も含めて、その車両がその日に走った全ての乗車・降車を返す。** 9章の`tickets/get`系より広いデータ源で、こちらが本命。

```
GET /kmx/api/v1/trip_infos/search?wirelessLineNumber=<車両の無線番号>&userName=&date=<YYYY/MM/DD HH:mm>
```

1回のリクエストで「その無線番号の車1台・その日の乗務（1シフト）」の全記録が返る。

```json
{
  "driverName": "土井 太路",
  "wirelessLineNumber": "5353",
  "shift": "隔勤",
  "tripCount": "7",
  "totalSales": "15600",
  "tripInfoList": [
    {
      "onServiceAt": "2026/09/16 09:59",
      "onServiceLatitude": "35.767067",
      "onServiceLongitude": "139.70032",
      "outServiceAt": "2026/09/16 10:14",
      "outServiceLatitude": "35.778576",
      "outServiceLongitude": "139.71962",
      "distance": "2690",
      "driveMin": "13",
      "fare": "2300",
      "ticketNumber": "44110888",
      "ticketStatus": "処理完了"
    }
  ]
}
```

**良いニュース: 流し営業の記録には顧客名が一切含まれない。** `ticketNumber`が無いトリップ（街で拾った乗客）は`onService*`/`outService*`/`fare`/`distance`/`driveMin`だけで、氏名系フィールド自体が存在しない。配車由来（`ticketNumber`あり）のトリップだけ`customerFullNameKana`/`passengerNameKana`が付くが、アプリ配車（S.RIDE等）のものはお客様個人名ではなく固定文言が入っていた（電話配車の場合は9章で見た通り実名かなが入る可能性があるので油断はできない）。

- **1回の呼び出し＝1台・1シフト分。** 車両台数分×日数分をループして呼ぶ必要がある（無線番号の一覧は別途`car_types/search`等のマスタや車両管理画面側で取得する必要あり、未調査）。
- 併せて`trip_infos/get_address`（緯度経度→住所の逆ジオコーディング）も呼ばれていたが、**住所文字列を保存しないならこの呼び出しは省略してAPI消費を減らせる**。
- `tripCount`/`totalSales`はその車両・そのシフトの合計（本数・売上合計）で、これも営業分析に使える副産物。

## 9-3. 車両（無線番号）一覧の取得元 — km-operatorではなく自社DBを使う（2026-09-16 決定）

`itabashi1`アカウントではkm-operator側の「車両管理→車両検索」画面が権限的に見られないことが判明。しかし、**弁天クラブ側（このリポジトリ）の`vehicles`テーブルに、既に無線番号(`radio_no`)と営業所(`office`/`office2`)の対応が入っている**（[[project_tantosha]]の車両検索連携で使用中のテーブル）。

```sql
SELECT radio_no FROM vehicles WHERE office LIKE '%板橋%'
```
→ 実行結果: **376件**（`vehicles`テーブル全体は4,909件＝kmグループ全社分のマスタ）。

このリストをそのまま`trip_infos/search`のループ対象に使える。km-operator側の車両検索にアクセスできなくても、自社DBだけで完結する。

**注意**: このテーブルはCSV取込で作られたマスタで、廃車済み・異動済みの車両が混ざっている可能性がある（tantosha memoに「紙と目視照合が必要」との既知の注意点あり）。収集バッチが「該当日にその無線番号の勤怠が無い」場合は`trip_infos/search`が`EHS006200L004`（対象の勤怠が見つかりませんでした）エラーを返すことを7章のHAR8実例で確認済みなので、単純にスキップすればよい。

### アカウントの営業所スコープ検証（2026-09-16、実機確認済み）

`itabashi1`アカウントで板橋以外の営業所の車両（台東営業所、無線番号`1304`）を「営業情報」画面から検索したところ、**「対象の車両が見つかりませんでした」というエラーになった。** これは「勤怠が見つかりません」（＝車は存在するがその日のシフトが無い）とは異なる、「そもそもその車の存在を認識していない」というエラーである。

→ **結論: `itabashi1`アカウントはサーバー側で板橋営業所の車両に限定されている。** 誤って他営業所の無線番号をバッチに紛れ込ませても、エラーになるだけでデータが漏れることはない（安全側に倒れている）。9-3章の自社DB由来376件のリストをそのまま使って問題ない。

## 10. 実装状況（2026-09-16 v2実装・本番デプロイ済み）

### v1（Cloudflare Workersから直接km-operatorへ接続する方式）→ 実機検証で失敗

- `src/db/migration_158.sql` — `km_trip_pins`（収集したピン1件＝1トリップ）・`km_pin_collection_runs`（収集実行ログ）
- `src/utils/km_operator.ts` — ログイン（`kmOperatorLogin`）・`trip_infos/search`呼び出し（`kmOperatorSearchTripInfos`、[[project_sr_sride_analysis]]のS.RIDE連携と同じ「手動Cookie jar」方式）
- `src/routes/admin_km_pins.ts` — 設定ページ`/settings/km-pins`＋API（`/api/km-pins/status`, `/pins`, `/collect_chunk`）。権限キー`settings.km-pins`
- デプロイ後に「収集開始」ボタンを実際に押して検証 → **「km-operatorへの接続がタイムアウトしました」で失敗確認**。3章で懸念していた「Cloudflare Workersからのアクセスがブロックされる」問題が実際に発生した（ユーザーの個人MacBookでも別途Cloudflare WARP有効時に同じくkm-operatorに接続できない事象が起きており、Cloudflareのネットワーク経由だと弾かれる可能性が高いと判断）。

### v2（社内PCが直接km-operatorへログインしてデータを取得し、ホシコンへ送り返す方式）→ 現行

Cloudflare側からkm-operatorへ直接アクセスするのをやめ、**常時稼働している社内PC（板橋営業所、4台のうち1台）がkm-operatorに直接ログインしてデータを取得し、結果だけをホシコンへPOSTする**方式に変更。この社内PCは既に「事故データCSVの自動アップロード」（`ACCIDENTS_UPLOAD_KEY`、`public_accidents_upload.ts`）で同じ形の連携実績があり、km-operatorへの通常アクセスも問題なく行えるネットワーク環境にある。

- `src/utils/km_pins.ts`（新規） — `getItabashiRadioNumbers`・`saveTripsStmts`を共通化（admin_km_pins.tsとpublic_km_pins_upload.tsの両方から使用）
- `src/routes/public_km_pins_upload.ts`（新規） — 社内PC専用の受け口。認証はヘッダー`X-Upload-Key`と`KM_PINS_UPLOAD_KEY`の照合のみ（`public_accidents_upload.ts`と同じ方式）。
  - `GET /api/public/km-pins/vehicles` — 収集対象（板橋営業所）の無線番号一覧を返す
  - `POST /api/public/km-pins/upload` — 収集結果（車両ごとのtripInfoList）を受け取り`km_trip_pins`に保存
- `scripts/km_pins_collector/collect.ps1`（新規） — 社内PCで動かすPowerShellスクリプト。①ホシコンから対象車両一覧を取得→②km-operatorに直接ログイン→③車両ごとに`trip_infos/search`を呼ぶ→④20台分ずつまとめてホシコンへアップロード、をタスクスケジューラで定期実行する想定。ログは`collect.log`に出力。
- `src/routes/admin_km_pins.ts`の`/settings/km-pins`画面文言を更新（「収集は社内PCが自動で行う」旨を明記。旧「収集開始」ボタンは動作しないことを明記した上で参考として残置）。
- 氏名等は保存する（9章のユーザー判断の通り）。

### デプロイ済み内容・残作業

1. ✅ `migration_158.sql` 適用済み（本番）
2. ✅ `KM_OPERATOR_LOGIN_ID` / `KM_OPERATOR_PASSWORD` 登録済み（`itabashi1`/`1111`。社内PC側スクリプトの設定にも同じ値を使う）
3. ✅ 本番デプロイ済み
4. ⬜ `wrangler secret put KM_PINS_UPLOAD_KEY` — 社内PC専用キーの登録（未実施）
5. ⬜ `scripts/km_pins_collector/collect.ps1` の`$UploadKey`/`$KmLoginId`/`$KmPassword`を埋めて、社内PC（4台のうち1台。事故CSV自動アップロードが動いているPCが望ましい）に配置
6. ⬜ Windowsタスクスケジューラに登録（例: 1時間おき）
7. ⬜ 実行後、`/settings/km-pins`画面で「社内PCからの最終受信」が更新されるか確認

## 11. 実装方式（当初案・上記v1で概ね反映済み）

1. **収集バッチ**: Cloudflare Workers（Cron Trigger）で定期実行。①`itabashi1`アカウントでログイン（3章の手順）→②車両（無線番号）一覧を取得→③各車両×対象日で`trip_infos/search`を呼ぶ→④返ってきた`tripInfoList`から`onService*`（乗車）・`outService*`（降車）・`fare`・`distance`・`driveMin`だけを抜き出してD1に保存（`customerFullNameKana`等の氏名系フィールドは保存しない。8章・9-2章参照）。
   - 配車依頼単位のピンだけで良い場合は9章の`ticket_searches/search`→`tickets/get`ルートでも良いが、**流しも含めた全件が欲しい今回の目的には`trip_infos/search`（9-2章）の方が適している**。
2. **検索・地図表示UI**: 板橋タクシー管理画面（`system/`）に新規ページを追加し、上記で蓄積した匿名化済みピンデータを地図上に表示・期間や地域でフィルタ検索できるようにする（過去に作った[[project_airport_flat_fare_map]]や[[project_sr_sride_analysis]]の実道路網ベース地図と同じ資産を流用できる見込み）。
3. **未確定事項**:
   - `ticket_searches/search`を`ticketNumber`指定なしで広い日時範囲だけで叩いた場合に何件返るか（`limit`/`pageNo`はクエリにあるのでページングは可能そうだが、実際の上限件数・レート制限は未検証）。
   - Cloudflare Workersの実行リージョンが日本国外と判定されて`requireJapan`的な制限にブロックされないか（3章参照、要検証）。
   - ログインセッションの有効期限（`SessionEnsure`は数十秒間隔でポーリングされていたので、長時間放置するとタイムアウトする可能性がある。バッチ実行のたびに毎回ログインし直す設計にすれば問題にならないはず）。

## 13. 営業戦略ページへの統合（2026-09-17）

収集したピンデータが実際に集まり始めたことを受けて、「営業戦略」という左サイドバー項目を新設し、SR（S.RIDE迎車分析）と乗降ピン分析を1つのページに統合した。

- **サイドバー**: `layout.ts`に「営業戦略」を追加（`/settings/sales-strategy`、権限キー`settings.sales-strategy`）
- **`admin_sales_strategy.ts`（新規）**: パスワードゲート（`SALES_STRATEGY_PASSWORD`、旧`SR_PASSWORD`を統合・廃止）→ 通過後、「需要分析（乗降ピン）」「SR分析（S.RIDE）」の2タブ。中身は`/settings/km-pins?embed=1`・`/settings/sr?embed=1`をiframe埋め込み（既存コードの作り直しを避けるため）
- **`admin_sr.ts`**: 独自パスワードゲート（`checkPassword`・`#sr-gate`等）を全廃止。`?embed=1`でサイドバー無しの単体ページを返せるように対応
- **`admin_km_pins.ts`**: `?embed=1`対応に加え、「需要分析」セクションを追加（後述）
- **`index.ts`**: `X-Frame-Options`のCSP例外リストに`/settings/sr`・`/settings/km-pins`の`embed=1`アクセスを追加（他ページは引き続き全面DENY）
- **`permissions.ts`**: `settings.sr`・`settings.km-pins`権限キーを廃止し`settings.sales-strategy`に統合

### 乗降ピンの需要分析機能（`admin_km_pins.ts`）

タクシー需要予測の一般的な手法（GPSデータ×グリッド分割×時間帯分析。Web検索で確認: トヨタ/JapanTaxi等のAI配車支援では500mメッシュ×30分単位で予測し空車率15〜25%改善の実績）を参考に、以下を実装:

- **頻出地点マップ**（`GET /api/km-pins/heatmap?kind=on|out`）: 緯度経度を小数点3桁（約100m四方）に丸めてGROUP BY集計し、円の大小・濃淡で頻度を表示。外部地図タイル（Leaflet等）は使わず、データの緯度経度レンジに自動フィットする単純な相対座標プロットで実装（CSPを緩める必要がなく実装コストも低いため。将来的に実地図が要るなら要再検討）
- **時間帯×曜日ヒートマップ**（`GET /api/km-pins/time-pattern`）: `on_service_at`が`"YYYY/MM/DD HH:mm"`形式でSQLiteのdate関数が使えないため、全件取得してJS側（`new Date(str.replace(/\\//g,'-'))`）で曜日・時刻を集計
- **サマリー統計**（`GET /api/km-pins/summary`）: 件数・平均料金・平均距離・配車/流し比率

## 14. 流し営業（配車を介さない乗車）の過去データ再現（2026-09-17）

ユーザーからの指摘で、「走行軌跡」画面のAPI（`running_paths/search`）を調べ直したところ、**過去の日付でも車両の生GPSログ（5秒おき、ステータス付き）が取得できる**ことが判明した。ticket_searches/search（9-2章・13章）が配車依頼分のみだったのに対し、こちらは流し営業も含めた全乗降を過去に遡って再現できる、より強力な情報源。

### 車両ステータスコード（`ctlib.js`の`VEHICLE_STATUS`定数より）
```
EMPTY=0(空車) SERVICE=1(実車) MEET_CUSTOMER=2(迎車) NOT_IN_SERVICE=3(回送)
PAID=4(支払) STACK=6 TERMINAL_NATHING=10 NO_DRIVER=20 BREAK_TIME=30
ON_DISPATCHING=90 UNKNOWN=99 DOUBLE_DISPATCHED=9999
```
`status`が「1以外→1」に変わった瞬間＝乗車、「1→1以外」に変わった瞬間＝降車、として抽出する。

### API仕様
```
GET /kmx/api/v1/running_paths/search?wirelessLineNumber=<無線番号>&dateFrom=<YYYY/MM/DD HH:mm>&dateTo=<YYYY/MM/DD HH:mm>&time=10
```
`dateFrom`/`dateTo`/`time`はいずれも必須（`time`は整数のみ・具体的な意味は未確認だが`10`で正常動作を確認）。応答の`runningPathList`は5秒間隔の生ログで、車両1台・1日で1万件超になることもある（実機確認: 14,855件/日）。

### 実装（`scripts/km_pins_collector/running_paths_collector.py`）
- 生ログはこのスクリプトの実行マシン上だけで処理し、**乗車・降車の変化点だけ**をホシコンへ送る（通信量対策）
- `running_paths_progress.json`に処理済み(車両, 日付)を記録し、再実行時は続きから処理（同じ範囲を取り直さない）
- `--max`で1回の実行件数に上限を設け、km-operator側への短時間集中アクセスを回避（過去に大量アクセスで一時ブロックされた実績があるため）
- launchd（`com.benten.runningpathscollector`、30分おき・1回40件）で自動的に少しずつ過去分を埋めていく
- `trip_id`は`path-<無線番号>-<乗車日時>`形式。配車由来のデータ（`ticket-*`・trip_infos由来の生の数字ID）と同じ`km_trip_pins`テーブルに入るため、配車分と流し分が二重にカウントされる可能性がある点は既知の制限（乗車・降車の「場所の傾向」を見る用途では実害小さいと判断し許容）

## 15. 地図表示の改善（Leaflet + OpenStreetMap、2026-09-17）

当初の「相対座標に点をプロットするだけ」の簡易地図から、実際の地図（道路・地名が見える）に変更した。

- `admin_km_pins.ts`: Leaflet（`cdn.jsdelivr.net`から読込）＋OpenStreetMapタイルで実地図上に頻出地点をプロット（円の大小・濃淡が頻度）
- `index.ts`: `/settings/km-pins`ページのみCSPの`style-src`に`cdn.jsdelivr.net`、`img-src`に`*.tile.openstreetmap.org`を追加（他ページのCSPは変更なし）
- サーバー側は引き続き約100m四方に集計した最大300点だけを返す設計（9-2章で決めた通信量対策を踏襲）。生の位置ログをブラウザに送ることはない

## 16. ZENRIN認証情報の転用について（判断・不使用）

km-operator側の`zntUid`/`zntPassword`/`zdcCgiKy`（6章）を、ホシコン側のルート検索機能に転用できないか質問があったが、**使わない方針とした**。理由: これは国際自動車グループがZENRINと契約して発行された、km-operator専用の認証情報であり、別会社・別システムであるホシコンで転用するのは利用規約違反・契約トラブルのリスクがあるため。将来「流し方最適化ルート」機能を作る場合は、別途正規のルーティングサービス（OSRM等）を検討する。

## 12. 注意事項

- **このAPIは非公式**。km-operator側が外部連携用として公開しているものではなく、画面が内部的に呼んでいるエンドポイントを観測しただけの調査結果。ベンダー（スマートタクシーセンター運営元）の利用規約を確認しないまま本番の自動収集バッチ化はしない。
- HARファイル自体に上記の認証情報・ログインパスワードが平文で残っている。**このHARファイル（`~/Downloads/スマタク/*.har`, `~/Downloads/km-operator.smartaxicenter.com5/6.har`）の管理には注意し、不要になったら削除推奨**。
- 1回目のキャプチャ4ファイルのうち2ファイル、2回目のキャプチャ2ファイルのうち1ファイルは、キャプチャ中断により末尾のJSONが壊れていたため、末尾の不完全なエントリを切り捨てて復元した上で解析（データの欠落は各ファイル末尾の1エントリ分のみ、他の内容には影響なし）。
