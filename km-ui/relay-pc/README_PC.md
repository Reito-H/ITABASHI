# 社内PC用: 配車コンソール中継（km-relay）の設置 — Claude への指示書

このフォルダを開いた Claude Code は、**このファイルの手順どおりに設置を実行してください。** リポジトリ（git）は不要で、このフォルダだけで完結します。
ユーザーは非エンジニアです。進め方は平易な言葉で短く伝え、完了したら「OK」とだけ分かるように報告してください。

## 何をするか（1行で）
このWindows PCに cloudflared（Cloudflare Tunnel の常駐ソフト）を置き、このユーザーがログオンするたびに自動起動するよう登録する。**管理者権限は使わない。**

## 背景
- ホシコン（タクシー会社の管理画面・Cloudflare Workers）に「配車コンソール」（スマタク＝km-operator の画面を作り直した新UI）を組み込んだ。
- ホシコンから km-operator へ直接つなぐと遮断される（522）ため、日本国内にあるこのPCを通り道にする:
  `ホシコン → https://km-relay.bentenclub.com（Cloudflare Tunnel）→ このPCの cloudflared → https://km-operator.smartaxicenter.com`
- Tunnel・DNS・アクセス制限は Cloudflare 側で作成済み。このPCでやるのは cloudflared の設置だけ。
- このPCに km-operator の ID/パスワードは不要（ログインはホシコン側のサーバーが行う）。

## フォルダの中身
| ファイル | 役割 |
|---|---|
| `README.md` | この指示書 |
| `setup-km-relay.ps1` | 設置スクリプト（cloudflared.exe の取得・トークン配置・ログオン時タスク登録・起動確認を全部やる） |
| `tunnel_token.txt` | トンネル接続トークン（合言葉。**他のチャットやメールに貼らない**） |

## 手順（Claude が実行する）
1. このフォルダで PowerShell を使い、次を実行する（ユーザーに `!` 実行を頼むのでも、自分で Bash/PowerShell ツールから実行するのでもよい）:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\setup-km-relay.ps1
   ```
   スクリプトの動作: `%USERPROFILE%\km-relay\` を作り、cloudflared.exe を Cloudflare 公式 GitHub（`github.com/cloudflare/cloudflared/releases`）から取得 → `tunnel_token.txt` をコピー → 隠しウィンドウで起動する `run-km-relay.vbs` を作成 → タスクスケジューラに `km-relay`（トリガー: ログオン時、権限: 制限付き）を登録 → その場で起動し 20 秒後に動作確認。
2. 「OK: cloudflared が動いています」と出れば完了。`%USERPROFILE%\km-relay\km-relay.log` に `Registered tunnel connection` が複数行出ていれば接続済み。
3. ユーザーに「ホシコンの左メニュー『配車コンソール』を開いて、上の通知バーに『LIVE 実データ(読み取り専用)』と出るか見てください」と伝える。出れば成功。
4. 「中継PC（km-relay）がオフラインです」と出る場合は cloudflared が動いていない。`Get-Process cloudflared` と上記ログを確認し、`schtasks /Run /TN km-relay` で起動し直す。

## うまくいかない時の見どころ
- `Invoke-WebRequest` が失敗 → 社内プロキシ/セキュリティソフトが GitHub からの exe 取得を止めている可能性。ブラウザで `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe` を手動ダウンロードし、`%USERPROFILE%\km-relay\cloudflared.exe` に置いてから再実行。
- `schtasks /Create` が「アクセスが拒否されました」→ グループポリシーでタスク作成が禁止されている。その場合はスタートアップフォルダ（`shell:startup`）に `run-km-relay.vbs` へのショートカットを置く方法に切り替える（これも管理者権限不要）。
- ログに `Unauthorized` / `invalid token` → トークンの貼り付けミス（前後の空白・改行）。`tunnel_token.txt` を1行だけにして再実行。
- 接続はできるのにホシコン側でエラー → PC側の問題ではない。Mac側（ホシコン開発側）の Claude に見てもらう。

## 運用メモ（ユーザーに伝えること）
- 再起動後、このユーザーでログオンすれば自動で立ち上がる。ログオン前は中継が止まる（数分程度）。
- 止める: `schtasks /End /TN km-relay`、解除: `schtasks /Delete /TN km-relay /F` ＋ `%USERPROFILE%\km-relay` を削除。
- 同じトークンで予備PCに同じ設置をしても問題ない（再起動中の空白をなくせる）。
