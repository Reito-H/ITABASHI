// シャトルバス（左サイドバー「シャトルバス」）
//   ページ: /shuttle
//   API   : /api/shuttle/trips（管理パス配下）
//   閲覧  : 管理画面アカウントなら誰でも可（index.ts でページ権限チェックを免除・便利と同じ扱い）
//   編集  : フル権限アカウント（admins.permissions IS NULL）のみ。制限アカウントは常に閲覧のみ
import { Hono } from 'hono';
import type { Env } from '../auth';
import { layout } from '../html/layout';
import { shuttlePage, type ShuttleTrip } from '../html/shuttle';
import { getAdminPermissions } from '../permissions';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

const DESTINATIONS = ['北赤羽駅', '東武練馬駅'];
const HHMM = /^([01]?\d|2[0-3]):[0-5]\d$/;

async function canEdit(c: { env: Env; get: (k: 'adminId') => number }): Promise<boolean> {
  const perms = await getAdminPermissions(c.env.DB, c.get('adminId'));
  return perms === null;
}

function requireEdit(c: { json: (body: unknown, status: 403) => Response }, editable: boolean): Response | null {
  if (!editable) return c.json({ error: 'この操作はフル権限アカウントのみ行えます' }, 403);
  return null;
}

// 'H:MM' / 'HH:MM' を 'HH:MM'（ゼロ埋め）へ。不正なら null
function normHHMM(v: unknown): string | null {
  const s = String(v ?? '').trim();
  if (!HHMM.test(s)) return null;
  const [h, m] = s.split(':');
  return h.padStart(2, '0') + ':' + m;
}

function parseBody(b: Record<string, unknown>): { row: Omit<ShuttleTrip, 'id'> } | { error: string } {
  const destination = String(b.destination ?? '').trim();
  if (!DESTINATIONS.includes(destination)) return { error: '行先は「北赤羽駅」「東武練馬駅」から選んでください' };
  const depart_office = normHHMM(b.depart_office);
  const depart_dest = normHHMM(b.depart_dest);
  const arrive_office = normHHMM(b.arrive_office);
  if (!depart_office || !depart_dest || !arrive_office) return { error: '時刻は HH:MM 形式で入力してください' };
  if (!(depart_office <= depart_dest && depart_dest <= arrive_office)) {
    return { error: '時刻は「営業所発 ≦ 折返発 ≦ 営業所着」の順にしてください' };
  }
  return { row: { destination, depart_office, depart_dest, arrive_office } };
}

async function loadTrips(db: D1Database): Promise<ShuttleTrip[]> {
  const res = await db.prepare(
    `SELECT id, destination, depart_office, depart_dest, arrive_office
       FROM shuttle_trips WHERE is_active = 1
      ORDER BY depart_office, id`
  ).all<ShuttleTrip>();
  return res.results ?? [];
}

// ===== ページ =====
app.get('/shuttle', async (c) => {
  const [editable, trips] = await Promise.all([canEdit(c), loadTrips(c.env.DB)]);
  return c.html(layout('シャトルバス', shuttlePage(trips, editable), 'shuttle'));
});

// ===== API =====
app.get('/api/shuttle/trips', async (c) => {
  return c.json({ trips: await loadTrips(c.env.DB) });
});

app.post('/api/shuttle/trips', async (c) => {
  const editable = await canEdit(c);
  const denied = requireEdit(c, editable); if (denied) return denied;
  const parsed = parseBody(await c.req.json<Record<string, unknown>>());
  if ('error' in parsed) return c.json({ error: parsed.error }, 400);
  const r = parsed.row;
  const result = await c.env.DB.prepare(
    `INSERT INTO shuttle_trips (destination, depart_office, depart_dest, arrive_office) VALUES (?, ?, ?, ?)`
  ).bind(r.destination, r.depart_office, r.depart_dest, r.arrive_office).run();
  return c.json({ ok: true, id: result.meta.last_row_id });
});

app.put('/api/shuttle/trips/:id', async (c) => {
  const editable = await canEdit(c);
  const denied = requireEdit(c, editable); if (denied) return denied;
  const id = parseInt(c.req.param('id'), 10);
  const found = await c.env.DB.prepare('SELECT id FROM shuttle_trips WHERE id = ?').bind(id).first<{ id: number }>();
  if (!found) return c.json({ error: '便が見つかりません' }, 404);
  const parsed = parseBody(await c.req.json<Record<string, unknown>>());
  if ('error' in parsed) return c.json({ error: parsed.error }, 400);
  const r = parsed.row;
  await c.env.DB.prepare(
    `UPDATE shuttle_trips SET destination = ?, depart_office = ?, depart_dest = ?, arrive_office = ?,
            updated_at = datetime('now','localtime')
      WHERE id = ?`
  ).bind(r.destination, r.depart_office, r.depart_dest, r.arrive_office, id).run();
  return c.json({ ok: true });
});

app.delete('/api/shuttle/trips/:id', async (c) => {
  const editable = await canEdit(c);
  const denied = requireEdit(c, editable); if (denied) return denied;
  const id = parseInt(c.req.param('id'), 10);
  await c.env.DB.prepare('DELETE FROM shuttle_trips WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

export default app;
