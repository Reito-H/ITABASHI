# 社内PC側の Claude への引き継ぎ: 配車コンソール中継（km-relay）の設置

このファイルは、**社内PC（Windows・管理者権限なし・毎朝再起動後にログインする運用）で動かしている Claude Code** に読ませるための手順書です。
やってもらうことは1つだけ: **このPCに cloudflared（Cloudflare Tunnel の常駐ソフト）を置いて、ログオン時に自動起動させる。**

## 背景（なぜこれが必要か）
- ホシコンの管理画面に「配車コンソール」（km-operator＝スマタクの画面を作り直した新UI）を組み込んだ。
- ホシコン（Cloudflare Workers）から km-operator へ直接つなぐと km-operator 側に遮断される（522）。
- そこで、**日本国内にあるこの社内PC** を通り道にする:
  `ホシコン(Worker) → https://km-relay.bentenclub.com（Cloudflare Tunnel）→ このPCの cloudflared → https://km-operator.smartaxicenter.com`
- Tunnel・DNS・Cloudflare Access（サービストークンで保護）は Cloudflare 側で作成済み。**このPCでやるのは cloudflared の設置だけ。**
- km-operator へのログインはホシコンのサーバーが自動で行う。このPCに km-operator の ID/パスワードを置く必要はない。

## このPCでやること（Claude が実行する）
前提: `tunnel_token.txt`（トンネル接続トークン）が必要。**gitには入っていない**ので、ユーザーから受け取る（下記「トークンの受け取り方」）。

1. このリポジトリを最新にする（`git pull`）。無ければ `km-ui/relay-pc/` の2ファイル（`setup-km-relay.ps1` と `HANDOFF.md`）だけあればよい。
2. `km-ui/relay-pc/` に `tunnel_token.txt` を置く（中身はトークン文字列1行。前後の空白・改行は除く）。
3. PowerShell で実行:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\km-ui\relay-pc\setup-km-relay.ps1
   ```
   スクリプトがやること: `%USERPROFILE%\km-relay\` に cloudflared.exe を公式GitHubから取得 → トークン配置 → タスクスケジューラに「ログオン時に隠しウィンドウで起動」(`km-relay`)を登録 → その場で起動して確認。管理者権限は使わない。
4. 「OK: cloudflared が動いています」と出たら完了。`%USERPROFILE%\km-relay\km-relay.log` に `Registered tunnel connection` が出ていれば接続済み。
5. 確認: ユーザーにホシコンの「配車コンソール」（左メニュー）を開いてもらい、上の通知バーに **「LIVE 実データ(読み取り専用)」** が出れば成功。
   「中継PC（km-relay）がオフラインです」と出る場合は cloudflared が動いていない（ログを見る）。

## トークンの受け取り方（ユーザー向け）
- Mac側の Claude Code のセッションフォルダに `km-ui/relay-pc/tunnel_token.txt` がある（gitignore 済み）。
- その中身（1行の長い文字列）をコピーして、このPCの Claude に「これがトークン」と貼り付ける → Claude が `km-ui/relay-pc/tunnel_token.txt` として保存する。
- トークンはチャットログ以外（メール・LINE グループ等）に貼らない。漏れた場合は Cloudflare 側でトンネルを作り直せば無効化できる（Mac側の Claude に依頼）。

## 運用メモ
- 再起動後は、このユーザーでログオンした時点で自動起動する（タスク名 `km-relay`、トリガー「ログオン時」）。ログオン前は中継が止まっている。
- 止めたいとき: `schtasks /End /TN km-relay`、解除: `schtasks /Delete /TN km-relay /F` ＋ `%USERPROFILE%\km-relay` フォルダ削除。
- cloudflared は `--no-autoupdate` で起動している。更新したいときは exe を置き換えるだけ。
- 同じトークンで複数台が同時に接続しても問題ない（Cloudflare 側で自動的に振り分ける）。予備PCに同じ手順を入れておくと再起動中の空白もなくせる。

## Cloudflare 側に作ってあるもの（参考・触らなくてよい）
| 種類 | 名前 / 値 |
|---|---|
| Tunnel | `km-relay`（ID `7f41301b-bf13-4c18-b21f-2c3501850877`、設定は Cloudflare 側管理） |
| Ingress | `km-relay.bentenclub.com` → `https://km-operator.smartaxicenter.com`（Host ヘッダー書換） |
| DNS | `km-relay.bentenclub.com` CNAME → `<tunnel-id>.cfargotunnel.com`（プロキシON） |
| Access | アプリ `km-relay (hoshikon)`、ポリシー「サービストークンのみ」。ホシコンの Worker が `KM_RELAY_ACCESS_ID/SECRET` を付けて呼ぶ。それ以外は 403 |
| Worker 側 | `system/src/utils/km_relay.ts`（自動ログイン・Cookie/トークン保持）、`system/src/routes/admin_km_console.ts`（画面＋GET専用中継）、`migration_197.sql` |
