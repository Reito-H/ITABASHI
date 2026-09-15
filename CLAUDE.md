# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

「ホシコン」— タクシー会社（弁天クラブ）向けの社員管理Webシステム。新人離職防止から始まり、社員管理・シフト・売上・報告（忘れ物/事故/違反）・LINE連携・点検管理・車両管理・板橋ページ（勉強会/アンケート/ヒヤリハット等）まで扱う統合管理システムに拡張されている。実装コードは `system/` 配下に集約。リポジトリ直下の `docs/`・`scripts/`・帳票用Excel/PDFは補助資料。

## Commands

All commands run from `system/`:

```bash
npm run dev              # wrangler dev（ローカル開発サーバー、port 8787）
npm run deploy           # wrangler deploy（本番デプロイ。実行前に必ずユーザーへ内容を伝えて確認を取る。コマンド自体は下記「Cloudflare操作」のcloudflareスキル経由で実行する）
npm test                 # vitest run（@cloudflare/vitest-pool-workers、wrangler.tomlのworkers環境で実行）
npx vitest run test/admin-auth.spec.ts   # 単一テストファイルの実行
npm run db:init          # ローカルDBにschema.sqlを適用
npm run db:init:remote   # 本番DBにschema.sqlを適用
npm run db:seed          # ローカルDBにseed.sqlを投入
npm run setup-admin      # 管理者アカウント初期作成（setup_admin.sql）
npm run build:pdf-parsers-bundle   # scripts/build_pdf_parsers_bundle.mjs（PDFパーサーのクライアント用バンドル生成）
```

TypeScriptのコンパイルチェックのみ行う場合は `npx tsc --noEmit`（`tsconfig.json` は strict + noUnusedLocals）。

## Cloudflare操作（デプロイ・D1マイグレーション適用・secret登録・API呼び出し等）

**Cloudflareに対する操作は、素の `wrangler`/`curl` を直接叩かず、必ず `cloudflare` スキル（`.claude/skills/cloudflare/SKILL.md`）を使うこと。**
認証情報（フルアクセス権限のAPIトークン）はリポジトリ直下の `.env`（gitignore済み・非公開）に保存済みで、
スキル配下のラッパースクリプトが自動的に読み込む。

```bash
# wranglerコマンド全般（dev/deploy/d1 execute/secret put/tail等）
.claude/skills/cloudflare/cf-wrangler.sh deploy
.claude/skills/cloudflare/cf-wrangler.sh d1 execute staff-db --remote --file=src/db/migration_156.sql

# wranglerでカバーできないCloudflare REST API呼び出し
.claude/skills/cloudflare/cf-api.sh GET /accounts/{account_id}/workers/scripts
```

- `npx wrangler login` によるブラウザ認証や、トークンをコマンド引数・コード中に直接書く方法は使わない。
- `.env` の中身（トークン本体）をチャット出力・他ファイル・コミットに書き出さない。
- 認証さえ通っていても、本番デプロイ・secret登録・D1マイグレーション適用など本番環境に影響する操作は、
  実行前に必ずユーザーへ内容を伝えて確認を取る（詳細はSKILL.md参照）。

## Architecture

### ランタイム構成
Cloudflare Workers（Hono）+ D1（SQLite）+ R2（3バケット: ドキュメント/証明写真/学習ノート）+ LINE Messaging API/LIFF。サーバーサイドでHTML文字列を組み立てて返す構成で、フロントエンドのビルドステップはない（React等は使わない。生のHTML/CSS/JSをTypeScriptのテンプレートリテラルで生成）。

### ルーティングの三層構造（`system/src/index.ts` がエントリポイント）
1. **管理画面** — `/${SECRET}/admin/*`（`SECRET` は `config.ts` の `s7db8q6wys`、本番URL非公開の擬似シークレットパス）。`requireAuth` ミドルウェアでセッション認証必須（`/login`・`/logout`・`/setup` のみ公開）。続けてアカウント別ページ権限ミドルウェアが `permissions.ts` の `PATH_PERMISSIONS` でパス→必要権限キーを判定し、権限なしなら403。
2. **`/api/*`** — 認証必須API（`/api/line/webhook` はLINE署名検証、`/api/liff/*` はLINE UID検証、`/api/public/*` は完全公開）。
3. **LIFF・公開ページ** — `/liff/*`（LINEログイン内ブラウザ）、および完全ログイン不要の固定パスページ群（希望休フォーム・事故モニター・調整さん・ヒヤリハット・イベント募集・デジタルサイネージなど）。それぞれ `config.ts` に推測困難な固定パス（例: `/kw-...`, `/sg-...`）が定義されており、URL自体がアクセス制御を兼ねる設計。

`index.ts` に新しいルートモジュールを追加する際は、この3層のどこに属するかを踏まえて `app.route()` の位置（admin配下 / `/api/*` 配下 / トップレベル公開）を選ぶこと。

### ファイル構成パターン（機能ごとに3ファイルで完結することが多い）
- `src/routes/admin_<feature>.ts` — 管理画面ページのHTML生成＋操作用JS（インライン`<script>`でfetch呼び出し）を1ファイルにまとめて返す
- `src/routes/api/<feature>.ts` — 上記ページが叩くAPI（CRUD等）
- `src/html/<feature>.ts` — 複数ルートで共有するHTML断片・レイアウトヘルパー（例: `layout.ts` の `layout()` が全管理画面ページの共通シェル）
- `src/data/<feature>.ts` — 静的マスタデータ・定数（DBに入れるほどでもない設定値）
- `src/utils/<feature>.ts` — PDF生成・集計ロジック・外部API連携などのビジネスロジック

機能追加時はこの分割に沿わせる。1ファイルにルーティング・HTML・SQLをすべて詰め込んでいる既存ファイルも多く、それ自体がこのコードベースの標準スタイル（過度な抽象化・共通化はしない）。

### 権限モデル（`src/permissions.ts` + `src/middleware/auth.ts`）
- `admins.permissions` が `NULL` のアカウントは全ページ・全API利用可（フル権限）。
- JSON配列のキー（例: `["home","staff","settings.offices"]`）を持つアカウントは、そのキーに対応するページのみ閲覧可。書き込み（非GET）には `<key>.edit` が別途必要（migration_031〜の閲覧/編集分離）。
- 一部の「全アカウント共通だった機能」（`benri`/`garage`/`shuttle`/`signage`/`cc-list`）はページ権限ではなく専用の閲覧ON/OFFキーで制御（`index.ts` 側で個別判定）。
- 権限キーの全体像・階層は `permissions.ts` 冒頭コメントと `PERMISSION_TREE` を参照。

### DBマイグレーション
`src/db/migration_NNN.sql` を連番で追加していく方式。**自動マイグレーションランナーは存在しない** — 新しいマイグレーションファイルを作成したら、ユーザーに `wrangler d1 execute staff-db --remote --file=src/db/migration_NNN.sql`（ローカル検証は `--local`）を `!` 実行してもらう必要がある。番号は既存ファイルの最大値+1を使うこと（並行作業中のセッションと番号が衝突すると後勝ちで上書き消失するため、着手直前に `ls src/db/migration_*.sql` で最新番号を再確認する）。

### 認証・シークレット
- パスワードは Web Crypto の PBKDF2（`src/auth.ts`）。Cloudflare Workers 制約でイテレーション上限は100000回固定。
- 実際の秘密値（LINEトークン、各種専用パスワード等）は `wrangler.toml` に書かず `wrangler secret put <NAME>` で登録する。`wrangler.toml` 内のコメントに登録すべきキー一覧がある。
- 一部ページ（SR分析・CC名簿など）はアカウント権限とは別に、開くたびヘッダー経由の専用パスワード（`SR_PASSWORD`/`CC_PASSWORD` 等）を要求する二重ロック方式。

### セキュリティヘッダー
`index.ts` のグローバルミドルウェアでページ種別（LIFF/フォーム/サイネージ/wasm使用ページ/通常admin）ごとにCSP・X-Frame-Options・Permissions-Policyを出し分けている。新しいページで `iframe` 埋め込みやカメラ/WASMが必要な場合は、ここの判定リストに個別の例外パスを追加する形で対応する（デフォルトは全面DENY）。日本国外IPは `requireJapan` ミドルウェアで全面ブロック。

### テスト
`test/*.spec.ts` を `@cloudflare/vitest-pool-workers` の `SELF.fetch()` で実行し、実際のWorkerに対してHTTPリクエストを投げて検証する（unitモックではなく実環境に近い統合テスト）。既存テストは認証ゲートの再発防止テストが中心。

## Notes

- 月度の締め日ルールは「17日締め・18日スタート」（例: 「6月度」=5月18日〜6月17日）。設定 → 月度設定で変更可能。
- `docs/SPECIFICATION.md`（初期設計仕様・歴史的資料）、`docs/DIALOGUE_LOG.md`（設計決定の経緯）に詳細な背景がある。
- UI・LINE文面に絵文字は使わない（強調は【】等の記号で行う）。
