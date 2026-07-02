# デプロイ手順書（初心者向け）

このシステムは **Cloudflare Workers**（クラウドサーバー）と **D1**（データベース）で動きます。  
一度デプロイすれば、毎月費用なしで運用できます。

---

## 全体の流れ

```
① Node.js をインストール（PCに入っていない場合のみ）
② Cloudflare にログイン
③ D1データベースを作成
④ wrangler.toml を設定
⑤ DBを初期化
⑥ Workerをデプロイ
⑦ ドメインのルート設定
⑧ 初回パスワード設定
⑨ ログイン確認
⑩ Excelデータの移行（任意）
⑪ LINEの設定（任意）
```

---

## ① Node.js のインストール（初回のみ）

1. https://nodejs.org/ja から **LTS版**（推奨版）をダウンロード
2. インストーラーを実行（全部「次へ」でOK）
3. ターミナル（Macはターミナル.app、WindowsはPowerShell）を開き、確認：
   ```
   node --version
   ```
   `v18.x.x` 以上と表示されればOK。

---

## ② Cloudflare にログイン

ターミナルで `system` フォルダに移動してから操作します。

```bash
cd /Users/reito/NC/MyApp/新人離職防止/system
```

依存パッケージをインストール：
```bash
npm install
```

Cloudflare にログイン：
```bash
npx wrangler login
```

→ ブラウザが自動で開きます。「Allow（許可）」をクリックしてください。  
→ 「Successfully logged in」と表示されたらOK。

---

## ③ D1データベースを作成

```bash
npx wrangler d1 create staff-db
```

実行すると以下のような出力が表示されます：

```
✅ Successfully created DB 'staff-db'

[[d1_databases]]
binding = "DB"
database_name = "staff-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  ← これをコピー！
```

`database_id` の値（ `xxxxxxxx-...` の部分）をコピーしてください。

---

## ④ wrangler.toml を設定

`system/wrangler.toml` を開き、以下の2箇所を編集します：

### 1. database_id を貼り付ける

```toml
database_id = "YOUR_DATABASE_ID_HERE"  ← ここを③でコピーしたIDに変更
```

### 2. SETUP_KEY を設定する

```toml
SETUP_KEY = "CHANGE_THIS_TO_RANDOM_STRING"  ← ここを自分だけが知るランダムな文字列に変更
```

**SETUP_KEY の決め方:**  
英字・数字を混ぜた16文字以上を推奨します。  
例: `Abc123XyZ456WwW9`  
※ 後でパスワード設定画面のURLに使います。他人に教えないでください。

---

## ⑤ DBを初期化

スキーマ（テーブル構造）を作成：

```bash
npx wrangler d1 execute staff-db --remote --file=src/db/schema.sql
```

管理者アカウントを作成：

```bash
npx wrangler d1 execute staff-db --remote --file=src/db/setup_admin.sql
```

両方とも `✅ Executed ... queries` と表示されればOK。

---

## ⑥ Workerをデプロイ

```bash
npx wrangler deploy
```

デプロイが完了すると、以下のようなURLが表示されます：

```
https://staff-mgmt.あなたのアカウント名.workers.dev
```

このURLからシステムにアクセスできます（この時点ではパスワード未設定）。

---

## ⑦ ドメインのルート設定

自分のドメイン（例: `example.com`）を使う場合に設定します。  
**独自ドメインを使わない場合はこのステップをスキップ。**

1. https://dash.cloudflare.com を開く
2. 左メニューから使いたいドメイン名をクリック
3. 左メニューの「**Workers Routes**」または「**Workers & Pages**」→「概要」→ 自分のWorkerを選択
4. 「**ルートを追加**」から以下を設定：
   - `https://example.com/admin*` → `staff-mgmt`
   - `https://example.com/api*` → `staff-mgmt`

---

## ⑧ 初回パスワード設定

ブラウザで以下のURLにアクセス：

```
https://staff-mgmt.あなたのアカウント名.workers.dev/admin/setup?key=あなたのSETUP_KEY
```

（独自ドメインを設定した場合は `https://example.com/admin/setup?key=あなたのSETUP_KEY`）

→ パスワード入力フォームが表示されます。  
→ **8文字以上**のパスワードを入力して「設定する」をクリック。  
→ 「設定完了」画面が出たらOK。

> ⚠️ **重要:** 設定完了後は同じURLにアクセスしても「セットアップは既に完了しています」と表示されます。
> 追加のセキュリティ対策として、設定後に `wrangler.toml` の `SETUP_KEY` を別の値に変更して再デプロイすることを推奨します。

---

## ⑨ ログイン確認

ブラウザで管理画面を開きます：

```
https://staff-mgmt.あなたのアカウント名.workers.dev/admin
```

ログイン画面が表示されたら：
- **ユーザー名:** `admin`
- **パスワード:** ⑧で設定したもの

ダッシュボードが表示されたらセットアップ完了です！

---

## ⑩ Excelデータの移行（既存データがある場合）

既存のExcelシフト表をDBに取り込みます。

### 準備

```bash
pip install openpyxl
```

（Pythonが入っていない場合: https://www.python.org/downloads/ からインストール）

### 実行

```bash
cd /Users/reito/NC/MyApp/新人離職防止
python3 scripts/import_excel.py \
  --file "/path/to/あなたのExcelファイル.xlsx" \
  --output import.sql \
  --sheets "2026.05月度" "2026.06月度"
```

`--file` の部分をExcelファイルの実際のパスに変更してください。

SQLファイルが生成されたら本番DBに投入：

```bash
cd system
npx wrangler d1 execute staff-db --remote --file=../import.sql
```

---

## ⑪ LINE「リフ」の設定（任意）

LINEボット機能を使う場合のみ設定します。

### 1. LINE公式アカウントを開設

1. https://www.lycbiz.com/jp/service/line-official-account/ を開く
2. 「無料で始める」→ ビジネス用アカウントでログイン（なければ作成）
3. アカウント名を入力して作成

### 2. Messaging API チャネルを作成

1. https://developers.line.biz/console/ を開く
2. 「プロバイダーを作成」→ 名前を入力
3. 「チャネルを作成」→「Messaging API」を選択
4. 必要事項を入力して作成
5. 「Messaging API設定」タブを開く
6. 「チャネルシークレット」と「チャネルアクセストークン（長期）」をコピー

### 3. Webhook URL を設定

「Messaging API設定」タブの Webhook URL に以下を入力：

```
https://staff-mgmt.あなたのアカウント名.workers.dev/api/line/webhook
```

「Webhookの利用」をONにして「検証」ボタンで確認。

### 4. wrangler.toml に追加して再デプロイ

`system/wrangler.toml` の `[vars]` セクションに追加：

```toml
LINE_CHANNEL_SECRET = "コピーしたチャネルシークレット"
LINE_CHANNEL_ACCESS_TOKEN = "コピーしたチャネルアクセストークン"
```

再デプロイ：

```bash
cd /Users/reito/NC/MyApp/新人離職防止/system
npx wrangler deploy
```

### 5. リッチメニューの設定（管理画面のLINE管理ページから招待コードを発行後）

LINE Official Account Manager（https://manager.line.biz/）でリッチメニューを設定します。  
メニュー項目の「テキスト送信」に以下を設定：

| ボタン | 送信テキスト |
|-------|------------|
| 売上記録 | `売上記録` |
| 嫌なこと報告 | `嫌なこと報告` |
| シフト確認 | `シフト確認` |

---

## ローカルで動作確認したい場合

本番デプロイ前にPC上で動作確認できます。

```bash
cd /Users/reito/NC/MyApp/新人離職防止/system

# ローカルDBを初期化
npx wrangler d1 execute staff-db --local --file=src/db/schema.sql
npx wrangler d1 execute staff-db --local --file=src/db/setup_admin.sql

# ローカルサーバーを起動
npm run dev
```

ブラウザで `http://localhost:8787/admin` を開きます。  
初回パスワード設定: `http://localhost:8787/admin/setup?key=（wrangler.tomlのSETUP_KEY）`

> ローカルの変更は本番に影響しません。安心してお試しください。

---

## よくあるエラー

| エラー内容 | 原因 | 対処 |
|-----------|------|------|
| `Not authorized. You need to be logged in` | Cloudflareにログインしていない | `npx wrangler login` を実行 |
| `D1 database not found` | database_id が間違っている | wrangler.toml の database_id を確認 |
| `Access denied` | SETUP_KEY が間違っている | URLの `?key=` の値と wrangler.toml の `SETUP_KEY` を確認 |
| `Module not found: hono` | npm install 未実行 | `npm install` を実行 |
| ブラウザで403が出る | 海外IPからアクセスしている | 日本国内のネットワークからアクセスする |

---

## セキュリティチェックリスト

デプロイ後に確認してください：

- [ ] `SETUP_KEY` を推測しにくい文字列に設定した
- [ ] パスワードを8文字以上の強力なものに設定した
- [ ] ドメインのSSL/TLS設定で「常にHTTPSを使用」をONにした
  （Cloudflareダッシュボード → SSL/TLS → 概要 → Always Use HTTPS: ON）
- [ ] LINE Webhookの「署名検証」が機能している（Webhook URLで「検証」ボタンが成功した）
