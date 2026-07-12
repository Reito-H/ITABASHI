import { Hono } from 'hono';
import type { Env } from '../../auth';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

export interface InspectionEntry {
  id: number;
  year_month: string;
  ka: number;
  day: number;
  han: number;
  vehicle_num: string;
  type: string;
  dep_time: string | null;
}

// 月・課のスケジュール取得
app.get('/schedule', async (c) => {
  const ym = c.req.query('ym');
  const ka = parseInt(c.req.query('ka') ?? '0');
  if (!ym || !ka) return c.json({ error: 'パラメータ不足' }, 400);

  const rows = await c.env.DB.prepare(
    'SELECT id, day, han, vehicle_num, type, dep_time FROM inspection_schedules WHERE year_month = ? AND ka = ? ORDER BY day, han, id'
  ).bind(ym, ka).all<InspectionEntry>();

  return c.json(rows.results ?? []);
});

// 特定日・全課のデータ取得（日次出力用）
app.get('/day', async (c) => {
  const ym = c.req.query('ym');
  const day = parseInt(c.req.query('day') ?? '0');
  if (!ym || !day) return c.json({ error: 'パラメータ不足' }, 400);

  const rows = await c.env.DB.prepare(
    'SELECT id, ka, day, han, vehicle_num, type, dep_time FROM inspection_schedules WHERE year_month = ? AND day = ? ORDER BY ka, han, id'
  ).bind(ym, day).all<InspectionEntry>();

  return c.json(rows.results ?? []);
});

// データのある年月一覧（過去データ閲覧用）
app.get('/months', async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT DISTINCT year_month FROM inspection_schedules ORDER BY year_month DESC'
  ).all<{ year_month: string }>();

  return c.json(rows.results ?? []);
});

// 車両追加
app.post('/schedule', async (c) => {
  const body = await c.req.json<{
    ym: string; ka: number; day: number; han: number;
    vehicle_num: string; type: string; dep_time?: string;
  }>();

  const { ym, ka, day, han, vehicle_num, type, dep_time } = body;
  if (!ym || !ka || !day || !han || !vehicle_num || !type) {
    return c.json({ error: 'パラメータ不足' }, 400);
  }

  const result = await c.env.DB.prepare(
    'INSERT INTO inspection_schedules (year_month, ka, day, han, vehicle_num, type, dep_time) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(ym, ka, day, han, vehicle_num.trim(), type, dep_time?.trim() || null).run();

  return c.json({ id: result.meta.last_row_id });
});

// 車両更新
app.put('/schedule/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const body = await c.req.json<{ vehicle_num: string; type: string; dep_time?: string }>();

  await c.env.DB.prepare(
    'UPDATE inspection_schedules SET vehicle_num = ?, type = ?, dep_time = ?, updated_at = datetime(\'now\', \'localtime\') WHERE id = ?'
  ).bind(body.vehicle_num.trim(), body.type, body.dep_time?.trim() || null, id).run();

  return c.json({ ok: true });
});

// 車両削除
app.delete('/schedule/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  await c.env.DB.prepare('DELETE FROM inspection_schedules WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// ===== 写真AI解析 =====
const INS_TYPES = new Set(['inspect', 'shaken', 'bomb', 'sub', 'recall']);

function normalizeEntries(raw: unknown): { day: number; han: number; vehicle_num: string; type: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((e: any) => ({
      day: parseInt(e?.day),
      han: parseInt(e?.han),
      vehicle_num: String(e?.vehicle_num ?? '').trim(),
      type: String(e?.type ?? '').trim(),
    }))
    .filter(e =>
      e.day >= 1 && e.day <= 31 &&
      (e.han === 1 || e.han === 2) &&
      /^[0-9A-Za-z\-]{1,6}$/.test(e.vehicle_num) &&
      INS_TYPES.has(e.type)
    );
}

// 定期点検表の写真をAI解析して車両スケジュールを抽出
app.post('/analyze', async (c) => {
  const env = c.env as Env & { GROQ_API_KEY?: string };
  if (!env.GROQ_API_KEY) return c.json({ error: 'GROQ_API_KEYが設定されていません' }, 500);

  const body = await c.req.json<{ image: string; ym?: string }>().catch(() => null);
  const image = body?.image ?? '';
  if (!image.startsWith('data:image/')) return c.json({ error: '画像データが不正です' }, 400);
  if (image.length > 5_000_000) return c.json({ error: '画像サイズが大きすぎます（縮小して再試行してください）' }, 400);

  const prompt = `あなたはタクシー会社の「定期点検表（月間予定表）」の写真を読み取るOCRアシスタントです。

表の構造:
- タイトルに「N課 定期点検表（M月）」と書かれている
- 中央の黄色い縦列が日付（1〜31）
- 日付列の左側が1つ目の班（han=1）、右側が2つ目の班（han=2）。班の名称（例:《5班》《6班》）は課によって異なるが、必ず 左側=han:1、右側=han:2 とする
- 各行に並ぶ2〜4桁の数字が車両番号。1つのセルに複数の車番が並ぶことがある

文字色の意味（typeに変換）:
- 黒 → "inspect"（点検）
- 赤 → "shaken"（車検）
- 青 → "sub"（代替）
- 黄・オレンジ → "sub"（代替）
- 緑 → "bomb"（ボンベ交換）

注意:
- 表の下部にある「メーター検査 対象車両」の欄は無視する
- 車番が書かれていない日は出力しない
- 日付の数字自体（1〜31）を車番として出力しない
- 読み取れた全ての車番を漏れなく出力する

必ず次の形式のJSONのみを出力すること:
{"ka": 課番号, "month": 月, "entries": [{"day": 日, "han": 1, "vehicle_num": "5004", "type": "inspect"}, ...]}`;

  const aiRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-4-maverick-17b-128e-instruct',
      temperature: 0,
      max_tokens: 6000,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: image } },
        ],
      }],
    }),
  });

  if (!aiRes.ok) {
    const errText = await aiRes.text();
    console.error('Groq vision API error', aiRes.status, errText);
    return c.json({ error: `AI解析エラー(${aiRes.status}): ${errText.slice(0, 200)}` }, 502);
  }

  const aiJson = await aiRes.json() as { choices: { message: { content: string } }[] };
  const content = aiJson.choices?.[0]?.message?.content ?? '';
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    return c.json({ error: 'AI応答の解析に失敗しました。もう一度お試しください' }, 502);
  }

  const entries = normalizeEntries(parsed.entries);
  if (entries.length === 0) return c.json({ error: '車両データを読み取れませんでした。写真を撮り直してお試しください' }, 422);

  return c.json({
    entries,
    detected_ka: parseInt(parsed.ka) || null,
    detected_month: parseInt(parsed.month) || null,
  });
});

// 一括登録（AI取込の確定用）
app.post('/schedule/bulk', async (c) => {
  const body = await c.req.json<{
    ym: string; ka: number; replace?: boolean;
    entries: { day: number; han: number; vehicle_num: string; type: string }[];
  }>().catch(() => null);

  if (!body?.ym || !/^\d{6}$/.test(body.ym) || !body.ka || body.ka < 1 || body.ka > 4) {
    return c.json({ error: 'パラメータ不足' }, 400);
  }
  const entries = normalizeEntries(body.entries);
  if (entries.length === 0) return c.json({ error: '登録する車両がありません' }, 400);

  const stmts = [];
  if (body.replace) {
    stmts.push(c.env.DB.prepare(
      'DELETE FROM inspection_schedules WHERE year_month = ? AND ka = ?'
    ).bind(body.ym, body.ka));
  }
  for (const e of entries) {
    stmts.push(c.env.DB.prepare(
      'INSERT INTO inspection_schedules (year_month, ka, day, han, vehicle_num, type, dep_time) VALUES (?, ?, ?, ?, ?, ?, NULL)'
    ).bind(body.ym, body.ka, e.day, e.han, e.vehicle_num, e.type));
  }
  await c.env.DB.batch(stmts);

  return c.json({ ok: true, count: entries.length });
});

// 月・課のデータ一括削除
app.delete('/schedule', async (c) => {
  const ym = c.req.query('ym');
  const ka = parseInt(c.req.query('ka') ?? '0');
  if (!ym || !ka) return c.json({ error: 'パラメータ不足' }, 400);

  await c.env.DB.prepare(
    'DELETE FROM inspection_schedules WHERE year_month = ? AND ka = ?'
  ).bind(ym, ka).run();

  return c.json({ ok: true });
});

export default app;
