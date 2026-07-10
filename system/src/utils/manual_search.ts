import type { D1Database } from '@cloudflare/workers-types';

type Chunk = { id: number; section: string; content: string };

export async function queryManual(
  db: D1Database,
  apiKey: string,
  question: string,
  source: string = 'admin',
  lineUserId: string | null = null,
): Promise<string> {
  // FTS5検索（上位5件）
  const ftsResult = await db.prepare(`
    SELECT mc.id, mc.section, mc.content
    FROM manual_chunks_fts fts
    JOIN manual_chunks mc ON mc.id = fts.rowid
    WHERE manual_chunks_fts MATCH ?
    ORDER BY rank
    LIMIT 5
  `).bind(question.replace(/['"*]/g, ' ')).all<Chunk>();

  let chunks = ftsResult.results ?? [];

  // FTSミスの場合はLIKE検索にフォールバック
  if (chunks.length === 0) {
    const words = question.split(/\s+/).filter(w => w.length >= 2).slice(0, 3);
    if (words.length > 0) {
      const conds = words.map(() => 'mc.content LIKE ?').join(' OR ');
      const likeResult = await db.prepare(
        `SELECT mc.id, mc.section, mc.content FROM manual_chunks mc WHERE ${conds} LIMIT 5`
      ).bind(...words.map(w => `%${w}%`)).all<Chunk>();
      chunks = likeResult.results ?? [];
    }
  }

  const context = chunks.length > 0
    ? chunks.map(ch => `【${ch.section}】\n${ch.content}`).join('\n\n---\n\n')
    : '（関連する情報が見つかりませんでした）';

  const prompt = chunks.length > 0
    ? `あなたはタクシー乗務員向けのサポートアシスタントです。以下のマニュアル情報をもとに、質問に正確・簡潔に答えてください。マニュアルに記載のない内容は「マニュアルに記載がありません」と答えてください。

【マニュアル情報】
${context}

【質問】
${question}`
    : `あなたはタクシー乗務員向けのサポートアシスタントです。質問に答えてください。マニュアルに該当情報がないため、不確かな場合は営業所へ確認するよう案内してください。\n\n【質問】\n${question}`;

  const aiRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1024,
    }),
  });

  if (!aiRes.ok) {
    const errText = await aiRes.text();
    console.error('Groq API error', aiRes.status, errText);
    return `AI応答エラー(${aiRes.status}): ${errText.slice(0, 200)}`;
  }

  const aiJson = await aiRes.json() as { choices: { message: { content: string } }[] };
  const answer = aiJson.choices?.[0]?.message?.content ?? '回答を生成できませんでした';

  // ログ保存（失敗しても無視）
  await db.prepare(
    `INSERT INTO manual_chat_logs (source, line_user_id, question, answer) VALUES (?, ?, ?, ?)`
  ).bind(source, lineUserId, question, answer).run().catch(() => {});

  return answer;
}
