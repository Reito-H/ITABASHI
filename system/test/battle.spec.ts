import { SELF, env } from 'cloudflare:test';
import { describe, expect, it, beforeAll } from 'vitest';
import migration from '../src/db/migration_174.sql?raw';
import migration181 from '../src/db/migration_181.sql?raw';
import migration184 from '../src/db/migration_184.sql?raw';
import { loadBattleRecords, recordsCsv } from '../src/battle/records';

// ITABASHI BATTLE 2：参加 → チーム決め → 早押し → 選択クイズの自動採点 までを、実際の Durable Object で通す
const PUB = '/ib2-8cbb19aa8bae80ec4652540a9cb36da1c9151104';
const jp = { 'CF-IPCountry': 'JP' };
type Msg = Record<string, any>;

function client(ws: WebSocket) {
  const msgs: Msg[] = [];
  let last: Msg | null = null;
  ws.accept();
  ws.addEventListener('message', (e) => { const m = JSON.parse(String(e.data)); msgs.push(m); if (m.t === 'state') last = m.s; });
  return {
    send: (o: Msg) => ws.send(JSON.stringify(o)),
    state: () => last as Msg,
    msgs,
    async until(pred: (s: Msg) => boolean, ms = 3000): Promise<Msg> {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) { if (last && pred(last)) return last; await new Promise((r) => setTimeout(r, 20)); }
      throw new Error('timeout: ' + JSON.stringify(last)?.slice(0, 400));
    },
  };
}
async function adminWs() {
  const stub = env.BATTLE_ROOM.get(env.BATTLE_ROOM.idFromName('game-1'));
  const res = await stub.fetch(new Request('https://ib2/ws', { headers: { Upgrade: 'websocket', 'X-Role': 'admin', 'X-Game': '1', 'X-Admin': 'tester' } }));
  return client(res.webSocket!);
}
async function playerWs(token: string) {
  const res = await SELF.fetch(`https://example.com${PUB}/ws?token=${token}`, { headers: { Upgrade: 'websocket', ...jp } });
  expect(res.status).toBe(101);
  return client(res.webSocket!);
}
async function join(emp: string): Promise<string> {
  const res = await SELF.fetch(`https://example.com${PUB}/api/join`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...jp }, body: JSON.stringify({ emp_no: emp }) });
  const j = (await res.json()) as Msg;
  expect(res.status, JSON.stringify(j)).toBe(200);
  return j.token;
}

beforeAll(async () => {
  const stmts = migration.split(';').map((s) => s.replace(/--.*$/gm, '').trim()).filter((s) => s);
  for (const s of stmts) await env.DB.prepare(s).run();
  for (const s of migration184.split(';').map((x) => x.replace(/--.*$/gm, '').trim()).filter((x) => x)) await env.DB.prepare(s).run();
  for (const s of migration181.split(';').map((x) => x.replace(/--.*$/gm, '').trim()).filter((x) => x)) await env.DB.prepare(s).run();
  await env.DB.prepare("INSERT INTO ib2_games (id, title, is_active) VALUES (1, 'T', 1)").run();
  await env.DB.prepare("INSERT INTO ib2_roster (game_id, emp_no, name, team) VALUES (1, '1001', '山田', 'A'), (1, '1002', '佐藤', 'B'), (1, '1003', '鈴木', 'C')").run();
  // 参加受付・チーム発表・代表者決めもメニューの項目
  await env.DB.prepare("INSERT INTO ib2_steps (game_id, sort_order, kind, title, config) VALUES (1, -3, 'lobby', '参加受付', '{}'), (1, -2, 'reveal', 'チーム発表', '{}'), (1, -1, 'setup', '代表者決め', '{}')").run();
  const s1 = await env.DB.prepare("INSERT INTO ib2_steps (game_id, sort_order, kind, title, config) VALUES (1, 0, 'buzzer', '交差点', '{}')").run();
  await env.DB.prepare("INSERT INTO ib2_questions (step_id, sort_order, prompt, answer, points) VALUES (?, 0, 'この交差点は？', '大和町', 10)").bind(s1.meta.last_row_id).run();
  const s2 = await env.DB.prepare("INSERT INTO ib2_steps (game_id, sort_order, kind, title, config) VALUES (1, 1, 'choice', '○×', '{\"mode\":\"all\"}')").run();
  await env.DB.prepare("INSERT INTO ib2_questions (step_id, sort_order, prompt, choices, answer, points, time_limit) VALUES (?, 0, '復唱する', '[\"○\",\"×\"]', '0', 10, 20)").bind(s2.meta.last_row_id).run();
  await env.DB.prepare("INSERT INTO ib2_media (id, kind, r2_key, name, mime, size) VALUES (1, 'video', 'ib2/x.mp4', 'op.mp4', 'video/mp4', 10)").run();
  await env.DB.prepare("INSERT INTO ib2_steps (game_id, sort_order, kind, title, config) VALUES (1, 3, 'mygrowth', 'わたしの成長', '{}')").run();
  await env.DB.prepare("INSERT INTO ib2_steps (game_id, sort_order, kind, title, config) VALUES (1, 4, 'mysales', 'わたしの売上', '{}')").run();
  const pz = await env.DB.prepare("INSERT INTO ib2_steps (game_id, sort_order, kind, title, config) VALUES (1, 5, 'prizes', 'チーム賞', '{}')").run();
  await env.DB.prepare("INSERT INTO ib2_questions (step_id, sort_order, prompt, choices, answer, points) VALUES (?, 0, '1位賞', '[\"team\",\"1\"]', '洗車券9枚', 0), (?, 1, '最下位賞', '[\"teamLast\"]', 'ツアー', 1), (?, 2, 'タイム1位', '[\"ta\",\"1\"]', '景品X', 0)").bind(pz.meta.last_row_id, pz.meta.last_row_id, pz.meta.last_row_id).run();
  await env.DB.prepare("UPDATE ib2_questions SET seq = 'image,winner,prize,full' WHERE prompt = 'タイム1位'").run();
  await env.DB.prepare("INSERT INTO ib2_steps (game_id, sort_order, kind, title, config) VALUES (1, 6, 'announce', '打ち上げ会場', '{\"teaser\":\"最後に…\",\"reveal\":\"会場X\",\"video_id\":1}')").run();
  await env.DB.prepare("INSERT INTO ib2_timeattack (emp_no, name, seconds) VALUES ('1002', '佐藤', 41.5), ('1001', '山田', 52.0)").run();
  // ホシコン側の売上（テスト用の最小テーブル）
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS employees (id INTEGER PRIMARY KEY, emp_no TEXT, name TEXT)').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS sales_records (id INTEGER PRIMARY KEY AUTOINCREMENT, emp_id INTEGER, date TEXT, amount INTEGER, ride_count INTEGER, distance_km INTEGER, period_year INTEGER, period_month INTEGER, duty_code TEXT, start_time TEXT, return_time TEXT, labor_hours REAL)').run();
  await env.DB.prepare("INSERT INTO employees (id, emp_no, name) VALUES (1, '1001', '山田'), (2, '1002', '佐藤')").run();
  await env.DB.prepare("INSERT INTO sales_records (emp_id, date, amount, period_year, period_month, duty_code) VALUES (1, '2026-06-01', 10000, 2026, 6, 'a'), (1, '2026-06-02', 20000, 2026, 6, 'a'), (1, '2026-07-01', 30000, 2026, 7, 'D'), (2, '2026-06-03', 99999, 2026, 6, 'a')").run();
  await env.DB.prepare("INSERT INTO ib2_steps (game_id, sort_order, kind, title, config) VALUES (1, 2, 'video', 'オープニング映像', '{\"video_id\":1,\"autoplay\":true}')").run();
});

describe('ITABASHI BATTLE 2', () => {
  it('名簿にない社員番号は参加できない', async () => {
    const res = await SELF.fetch(`https://example.com${PUB}/api/join`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...jp }, body: JSON.stringify({ emp_no: '9999' }) });
    expect(res.status).toBe(404);
  });

  it('管理者画面は未認証だとログインへリダイレクトされる', async () => {
    const res = await SELF.fetch('https://example.com/s7db8q6wys/admin/ib2', { redirect: 'manual', headers: jp });
    expect([301, 302, 303, 307, 308]).toContain(res.status);
  });

  it('参加者画面は公開URLで開ける', async () => {
    const res = await SELF.fetch(`https://example.com${PUB}/`, { headers: jp });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('ITABASHI');
  });

  it('参加 → チーム決め → 早押し → 選択クイズの自動採点', async () => {
    const t1 = await join('１００１'); // 全角でも通る
    const t2 = await join('1002');
    expect(await join('1001')).toBe(t1); // 再参加は同じ token
    const admin = await adminWs();
    const p1 = await playerWs(t1);
    const p2 = await playerWs(t2);
    await p1.until((s) => s.me && s.me.team === 'A' && s.stage === 'lobby');
    await admin.until((s) => s.online === 2);

    // ロビー：最初はQRなし → 管理者の切替で表示。黒画面はいつでも出し入れできる
    expect(admin.state().lobbyQr).toBe(false);
    expect(admin.state().bgm).toBe('builtin:lobby');
    admin.send({ t: 'lobbyQr', on: true });
    await p1.until((s) => s.lobbyQr === true);
    admin.send({ t: 'blackout', on: true });
    await p1.until((s) => s.blackout === true);
    admin.send({ t: 'blackout', on: false });
    await p1.until((s) => s.blackout === false);

    // 管理者がチームを移す・参加を取り消す
    const t3 = await join('1003');
    const p3 = await playerWs(t3);
    await p3.until((s) => s.me && s.me.team === 'C');
    admin.send({ t: 'moveplayer', emp: '1003', team: 'D' });
    await p3.until((s) => s.me.team === 'D');
    const ro = await env.DB.prepare("SELECT team FROM ib2_roster WHERE game_id = 1 AND emp_no = '1003'").first<{ team: string }>();
    expect(ro!.team).toBe('D');
    admin.send({ t: 'kickplayer', emp: '1003' });
    await admin.until((s) => s.joined === 2);

    admin.send({ t: 'next' });
    await p1.until((s) => s.stage === 'reveal');
    admin.send({ t: 'next' });
    await p1.until((s) => s.stage === 'setup');
    p1.send({ t: 'leader', emp: '1001' });
    await p1.until((s) => s.me.isLeader);
    p1.send({ t: 'teamname', name: '環七ライダーズ' });
    await admin.until((s) => s.teams[0].name === '環七ライダーズ');
    admin.send({ t: 'setteam', team: 'A', name: '環七ライダーズ改' }); // 管理側からいつでも直せる
    await admin.until((s) => s.teams[0].name === '環七ライダーズ改');
    p2.send({ t: 'teamname', name: 'NG' }); // 代表者でない人は決められない
    p2.send({ t: 'leader', emp: '1001' }); // 他チームの人は代表者にできない

    // 早押し：遅く届いても反応時間が短い人が1位
    admin.send({ t: 'next' });
    await admin.until((s) => s.stage === 'step' && s.step.kind === 'buzzer' && s.phase === 'intro');
    admin.send({ t: 'act', a: 'show' });
    await admin.until((s) => s.phase === 'ready');
    admin.send({ t: 'act', a: 'open' });
    await p2.until((s) => s.phase === 'open');
    await new Promise((r) => setTimeout(r, 900));
    p2.send({ t: 'buzz', ms: 820 });
    await new Promise((r) => setTimeout(r, 60));
    p1.send({ t: 'buzz', ms: 600 });
    const j = await admin.until((s) => s.phase === 'judge' && s.buzz.length === 2);
    expect(j.buzz[0].emp).toBe('1001');
    expect(j.buzz[1].show).toBeGreaterThan(j.buzz[0].show);
    admin.send({ t: 'act', a: 'ok' });
    await admin.until((s) => s.phase === 'reveal' && s.teams[0].score === 10);

    // 選択クイズ：全員回答で自動締切 → 正解発表で正解者のチームに加点
    admin.send({ t: 'next' });
    await admin.until((s) => s.step.kind === 'choice' && s.phase === 'intro');
    admin.send({ t: 'act', a: 'show' });
    admin.send({ t: 'act', a: 'open' });
    await p1.until((s) => s.phase === 'open');
    p1.send({ t: 'answer', a: '0', ms: 1200 });
    p2.send({ t: 'answer', a: '1', ms: 1500 });
    await admin.until((s) => s.phase === 'closed');
    admin.send({ t: 'act', a: 'reveal' });
    const r = await admin.until((s) => s.phase === 'reveal');
    expect(r.teams[0].score).toBe(20);
    expect(r.teams[1].score).toBe(0);

    // 動画：入った瞬間に自動再生 → 一時停止 → 最初から
    admin.send({ t: 'next' });
    const v1 = await admin.until((s) => s.step.kind === 'video');
    expect(v1.video.playing).toBe(true);
    expect(v1.step.video).toContain('/media/1');
    await new Promise((r) => setTimeout(r, 300));
    admin.send({ t: 'act', a: 'vpause' });
    const v2 = await admin.until((s) => s.video && s.video.playing === false);
    expect(v2.video.offset).toBeGreaterThan(0.2);
    admin.send({ t: 'act', a: 'vrestart' });
    const v3 = await admin.until((s) => s.video.playing === true && s.video.offset === 0);
    expect(v3.bgm).toBe(v1.bgm);

    // わたしの成長：本人のスマホにだけ、月度平均と前月比（6月度 15,000円 → 7月度 30,000円 = +100%）
    admin.send({ t: 'next' });
    const g1 = await p1.until((s) => s.step && s.step.kind === 'mygrowth' && s.mine);
    expect(g1.mine.months.map((m: Msg) => [m.m, m.avg, m.rate])).toEqual([[6, 15000, null], [7, 30000, 100]]);
    expect(g1.mine.days).toBeUndefined();
    const g2 = await p2.until((s) => s.step && s.step.kind === 'mygrowth' && s.mine);
    expect(g2.mine.months).toEqual([expect.objectContaining({ m: 6, avg: 99999 })]);
    const ga = await admin.until((s) => s.step && s.step.kind === 'mygrowth');
    expect(ga.mine).toBeUndefined();
    expect(JSON.stringify(ga)).not.toContain('99999');
    // わたしの売上：日ごとの明細も本人分だけ
    admin.send({ t: 'next' });
    const d1 = await p1.until((s) => s.step && s.step.kind === 'mysales' && s.mine && s.mine.days);
    expect(d1.mine.days.map((d: Msg) => d.amount)).toEqual([10000, 20000, 30000]);
    expect(JSON.stringify(d1)).not.toContain('99999');

    // 景品発表：受賞者は得点・タイムから自動。発表前の景品は参加者に送らない
    admin.send({ t: 'next' });
    const z0 = await admin.until((s) => s.step && s.step.kind === 'prizes');
    expect(z0.items.map((x: Msg) => [x.label, x.win && x.win.name])).toEqual([['1位賞', '環七ライダーズ改'], ['最下位賞', 'チームB・チームC・チームD'], ['タイム1位', '佐藤']]);
    expect(JSON.stringify(p1.state())).not.toContain('洗車券');
    admin.send({ t: 'act', a: 'revealNext' });
    const z1 = await p1.until((s) => s.step.kind === 'prizes' && s.revealN === 1);
    expect(z1.items[0].win.name).toBe('環七ライダーズ改');
    expect(z1.items[0].prize).toBeNull();
    admin.send({ t: 'act', a: 'revealNext' });
    const z2 = await p1.until((s) => s.revealN === 2);
    expect(z2.items[0].prize).toBe('洗車券9枚');
    expect(z2.items[1].win).toBeNull();
    // 最下位賞は「景品 → 受賞者」：1回目で景品だけ、2回目で受賞者
    admin.send({ t: 'act', a: 'revealNext' });
    const z3 = await p1.until((s) => s.revealN === 3);
    expect([z3.items[1].prize, z3.items[1].win]).toEqual(['ツアー', null]);
    admin.send({ t: 'act', a: 'revealNext' });
    const z4 = await p1.until((s) => s.revealN === 4);
    expect(z4.items[1].win.name).toBe('チームB・チームC・チームD');
    // 細かい順番：タイム1位は「画像 → 受賞者 → 景品の文 → 全画面」。画像だけ先に出て、景品の文はまだ送らない
    expect(z4.items[2].seq).toEqual(['image', 'winner', 'prize', 'full']);
    admin.send({ t: 'act', a: 'revealNext' });
    const z5 = await p1.until((s) => s.revealN === 5);
    expect([z5.items[2].imgOn, z5.items[2].prize, z5.items[2].win]).toEqual([true, null, null]);
    admin.send({ t: 'act', a: 'revealAll' });
    const z8 = await p1.until((s) => s.revealN === 8);
    expect([z8.items[2].full, z8.items[2].prize, z8.items[2].win.name]).toEqual([true, '景品X', '佐藤']);
    admin.send({ t: 'act', a: 'revealPrev' });
    await p1.until((s) => s.revealN === 7 && s.items[2].full === false);
    // 1行ずつ：最下位賞を「lines,winner」に。押すたびに1行ずつ届き、まだ出していない行は送らない
    await env.DB.prepare("UPDATE ib2_questions SET seq = 'lines,winner', answer = 'なんと' || char(10) || 'ツアー' WHERE prompt = '最下位賞'").run();
    admin.send({ t: 'reload' });
    const l0 = await p1.until((s) => s.items && s.items[1].steps && s.items[1].steps.join() === 'line0,line1,winner');
    expect(l0.total).toBe(9);
    for (let i = 0; i < 5; i++) admin.send({ t: 'act', a: 'revealPrev' });
    await p1.until((s) => s.revealN === 2);
    admin.send({ t: 'act', a: 'revealNext' });
    const l1 = await p1.until((s) => s.revealN === 3);
    expect([l1.items[1].prize, l1.items[1].win]).toEqual(['なんと', null]);
    admin.send({ t: 'act', a: 'revealNext' });
    const l2 = await p1.until((s) => s.revealN === 4);
    expect([l2.items[1].prize, l2.items[1].win]).toEqual(['なんと' + String.fromCharCode(10) + 'ツアー', null]);
    admin.send({ t: 'act', a: 'revealNext' });
    await p1.until((s) => s.revealN === 5 && s.items[1].win !== null);

    // 発表：予告のうちは中身を送らず、発表で動画も再生開始
    admin.send({ t: 'next' });
    const an0 = await p1.until((s) => s.step && s.step.kind === 'announce');
    expect(an0.step.teaser).toBe('最後に…');
    expect(an0.step.reveal).toBe('');
    expect(an0.step.video).toBeNull();
    admin.send({ t: 'act', a: 'revealNext' });
    const an1 = await p1.until((s) => s.revealN === 1);
    expect(an1.step.reveal).toBe('会場X');
    expect(an1.video.playing).toBe(true);

    // 個人記録：早押し正解・選択クイズの正誤・本人の答えと正解が、問題文ごと残る
    const recs = await loadBattleRecords(env.DB);
    const yamada = recs.find((x) => x.empNo === '1001')!;
    const sato = recs.find((x) => x.empNo === '1002')!;
    expect(yamada.stats).toMatchObject({ answered: 2, correct: 2, wrong: 0, buzzOk: 1 });
    expect(sato.stats).toMatchObject({ answered: 1, correct: 0, wrong: 1 });
    const miss = sato.rows.find((x) => x.kind === 'choice')!;
    expect([miss.prompt, miss.answer_label, miss.correct_label, miss.step_title]).toEqual(['復唱する', '×', '○', '○×']);
    expect(recordsCsv(recs)).toContain('復唱する');
    expect(await loadBattleRecords(env.DB, '1002')).toHaveLength(1);

    // 手動加点と、得点のDB保存
    admin.send({ t: 'score', team: 'B', delta: 5, reason: 'ナイス発言' });
    await admin.until((s) => s.teams[1].score === 5);
    const sum = await env.DB.prepare("SELECT team, SUM(delta) AS s FROM ib2_scores WHERE game_id = 1 GROUP BY team ORDER BY team").all<{ team: string; s: number }>();
    expect(sum.results).toEqual([{ team: 'A', s: 20 }, { team: 'B', s: 5 }]);

    // リセットしても記録は消さずに「無効」として残る（記録画面には出ない）
    admin.send({ t: 'reset' });
    await admin.until((s) => s.teams[0].score === 0);
    const left = await env.DB.prepare('SELECT COUNT(*) AS n, SUM(voided) AS v FROM ib2_answers').first<{ n: number; v: number }>();
    expect(left!.n).toBeGreaterThan(0);
    expect(left!.v).toBe(left!.n);
  });
});
