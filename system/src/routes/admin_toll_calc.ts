// 高速道路料金計算（普通車・関東+群馬）ページ
// ページ: /toll-calc
// API   : /api/toll-calc/*（routes/api/toll_calc.ts。ルートAPIとして別マウント）
import { Hono } from 'hono';
import type { Env } from '../auth';
import { layout } from '../html/layout';
import { tollCalcPage } from '../html/toll_calc';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

app.get('/toll-calc', async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT id, name, kind, area_tag FROM toll_nodes ORDER BY name'
  ).all<{ id: number; name: string; kind: string; area_tag: string | null }>();
  const nodes = rows.results ?? [];
  return c.html(layout('高速料金計算', tollCalcPage(nodes), 'toll-calc'));
});

export default app;
