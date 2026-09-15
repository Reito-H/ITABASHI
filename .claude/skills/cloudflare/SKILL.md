---
name: cloudflare
description: Cloudflare Workers/D1/R2に対する操作（本番デプロイ・D1マイグレーション適用・secret登録・ログ確認・REST API呼び出しなど）を行うためのスキル。このリポジトリでCloudflareに何らかの操作をするときは必ずこのスキルの手順に従う。
---

# Cloudflare操作スキル

本リポジトリの本番環境は Cloudflare Workers（Hono）+ D1 + R2 で構築されている（詳細は `CLAUDE.md` 参照）。
Cloudflareに対する操作（デプロイ、D1マイグレーション適用、secret登録、ログ確認、Workers/D1/R2のAPI照会など）は
**すべてこのスキルの認証情報・ラッパースクリプト経由で行うこと**。`npx wrangler login` によるブラウザ認証フローや、
トークンをコマンドライン引数・ソースコード・コミットに直接書く方法は使わない。

## 認証情報

- 保存場所: リポジトリ直下の `.env`（`.gitignore` 登録済み・gitには含まれない）
- 内容: `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN`（フルアクセス権限のAPIトークン）
- **`.env` の中身をチャット出力・他ファイルへの転記・外部サービスへの送信をしない。**
- このトークンはCloudflareダッシュボードで再表示できない一度きりの値。`.env` を上書き・削除しないこと。
  万一失われた場合はユーザーにCloudflareダッシュボードでの再発行を依頼する（Claudeが再発行することはできない）。
- **`cfat_` プレフィックス付き = account-owned token**（ユーザー個人ではなくアカウントに直接紐づくサービス用トークン。
  https://developers.cloudflare.com/fundamentals/api/get-started/account-owned-tokens/ 参照）。
  ユーザー所有トークン用の `/user/tokens/verify` は使えず、有効性確認は必ず
  `GET /accounts/{account_id}/tokens/verify`（アカウントスコープの検証エンドポイント）を使うこと。

## 使い方

### 1. wranglerコマンド（deploy / dev / d1 execute / secret put / tail など）

`.claude/skills/cloudflare/cf-wrangler.sh` に、通常 `wrangler` に渡すのと同じ引数をそのまま渡す。
内部で `.env` を読み込んでから `system/` ディレクトリに移動して `npx wrangler` を実行する
（`CLOUDFLARE_API_TOKEN` が環境変数にあると wrangler はブラウザログイン不要でAPIトークン認証を使う）。

```bash
# 本番デプロイ
.claude/skills/cloudflare/cf-wrangler.sh deploy

# D1マイグレーション適用（本番）
.claude/skills/cloudflare/cf-wrangler.sh d1 execute staff-db --remote --file=src/db/migration_156.sql

# D1マイグレーション適用（ローカル検証）
.claude/skills/cloudflare/cf-wrangler.sh d1 execute staff-db --local --file=src/db/migration_156.sql

# secret登録（値の入力を対話式で求められる）
.claude/skills/cloudflare/cf-wrangler.sh secret put SR_PASSWORD

# 本番ログのtail
.claude/skills/cloudflare/cf-wrangler.sh tail
```

### 2. Cloudflare REST APIを直接呼ぶ場合（wranglerでカバーできない操作）

`.claude/skills/cloudflare/cf-api.sh <METHOD> <path> [JSONボディ]` を使う。`<path>` 中の `{account_id}` は
自動的に `.env` の `CLOUDFLARE_ACCOUNT_ID` に置換される。

```bash
# トークンの有効性確認（account-owned tokenはこのアカウントスコープのエンドポイントを使う）
.claude/skills/cloudflare/cf-api.sh GET /accounts/{account_id}/tokens/verify

# Workers一覧
.claude/skills/cloudflare/cf-api.sh GET /accounts/{account_id}/workers/scripts

# D1データベース一覧
.claude/skills/cloudflare/cf-api.sh GET /accounts/{account_id}/d1/database
```

## 注意（破壊的操作）

認証情報が使える状態でも、本番デプロイ・secret登録・D1マイグレーション適用など本番環境に影響する操作は
**実行前に内容をユーザーに伝えて確認を取ってから実行する**。このスキルは「認証をどう通すか」を解決するもので、
実行前確認の必要性そのものをなくすものではない。特にD1マイグレーションは既存データを破壊しうるため、
実行前に対象SQLの内容を確認すること。
