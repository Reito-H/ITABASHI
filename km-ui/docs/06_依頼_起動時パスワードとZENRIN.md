# 06. ホシコン側(Mac の Claude)への依頼: 配車コンソールの起動時パスワード と ZENRIN 地図

作成: 2026-10-13(Windows 側 Claude)。中継 PC(km-relay)は設置済みで「LIVE 実データ(読み取り専用)」の表示まで確認済み。

## 依頼 1: 配車コンソールを開くときに暗証番号の入力を必須にする
要件: ホシコンの「配車コンソール」を開くたびに、4 桁の暗証番号(オーナーが別途伝える。ここには書かない)を入力させる。
正しい番号を入れるまで画面も API も使えないこと。

### 推奨実装(Worker 側で判定。画面側の JS だけで判定しない)
1. 暗証番号は Cloudflare のシークレットに置く: `wrangler secret put CONSOLE_PIN`(コードや wrangler.toml には書かない)
2. `/console/unlock`(POST, JSON `{pin}`)を追加。一致したら HMAC 署名付きの Cookie `km_console`(HttpOnly, Secure, SameSite=Lax, 有効 8 時間)を発行。
   署名鍵も `wrangler secret put CONSOLE_SESSION_KEY`
3. 配車コンソールの静的ファイル配信、`/kmx/*`、`/api/session` のすべてで、この Cookie を検証。無ければ暗証番号入力ページ(小さな HTML)を返す
4. 連続失敗の抑止: 同一 IP で 5 回失敗したら 10 分ロック(Workers KV か Durable Object。簡易なら Cloudflare Rate Limiting ルール)
5. ロック解除後の画面には「ロック」ボタンを置き、押すと Cookie を消す

### Worker の骨子(index.js に足す)
```js
async function hmac(key, data){const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(data)))))}
async function issueSession(env){const exp=Date.now()+8*3600*1000;const sig=await hmac(env.CONSOLE_SESSION_KEY,String(exp));
  return `km_console=${exp}.${sig}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800`}
async function hasSession(request,env){const m=/(?:^|;\s*)km_console=(\d+)\.([^;]+)/.exec(request.headers.get('cookie')||'');
  if(!m||Date.now()>+m[1])return false;return (await hmac(env.CONSOLE_SESSION_KEY,m[1]))===m[2]}
// fetch() の先頭:
//   if (url.pathname==='/console/unlock' && request.method==='POST') { const {pin}=await request.json();
//     if (pin===env.CONSOLE_PIN) return new Response(null,{status:204,headers:{'set-cookie':await issueSession(env)}});
//     return new Response('NG',{status:401}); }
//   if (!(await hasSession(request,env))) return new Response(UNLOCK_HTML,{status:401,headers:{'content-type':'text/html; charset=utf-8'}});
```
`UNLOCK_HTML` は「暗証番号」入力 1 つと「開く」ボタンだけの小さなページ。送信は `fetch('/console/unlock',{method:'POST',body:JSON.stringify({pin})})` → 204 なら `location.reload()`。

### 注意
- 4 桁の暗証番号は総当たりに弱い。上記 4 のロックは必須。可能なら Cloudflare Access(社内アカウントのログイン)も併用し、暗証番号は「席を離れたときの簡易ロック」の位置づけにする
- 暗証番号を画面側の JS に埋め込む実装(`if(pin==='....')`)は、ソースを見れば分かるので不可

## 依頼 2: ZENRIN 地図が表示されない件(現状は仕様)
現在の配車コンソールの地図は Canvas の模式図で、ZENRIN 地図は意図的に載せていない。理由:
- 旧UI(km-operator)は `https://js.zmaps-api.com/zma_loader.js?auth=referer&key=...` を使っている。`auth=referer` は **呼び出し元ドメインを ZENRIN 側で許可制** にしている。ホシコンのドメインは許可されていないので、鍵を使っても読み込めない(あるいは ZENRIN の契約違反になる)
- 鍵は `tickets/get_init_display_data` の応答 `companyConfigAdmin.zenrinKey` に入っている(資料に貼らない)

必要な手続き:
1. km-operator の運用元(BIPROGY / 国際自動車)に「新しい画面をホシコンのドメインで動かすので、ZENRIN の許可ドメインに追加してほしい」と依頼する。契約者側でしかできない
2. 許可されたら、配車コンソールの `map.js` の描画部分を zmaps API に置き換える。範囲検索・走行軌跡のロジックは `live.js` の `toXY/toLL`(板橋営業所原点の平面近似)を地図 API の座標に差し替えるだけで流用できる
3. それまでは模式図のまま運用して問題ない。車両位置・待機場所・走行軌跡の **データ自体は実物** が出ている

代替案: 許可が取れない場合は、国土地理院タイルや OpenStreetMap(利用規約に沿って)を背景にする。配車先の住所検索は旧UIの `map_searches/get_map_search_info` を使えば ZENRIN なしでも動く。
