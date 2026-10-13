# 09. Mac 側 Claude への次の依頼(2026-10-13 時点のまとめ)

板橋 PC 側は以下まで完了。Mac 側(ホシコン)でやってほしいことを優先順に書く。詳細は各 docs を参照。

## 板橋 PC 側で完了していること
1. km-relay(Cloudflare Tunnel)設置済み。配車コンソールで「LIVE 実データ(読み取り専用)」表示を確認済み
2. takcon-sync 設置済み。タクコンの CSV 出力先共有を監視し、`http://127.0.0.1:8766` で pull API(/health, /files, /file/{name}, POST /ack/{name})を提供中。今日以降の CSV だけが未処理として見える(docs/08)
3. 新UI(ui/)にマスタ API の自動探索を追加(docs/07)

## Mac 側への依頼(優先順)
1. **タクコン CSV の取り込み(docs/08「ホシコン側でやること(案 pull)」)**
   - Tunnel km-relay に Public Hostname `takcon.bentenclub.com → http://localhost:8766` を追加し、Cloudflare Access(サービストークン)で保護
   - Worker に Cron(15 分ごと)で `/files` → `/file/{name}` → 既存 CSV 取込 → `/ack/{name}`。種別は ホシコン収集データ / 事故データCSV / 日報データCSV / 駐車料金 / オット
   - 板橋側の `serveToken` の値を決めて共有(板橋側で config.json に設定する)
   - 画面に「最終取込日時 / 件数 / 失敗」を表示
2. **配車コンソールの起動時暗証番号(docs/06)**: Worker 側で判定、連続失敗ロック、暗証番号はシークレットに
3. **マスタ API の確定(docs/07)**: 管理者ロールのアカウントで各マスタ画面の通信を確認し `ui/live.js` の KNOWN/GUESS を確定値に
4. **ZENRIN 地図(docs/06)**: 許可ドメイン追加の依頼が通ったら `map.js` を zmaps に差し替え

## 保留(板橋側で依頼中)
- SQL Server 読み取り専用ログインの発行(IT 担当 / SystemOrigin)。発行されたら板橋側で `takcon-db-export.ps1` を有効化し、タクコンの「出力」操作も不要にする

## 連絡事項
- 板橋 PC がログオフ・停止中は中継も CSV 連携も止まる(復帰後に自動再開)
- 板橋側のトラブル診断はデスクトップのショートカット 2 つ(「中継トラブル診断」「タクコンDB接続テスト」)
