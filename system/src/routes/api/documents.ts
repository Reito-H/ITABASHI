import { Hono } from 'hono';
import type { Env } from '../../auth';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

// アップロード可能なファイル形式（拡張子ベースで判定・PDF/Office/画像）
const ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'gif'];
const MAX_FILE_SIZE = 30 * 1024 * 1024; // 30MB

type ResourceRow = {
  id: number; title: string; category: string; filename: string | null;
  mime_type: string | null; size_bytes: number | null;
  has_text: number; uploaded_by: string | null;
  created_at: string; updated_at: string;
};

async function getUsername(db: D1Database, adminId: number): Promise<string | null> {
  const row = await db.prepare('SELECT username FROM admins WHERE id = ?').bind(adminId).first<{ username: string }>();
  return row?.username ?? null;
}

// 一覧
app.get('/', async (c) => {
  const category = c.req.query('category');
  const sql = `SELECT id, title, category, filename, mime_type, size_bytes,
      (content_text IS NOT NULL) AS has_text, uploaded_by, created_at, updated_at
    FROM resources ${category ? 'WHERE category = ?' : ''} ORDER BY created_at DESC`;
  const stmt = category ? c.env.DB.prepare(sql).bind(category) : c.env.DB.prepare(sql);
  const rows = await stmt.all<ResourceRow>();
  return c.json(rows.results ?? []);
});

// テキスト内容の取得（旧マニュアルBotデータ等、ファイル本体を持たない資料用）
app.get('/:id/content', async (c) => {
  const id = parseInt(c.req.param('id'));
  const row = await c.env.DB.prepare('SELECT title, content_text FROM resources WHERE id = ?')
    .bind(id).first<{ title: string; content_text: string | null }>();
  if (!row || row.content_text == null) return c.json({ error: '見つかりません' }, 404);
  return c.json({ title: row.title, content: row.content_text });
});

// ファイルダウンロード
app.get('/:id/file', async (c) => {
  const id = parseInt(c.req.param('id'));
  const row = await c.env.DB.prepare('SELECT filename, r2_key, mime_type FROM resources WHERE id = ?')
    .bind(id).first<{ filename: string | null; r2_key: string | null; mime_type: string | null }>();
  if (!row || !row.r2_key) return c.json({ error: '見つかりません' }, 404);

  const obj = await c.env.DOCUMENTS_BUCKET.get(row.r2_key);
  if (!obj) return c.json({ error: 'ファイルが見つかりません' }, 404);

  const headers = new Headers();
  headers.set('Content-Type', row.mime_type || 'application/octet-stream');
  headers.set('Content-Disposition', `inline; filename="${encodeURIComponent(row.filename || 'file')}"`);
  return new Response(obj.body, { headers });
});

// アップロード（multipart/form-data: title, category, file）
app.post('/', async (c) => {
  let form: FormData;
  try { form = await c.req.formData(); } catch { return c.json({ error: '不正なリクエスト' }, 400); }

  const title = String(form.get('title') ?? '').trim();
  const category = String(form.get('category') ?? '').trim() || 'その他';
  const file = form.get('file');

  if (!title) return c.json({ error: 'タイトルを入力してください' }, 400);
  if (!(file instanceof File) || file.size === 0) return c.json({ error: 'ファイルを選択してください' }, 400);
  if (file.size > MAX_FILE_SIZE) return c.json({ error: `ファイルサイズは${MAX_FILE_SIZE / 1024 / 1024}MB以下にしてください` }, 400);

  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return c.json({ error: `対応していないファイル形式です（対応形式: ${ALLOWED_EXTENSIONS.join(', ')}）` }, 400);
  }

  const adminId = c.get('adminId');
  const uploadedBy = adminId ? await getUsername(c.env.DB, adminId) : null;

  const r2Key = `documents/${crypto.randomUUID()}.${ext}`;
  await c.env.DOCUMENTS_BUCKET.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type || 'application/octet-stream' },
  });

  const result = await c.env.DB.prepare(`
    INSERT INTO resources (title, category, filename, r2_key, mime_type, size_bytes, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(title, category, file.name, r2Key, file.type || 'application/octet-stream', file.size, uploadedBy).run();

  return c.json({ ok: true, id: result.meta.last_row_id });
});

// タイトル・カテゴリの編集
app.patch('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  let body: { title?: string; category?: string };
  try { body = await c.req.json(); } catch { return c.json({ error: '不正なリクエスト' }, 400); }

  const title = (body.title ?? '').trim();
  const category = (body.category ?? '').trim();
  if (!title || !category) return c.json({ error: 'タイトルとカテゴリを入力してください' }, 400);

  await c.env.DB.prepare(`UPDATE resources SET title = ?, category = ?, updated_at = datetime('now','+9 hours') WHERE id = ?`)
    .bind(title, category, id).run();
  return c.json({ ok: true });
});

// 削除
app.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const row = await c.env.DB.prepare('SELECT r2_key FROM resources WHERE id = ?').bind(id).first<{ r2_key: string | null }>();
  if (!row) return c.json({ error: '見つかりません' }, 404);

  if (row.r2_key) await c.env.DOCUMENTS_BUCKET.delete(row.r2_key).catch(() => {});
  await c.env.DB.prepare('DELETE FROM resources WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

export default app;
