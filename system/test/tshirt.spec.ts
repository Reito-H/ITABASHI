import { SELF, env } from 'cloudflare:test';
import { describe, expect, it, beforeAll } from 'vitest';
import migration from '../src/db/migration_186.sql?raw';

// 期間限定 オリジナルTシャツ：共有URLから 社員番号（ない人は名前）→ サイズ を登録できること
const PAGE = '/ts-eb1ea85a4d61a02a88671f11baf26e48';
const jp = { 'CF-IPCountry': 'JP', 'Content-Type': 'application/json' };
const post = (path: string, body: unknown) =>
  SELF.fetch(`https://example.com/api/public/tshirt${path}`, { method: 'POST', headers: jp, body: JSON.stringify(body) });

beforeAll(async () => {
  for (const s of migration.split(';').map((x) => x.replace(/--.*$/gm, '').trim()).filter((x) => x)) await env.DB.prepare(s).run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS employees (id INTEGER PRIMARY KEY, emp_no TEXT, name TEXT, is_active INTEGER DEFAULT 1)').run();
  await env.DB.prepare("INSERT INTO employees (id, emp_no, name, is_active) VALUES (1, '1001', '山田 太郎', 1), (2, '1002', '退職 者', 0)").run();
});

describe('オリジナルTシャツ注文', () => {
  it('共有ページはログインなしで開ける', async () => {
    const res = await SELF.fetch(`https://example.com${PAGE}`, { headers: { 'CF-IPCountry': 'JP' } });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('オリジナルTシャツ');
  });

  it('社員番号（全角でも可）で登録し、登録し直すと上書きされる', async () => {
    const lk = await post('/lookup', { emp_no: '１００１' });
    expect(await lk.json()).toMatchObject({ name: '山田 太郎', current_size: null });
    expect((await post('/order', { emp_no: '1001', size: 'M' })).status).toBe(200);
    const r2 = await post('/order', { emp_no: '1001', size: 'XL' });
    expect(await r2.json()).toMatchObject({ updated: true, size: 'XL' });
    const rows = await env.DB.prepare("SELECT size FROM tshirt_orders WHERE emp_no = '1001'").all();
    expect(rows.results).toEqual([{ size: 'XL' }]);
  });

  it('名簿にない・退職者の社員番号は登録できない', async () => {
    expect((await post('/order', { emp_no: '9999', size: 'M' })).status).toBe(404);
    expect((await post('/order', { emp_no: '1002', size: 'M' })).status).toBe(404);
  });

  it('社員番号がない人は名前で登録でき、同じ名前は上書き', async () => {
    expect((await post('/order', { name: ' 外部　花子 ', size: 'S' })).status).toBe(200);
    expect(await (await post('/lookup', { name: '外部 花子' })).json()).toMatchObject({ current_size: 'S' });
    expect((await post('/order', { name: '外部 花子', size: 'L' })).status).toBe(200);
    const rows = await env.DB.prepare("SELECT name, size FROM tshirt_orders WHERE emp_no = ''").all();
    expect(rows.results).toEqual([{ name: '外部 花子', size: 'L' }]);
  });

  it('設定にないサイズ・受付終了・締切後は登録できない', async () => {
    expect((await post('/order', { emp_no: '1001', size: '5XL' })).status).toBe(400);
    await env.DB.prepare("UPDATE tshirt_settings SET deadline = '2000-01-01T00:00' WHERE id = 1").run();
    expect((await post('/order', { emp_no: '1001', size: 'M' })).status).toBe(400);
    await env.DB.prepare("UPDATE tshirt_settings SET deadline = '', is_open = 0 WHERE id = 1").run();
    expect((await post('/order', { emp_no: '1001', size: 'M' })).status).toBe(400);
    expect(await (await SELF.fetch('https://example.com/api/public/tshirt', { headers: jp })).json()).toMatchObject({ open: false });
  });

  it('管理ページはログインなしでは開けない', async () => {
    const res = await SELF.fetch('https://example.com/s7db8q6wys/admin/settings/tshirt', { headers: { 'CF-IPCountry': 'JP' }, redirect: 'manual' });
    expect(res.status).not.toBe(200);
  });
});
