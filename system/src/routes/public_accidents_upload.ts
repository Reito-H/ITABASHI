// 事故データCSVの無人アップロード（社内PCの監視スクリプト専用）
// ページ: なし（人が開く画面ではない）  API: /api/public/accidents-upload
// 通常の管理画面ログイン・ブラウザ操作を介さず、Windowsのフォルダ監視スクリプトから
// 生のCSVファイルをそのままPOSTしてもらう想定。認証は専用キー（ACCIDENTS_UPLOAD_KEY、
// wrangler secret putで設定）をヘッダーで照合するだけの、admin_accidents.ts CSVインポートと
// 同じ取込ロジック（utils/accident_csv.ts）を共有する別入口。
import { Hono } from 'hono';
import type { Env } from '../auth';
import { parseAccidentCsv, upsertAccidentRecords } from '../utils/accident_csv';

const app = new Hono<{ Bindings: Env }>();

function decodeCsvBytes(buf: ArrayBuffer): string {
  try {
    return new TextDecoder('shift-jis').decode(buf);
  } catch {
    return new TextDecoder('utf-8').decode(buf);
  }
}

app.post('/api/public/accidents-upload', async (c) => {
  const expectedKey = c.env.ACCIDENTS_UPLOAD_KEY;
  if (!expectedKey) return c.json({ error: 'アップロード機能が未設定です' }, 503);
  if (c.req.header('X-Upload-Key') !== expectedKey) return c.json({ error: '認証に失敗しました' }, 401);

  const buf = await c.req.arrayBuffer();
  if (!buf.byteLength) return c.json({ error: 'データがありません' }, 400);

  const text = decodeCsvBytes(buf);
  const parsed = parseAccidentCsv(text);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);

  const result = await upsertAccidentRecords(c.env.DB, parsed.records);
  if (!result.ok && result.imported === 0) return c.json({ error: result.errors[0] ?? '取込に失敗しました' }, 400);
  return c.json(result);
});

export default app;
