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

// 候補用の社員検索（在籍社員。氏名・フリガナ・社員番号の部分一致。空白や全角半角の違いは無視）
app.get('/api/driver-finder/employees', async (c) => {
  const q = (c.req.query('q') ?? '').replace(/[\s　]+/g, '').normalize('NFKC');
  if (!q) return c.json({ results: [] });
  const like = `%${q.replace(/[%_]/g, '')}%`;
  const rows = await c.env.DB.prepare(
    `SELECT emp_no, name, name_kana, division, team, used_cars, car_no FROM employees
     WHERE is_active = 1 AND (REPLACE(name, '　', '') LIKE ? OR REPLACE(name_kana, ' ', '') LIKE ? OR emp_no LIKE ?)
     ORDER BY division, team, emp_no LIMIT 12`,
  ).bind(like, like, like).all<{ emp_no: string; name: string; name_kana: string | null; division: number | null; team: number | null; used_cars: string | null; car_no: string | null }>();
  const results = rows.results.map((r) => {
    let cars: string[] = [];
    try { cars = r.used_cars ? (JSON.parse(r.used_cars) as string[]) : []; } catch { cars = []; }
    if (r.car_no && !cars.includes(r.car_no)) cars.unshift(r.car_no);
    return { empNo: r.emp_no, name: r.name, kana: r.name_kana ?? '', division: r.division, team: r.team, usualCars: cars.slice(0, 5) };
  });
  return c.json({ results }, 200, { 'Cache-Control': 'no-store' });
});

app.get('/api/driver-finder/address', async (c) => {
  const lat = Number(c.req.query('lat')); const lon = Number(c.req.query('lon'));
  const a = await resolveAddress(c.env, lat, lon);
  return c.json({ isSuccess: !!a, address: a ?? '' }, 200, { 'Cache-Control': 'no-store' });
});

export default app;
