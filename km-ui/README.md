# km-operator 新UI 引き継ぎパッケージ

タクシー配車システム「クラウド配車システム(km-operator / BIPROGY)」の画面を最新 UI に作り直すプロジェクトの引き継ぎ一式。
作成日: 2026-10-13。**個人情報・認証情報・API 鍵は含めていません。**

## 内容
```
km-handoff/
├─ README.md                      … これ
├─ docs/
│  ├─ 01_調査結果.md               … 技術構成、画面一覧、非表示機能、API 一覧、確認済みパラメータ/応答、コード値
│  ├─ 02_アーキテクチャと配置.md    … Cloudflare Workers でのリバースプロキシ構成、ログイン、セキュリティ、ZENRIN
│  ├─ 03_新UIの構成.md             … ui/ の各ファイルの役割、データの流れ、既知の制限
│  ├─ 04_次の作業.md               … 優先順の作業リスト(フェーズ 1〜5)
│  └─ 05_Claudeへの指示文.md       … 次の Claude に最初に貼る指示文
├─ ui/                            … 新UI(静的ファイル。ビルド不要)
│  ├─ index.html  screens.js  map.js  live.js
│  ├─ bridge.js  inject.js  serve.ps1  README.md
└─ cloudflare-worker/             … リバースプロキシ + 静的配信(wrangler)
   ├─ wrangler.toml  package.json
   └─ src/index.js
```

## 30 秒で把握する
- 既存アプリは古い jQuery/Bootstrap 画面だが、**データは全部 `/kmx/api/v1/*` の JSON API**。サーバーを触らず画面だけ作り直せる
- 新UI(`ui/`)は全画面分のプロトタイプ。モックで動き、接続層(`live.js`)を通すと実 API で動く(伝票検索・通知・地図車両・営業履歴・走行軌跡・マスタは確認済み)
- 自社ドメインなしでも動かせるが、本番は **Cloudflare Workers のリバースプロキシ**(`cloudflare-worker/`)で UI と API を同一オリジンにする構成を推奨
- 現状は **読み取り専用**。書き込み API は Worker と UI の両方で止めている

## 現状（2026-10-13）
**ホシコンに組み込み済み・本番稼働中（読み取り専用）。** 構成と変更点は `docs/06_ホシコン組み込み.md`、社内PC側の設置は `relay-pc/HANDOFF.md`。
`cloudflare-worker/` の単独Worker案は、Workers→km-operator が遮断（522）されるため使っていない（参考として残置）。

## 最初にやること（旧・引き継ぎ当初の案）
`docs/05_Claudeへの指示文.md` の指示文を次の Claude に貼る → `docs/04_次の作業.md` フェーズ 1。

## 確認方法(ローカル・モック)
`ui/index.html` をブラウザで開く。または
```
powershell -NoProfile -ExecutionPolicy Bypass -File ui/serve.ps1
```
で http://localhost:8765/ 。

## 注意
- テストアカウントの ID/パスワードはこのパッケージに含めていない。別経路で共有する
- `tickets/get_init_display_data` の応答に地図鍵やパスワードが含まれる。ログや資料に貼らない
- 顧客データが入った本番環境なので、書き込み系を有効にするときは検証環境の有無を BIPROGY に確認する
