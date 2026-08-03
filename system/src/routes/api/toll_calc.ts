// 高速道路料金計算API
// GET /api/toll-calc/quote?from=<nodeId>&to=<nodeId>&depTime=HH:MM
import { Hono } from 'hono';
import type { Env } from '../../auth';
import { computeQuote } from '../../utils/toll_calc';
import { applyNightDiscount } from '../../utils/night_discount';
import { fetchDriveplazaFare } from '../../utils/driveplaza';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

app.get('/quote', async (c) => {
  const from = parseInt(c.req.query('from') ?? '');
  const to = parseInt(c.req.query('to') ?? '');
  if (!Number.isInteger(from) || !Number.isInteger(to)) {
    return c.json({ error: '出発地・到着地を選択してください' }, 400);
  }
  const depTime = c.req.query('depTime') ?? undefined;

  // まずNEXCO東日本「ドラぷら」の検索結果(公式の正確な料金)を試す。
  // 取得できなければ自前の計算エンジン(概算)にフォールバックする。
  const [fromNode, toNode] = await Promise.all([
    c.env.DB.prepare('SELECT name FROM toll_nodes WHERE id = ?').bind(from).first<{ name: string }>(),
    c.env.DB.prepare('SELECT name FROM toll_nodes WHERE id = ?').bind(to).first<{ name: string }>(),
  ]);
  if (!fromNode || !toNode) return c.json({ error: '出発地・到着地が見つかりません' }, 400);
  if (from === to) return c.json({ error: '出発地と到着地が同じです' }, 400);

  const dp = await fetchDriveplazaFare(fromNode.name, toNode.name, depTime);

  let responseBody: Record<string, unknown>;
  let logFare: number;
  let logDistance: number;
  let logNightDiscount = false;

  if (dp) {
    responseBody = {
      source: 'driveplaza',
      distanceKm: dp.distanceKm,
      segments: [{
        roadName: `${fromNode.name} 〜 ${toNode.name}`,
        operator: 'official',
        distanceKm: dp.distanceKm,
        fare: dp.fare,
        isOverride: false,
        fareAfterDiscount: dp.fare,
        nightDiscounted: false,
      }],
      total: dp.fare,
      nightDiscountApplied: false,
      totalAfterNightDiscount: dp.fare,
      nightDiscountNote: 'NEXCO東日本「ドラぷら」の検索結果(公式のETC料金)。指定した時刻に応じた深夜割引等は既に反映されています。',
    };
    logFare = dp.fare;
    logDistance = dp.distanceKm;
  } else {
    const result = await computeQuote(c.env.DB, from, to);
    if ('error' in result) return c.json({ error: result.error }, 400);
    const night = applyNightDiscount(result.segments, depTime);
    responseBody = {
      source: 'internal',
      distanceKm: result.distanceKm,
      segments: night.segments,
      total: night.totalBeforeDiscount,
      nightDiscountApplied: night.applied,
      totalAfterNightDiscount: night.totalAfterDiscount,
      nightDiscountNote: `${night.note}（公式サイトから取得できなかったため、自前の概算計算です）`,
    };
    logFare = night.totalAfterDiscount;
    logDistance = result.distanceKm;
    logNightDiscount = night.applied;
  }

  const adminId = c.get('adminId');
  if (adminId) {
    await c.env.DB.prepare(
      `INSERT INTO toll_calc_logs (admin_id, from_node_id, to_node_id, distance_km, fare, night_discount)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(adminId, from, to, logDistance, logFare, logNightDiscount ? 1 : 0).run();
  }

  return c.json(responseBody);
});

app.get('/nodes', async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT id, name, kind, area_tag FROM toll_nodes ORDER BY name'
  ).all();
  return c.json({ items: rows.results ?? [] });
});

export default app;
