import { SELF, env } from 'cloudflare:test';
import { describe, expect, it, beforeAll } from 'vitest';
import migration from '../src/db/migration_174.sql?raw';
import migration181 from '../src/db/migration_181.sql?raw';
import migration184 from '../src/db/migration_184.sql?raw';

// ITABASHI BATTLE 2：プレゼン（台本スライド）ラウンド。ページ送り → 問題スライドだけスマホに出題 → 自動採点 → 解説スライドへ
const PUB = '/ib2-8cbb19aa8bae80ec4652540a9cb36da1c9151104';
const jp = { 'CF-IPCountry': 'JP' };
type Msg = Record<string, any>;

function client(ws: WebSocket) {
  let last: Msg | null = null;
  ws.accept();
  ws.addEventListener('message', (e) => { const m = JSON.parse(String(e.data)); if (m.t === 'state') last = m.s; });
  return {
    send: (o: Msg) => ws.send(JSON.stringify(o)),
    state: () => last as Msg,
    async until(pred: (s: Msg) => boolean, ms = 3000): Promise<Msg> {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) { if (last && pred(last)) return last; await new Promise((r) => setTimeout(r, 20)); }
      throw new Error('timeout: ' + JSON.stringify(last)?.slice(0, 400));
    },
  };
}
const run = async (sql: string) => { for (const s of sql.split(';').map((x) => x.replace(/--.*$/gm, '').trim()).filter((x) => x)) await env.DB.prepare(s).run(); };

beforeAll(async () => {
  await run(migration); await run(migration184); await run(migration181);
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS daihon_decks (id INTEGER PRIMARY KEY, title TEXT, sort_order INTEGER DEFAULT 0)').run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS daihon_slides (id INTEGER PRIMARY KEY, deck_id INTEGER, sort_order INTEGER, layout TEXT, title TEXT, body TEXT DEFAULT '', hidden INTEGER DEFAULT 0, quiz TEXT DEFAULT '')").run();
  await env.DB.prepare("INSERT INTO daihon_decks (id, title) VALUES (7, 'ハンドブック')").run();
  await env.DB.prepare(`INSERT INTO daihon_slides (id, deck_id, sort_order, layout, title, body, hidden, quiz) VALUES
    (1, 7, 0, 'cover', '表紙', '', 0, ''),
    (2, 7, 1, 'content', '非表示のスライド', '', 1, ''),
    (3, 7, 2, 'question', '車いすのお客様。断ってもいい？', '断ってもいい\n断れない', 0, '{"answer":1,"points":10,"time":20,"phone":true}'),
    (4, 7, 3, 'answer', '断れません', '', 0, ''),
    (5, 7, 4, 'question', '口頭だけの問題', 'A\nB', 0, '{"answer":0,"points":10,"time":20,"phone":false}')`).run();
  await env.DB.prepare("INSERT INTO ib2_games (id, title, is_active) VALUES (1, 'T', 1)").run();
  await env.DB.prepare("INSERT INTO ib2_roster (game_id, emp_no, name, team) VALUES (1, '1001', '山田', 'A'), (1, '1002', '佐藤', 'B')").run();
  await env.DB.prepare("INSERT INTO ib2_steps (game_id, sort_order, kind, title, config) VALUES (1, 0, 'deck', '講座 ハンドブック', '{\"deck_id\":7}')").run();
});

describe('ITABASHI BATTLE 2 プレゼン（台本スライド）', () => {
  it('スライド送り → スマホ出題 → 自動採点 → 解説スライドへ', async () => {
    const join = async (emp: string) => ((await (await SELF.fetch(`https://example.com${PUB}/api/join`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...jp }, body: JSON.stringify({ emp_no: emp }) })).json()) as Msg).token as string;
    const t1 = await join('1001'), t2 = await join('1002');
    const stub = env.BATTLE_ROOM.get(env.BATTLE_ROOM.idFromName('game-1'));
    const admin = client((await stub.fetch(new Request('https://ib2/ws', { headers: { Upgrade: 'websocket', 'X-Role': 'admin', 'X-Game': '1', 'X-Admin': 'tester' } }))).webSocket!);
    const pw = async (t: string) => client((await SELF.fetch(`https://example.com${PUB}/ws?token=${t}`, { headers: { Upgrade: 'websocket', ...jp } })).webSocket!);
    const p1 = await pw(t1), p2 = await pw(t2);

    // 非表示のスライドは出ない（4枚）。最初は表紙・問題ボタンなし
    let s = await admin.until((x) => x.step && x.step.kind === 'deck' && x.deck);
    expect(s.deck.count).toBe(4);
    expect(s.deck.url).toContain('/daihon/7/present?embed=1');
    expect(s.deck.hasQuiz).toBe(false);
    await p1.until((x) => x.step && x.step.kind === 'deck' && !x.q);

    admin.send({ t: 'act', a: 'slideNext' });
    s = await admin.until((x) => x.deck && x.deck.idx === 1);
    expect(s.deck.hasQuiz).toBe(true);
    admin.send({ t: 'act', a: 'quizStart' });
    await p1.until((x) => x.step.kind === 'choice' && x.step.fromDeck && x.phase === 'intro');
    admin.send({ t: 'act', a: 'show' });
    admin.send({ t: 'act', a: 'open' });
    await p1.until((x) => x.phase === 'open' && x.q && x.q.choices.length === 2);
    p1.send({ t: 'answer', a: '1', ms: 900 });
    p2.send({ t: 'answer', a: '0', ms: 900 });
    await admin.until((x) => x.phase === 'closed');
    admin.send({ t: 'act', a: 'reveal' });
    s = await admin.until((x) => x.phase === 'reveal');
    expect(s.teams.find((t: Msg) => t.team === 'A').score).toBe(10);
    expect(s.teams.find((t: Msg) => t.team === 'B').score).toBe(0);
    const rec = await env.DB.prepare("SELECT emp_no, correct FROM ib2_answers WHERE game_id = 1 ORDER BY emp_no").all<{ emp_no: string; correct: number }>();
    expect(rec.results).toEqual([{ emp_no: '1001', correct: 1 }, { emp_no: '1002', correct: 0 }]);

    // スライドに戻ると、次の「答え・解説」へ進む
    admin.send({ t: 'act', a: 'quizEnd' });
    s = await admin.until((x) => x.step.kind === 'deck' && x.deck && x.deck.idx === 2);
    expect(s.deck.title).toBe('断れません');
    // スマホ出題の印がない問題スライドはボタンが出ない
    admin.send({ t: 'act', a: 'slideGo', to: 3 });
    s = await admin.until((x) => x.deck && x.deck.idx === 3);
    expect(s.deck.hasQuiz).toBe(false);
    admin.send({ t: 'act', a: 'quizStart' });
    admin.send({ t: 'act', a: 'slideNext' }); // 最後のスライドより先には進まない
    await new Promise((r) => setTimeout(r, 150));
    expect(admin.state().step.kind).toBe('deck');
    expect(admin.state().deck.idx).toBe(3);
  });
});
