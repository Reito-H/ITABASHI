// ローカル開発用: http://localhost:8790 → https://localhost:8787（wrangler dev --local-protocol https）への素通しプロキシ。
// アプリ内ブラウザ等が自己署名証明書の https://localhost を開けない場合に使う。
// Set-Cookie の Secure 属性を外して http でもセッションCookieが保持されるようにする（開発専用。本番には無関係）。
import http from 'node:http';
import https from 'node:https';

const FROM = Number(process.env.PROXY_PORT || 8790);
const TO = { host: 'localhost', port: Number(process.env.TARGET_PORT || 8787) };

http.createServer((req, res) => {
  const headers = { ...req.headers, host: `localhost:${TO.port}` };
  const up = https.request({ ...TO, path: req.url, method: req.method, headers, rejectUnauthorized: false }, (r) => {
    const out = { ...r.headers };
    if (out['set-cookie']) out['set-cookie'] = out['set-cookie'].map((c) => c.replace(/;\s*Secure/gi, ''));
    if (out.location) out.location = String(out.location).replace(`https://localhost:${TO.port}`, `http://localhost:${FROM}`);
    res.writeHead(r.statusCode || 502, out);
    r.pipe(res);
  });
  up.on('error', (e) => { res.writeHead(502); res.end('proxy error: ' + e.message); });
  req.pipe(up);
}).listen(FROM, () => console.log(`dev http proxy: http://localhost:${FROM} -> https://localhost:${TO.port}`));
