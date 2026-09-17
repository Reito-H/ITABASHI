// 異常気象警報 注意喚起サイネージ（ログイン不要・完全公開の投影ページ）
// ページ: {WEATHER_NOTICE_PUBLIC_PATH}                 本日の発令記録を表示（既定）
//         {WEATHER_NOTICE_PUBLIC_PATH}?date=YYYY-MM-DD  指定した過去日の発令記録を表示（表示モード切り替え）
// URLの推測困難な文字列自体をアクセス制御として扱う（public_signage.ts と同じ設計）。
// 指定日の発令記録だけを、1件あたり見出し→注意文言の2枚（各5秒・計10秒）で順番に自動表示する。
import { Hono } from 'hono';
import type { Env } from '../auth';
import { WEATHER_NOTICE_PUBLIC_PATH } from '../config';
import { weatherNoticePresentPage, formatDateWithDow, type WeatherNoticeEvent } from '../html/weather_notice';

const app = new Hono<{ Bindings: Env }>();

function todayJstStr(): string {
  const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return nowJST.toISOString().split('T')[0];
}

app.get(WEATHER_NOTICE_PUBLIC_PATH, async (c) => {
  const today = todayJstStr();
  const requested = c.req.query('date') ?? '';
  const targetDate = /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : today;

  const r = await c.env.DB.prepare('SELECT * FROM weather_notice_events WHERE event_date = ? ORDER BY sort_order ASC, id ASC')
    .bind(targetDate).all<WeatherNoticeEvent>();
  const events = r.results ?? [];
  return c.html(weatherNoticePresentPage(formatDateWithDow(targetDate), events));
});

export default app;
