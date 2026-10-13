# 07. マスタ API の接続状況(2026-10-13 追記)

## 接続済み(実 API で一覧が出る)
グレード(grade_types)、色(colors)、メーカー(makers)、車種(car_types)、営業所(offices)、会員優先度(customer_ranks)、商品種別(product_types)、商品情報(products)、待機場所(taxi_stand_infos)、システム種別(system_types type=1/2/3)

## 候補 API を自動で試すもの(`ui/live.js` の `LIVE.masters`)
ユーザー(users/search)、顧客(customers/search)、車両(vehicles/search)、乗務員(drivers/search)は API 名は確定しているが、
`searchKind`(一覧検索種別)などの必須パラメータの値が未確認。新UIは `searchKind=1,2,3` を順に試し、サーバーのメッセージを画面の「API の呼び出し記録」に出す。

残り 30 種(形状、燃料、ロール、企業、スキル、タクシー料金、配車ルール、エリア、配車先、祝日 など)は旧画面の JS を読めていないため、
**資源名を推測した候補**(例: `holidays/search`, `areas/search`, `company_groups/search`)を順に呼び、成功したものを表示する。
失敗時はサーバーの日本語メッセージ(「○○に値が入力されていません」等)をそのまま記録に出すので、必須項目をその場で特定できる。

## なぜ未確認か
Windows 側のセッションでは、マスタ画面(HSHS0187 等)を開くと「認証に失敗しました」になった(途中でセッション切れ。再ログインは Windows 側 Claude では安全ポリシー上できなかった)。
一斉送信・SOS・予約本数表も同じ表示だったため、**テストアカウント(roleId=5、営業所ユーザー)にはマスタ画面の権限がない可能性**もある。

## Mac 側でやること
1. 権限のあるアカウント(管理者ロール)でログインし、マスタ管理(HSHS0900)から各マスタ画面を開く
2. DevTools → Network で `api/v1/.../search` のリクエストを見て、資源名と必須パラメータ(`searchKind` の値を含む)を控える
   - または各画面の JS(`/kmx/js/HSHSxxxx.js`)で `ajaxGet(... '/kmx/api/v1/` を検索
3. `ui/live.js` の `KNOWN` / `GUESS` 表を確定値に置き換える。応答の配列キーと表示名のキーは `norm()` のヒューリスティックで拾えるが、必要なら列名を明示する
4. 編集・登録(create/update/delete)は書き込み解禁後(04 のフェーズ 3)に

## 確認用メモ
- `vehicles/search` と `drivers/search` は `searchKind` が必須(値 1 以外の意味は未確認)
- `particular_customers/get` は ID 指定の取得のみ確認。一覧 API は未確認
- `tickets/get_init_display_data` の応答に `offices / approachPoints(付け場所) / dispatchDestinations(配車先) / spAppAirlines(航空会社) / systemTypes` が含まれる。付け場所・配車先・航空会社の一覧は、専用 API が見つからなければここから取れる(ただし鍵情報を含む応答なので、必要なキーだけ取り出すこと)
