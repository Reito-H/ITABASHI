// 学習ノートの無人アップロード（Mac上のkindle_capture.shから直接アップロードするための専用入口）
// 通常の管理画面ログイン・ブラウザ操作を介さず、専用キー（STUDY_NOTES_UPLOAD_KEY、
// wrangler secret put で設定）をヘッダーで照合するだけの、admin_study_notes.ts / api/study_notes.ts と
// 同じ取込ロジック（utils/study_notes.ts）を共有する別入口。public_accidents_upload.ts と同じ方針。
import { Hono } from 'hono';
import type { Env } from '../auth';
import { findOrCreateBook, appendPages, buildBookPdf, deleteBook, getBookInfo, MAX_PAGES_PER_PDF } from '../utils/study_notes';

const app = new Hono<{ Bindings: Env }>();

function hasValidKey(c: { env: Env; req: { header: (name: string) => string | undefined } }): boolean {
  const expectedKey = c.env.STUDY_NOTES_UPLOAD_KEY;
  if (!expectedKey) return false;
  return c.req.header('X-Upload-Key') === expectedKey;
}

// タイトルで検索し、なければ作成してbook idを返す（同じ本への追記アップロードに対応するため）
app.post('/api/public/study-notes-upload/find-or-create', async (c) => {
  if (!hasValidKey(c)) return c.json({ error: '認証に失敗しました' }, 401);

  let body: { title?: string };
  try { body = await c.req.json(); } catch { return c.json({ error: '不正なリクエスト' }, 400); }
  const title = (body.title ?? '').trim();
  if (!title) return c.json({ error: 'タイトルを入力してください' }, 400);

  const result = await findOrCreateBook(c.env.DB, title, 'kindle_capture.sh');
  return c.json({ ok: true, id: result.id, created: result.created });
});

// ページ画像の追加（multipart/form-data: files を複数）
app.post('/api/public/study-notes-upload/:id/pages', async (c) => {
  if (!hasValidKey(c)) return c.json({ error: '認証に失敗しました' }, 401);

  const id = parseInt(c.req.param('id'));
  let form: FormData;
  try { form = await c.req.formData(); } catch { return c.json({ error: '不正なリクエスト' }, 400); }
  const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return c.json({ error: 'ファイルを選択してください' }, 400);

  const result = await appendPages(c.env, id, files);
  if ('error' in result) return c.json({ error: result.error }, result.status as 400 | 404);
  return c.json({ ok: true, ...result });
});

// タイトル・ページ数の取得（大きい本をfrom/toで分割取得する際の下調べ用）
app.get('/api/public/study-notes-upload/:id', async (c) => {
  if (!hasValidKey(c)) return c.json({ error: '認証に失敗しました' }, 401);

  const id = parseInt(c.req.param('id'));
  const info = await getBookInfo(c.env.DB, id);
  if (!info) return c.json({ error: '見つかりません' }, 404);
  return c.json({ ok: true, ...info, max_pages_per_pdf: MAX_PAGES_PER_PDF });
});

// ページを結合したPDFを生成して返す（?from=&to= で範囲指定。1回に生成できるのは
// MAX_PAGES_PER_PDFページまで。大きい本は呼び出し側が範囲を分けてダウンロードし、
// ローカルで結合する）
app.get('/api/public/study-notes-upload/:id/pdf', async (c) => {
  if (!hasValidKey(c)) return c.json({ error: '認証に失敗しました' }, 401);

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

// タイトルごと削除（テスト撮影のやり直し等、無人スクリプト側からの掃除用）
app.delete('/api/public/study-notes-upload/:id', async (c) => {
  if (!hasValidKey(c)) return c.json({ error: '認証に失敗しました' }, 401);

  const id = parseInt(c.req.param('id'));
  const ok = await deleteBook(c.env, id);
  if (!ok) return c.json({ error: '見つかりません' }, 404);
  return c.json({ ok: true });
});

export default app;
