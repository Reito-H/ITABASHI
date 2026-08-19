// 運転リスク検証の閾値設定（単一行 id=1）
import { Hono } from 'hono';
import type { Env } from '../../auth';

const app = new Hono<{ Bindings: Env }>();

type DrivingRiskSettingsRow = {
  harsh_event_daily_threshold: number;
  max_speed_highway_threshold: number;
  max_speed_local_threshold: number;
};

app.get('/', async (c) => {
  const row = await c.env.DB.prepare('SELECT * FROM driving_risk_settings WHERE id = 1').first<DrivingRiskSettingsRow>();
  return c.json({ settings: row });
});

function validate(b: Partial<DrivingRiskSettingsRow>): string | null {
  if (typeof b.harsh_event_daily_threshold !== 'number' || b.harsh_event_daily_threshold < 0 || b.harsh_event_daily_threshold > 999) return '不正な急挙動しきい値です';
  if (typeof b.max_speed_highway_threshold !== 'number' || b.max_speed_highway_threshold < 0 || b.max_speed_highway_threshold > 300) return '不正な高速道速度しきい値です';
  if (typeof b.max_speed_local_threshold !== 'number' || b.max_speed_local_threshold < 0 || b.max_speed_local_threshold > 300) return '不正な一般道速度しきい値です';
  return null;
}

app.post('/', async (c) => {
  const body = await c.req.json<Partial<DrivingRiskSettingsRow>>();
  const err = validate(body);
  if (err) return c.json({ error: err }, 400);

  await c.env.DB.prepare(`
    UPDATE driving_risk_settings SET
      harsh_event_daily_threshold = ?, max_speed_highway_threshold = ?, max_speed_local_threshold = ?,
      updated_at = datetime('now', 'localtime')
    WHERE id = 1
  `).bind(body.harsh_event_daily_threshold, body.max_speed_highway_threshold, body.max_speed_local_threshold).run();

  return c.json({ ok: true });
});

export default app;
