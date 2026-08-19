// 賃金試算設定（成果手当の概算計算用パラメータ、単一行 id=1）
import { Hono } from 'hono';
import type { Env } from '../../auth';

const app = new Hono<{ Bindings: Env }>();

type WageEstimateSettingsRow = {
  hiru_weekday_base_amount: number; hiru_sat_mon_base_amount: number; hiru_holiday_base_amount: number; hiru_commission_rate: number; hiru_base_salary: number;
  yoru_weekday_base_amount: number; yoru_sat_mon_base_amount: number; yoru_holiday_base_amount: number; yoru_commission_rate: number; yoru_base_salary: number;
  kakujitsu_weekday_base_amount: number; kakujitsu_sat_mon_base_amount: number; kakujitsu_holiday_base_amount: number; kakujitsu_commission_rate: number; kakujitsu_base_salary: number;
  assumed_fare_per_ride: number; minimum_wage_hourly: number;
  hiru_kokyu_weekday_base_amount: number; hiru_kokyu_sat_mon_base_amount: number; hiru_kokyu_holiday_base_amount: number; hiru_kokyu_commission_rate: number;
  yoru_kokyu_weekday_base_amount: number; yoru_kokyu_sat_mon_base_amount: number; yoru_kokyu_holiday_base_amount: number; yoru_kokyu_commission_rate: number;
  kakujitsu_kokyu_weekday_base_amount: number; kakujitsu_kokyu_sat_mon_base_amount: number; kakujitsu_kokyu_holiday_base_amount: number; kakujitsu_kokyu_commission_rate: number;
};

app.get('/', async (c) => {
  const row = await c.env.DB.prepare('SELECT * FROM wage_estimate_settings WHERE id = 1').first<WageEstimateSettingsRow>();
  return c.json({ settings: row });
});

function validate(b: Partial<WageEstimateSettingsRow>): string | null {
  const amounts: Array<keyof WageEstimateSettingsRow> = [
    'hiru_weekday_base_amount', 'hiru_sat_mon_base_amount', 'hiru_holiday_base_amount', 'hiru_base_salary',
    'yoru_weekday_base_amount', 'yoru_sat_mon_base_amount', 'yoru_holiday_base_amount', 'yoru_base_salary',
    'kakujitsu_weekday_base_amount', 'kakujitsu_sat_mon_base_amount', 'kakujitsu_holiday_base_amount', 'kakujitsu_base_salary',
    'assumed_fare_per_ride', 'minimum_wage_hourly',
    'hiru_kokyu_weekday_base_amount', 'hiru_kokyu_sat_mon_base_amount', 'hiru_kokyu_holiday_base_amount',
    'yoru_kokyu_weekday_base_amount', 'yoru_kokyu_sat_mon_base_amount', 'yoru_kokyu_holiday_base_amount',
    'kakujitsu_kokyu_weekday_base_amount', 'kakujitsu_kokyu_sat_mon_base_amount', 'kakujitsu_kokyu_holiday_base_amount',
  ];
  for (const k of amounts) {
    const v = b[k];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 999999) return `${k}: 不正な金額です`;
  }
  const rates: Array<keyof WageEstimateSettingsRow> = [
    'hiru_commission_rate', 'yoru_commission_rate', 'kakujitsu_commission_rate',
    'hiru_kokyu_commission_rate', 'yoru_kokyu_commission_rate', 'kakujitsu_kokyu_commission_rate',
  ];
  for (const k of rates) {
    const v = b[k];
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > 1) return `${k}: 不正な歩合率です（0〜1）`;
  }
  return null;
}

app.post('/', async (c) => {
  const body = await c.req.json<Partial<WageEstimateSettingsRow>>();
  const err = validate(body);
  if (err) return c.json({ error: err }, 400);

  await c.env.DB.prepare(`
    UPDATE wage_estimate_settings SET
      hiru_weekday_base_amount = ?, hiru_sat_mon_base_amount = ?, hiru_holiday_base_amount = ?, hiru_commission_rate = ?, hiru_base_salary = ?,
      yoru_weekday_base_amount = ?, yoru_sat_mon_base_amount = ?, yoru_holiday_base_amount = ?, yoru_commission_rate = ?, yoru_base_salary = ?,
      kakujitsu_weekday_base_amount = ?, kakujitsu_sat_mon_base_amount = ?, kakujitsu_holiday_base_amount = ?, kakujitsu_commission_rate = ?, kakujitsu_base_salary = ?,
      assumed_fare_per_ride = ?, minimum_wage_hourly = ?,
      hiru_kokyu_weekday_base_amount = ?, hiru_kokyu_sat_mon_base_amount = ?, hiru_kokyu_holiday_base_amount = ?, hiru_kokyu_commission_rate = ?,
      yoru_kokyu_weekday_base_amount = ?, yoru_kokyu_sat_mon_base_amount = ?, yoru_kokyu_holiday_base_amount = ?, yoru_kokyu_commission_rate = ?,
      kakujitsu_kokyu_weekday_base_amount = ?, kakujitsu_kokyu_sat_mon_base_amount = ?, kakujitsu_kokyu_holiday_base_amount = ?, kakujitsu_kokyu_commission_rate = ?,
      updated_at = datetime('now', 'localtime')
    WHERE id = 1
  `).bind(
    body.hiru_weekday_base_amount, body.hiru_sat_mon_base_amount, body.hiru_holiday_base_amount, body.hiru_commission_rate, body.hiru_base_salary,
    body.yoru_weekday_base_amount, body.yoru_sat_mon_base_amount, body.yoru_holiday_base_amount, body.yoru_commission_rate, body.yoru_base_salary,
    body.kakujitsu_weekday_base_amount, body.kakujitsu_sat_mon_base_amount, body.kakujitsu_holiday_base_amount, body.kakujitsu_commission_rate, body.kakujitsu_base_salary,
    body.assumed_fare_per_ride, body.minimum_wage_hourly,
    body.hiru_kokyu_weekday_base_amount, body.hiru_kokyu_sat_mon_base_amount, body.hiru_kokyu_holiday_base_amount, body.hiru_kokyu_commission_rate,
    body.yoru_kokyu_weekday_base_amount, body.yoru_kokyu_sat_mon_base_amount, body.yoru_kokyu_holiday_base_amount, body.yoru_kokyu_commission_rate,
    body.kakujitsu_kokyu_weekday_base_amount, body.kakujitsu_kokyu_sat_mon_base_amount, body.kakujitsu_kokyu_holiday_base_amount, body.kakujitsu_kokyu_commission_rate,
  ).run();

  return c.json({ ok: true });
});

export default app;
