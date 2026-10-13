// 乗務員クイック検索（管理画面の右下フローティング。html/layout.ts が全ページに同梱）
//   GET /driver-finder.js                 部品本体（km-ui/ui/driver-finder.js を埋め込んだもの。?v=ハッシュで長期キャッシュ）
//   GET /api/driver-finder/vehicles       稼働中の全車両（無線番号・乗務員名・状態・座標・車番）。45秒メモリキャッシュ
//   GET /api/driver-finder/address?lat=&lon=  緯度経度→住所
// ホシコンにログインしていれば誰でも使える（ページ権限は見ない。index.ts でバイパス）。配車コンソールの 0724 は不要。
import { Hono } from 'hono';
import type { Env } from '../auth';
import { DRIVER_FINDER_JS, DRIVER_FINDER_VERSION } from '../assets/km_console_ui';
import { liveVehicles, resolveAddress } from '../utils/driver_locator';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

app.get('/driver-finder.js', (c) => new Response(DRIVER_FINDER_JS, {
  headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Driver-Finder-Version': DRIVER_FINDER_VERSION },
}));

app.get('/api/driver-finder/vehicles', async (c) => {
  const r = await liveVehicles(c.env);
  if (!r.ok) return c.json({ isSuccess: false, msgs: [{ msg: r.message }] }, 503);
  // 部品（driver-finder.js）が期待する km-operator 互換の形で返す（車番は plate として追加）
  return c.json({
    isSuccess: true, fetchedAt: r.fetchedAt,
    vehiclePointList: r.vehicles.map((v) => ({ wirelessLineNumber: v.radio, vehicleId: v.vehicleId, lastName: v.lastName, firstName: v.firstName, status: String(v.status), latitude: String(v.lat), longitude: String(v.lon), dispatchExcluded: v.excluded ? '1' : '0', plate: v.plate })),
  }, 200, { 'Cache-Control': 'no-store' });
});

app.get('/api/driver-finder/address', async (c) => {
  const lat = Number(c.req.query('lat')); const lon = Number(c.req.query('lon'));
  const a = await resolveAddress(c.env, lat, lon);
  return c.json({ isSuccess: !!a, address: a ?? '' }, 200, { 'Cache-Control': 'no-store' });
});

export default app;
