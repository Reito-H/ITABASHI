# km 配車コンソール(新UI) — 実データ接続の手順

## ファイル
- `index.html` … 画面本体(伝票・検索・各画面)。モックデータ内蔵
- `screens.js` … 伝票の関連パネル、営業情報、メッセージ、マスタ、CSV、SOS、予約本数表、機能一覧
- `map.js` … 地図・範囲検索、走行軌跡(模式地図。本番は ZENRIN に差し替え)
- `live.js` … 実サーバー `/kmx/api/v1` への接続層(読み取り専用)
- `bridge.js` … ログイン済みの km-operator タブで実行する中継スクリプト
- `inject.js` … km-operator の画面そのものを新UIに置き換えるローダー(同一オリジン方式)

## 今すぐ実データで動かす(開発用・ドメイン不要)
1. この PC で新UIを配信する(例: `powershell -File ..\serve.ps1` → http://localhost:8765/)
2. Chrome で km-operator にログインする(itabashi1)
3. 同じ Chrome で http://localhost:8765/index.html?proxy=1 を開き、右上の「km-operator に接続」を押す  
   → km-operator が別タブで開く
4. その km-operator タブで DevTools(F12)→ Console を開き、`bridge.js` の中身を貼り付けて Enter
5. 新UIのタブに戻ると、通知バーに「LIVE 実データ(読み取り専用)」が出て、伝票検索・地図・営業情報・走行軌跡・マスタが本物のデータになる

仕組み: 新UI → postMessage → km-operator タブ(ログインセッションあり)が API を呼ぶ → 結果を返す。  
km-operator 側のサーバーには何も置かず、CORS も不要。bridge.js は create/update/delete/send 系の API を中継しないので、誤って本番データを書き換えることはない。

## 本番運用の方式(2 択)
A. **同一オリジン配置(推奨)**: BIPROGY 側に依頼して `https://km-operator.smartaxicenter.com/kmx/` 配下の静的ファイルとして新UIを置く。
   `inject.js` 不要、`live.js` が直接 fetch する。ログインも既存のまま。
B. **自社ドメイン + リバースプロキシ**: 自社サーバー(例: bentenclub.com など、nginx/IIS/Node が動かせるもの)で
   `https://<自社ドメイン>/kmx/*` を `https://km-operator.smartaxicenter.com/kmx/*` へ転送(Cookie も転送)。
   新UIは `https://<自社ドメイン>/ui/` に置く。ブラウザから見ると同一オリジンになるので CORS 不要。
   ログイン画面 `HSHS0199.do` もプロキシ越しに通せば、セッション Cookie は自社ドメインに発行される。
   ※ 共用レンタルサーバー(PHP のみ)ではプロキシが組めないので、VPS か Cloudflare Workers 等が必要。

書き込み(伝票保存・探車・メッセージ送信)を有効にするには、`live.js` の `API.post` と `bridge.js` の READ_ONLY を外し、
各 API のパラメータ(旧 JS の `$cf.ajaxPost` 呼び出し)に合わせて実装する。
