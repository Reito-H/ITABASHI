# nojico（ドラレコ運行管理SaaS）API調査メモ

`app.no-jico.com.har`（2026-09-15採取、ユーザー: tat-honda@km-group.jp、kmタクシー 板橋営業所）を解析した結果。

nojicoは社用車に搭載したドライブレコーダーの運行データ（急加速・急減速・衝撃・急旋回・居眠り・ヒヤリハット等のイベント検知、走行日報、安全運転スコア、ライブ映像・スナップショット）を管理する外部SaaS（kmグループ/kmタクシーが契約）。板橋タクシーの既存機能とは無関係の完全に別サービス。

## ⚠️ 注意事項

- **非公式・無許可のAPI**。nojico側が外部連携用として公開しているものではなく、管理画面(Next.js SPA)が内部的に呼んでいるエンドポイントを観測しただけ。
- レスポンスには**ドライバー氏名・メールアドレス・走行位置・安全運転スコア**等の個人情報が含まれる。取り扱い注意（社内限定・保存する場合はパスワード保護必須）。
- HARファイル自体にログインID・パスワードが平文で記録されていた。**このHARファイルは取り扱いに注意し、不要になったら削除を推奨**。
- 認証は **AWS Cognito**（User Pool: `ap-northeast-1_zoc7M2eAx` / Client ID: `e57ntd91gjhrab3r9i3dsnaaa`）発行のJWT。長期利用向けAPIキー等は無い。

## 全体構成

| ホスト | 役割 |
|---|---|
| `app.no-jico.com` | 管理画面本体（Next.js） |
| `api.no-jico.com` | バックエンドAPI（AWS API Gateway + Cognito Authorizer） |
| `cdn.no-jico.com` | イベント画像・スナップショット画像配信 |

## 認証（Cognito直接ログイン）

S.RIDEと異なりOAuth2リダイレクトではなく、**単発のPOSTでトークンが返る**シンプルな方式。

```
POST https://api.no-jico.com/auth/sign_in
Content-Type: application/json
Origin: https://app.no-jico.com

{"email":"<メールアドレス>","password":"<パスワード>"}
```

レスポンス（200 OK）:

```json
{
  "type": "SUCCESS",
  "token_info": {
    "access_token": "eyJ...",
    "id_token": "eyJ...",
    "refresh_token": "eyJ...",
    "expires_in": 10800,
    "username": "tat-honda@km-group.jp"
  }
}
```

- `expires_in` は秒（10800秒 = 3時間）。
- 以降のAPI呼び出しは `Authorization: <id_token>`（Bearerプレフィックス無し、id_tokenをそのまま）ヘッダーを付与するだけでよい。
- **CORSが `Access-Control-Allow-Origin: *` かつ Cookie不使用**なので、ブラウザ（ローカルのHTMLファイルを直接開いた場合含む）から直接fetchできる。

## エンドポイント一覧（`api.no-jico.com`）

いずれも `Authorization: <id_token>` ヘッダー必須。クエリパラメータは全てGETのクエリ文字列。

### アカウント・マスタ系

| メソッド/パス | クエリ例 | 説明 |
|---|---|---|
| `GET /account` | - | ログイン中アカウント情報（氏名・role・所属・会社設定・通知設定・画面レイアウト等） |
| `GET /offices` | `page`,`limit` | 営業所一覧（板橋は `id:5, code:"itabashi"`） |
| `GET /departments` | `branch_office_id` or `page,limit,ignore_scope=true` | 課一覧（1課〜4課） |
| `GET /admins` | `page,sort,limit,branch_office_id` | 管理者アカウント一覧 |
| `GET /drivers` | `page,sort,limit,branch_office_id,employee_number,only_deleted` | ドライバー一覧 |
| `GET /drivers/{id}` | - | ドライバー詳細 |
| `GET /vehicles` | `page,sort,limit,branch_office_id` | 車両一覧（device_id＝ドラレコ機器ID） |
| `GET /evaluation-criteria` | `page,sort,limit` | 評価基準一覧（減点方式の設定） |
| `GET /evaluation_item_masters` | `categories`,`only_used_in_evaluation_criteria` | 評価項目マスタ（衝撃/急加速/急減速/急旋回/居眠り等） |
| `GET /event_masters` | `categories` | イベント種別マスタ（`code`: E3=急旋回, E4=急加速, E5=急減速, E6=衝撃, E10=ヒヤリハット, Fatigue=居眠り） |
| `GET /announcements` | - | お知らせ（バージョンアップ履歴等） |

### 日報・イベント系

| メソッド/パス | クエリ例 | 説明 |
|---|---|---|
| `GET /reports` | `page,sort,limit,branch_office_id` | 走行日報一覧 |
| `GET /drivers/{id}/reports` | `page,sort,limit,has_comment` | ドライバー別日報 |
| `GET /events` | `page,sort,limit,event_master_id,occurred_at,branch_office_id` | 検知イベント一覧（危険運転等。位置情報・画像URL含む） |
| `GET /drivers/{id}/events` | `page,sort,limit,event_master_id,event_date` | ドライバー別イベント |

### 分析・ランキング系

| メソッド/パス | クエリ例 | 説明 |
|---|---|---|
| `GET /analytics/distance_chart` | `evaluation_item_master_id,period(week/…),branch_office_id` | 走行距離別スコア分布 |
| `GET /analytics/duration_chart` | 同上 | 運転時間別スコア分布 |
| `GET /analytics/dow_chart` | 同上 | 曜日別スコア |
| `GET /analytics/hourly_chart` | 同上 | 時間帯別スコア |
| `GET /analytics/range_chart` | 同上 | スコア分布（レンジ） |
| `GET /drivers/{id}/analytics/distance_chart` | `evaluation_item_master_id,period` | ドライバー個人版（`driver_score`と`office_avg`を比較） |
| `GET /drivers/{id}/analytics/duration_chart` | 同上 | 同上 |
| `GET /drivers/{id}/analytics/event_ratio` | `period` | ドライバー個人のイベント種別割合 |
| `GET /drivers/{id}/analytics/score_trend` | `evaluation_item_master_id,period` | ドライバー個人のスコア推移 |
| `GET /rankings/driver` | `page,sort,limit,evaluation_item_master_id,request_date,only_5percent,period(day/…),branch_office_id` | ドライバーランキング（スコア・イベント別内訳含む） |
| `GET /rankings/office` | 同上（`sort=avg_score:asc`） | 営業所別ランキング |
| `GET /rankings/department` | 同上 | 課別ランキング |

### ダッシュボード系（トップ画面）

| メソッド/パス | クエリ例 | 説明 |
|---|---|---|
| `GET /dashboards/active_vehicles` | - | 稼働車両数（`active_vehicle_count / total_vehicle_count`） |
| `GET /dashboards/event_ratio` | - | 直近24時間のイベント種別比率 |
| `GET /dashboards/events` | `event_code`（例`Fatigue`） | 種別指定でイベント発生リスト |
| `GET /dashboards/notices` | - | 車両エラー通知（SD故障・カメラ故障の発生/復旧） |
| `GET /dashboards/ranking` | - | 当日のドライバースコアランキングTOP |
| `GET /dashboards/reports/today` | - | 本日の日報一覧 |

### ライブ・スナップショット系

| メソッド/パス | クエリ例 | 説明 |
|---|---|---|
| `GET /lives` | `include_events` | ライブ配信対象車両一覧（ドライバー・車両情報付き） |
| `GET /lives/reports` | `target_date,include_events` | 指定日の運行状況一覧 |
| `GET /lives/devices/{device_id}/details` | `latitude,longitude` | 機器詳細（現在地との距離計算用と思われる） |
| `GET /lives/{device_id}/record_time_tables` | `request_date` | 録画時間帯一覧 |
| `GET /lives/{device_id}/record_time_tables/describe` | `token`（AWS Step Functions実行ARNをBase64化したもの） | 非同期処理（録画データ取得）のポーリング結果取得 |
| `POST /lives/{device_id}/snapshots` | body無し | 対象機器にスナップショット撮影を指示（AWS Step Functionsのワークフローが起動し、`token`が返る） |
| `GET /lives/{device_id}/snapshots/describe` | `token` | スナップショット撮影結果のポーリング（完了すると`cdn.no-jico.com/image/snapshot/*.jpg`のURLが返る） |

**スナップショット取得の流れ**: `POST /lives/{device_id}/snapshots` → レスポンスの`token`を使って `GET .../snapshots/describe?token=...` を**数秒おきにポーリング**（HARでは同一tokenへのGETが5回連続していた）→ 完了すると画像URLが入る。

## コード値の対応

### `event_master.code` / イベント種別

| code | id | 意味 |
|---|---|---|
| `E3` | 4 | 急旋回 |
| `E4` | 2 | 急加速 |
| `E5` | 3 | 急減速 |
| `E6` | 1 | 衝撃 |
| `E10` | 19 | ヒヤリハット |
| `Fatigue` | 7 | 居眠り |

### `account.role`

観測範囲では `20` のみ（本田氏＝管理者）。他の値は未確認。

## 未調査・未確認の点

- POST/PUT/DELETE系（ドライバー・車両・評価基準の新規登録/編集/削除）はHARに含まれず未確認。
- `refresh_token` を使ったトークン更新エンドポイントは未確認（HAR採取中に期限切れが発生しなかったため）。
- `account.layout` （画面レイアウト設定JSON）の詳細構造は未調査。
- ページングは `page` + `limit`、ソートは `sort=<field>:<asc|desc>` 形式（`updated_at:desc` 等）。全エンドポイント共通か未確認。

## 検証用サイト

`scripts/nojico_api/index.html` をブラウザで直接開くと、ログイン→上記エンドポイントの実行をGUIで試せる（CORSが `*` なのでローカルファイルからでも動作する）。パスワード等はブラウザのメモリ上にのみ保持し、どこにも送信・保存しない。
