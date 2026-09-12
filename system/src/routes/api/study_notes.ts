import { Hono } from 'hono';
import type { Env } from '../../auth';
import { createBook, appendPages, buildBookPdf, deleteBook, getBookInfo, MAX_PAGES_PER_PDF } from '../../utils/study_notes';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

async function getUsername(db: D1Database, adminId: number): Promise<string | null> {
  const row = await db.prepare('SELECT username FROM admins WHERE id = ?').bind(adminId).first<{ username: string }>();
  return row?.username ?? null;
}

function pad(n: number): string {
  return String(n).padStart(4, '0');
}

// 新規タイトル作成
app.post('/', async (c) => {
  let body: { title?: string };
  try { body = await c.req.json(); } catch { return c.json({ error: '不正なリクエスト' }, 400); }

  const title = (body.title ?? '').trim();
  if (!title) return c.json({ error: 'タイトルを入力してください' }, 400);

  const adminId = c.get('adminId');
  const createdBy = adminId ? await getUsername(c.env.DB, adminId) : null;
  const id = await createBook(c.env.DB, title, createdBy);

  return c.json({ ok: true, id });
});

// ページ画像の追加（multipart/form-data: files を複数）
app.post('/:id/pages', async (c) => {
  const id = parseInt(c.req.param('id'));

  let form: FormData;
  try { form = await c.req.formData(); } catch { return c.json({ error: '不正なリクエスト' }, 400); }
  const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return c.json({ error: 'ファイルを選択してください' }, 400);

  const result = await appendPages(c.env, id, files);
  if ('error' in result) return c.json({ error: result.error }, result.status as 400 | 404);
  return c.json({ ok: true, ...result });
});

// 1ページ分の画像を取得（プレビュー用）
app.get('/:id/pages/:num', async (c) => {
  const id = parseInt(c.req.param('id'));
  const num = parseInt(c.req.param('num'));
  const prefix = `study-notes/${id}/page-${pad(num)}.`;
  const listed = await c.env.STUDY_NOTES_BUCKET.list({ prefix });
  const key = listed.objects[0]?.key;
  if (!key) return c.json({ error: '見つかりません' }, 404);

  const obj = await c.env.STUDY_NOTES_BUCKET.get(key);
  if (!obj) return c.json({ error: '見つかりません' }, 404);

  const headers = new Headers();
  headers.set('Content-Type', obj.httpMetadata?.contentType || 'application/octet-stream');
  return new Response(obj.body, { headers });
});

// タイトル・ページ数の取得（大きい本をfrom/toで分割取得する際の下調べ用）
app.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const info = await getBookInfo(c.env.DB, id);
  if (!info) return c.json({ error: '見つかりません' }, 404);
  return c.json({ ok: true, ...info, max_pages_per_pdf: MAX_PAGES_PER_PDF });
});

// ページを結合したPDFを生成して返す（?from=&to= で範囲指定。省略時は
// ページ数がMAX_PAGES_PER_PDF以下ならまとめて、超える場合はエラーになる）
app.get('/:id/pdf', async (c) => {
  const id = parseInt(c.req.param('id'));
  const from = c.req.query('from') ? parseInt(c.req.query('from')!) : undefined;
  const to = c.req.query('to') ? parseInt(c.req.query('to')!) : undefined;
  const result = await buildBookPdf(c.env, id, from, to);
  if ('error' in result) return c.json({ error: result.error }, result.status as 400 | 404);

  return new Response(result.bytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(result.title)}.pdf"`,
    },
  });
});

// タイトルごと削除（ページ画像も含めて完全削除）
app.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const ok = await deleteBook(c.env, id);
  if (!ok) return c.json({ error: '見つかりません' }, 404);
  return c.json({ ok: true });
});

export default app;
