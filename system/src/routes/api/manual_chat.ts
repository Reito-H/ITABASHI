import { Hono } from 'hono';
import type { Env } from '../../auth';
import { queryManual } from '../../utils/manual_search';
import { isTicketQuestion, queryTicket } from '../../utils/ticket_bot';

const app = new Hono<{ Bindings: Env & { GROQ_API_KEY: string } }>();

app.post('/manual-chat', async (c) => {
  let body: { question?: string; source?: string; line_user_id?: string };
  try { body = await c.req.json(); } catch { return c.json({ error: '不正なリクエスト' }, 400); }

  const question = (body.question ?? '').trim();
  if (!question) return c.json({ error: '質問を入力してください' }, 400);
  if (!c.env.GROQ_API_KEY) return c.json({ error: 'GROQ_API_KEYが設定されていません' }, 500);

  const query = isTicketQuestion(question) ? queryTicket : queryManual;
  const answer = await query(
    c.env.DB,
    c.env.GROQ_API_KEY,
    question,
    body.source ?? 'admin',
    body.line_user_id ?? null,
  );

  return c.json({ answer });
});

export default app;
