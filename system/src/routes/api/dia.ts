// 勤務ダイヤマスター・サイクルマスター API
// /api/dia/master ... ダイヤマスター CRUD
// /api/dia/cycles ... サイクル CRUD

import { Hono } from 'hono';
import type { Env } from '../../auth';

const app = new Hono<{ Bindings: Env }>();

// 時刻は "HH:MM"。24時越え表記（例 29:00）も許容する
const TIME_RE = /^\d{1,2}:\d{2}$/;

// dia_master の編集可能カラム（code/name 以外の任意項目）
const DIA_TIME_COLS = [
  'kosoku_start', 'kosoku_end', 'kosoku_time',
  'shotei_start', 'shotei_end', 'shotei_time',
  'zangyo_start', 'zangyo_end', 'zangyo_time',
  'shinya_start', 'shinya_end', 'shinya_time',
  'kyukei1_start', 'kyukei1_end', 'kyukei1_time',
  'kyukei2_start', 'kyukei2_end', 'kyukei2_time',
  'kyukei3_start', 'kyukei3_end', 'kyukei3_time',
  'kyukei4_start', 'kyukei4_end', 'kyukei4_time',
  'std_kosoku_max', 'std_kosoku_min',
  'std_handle_max', 'std_handle_min',
  'std_kutei_max', 'std_kutei_min',
] as const;
const DIA_INT_COLS = ['std_eishu', 'std_run_max', 'std_run_min'] as const;

type DiaBody = Record<string, unknown>;

// リクエストボディを検証し、INSERT/UPDATE用の [カラム, 値] 配列を返す（不正なら文字列 = エラー）
function validateDia(body: DiaBody): Array<[string, string | number]> | string {
  const cols: Array<[string, string | number]> = [];
  const code = Number(body.code);
  if (!Number.isInteger(code) || code < 0 || code > 9999) return 'コードは0〜9999の整数で入力してください';
  cols.push(['code', code]);
  const name = String(body.name ?? '').trim();
  if (!name) return 'ダイヤ名は必須です';
  cols.push(['name', name]);
  cols.push(['category', String(body.category ?? '出勤').trim() || '出勤']);
  cols.push(['symbol', String(body.symbol ?? '').trim()]);
  const days = Number(body.days);
  if (!Number.isFinite(days) || days < 0 || days > 9) return '日数は0〜9で入力してください';
  cols.push(['days', days]);
  for (const col of DIA_TIME_COLS) {
    const v = String(body[col] ?? '00:00').trim() || '00:00';
    if (!TIME_RE.test(v)) return `時刻の形式が不正です（${col}: ${v}）。例 07:45`;
    cols.push([col, v]);
  }
  for (const col of DIA_INT_COLS) {
    const v = Number(body[col] ?? 0);
    if (!Number.isFinite(v) || v < 0) return '営収・走行距離は0以上の数値で入力してください';
    cols.push([col, Math.round(v)]);
  }
  return cols;
}

// ===== ダイヤマスター =====

app.get('/master', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM dia_master ORDER BY code').all();
  return c.json({ items: rows.results });
});

app.post('/master', async (c) => {
  const body = await c.req.json<DiaBody>();
  const cols = validateDia(body);
  if (typeof cols === 'string') return c.json({ error: cols }, 400);
  try {
    const r = await c.env.DB.prepare(
      `INSERT INTO dia_master (${cols.map(([k]) => k).join(',')}) VALUES (${cols.map(() => '?').join(',')})`
    ).bind(...cols.map(([, v]) => v)).run();
    return c.json({ ok: true, id: r.meta.last_row_id });
  } catch {
    return c.json({ error: '同じコードのダイヤがすでに存在します' }, 409);
  }
});

app.put('/master/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const body = await c.req.json<DiaBody>();
  // 表示/非表示のみの切替
  if (Object.keys(body).length === 1 && 'is_active' in body) {
    await c.env.DB.prepare('UPDATE dia_master SET is_active = ?, updated_at = datetime(\'now\', \'localtime\') WHERE id = ?')
      .bind(body.is_active ? 1 : 0, id).run();
    return c.json({ ok: true });
  }
  const cols = validateDia(body);
  if (typeof cols === 'string') return c.json({ error: cols }, 400);
  try {
    await c.env.DB.prepare(
      `UPDATE dia_master SET ${cols.map(([k]) => `${k} = ?`).join(', ')}, updated_at = datetime('now', 'localtime') WHERE id = ?`
    ).bind(...cols.map(([, v]) => v), id).run();
    return c.json({ ok: true });
  } catch {
    return c.json({ error: '同じコードのダイヤがすでに存在します' }, 409);
  }
});

app.delete('/master/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  await c.env.DB.prepare('DELETE FROM dia_master WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// ===== サイクル =====

type CycleBody = { cycle_no?: unknown; name?: unknown; days?: unknown; pattern?: unknown };

function validateCycle(body: CycleBody): { cycle_no: number; name: string; days: number; pattern: string } | string {
  const cycle_no = Number(body.cycle_no);
  if (!Number.isInteger(cycle_no) || cycle_no < 0 || cycle_no > 999) return 'サイクル番号は0〜999の整数で入力してください';
  const name = String(body.name ?? '').trim();
  if (!name) return 'サイクル名は必須です';
  const days = Number(body.days);
  if (!Number.isInteger(days) || days < 1 || days > 40) return '日数は1〜40で入力してください';
  if (!Array.isArray(body.pattern)) return 'パターンが不正です';
  const pattern = body.pattern.map(v => String(v ?? '').trim().slice(0, 4));
  if (pattern.length !== days) return `パターンのマス数（${pattern.length}）が日数（${days}）と一致しません`;
  return { cycle_no, name, days, pattern: JSON.stringify(pattern) };
}

app.get('/cycles', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM dia_cycles ORDER BY cycle_no').all();
  return c.json({ items: rows.results });
});

app.post('/cycles', async (c) => {
  const v = validateCycle(await c.req.json<CycleBody>());
  if (typeof v === 'string') return c.json({ error: v }, 400);
  try {
    const r = await c.env.DB.prepare(
      'INSERT INTO dia_cycles (cycle_no, name, days, pattern) VALUES (?, ?, ?, ?)'
    ).bind(v.cycle_no, v.name, v.days, v.pattern).run();
    return c.json({ ok: true, id: r.meta.last_row_id });
  } catch {
    return c.json({ error: '同じサイクル番号がすでに存在します' }, 409);
  }
});

app.put('/cycles/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const body = await c.req.json<CycleBody & { is_active?: unknown }>();
  if (Object.keys(body).length === 1 && 'is_active' in body) {
    await c.env.DB.prepare('UPDATE dia_cycles SET is_active = ?, updated_at = datetime(\'now\', \'localtime\') WHERE id = ?')
      .bind(body.is_active ? 1 : 0, id).run();
    return c.json({ ok: true });
  }
  const v = validateCycle(body);
  if (typeof v === 'string') return c.json({ error: v }, 400);
  try {
    await c.env.DB.prepare(
      'UPDATE dia_cycles SET cycle_no = ?, name = ?, days = ?, pattern = ?, updated_at = datetime(\'now\', \'localtime\') WHERE id = ?'
    ).bind(v.cycle_no, v.name, v.days, v.pattern, id).run();
    return c.json({ ok: true });
  } catch {
    return c.json({ error: '同じサイクル番号がすでに存在します' }, 409);
  }
});

app.delete('/cycles/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  await c.env.DB.prepare('DELETE FROM dia_cycles WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

export default app;
