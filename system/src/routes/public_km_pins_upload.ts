// km-operator連携（乗降ピンデータ収集）: 社内PC収集スクリプト専用の受け口。
// ページ: なし（人が開く画面ではない）
// Cloudflare Workersからkm-operatorへ直接アクセスすると接続がブロックされることが判明したため、
// 社内の常時稼働PC（scripts/km_pins_collector.ps1）がkm-operatorに直接ログインしてデータを取得し、
// ここへ送り返す方式にした。認証は専用キー（KM_PINS_UPLOAD_KEY、wrangler secret putで設定）を
// ヘッダーで照合するだけ。public_accidents_upload.tsと同じ方式。
import { Hono } from 'hono';
import type { Env } from '../auth';
import { getItabashiRadioNumbers, saveTripsStmts } from '../utils/km_pins';
import type { KmTripInfo } from '../utils/km_operator';

const app = new Hono<{ Bindings: Env }>();

function checkKey(c: { req: { header: (n: string) => string | undefined }; env: Env }): boolean {
  const expected = c.env.KM_PINS_UPLOAD_KEY;
  return !!expected && c.req.header('X-Upload-Key') === expected;
}

// 収集対象の無線番号一覧（板橋営業所の車両）
app.get('/api/public/km-pins/vehicles', async (c) => {
  if (!checkKey(c)) return c.json({ error: '認証に失敗しました' }, 401);
  const radioNumbers = await getItabashiRadioNumbers(c.env.DB);
  return c.json({ radioNumbers });
});

type UploadVehicle = { radioNo?: number; driverName?: string | null; trips?: KmTripInfo[] };
type UploadBody = { runId?: number | null; vehicles?: UploadVehicle[]; errors?: number };

function isValidTrip(t: unknown): t is KmTripInfo {
  return !!t && typeof t === 'object' && typeof (t as { tripId?: unknown }).tripId === 'string' && (t as { tripId: string }).tripId.length > 0;
}

app.post('/api/public/km-pins/upload', async (c) => {
  if (!checkKey(c)) return c.json({ error: '認証に失敗しました' }, 401);

  const body = await c.req.json<UploadBody>().catch(() => ({}) as UploadBody);
  const vehicles = Array.isArray(body.vehicles) ? body.vehicles.slice(0, 100) : [];
  if (vehicles.length === 0) return c.json({ error: 'vehiclesが空です' }, 400);

  let runId = Number.isInteger(body.runId) ? Number(body.runId) : null;
  if (!runId) {
    const radioNumbers = await getItabashiRadioNumbers(c.env.DB);
    const ins = await c.env.DB.prepare(
      `INSERT INTO km_pin_collection_runs (target_date, vehicles_total, vehicles_done, trips_saved, vehicle_errors, triggered_by)
       VALUES (?, ?, 0, 0, 0, '社内PC（自動収集）')`
    ).bind(new Date().toISOString(), radioNumbers.length).run();
    runId = ins.meta.last_row_id as number;
  }

  const stmts: ReturnType<typeof c.env.DB.prepare>[] = [];
  let saved = 0;
  for (const v of vehicles) {
    if (typeof v.radioNo !== 'number' || !Array.isArray(v.trips)) continue;
    const validTrips = v.trips.filter(isValidTrip).slice(0, 200);
    if (validTrips.length === 0) continue;
    stmts.push(...saveTripsStmts(c.env.DB, v.radioNo, v.driverName ?? null, validTrips));
    saved += validTrips.length;
  }
  if (stmts.length > 0) await c.env.DB.batch(stmts);

  const errors = Number.isInteger(body.errors) ? Number(body.errors) : 0;
  await c.env.DB.prepare(
    `UPDATE km_pin_collection_runs
     SET vehicles_done = vehicles_done + ?, trips_saved = trips_saved + ?, vehicle_errors = vehicle_errors + ?
     WHERE id = ?`
  ).bind(vehicles.length, saved, errors, runId).run();

  return c.json({ ok: true, runId, saved });
});

export default app;
