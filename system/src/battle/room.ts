// ITABASHI BATTLE 2 — リアルタイム進行の本体（Durable Object）
//   ゲーム1つにつき1インスタンス（idFromName('game-<id>')）。管理者・プロジェクター・参加者のスマホが
//   WebSocket でつながり、管理者の操作や参加者の回答を受けて状態を更新し、全員へ配信する。
//   ・設定（メニュー・問題・名簿・得点）は D1、進行中の状態（live）は DO の storage に保存（休止から復帰しても続きから）。
//   ・Hibernation API（acceptWebSocket）を使うので、つなぎっぱなしでも無料枠のリクエスト数をほぼ消費しない。
//   ・早押しは「各スマホで測った反応時間」で並べる。最初の押下から BUZZ_WINDOW_MS 以内に届いた分をまとめて判定し、
//     同タイムは裏でランダムに並べ、表示タイムには必ず差をつける（電波差・同着をうまく見せる）。
import type { Env } from '../auth';
import { BATTLE_PUBLIC_PATH } from '../config';
import { TEAMS, type TeamId, type StepRow, type QuestionRow, parseJson } from './types';

const BUZZ_WINDOW_MS = 350;

interface Att { role: 'player' | 'admin' | 'screen'; emp?: string; name?: string; team?: TeamId; adminName?: string }
interface Buzz { emp: string; name: string; team: TeamId; ms: number; show: number }
interface Ans { a: string; ms: number; team: TeamId; name: string }
interface QItem { id: number; prompt: string; image_id: number | null; choices: string[]; answer: string; points: number; time_limit: number; note: string }
interface Step { id: number; kind: string; title: string; config: Record<string, unknown>; qs: QItem[] }
interface QBoxItem { id: number; emp: string; name: string; team: TeamId; text: string; likes: string[] }
// 「わたしの売上」：本人のスマホにだけ送る売上データ（ホシコンの sales_records から読むだけ）
interface SalesDay { date: string; py: number; pm: number; amount: number; rides: number | null; km: number | null; duty: string | null; start: string | null; ret: string | null; hours: number | null }
interface SalesMonth { y: number; m: number; n: number; sum: number; avg: number; rate: number | null; partial: boolean }
interface MySales { months: SalesMonth[]; days: SalesDay[]; latest: string | null }
const SALES_KINDS = ['mygrowth', 'mysales'];
// 今日が属する月度（17日締め・18日始まり。18日以降は翌月度）
function currentPeriod(): { y: number; m: number } {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  let y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
  if (d.getUTCDate() >= 18) { m++; if (m > 12) { m = 1; y++; } }
  return { y, m };
}

interface Live {
  stage: 'lobby' | 'reveal' | 'setup' | 'step';
  stepIdx: number;
  phase: string;
  qIdx: number;
  openAt: number;
  deadline: number;
  buzz: Buzz[];
  buzzCursor: number;
  buzzLocked: string[];          // この問題で既に回答権を使った人
  answers: Record<string, Ans>;
  survivors: string[] | null;
  revealN: number;
  picked: number | null;
  qbox: QBoxItem[];
  bgm: string | null;            // 'builtin:battle' | 'media:12' | null
  result: unknown;               // 正解発表時の集計（画面表示用）
  awardedKey: string;            // 同じ問題に二重加点しないための印
  timerEnd: number;              // タイトル（休憩など）のタイマー
  seq: number;                   // 状態の版（画面側の演出の重複防止）
  video: { playing: boolean; offset: number; at: number }; // 動画ラウンドの再生状態（offset=秒、at=再生開始のサーバー時刻）
  lobbyQr: boolean;              // 参加受付で参加用QRを出しているか（最初はロゴだけ）
  blackout: boolean;             // トラブル時の黒画面（どの場面でも上にかぶせる）
  streakTeam: string;            // 早押しで連続正解中のチーム（コンボ演出）
  streak: number;
}

function freshLive(): Live {
  return {
    stage: 'lobby', stepIdx: 0, phase: '', qIdx: 0, openAt: 0, deadline: 0,
    buzz: [], buzzCursor: 0, buzzLocked: [], answers: {}, survivors: null, revealN: 0, picked: null,
    qbox: [], bgm: 'builtin:lobby', result: null, awardedKey: '', timerEnd: 0, seq: 0, streakTeam: '', streak: 0, video: { playing: false, offset: 0, at: 0 }, lobbyQr: false, blackout: false,
  };
}

// 画像・動画のURL。差し替えたら別URLになるよう版（ファイルサイズ）を付ける（配信側は1年キャッシュ）
const mediaVer = new Map<number, number>();
function mediaUrl(id: number | null | undefined): string | null {
  return id ? `${BATTLE_PUBLIC_PATH}/media/${id}?v=${mediaVer.get(id) ?? 0}` : null;
}

// 問題ごとに決まった並びでシャッフル（並べ替えクイズの初期表示）
function seededShuffle(n: number, seed: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  let s = (seed * 9301 + 49297) % 233280;
  for (let i = n - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  if (n > 1 && a.every((v, i) => v === i)) [a[0], a[1]] = [a[1], a[0]];
  return a;
}

export class BattleRoom {
  private state: DurableObjectState;
  private env: Env;
  private loaded = false;
  private gameId = 0;
  private live: Live = freshLive();
  private steps: Step[] = [];
  private players = new Map<string, { name: string; team: TeamId }>();
  private teams = new Map<TeamId, { name: string; leader: string }>();
  private scores = new Map<TeamId, number>();
  private timeattack: Array<{ name: string; seconds: number; note: string }> = [];
  private buzzPending: Buzz[] = [];
  private mySales = new Map<string, MySales>();
  private buzzTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  // ---------------- 読み込み ----------------
  private async ensure(gameIdHint?: number): Promise<void> {
    if (this.loaded) return;
    const storedId = await this.state.storage.get<number>('gameId');
    this.gameId = storedId ?? gameIdHint ?? 0;
    if (!storedId && this.gameId) await this.state.storage.put('gameId', this.gameId);
    const stored = await this.state.storage.get<Live>('live');
    // 参加受付などがメニューに入る前に保存された進行状態か（その場合はラウンド番号を受付ぶんずらす）
    const legacy = !!stored && !('blackout' in stored);
    this.live = { ...freshLive(), ...(stored ?? {}) };
    await this.reloadAll();
    this.loaded = true;
    this.normalizeStage(legacy);
    // 休止から戻ったときも「わたしの売上」ラウンド中なら本人データを読み直す
    const cur = this.curStep();
    if (cur && SALES_KINDS.includes(cur.kind)) await this.loadMySales(Array.from(this.players.keys()));
  }

  private async reloadAll(): Promise<void> {
    const db = this.env.DB;
    const g = this.gameId;
    const steps = (await db.prepare('SELECT * FROM ib2_steps WHERE game_id = ? ORDER BY sort_order, id').bind(g).all<StepRow>()).results ?? [];
    const ids = steps.map((s) => s.id);
    const qs: QuestionRow[] = [];
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      const r = await db.prepare(`SELECT * FROM ib2_questions WHERE step_id IN (${chunk.map(() => '?').join(',')}) ORDER BY sort_order, id`).bind(...chunk).all<QuestionRow>();
      qs.push(...(r.results ?? []));
    }
    this.steps = steps.map((s) => ({
      id: s.id, kind: s.kind, title: s.title, config: parseJson<Record<string, unknown>>(s.config, {}),
      qs: qs.filter((q) => q.step_id === s.id).map((q) => ({
        id: q.id, prompt: q.prompt, image_id: q.image_id, choices: parseJson<string[]>(q.choices, []),
        answer: q.answer, points: q.points, time_limit: q.time_limit, note: q.note,
      })),
    }));
    await this.reloadPeople();
    await this.reloadScores();
    const mv = (await db.prepare('SELECT id, size FROM ib2_media').all<{ id: number; size: number }>()).results ?? [];
    mediaVer.clear();
    for (const m of mv) mediaVer.set(m.id, m.size);
    const ta = (await db.prepare('SELECT name, seconds, note FROM ib2_timeattack ORDER BY seconds ASC, id ASC').all<{ name: string; seconds: number; note: string }>()).results ?? [];
    this.timeattack = ta;
  }

  private async reloadPeople(): Promise<void> {
    const db = this.env.DB;
    const ps = (await db.prepare('SELECT emp_no, name, team FROM ib2_players WHERE game_id = ?').bind(this.gameId).all<{ emp_no: string; name: string; team: TeamId }>()).results ?? [];
    this.players = new Map(ps.map((p) => [p.emp_no, { name: p.name, team: p.team }]));
    const ts = (await db.prepare('SELECT team, name, leader_emp FROM ib2_teams WHERE game_id = ?').bind(this.gameId).all<{ team: TeamId; name: string; leader_emp: string }>()).results ?? [];
    this.teams = new Map(TEAMS.map((t) => [t, { name: '', leader: '' }]));
    for (const t of ts) if (this.teams.has(t.team)) this.teams.set(t.team, { name: t.name, leader: t.leader_emp });
  }

  private async reloadScores(): Promise<void> {
    const r = (await this.env.DB.prepare('SELECT team, SUM(delta) AS s FROM ib2_scores WHERE game_id = ? GROUP BY team').bind(this.gameId).all<{ team: TeamId; s: number }>()).results ?? [];
    this.scores = new Map(TEAMS.map((t) => [t, 0]));
    for (const x of r) if (this.scores.has(x.team)) this.scores.set(x.team, Number(x.s) || 0);
  }

  private async save(): Promise<void> {
    this.live.seq++;
    await this.state.storage.put('live', this.live);
  }

  // ---------------- 接続 ----------------
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const gid = Number(req.headers.get('X-Game') || 0);
    await this.ensure(gid);
    if (url.pathname.endsWith('/notify')) {
      // 管理画面で設定を変えた時など、外から再読込させる
      await this.reloadAll();
      this.broadcast();
      return new Response('ok');
    }
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const role = (req.headers.get('X-Role') || 'player') as Att['role'];
    const att: Att = { role };
    if (role === 'player') {
      att.emp = req.headers.get('X-Emp') || '';
      att.name = decodeURIComponent(req.headers.get('X-Name') || '');
      att.team = (req.headers.get('X-Team') || 'A') as TeamId;
      if (!this.players.has(att.emp)) await this.reloadPeople();
      const cur = this.curStep();
      if (cur && SALES_KINDS.includes(cur.kind) && !this.mySales.has(att.emp)) await this.loadMySales([att.emp]);
    } else {
      att.adminName = decodeURIComponent(req.headers.get('X-Admin') || '');
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server, [role]);
    server.serializeAttachment(att);
    server.send(JSON.stringify({ t: 'state', s: this.view(att) }));
    // 参加者が増えたことを全員に知らせる（ロビーの名前表示）。その人の最初の接続ならポンと鳴らす
    if (role === 'player') {
      const already = this.state.getWebSockets('player').filter((w) => (w.deserializeAttachment() as Att | null)?.emp === att.emp).length > 1;
      if (!already && this.effStage() === 'lobby') this.sfx('pop');
      this.broadcast();
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    try { ws.close(); } catch { /* 既に閉じている */ }
    const att = ws.deserializeAttachment() as Att | null;
    if (att?.role === 'player') this.broadcast();
  }
  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    await this.ensure();
    const att = ws.deserializeAttachment() as Att | null;
    if (!att) return;
    let m: Record<string, unknown>;
    try { m = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)); } catch { return; }
    const t = String(m.t || '');
    if (t === 'ping') { ws.send(JSON.stringify({ t: 'pong', now: Date.now(), c: m.c })); return; }
    if (att.role === 'admin') await this.onAdmin(m, att);
    else if (att.role === 'player') await this.onPlayer(m, att, ws);
  }

  async alarm(): Promise<void> {
    await this.ensure();
    const L = this.live;
    if (L.stage === 'step' && L.phase === 'open' && L.deadline && Date.now() >= L.deadline - 50) {
      const st = this.curStep();
      if (st && st.kind !== 'buzzer' && st.kind !== 'qbox') {
        L.phase = 'closed';
        await this.save();
        this.sfx('timeup');
        this.broadcast();
      }
    }
  }

  // ---------------- 便利関数 ----------------
  private curStep(): Step | null { return this.live.stage === 'step' ? this.steps[this.live.stepIdx] ?? null : null; }
  // 参加受付・チーム発表・代表者決めもメニューの1項目。画面側には従来どおり stage 名で伝える
  private effStage(): 'lobby' | 'reveal' | 'setup' | 'step' {
    const st = this.curStep();
    return st && (st.kind === 'lobby' || st.kind === 'reveal' || st.kind === 'setup') ? st.kind : 'step';
  }
  // 以前の固定の参加受付（stage='lobby' など）や最初の状態を、メニュー上の該当項目に置き換える
  private normalizeStage(legacy = false): void {
    const L = this.live;
    if (L.stage === 'step' && legacy) {
      let head = 0;
      while (head < this.steps.length && ['lobby', 'reveal', 'setup'].includes(this.steps[head].kind)) head++;
      L.stepIdx += head;
    }
    if (L.stage === 'step') { if (L.stepIdx >= this.steps.length) L.stepIdx = Math.max(0, this.steps.length - 1); return; }
    const want = L.stage;
    const idx = this.steps.findIndex((s) => s.kind === want);
    this.enterStep(idx >= 0 ? idx : 0);
  }
  private curQ(): QItem | null { const s = this.curStep(); return s ? s.qs[this.live.qIdx] ?? null : null; }
  private online(): Set<string> {
    const set = new Set<string>();
    for (const ws of this.state.getWebSockets('player')) {
      const a = ws.deserializeAttachment() as Att | null;
      if (a?.emp) set.add(a.emp);
    }
    return set;
  }
  private send(ws: WebSocket, msg: unknown): void { try { ws.send(JSON.stringify(msg)); } catch { /* 切断済み */ } }
  // 効果音。team = 早押しのチーム別の音、delay = 前の音に続けて鳴らすまでのミリ秒
  private sfx(name: string, opts: { team?: string; delay?: number } = {}): void {
    for (const ws of this.state.getWebSockets()) this.send(ws, { t: 'sfx', name, team: opts.team, delay: opts.delay });
  }
  private broadcast(): void {
    for (const ws of this.state.getWebSockets()) {
      const att = ws.deserializeAttachment() as Att | null;
      if (att) this.send(ws, { t: 'state', s: this.view(att) });
    }
  }
  private resetQ(): void {
    const L = this.live;
    L.phase = 'ready'; L.openAt = 0; L.deadline = 0; L.buzz = []; L.buzzCursor = 0; L.buzzLocked = [];
    L.answers = {}; L.result = null; L.awardedKey = '';
    this.buzzPending = [];
  }
  private enterStep(idx: number): void {
    const L = this.live;
    L.stage = 'step';
    L.stepIdx = Math.max(0, Math.min(idx, this.steps.length - 1));
    L.qIdx = 0; L.revealN = 0; L.picked = null; L.qbox = []; L.timerEnd = 0;
    this.resetQ();
    const st = this.curStep();
    L.survivors = st && st.kind === 'choice' && st.config.survival ? Array.from(this.players.keys()) : null;
    L.phase = st && ['buzzer', 'choice', 'number', 'order', 'vote'].includes(st.kind) ? 'intro' : st?.kind === 'qbox' ? 'open' : 'show';
    const defBgm: Record<string, string> = { lobby: 'builtin:lobby', reveal: 'builtin:battle', setup: 'builtin:funk', black: 'none' };
    const bgm = st ? String(st.config.bgm || defBgm[st.kind] || '') : '';
    if (bgm) L.bgm = bgm === 'none' ? null : bgm;
    // 動画ラウンドは入った瞬間から再生（自動再生オフなら講師が「再生」を押す）
    L.video = { playing: !!(st && st.kind === 'video' && st.config.autoplay !== false && st.config.video_id), offset: 0, at: Date.now() };
  }
  private async addScore(team: TeamId, delta: number, reason: string, by: string): Promise<void> {
    if (!delta || !this.scores.has(team)) return;
    await this.env.DB.prepare('INSERT INTO ib2_scores (game_id, team, delta, reason, created_by) VALUES (?, ?, ?, ?, ?)')
      .bind(this.gameId, team, delta, reason.slice(0, 120), by.slice(0, 60)).run();
    this.scores.set(team, (this.scores.get(team) ?? 0) + delta);
    for (const ws of this.state.getWebSockets()) this.send(ws, { t: 'score', team, delta, reason });
  }

  // ---------------- 参加者の操作 ----------------
  private async onPlayer(m: Record<string, unknown>, att: Att, ws: WebSocket): Promise<void> {
    const L = this.live;
    const emp = att.emp || '';
    const me = this.players.get(emp);
    if (!me) return;
    const t = String(m.t);
    const team = me.team;
    const tm = this.teams.get(team)!;

    if (t === 'leader' && this.effStage() === 'setup') {
      const target = String(m.emp || '');
      const p = this.players.get(target);
      if (!p || p.team !== team || tm.leader) return;
      tm.leader = target;
      await this.env.DB.prepare('INSERT INTO ib2_teams (game_id, team, name, leader_emp) VALUES (?, ?, ?, ?) ON CONFLICT(game_id, team) DO UPDATE SET leader_emp = excluded.leader_emp')
        .bind(this.gameId, team, tm.name, target).run();
      this.sfx('pop');
      this.broadcast();
      return;
    }
    if (t === 'teamname' && this.effStage() === 'setup') {
      if (tm.leader !== emp) return;
      const name = String(m.name || '').trim().slice(0, 16);
      if (!name) return;
      tm.name = name;
      await this.env.DB.prepare('INSERT INTO ib2_teams (game_id, team, name, leader_emp) VALUES (?, ?, ?, ?) ON CONFLICT(game_id, team) DO UPDATE SET name = excluded.name')
        .bind(this.gameId, team, name, tm.leader).run();
      this.sfx('fanfare_short');
      this.broadcast();
      return;
    }

    const st = this.curStep();
    const q = this.curQ();
    if (!st) return;
    const leaderOnly = st.config.mode === 'leader';

    if (t === 'buzz' && st.kind === 'buzzer' && (L.phase === 'open' || L.phase === 'judge')) {
      if (L.buzzLocked.includes(emp) || L.buzz.some((b) => b.emp === emp) || this.buzzPending.some((b) => b.emp === emp)) return;
      const now = Date.now();
      const sinceOpen = Math.max(0, now - L.openAt);
      let ms = Math.round(Number(m.ms));
      if (!Number.isFinite(ms) || ms < 80 || ms > sinceOpen + 1500) ms = sinceOpen;
      const b: Buzz = { emp, name: me.name, team, ms, show: ms };
      if (L.phase === 'judge') {
        // 判定中に押した人は順番待ちの最後に並ぶ
        const last = L.buzz[L.buzz.length - 1];
        b.show = Math.max(b.ms, (last?.show ?? 0) + 40);
        L.buzz.push(b);
        await this.save();
        this.broadcast();
        return;
      }
      this.buzzPending.push(b);
      this.send(ws, { t: 'buzzed' });
      if (!this.buzzTimer) {
        this.buzzTimer = setTimeout(() => { this.buzzTimer = null; void this.resolveBuzz(); }, BUZZ_WINDOW_MS);
      }
      return;
    }

    if (t === 'answer' && q && L.phase === 'open' && ['choice', 'number', 'order', 'vote'].includes(st.kind)) {
      if (leaderOnly && tm.leader !== emp) return;
      if (L.survivors && !L.survivors.includes(emp)) return;
      if (L.answers[emp]) return; // 回答は1回だけ
      const sinceOpen = Math.max(0, Date.now() - L.openAt);
      let ms = Math.round(Number(m.ms));
      if (!Number.isFinite(ms) || ms < 0 || ms > sinceOpen + 1500) ms = sinceOpen;
      L.answers[emp] = { a: String(m.a ?? '').slice(0, 200), ms, team, name: me.name };
      await this.save();
      this.send(ws, { t: 'answered' });
      // 全員（対象者）が答えたら自動で締め切る
      const targets = this.answerTargets(st);
      if (targets.length && targets.every((e) => L.answers[e])) {
        L.phase = 'closed';
        await this.save();
        this.sfx('timeup');
      }
      this.broadcast();
      return;
    }

    if (t === 'q' && st.kind === 'qbox' && L.phase === 'open') {
      const text = String(m.text || '').trim().slice(0, 120);
      if (!text || L.qbox.filter((x) => x.emp === emp).length >= 5) return;
      const ins = await this.env.DB.prepare('INSERT INTO ib2_answers (game_id, step_id, emp_no, team, answer) VALUES (?, ?, ?, ?, ?)')
        .bind(this.gameId, st.id, emp, team, text).run();
      L.qbox.push({ id: Number(ins.meta.last_row_id), emp, name: me.name, team, text, likes: [] });
      await this.save();
      this.sfx('pop');
      this.broadcast();
      return;
    }
    if (t === 'like' && st.kind === 'qbox') {
      const it = L.qbox.find((x) => x.id === Number(m.id));
      if (!it || it.emp === emp) return;
      it.likes = it.likes.includes(emp) ? it.likes.filter((e) => e !== emp) : [...it.likes, emp];
      await this.save();
      this.broadcast();
    }
  }

  private answerTargets(st: Step): string[] {
    const L = this.live;
    const on = this.online();
    if (st.config.mode === 'leader') {
      return TEAMS.map((t) => this.teams.get(t)?.leader || '').filter((e) => e && on.has(e));
    }
    const base = L.survivors ?? Array.from(this.players.keys());
    return base.filter((e) => on.has(e));
  }

  private async resolveBuzz(): Promise<void> {
    const L = this.live;
    const pend = this.buzzPending;
    this.buzzPending = [];
    if (!pend.length || this.curStep()?.kind !== 'buzzer') return;
    // 反応時間で並べ、同タイムはランダム。表示タイムは必ず差をつける
    pend.forEach((b) => { (b as Buzz & { r: number }).r = Math.random(); });
    pend.sort((a, b) => a.ms - b.ms || (a as Buzz & { r: number }).r - (b as Buzz & { r: number }).r);
    let prev = L.buzz.length ? L.buzz[L.buzz.length - 1].show : -1;
    for (const b of pend) {
      b.show = prev < 0 ? b.ms : Math.max(b.ms, prev + 30 + Math.floor(Math.random() * 50));
      prev = b.show;
      delete (b as Buzz & { r?: number }).r;
      L.buzz.push(b);
    }
    if (L.phase === 'open') { L.phase = 'judge'; L.buzzCursor = L.buzz.findIndex((b) => !L.buzzLocked.includes(b.emp)); if (L.buzzCursor < 0) L.buzzCursor = 0; }
    await this.save();
    this.sfx('buzz', { team: L.buzz[0]?.team });
    this.broadcast();
  }

  // ---------------- 管理者の操作 ----------------
  private async onAdmin(m: Record<string, unknown>, att: Att): Promise<void> {
    const L = this.live;
    const t = String(m.t);
    const by = att.adminName || '';
    if (t === 'reload') { await this.reloadAll(); this.broadcast(); return; }
    if (t === 'sfx') { this.sfx(String(m.name || '').slice(0, 30)); return; }
    if (t === 'bgm') { L.bgm = m.key ? String(m.key) : null; await this.save(); this.broadcast(); return; }
    if (t === 'score') {
      const team = String(m.team) as TeamId;
      const delta = Math.round(Number(m.delta) || 0);
      await this.addScore(team, delta, String(m.reason || '手動'), by);
      this.sfx(delta >= 10 ? 'scoreBig' : delta > 0 ? (Math.random() < 0.5 ? 'score' : 'coin') : 'wrong');
      await this.save();
      this.broadcast();
      return;
    }
    if (t === 'setteam') {
      // 管理画面からチーム名・代表者を直す
      const team = String(m.team) as TeamId;
      const tm = this.teams.get(team);
      if (!tm) return;
      if (typeof m.name === 'string') tm.name = m.name.trim().slice(0, 16);
      if (typeof m.leader === 'string') tm.leader = m.leader;
      await this.env.DB.prepare('INSERT INTO ib2_teams (game_id, team, name, leader_emp) VALUES (?, ?, ?, ?) ON CONFLICT(game_id, team) DO UPDATE SET name = excluded.name, leader_emp = excluded.leader_emp')
        .bind(this.gameId, team, tm.name, tm.leader).run();
      this.broadcast();
      return;
    }
    if (t === 'blackout') {
      L.blackout = typeof m.on === 'boolean' ? m.on : !L.blackout;
      await this.save(); this.broadcast(); return;
    }
    if (t === 'lobbyQr') {
      L.lobbyQr = typeof m.on === 'boolean' ? m.on : !L.lobbyQr;
      if (L.lobbyQr) { this.sfx('reveal2'); this.sfx('sparkle', { delay: 500 }); }
      await this.save(); this.broadcast(); return;
    }
    if (t === 'moveplayer') {
      // 参加者のチームを入れ替える（名簿も合わせて直す）。代表者だった場合は元チームの代表者を外す
      const emp = String(m.emp || ''), team = String(m.team || '') as TeamId;
      const p = this.players.get(emp);
      if (!p || !this.teams.has(team) || p.team === team) return;
      const old = this.teams.get(p.team)!;
      if (old.leader === emp) {
        old.leader = '';
        await this.env.DB.prepare('UPDATE ib2_teams SET leader_emp = ? WHERE game_id = ? AND team = ?').bind('', this.gameId, p.team).run();
      }
      p.team = team;
      await this.env.DB.batch([
        this.env.DB.prepare('UPDATE ib2_players SET team = ? WHERE game_id = ? AND emp_no = ?').bind(team, this.gameId, emp),
        this.env.DB.prepare('UPDATE ib2_roster SET team = ? WHERE game_id = ? AND emp_no = ?').bind(team, this.gameId, emp),
      ]);
      for (const ws of this.state.getWebSockets('player')) {
        const a = ws.deserializeAttachment() as Att | null;
        if (a?.emp === emp) { a.team = team; ws.serializeAttachment(a); }
      }
      this.broadcast(); return;
    }
    if (t === 'kickplayer') {
      // 参加を取り消す（名簿には残るので、本人が社員番号を入れ直せば戻れる）
      const emp = String(m.emp || '');
      const p = this.players.get(emp);
      if (!p) return;
      const tm = this.teams.get(p.team);
      if (tm && tm.leader === emp) {
        tm.leader = '';
        await this.env.DB.prepare('UPDATE ib2_teams SET leader_emp = ? WHERE game_id = ? AND team = ?').bind('', this.gameId, p.team).run();
      }
      await this.env.DB.prepare('DELETE FROM ib2_players WHERE game_id = ? AND emp_no = ?').bind(this.gameId, emp).run();
      this.players.delete(emp);
      for (const ws of this.state.getWebSockets('player')) {
        const a = ws.deserializeAttachment() as Att | null;
        if (a?.emp === emp) { this.send(ws, { t: 'kicked', soft: false }); try { ws.close(4002, 'removed'); } catch { /* 済 */ } }
      }
      this.broadcast(); return;
    }
    if (t === 'reset') {
      // ゲームを最初（ロビー）から。得点・チーム名・代表者も消す
      await this.env.DB.batch([
        this.env.DB.prepare('DELETE FROM ib2_scores WHERE game_id = ?').bind(this.gameId),
        this.env.DB.prepare('DELETE FROM ib2_teams WHERE game_id = ?').bind(this.gameId),
        this.env.DB.prepare('DELETE FROM ib2_answers WHERE game_id = ?').bind(this.gameId),
      ]);
      if (m.players) await this.env.DB.prepare('DELETE FROM ib2_players WHERE game_id = ?').bind(this.gameId).run();
      this.live = freshLive();
      await this.reloadAll();
      this.normalizeStage();
      await this.save();
      for (const ws of this.state.getWebSockets('player')) this.send(ws, { t: 'kicked', soft: !m.players });
      this.broadcast();
      return;
    }
    if (t === 'next' || t === 'prev' || t === 'goto') {
      if (!this.steps.length) return;
      const to = t === 'goto' ? Number(m.i) : L.stepIdx + (t === 'next' ? 1 : -1);
      if (!Number.isFinite(to) || to < 0 || to >= this.steps.length) return;
      this.enterStep(to);
      const nk = this.curStep()?.kind;
      if (t !== 'prev') {
        if (nk === 'reveal') { this.sfx('taiko'); this.sfx('cheer', { delay: 600 }); }
        else if (nk !== 'black') this.sfx('whoosh');
      }
      const cur = this.curStep();
      if (cur && SALES_KINDS.includes(cur.kind)) await this.loadMySales(Array.from(this.players.keys()));
      else this.mySales.clear();
      await this.save();
      this.broadcast();
      return;
    }
    if (t === 'act') await this.onAct(String(m.a || ''), m, by);
  }

  // 参加者本人の売上を読み込む（月度ごとの平均と前月比も計算）。社員番号→employees.id で sales_records を引く
  private async loadMySales(emps: string[]): Promise<void> {
    const cp = currentPeriod();
    for (let i = 0; i < emps.length; i += 40) {
      const chunk = emps.slice(i, i + 40);
      const r = await this.env.DB.prepare(
        `SELECT e.emp_no, s.date, s.amount, s.ride_count, s.distance_km, s.period_year, s.period_month, s.duty_code, s.start_time, s.return_time, s.labor_hours
           FROM sales_records s JOIN employees e ON e.id = s.emp_id
          WHERE e.emp_no IN (${chunk.map(() => '?').join(',')}) ORDER BY s.date`
      ).bind(...chunk).all<{ emp_no: string; date: string; amount: number; ride_count: number | null; distance_km: number | null; period_year: number | null; period_month: number | null; duty_code: string | null; start_time: string | null; return_time: string | null; labor_hours: number | null }>();
      const byEmp = new Map<string, SalesDay[]>();
      for (const x of r.results ?? []) {
        if (!byEmp.has(x.emp_no)) byEmp.set(x.emp_no, []);
        byEmp.get(x.emp_no)!.push({ date: x.date, py: x.period_year ?? 0, pm: x.period_month ?? 0, amount: x.amount, rides: x.ride_count, km: x.distance_km, duty: x.duty_code, start: x.start_time, ret: x.return_time, hours: x.labor_hours });
      }
      for (const emp of chunk) {
        const days = byEmp.get(emp) ?? [];
        const months: SalesMonth[] = [];
        for (const d of days) {
          if (!d.py || !d.pm) continue;
          let mo = months.find((x) => x.y === d.py && x.m === d.pm);
          if (!mo) { mo = { y: d.py, m: d.pm, n: 0, sum: 0, avg: 0, rate: null, partial: d.py === cp.y && d.pm === cp.m }; months.push(mo); }
          mo.n++; mo.sum += d.amount;
        }
        months.sort((a, b) => a.y - b.y || a.m - b.m);
        months.forEach((mo, k) => {
          mo.avg = mo.n ? Math.round(mo.sum / mo.n) : 0;
          const prev = months[k - 1];
          mo.rate = prev && prev.avg ? Math.round((mo.avg / prev.avg - 1) * 1000) / 10 : null;
        });
        this.mySales.set(emp, { months, days, latest: days.length ? days[days.length - 1].date : null });
      }
    }
  }

  private async onAct(a: string, m: Record<string, unknown>, by: string): Promise<void> {
    const L = this.live;
    const st = this.curStep();
    if (!st) return;
    const q = this.curQ();
    const now = Date.now();

    if (a === 'vplay' || a === 'vpause' || a === 'vrestart') {
      if (st.kind !== 'video') return;
      const v = L.video ?? { playing: false, offset: 0, at: now };
      const pos = v.playing ? v.offset + (now - v.at) / 1000 : v.offset;
      if (a === 'vplay') L.video = { playing: true, offset: pos, at: now };
      else if (a === 'vpause') L.video = { playing: false, offset: pos, at: now };
      else L.video = { playing: true, offset: 0, at: now };
    } else if (a === 'timer') {
      // タイトル（休憩など）のタイマー開始・停止
      const min = Number(m.min ?? st.config.timer ?? 0);
      L.timerEnd = L.timerEnd ? 0 : (min > 0 ? now + min * 60000 : 0);
    } else if (a === 'show') {
      // 問題を出す（早押しは画像を出した時点から計測、他は intro→ready）
      if (L.phase === 'intro') { L.phase = 'ready'; this.sfx('quizIntro'); }
    } else if (a === 'open' && q) {
      if (L.phase !== 'ready' && L.phase !== 'intro') return;
      L.phase = 'open'; L.openAt = now;
      L.deadline = st.kind === 'buzzer' ? 0 : now + Math.max(5, q.time_limit) * 1000;
      if (L.deadline) await this.state.storage.setAlarm(L.deadline);
      this.sfx(st.kind === 'buzzer' ? 'start' : 'go');
    } else if (a === 'close') {
      if (L.phase === 'open') { L.phase = 'closed'; L.deadline = 0; this.sfx('timeup'); }
    } else if (a === 'ok' && q && st.kind === 'buzzer' && L.phase === 'judge') {
      const b = L.buzz[L.buzzCursor];
      if (!b) return;
      const key = `q${q.id}`;
      if (L.awardedKey !== key) {
        L.awardedKey = key;
        await this.addScore(b.team, q.points, `${st.title} 第${L.qIdx + 1}問 正解（${b.name}）`, by);
      }
      L.result = { winner: b.emp };
      L.phase = 'reveal';
      L.streak = L.streakTeam === b.team ? L.streak + 1 : 1;
      L.streakTeam = b.team;
      this.sfx('correct');
      if (L.streak >= 2) this.sfx('combo', { delay: 700 });
    } else if (a === 'ng' && st.kind === 'buzzer' && L.phase === 'judge') {
      const b = L.buzz[L.buzzCursor];
      if (b) L.buzzLocked.push(b.emp);
      const nextIdx = L.buzz.findIndex((x, i) => i > L.buzzCursor && !L.buzzLocked.includes(x.emp));
      if (nextIdx >= 0) L.buzzCursor = nextIdx;
      else { L.phase = 'open'; L.buzzCursor = L.buzz.length; }
      this.sfx('wrong');
    } else if (a === 'reveal' && q) {
      if (st.kind === 'buzzer') { L.phase = 'reveal'; L.result = L.result ?? { winner: null }; this.sfx('reveal'); }
      else if (['choice', 'number', 'order', 'vote'].includes(st.kind)) {
        if (L.phase === 'open') L.phase = 'closed';
        await this.settle(st, q, by);
        L.phase = 'reveal';
        this.sfx(st.kind === 'vote' ? 'reveal' : 'correct');
        const elim = (L.result as { eliminated?: string[] } | null)?.eliminated;
        if (elim && elim.length) this.sfx('eliminate', { delay: 900 });
      }
    } else if (a === 'nextq' || a === 'prevq') {
      const ni = L.qIdx + (a === 'nextq' ? 1 : -1);
      if (ni < 0 || ni >= st.qs.length) return;
      L.qIdx = ni;
      this.resetQ();
      this.sfx('whoosh');
    } else if (a === 'revealNext') {
      const total = st.kind === 'timeattack' ? Math.min(this.timeattack.length, Number(st.config.top || 10)) : st.kind === 'scoreboard' ? 4 : st.qs.length;
      if (L.revealN < total) {
        L.revealN++;
        const remaining = total - L.revealN;
        if (remaining === 0) { this.sfx(st.kind === 'scoreboard' && st.config.final ? 'victory' : 'fanfare'); this.sfx('clapCheer', { delay: 500 }); }
        else this.sfx(remaining === 1 ? 'drumroll' : 'reveal');
      }
    } else if (a === 'revealAll') {
      const total = st.kind === 'timeattack' ? Math.min(this.timeattack.length, Number(st.config.top || 10)) : st.kind === 'scoreboard' ? 4 : st.qs.length;
      L.revealN = total;
      this.sfx('fanfare');
      this.sfx('clapCheer', { delay: 500 });
    } else if (a === 'drumroll') {
      this.sfx('drumroll');
      return;
    } else if (a === 'qboxToggle' && st.kind === 'qbox') {
      L.phase = L.phase === 'open' ? 'closed' : 'open';
    } else if (a === 'pick' && st.kind === 'qbox') {
      L.picked = L.picked === Number(m.id) ? null : Number(m.id);
      if (L.picked) this.sfx('reveal');
    } else if (a === 'survivalAward' && st.kind === 'choice' && L.survivors) {
      const key = `surv${st.id}`;
      if (L.awardedKey !== key) {
        L.awardedKey = key;
        const pts = Number(st.config.survivalPoints || 0);
        for (const e of L.survivors) {
          const p = this.players.get(e);
          if (p && pts) await this.addScore(p.team, pts, `${st.title} 生き残り（${p.name}）`, by);
        }
        L.phase = 'survived';
        this.sfx('survive');
        this.sfx('applause', { delay: 600 });
      }
    } else return;
    await this.save();
    this.broadcast();
  }

  // 正解発表時の集計と自動加点
  private async settle(st: Step, q: QItem, by: string): Promise<void> {
    const L = this.live;
    const key = `q${q.id}`;
    const already = L.awardedKey === key;
    L.awardedKey = key;
    const ans = L.answers;
    const entries = Object.entries(ans);
    const award = async (team: TeamId, pts: number, why: string) => { if (!already && pts) await this.addScore(team, pts, why, by); };
    const label = `${st.title} 第${L.qIdx + 1}問`;

    // 記録
    if (!already && entries.length) {
      const stmts = entries.map(([emp, v]) => this.env.DB.prepare(
        'INSERT INTO ib2_answers (game_id, step_id, question_id, emp_no, team, answer, ms) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(this.gameId, st.id, q.id, emp, v.team, v.a, v.ms));
      for (let i = 0; i < stmts.length; i += 40) await this.env.DB.batch(stmts.slice(i, i + 40));
    }

    if (st.kind === 'choice' || st.kind === 'vote') {
      const dist = q.choices.map((_, i) => entries.filter(([, v]) => v.a === String(i)).length);
      if (st.kind === 'vote') { L.result = { dist }; return; }
      const correctIdx = String(q.answer);
      const correct = entries.filter(([, v]) => v.a === correctIdx).map(([emp]) => emp);
      const byTeam: Record<string, number> = {};
      for (const e of correct) { const tm = ans[e].team; byTeam[tm] = (byTeam[tm] || 0) + 1; }
      for (const [tm, n] of Object.entries(byTeam)) await award(tm as TeamId, n * q.points, `${label} 正解${n}人`);
      let eliminated: string[] = [];
      if (L.survivors && !already) {
        const keep = L.survivors.filter((e) => ans[e]?.a === correctIdx);
        if (keep.length) { eliminated = L.survivors.filter((e) => !keep.includes(e)); L.survivors = keep; }
      }
      L.result = { dist, correct, eliminated };
      return;
    }
    if (st.kind === 'number') {
      const target = Number(String(q.answer).replace(/[^0-9.-]/g, ''));
      if (!String(q.answer).trim() || !Number.isFinite(target)) { L.result = { target: null, ranked: [] }; return; }
      const ranked = entries
        .map(([emp, v]) => ({ emp, name: v.name, team: v.team, val: Number(String(v.a).replace(/[^0-9.-]/g, '')), ms: v.ms }))
        .filter((x) => Number.isFinite(x.val))
        .map((x) => ({ ...x, diff: Math.abs(x.val - target) }))
        .sort((a, b) => a.diff - b.diff || a.ms - b.ms);
      const ptsList = [q.points, Math.round(q.points * 0.7), Math.round(q.points * 0.5)];
      const top = ranked.slice(0, 3);
      for (let i = 0; i < top.length; i++) await award(top[i].team, ptsList[i], `${label} ${i + 1}位（${top[i].name}）`);
      for (const x of ranked.filter((r) => r.diff === 0)) await award(x.team, q.points, `${label} ピタリ賞（${x.name}）`);
      L.result = { target, ranked: ranked.slice(0, 16) };
      return;
    }
    if (st.kind === 'order') {
      const n = q.choices.length;
      const right = Array.from({ length: n }, (_, i) => String(i)).join(',');
      const correct = entries.filter(([, v]) => v.a === right).sort((a, b) => a[1].ms - b[1].ms);
      const bonus = [5, 3, 1];
      for (let i = 0; i < correct.length; i++) {
        const [, v] = correct[i];
        await award(v.team, q.points + (bonus[i] || 0), `${label} 正解（${v.name}）`);
      }
      L.result = { correct: correct.map(([emp, v]) => ({ emp, name: v.name, team: v.team, ms: v.ms })) };
    }
  }

  // ---------------- 画面に送る状態 ----------------
  private view(att: Att): Record<string, unknown> {
    const L = this.live;
    const on = this.online();
    const st = this.curStep();
    const q = this.curQ();
    const revealed = L.phase === 'reveal' || L.phase === 'survived';
    const teams = TEAMS.map((t) => {
      const tm = this.teams.get(t) ?? { name: '', leader: '' };
      const members = Array.from(this.players.entries()).filter(([, p]) => p.team === t).map(([emp, p]) => ({ emp, name: p.name, online: on.has(emp) }));
      return { team: t, name: tm.name, leader: tm.leader, leaderName: this.players.get(tm.leader)?.name ?? '', score: this.scores.get(t) ?? 0, members };
    });
    const s: Record<string, unknown> = {
      seq: L.seq, now: Date.now(), stage: this.effStage(), phase: L.phase, bgm: L.bgm, lobbyQr: L.lobbyQr, blackout: L.blackout,
      stepIdx: L.stepIdx, stepCount: this.steps.length, teams,
      steps: att.role === 'admin' ? this.steps.map((x) => ({ id: x.id, kind: x.kind, title: x.title, qn: x.qs.length })) : undefined,
      joined: this.players.size, online: on.size, timerEnd: L.timerEnd,
    };
    if (st) {
      const cfg = st.config;
      s.step = { id: st.id, kind: st.kind, title: st.title, mode: cfg.mode || 'all', survival: !!cfg.survival, unit: cfg.unit || '', zoom: !!cfg.zoom,
        subtitle: cfg.subtitle || '', body: cfg.body || '', image: mediaUrl(Number(cfg.image_id) || null), final: !!cfg.final, timer: cfg.timer || 0,
        video: mediaUrl(Number(cfg.video_id) || null), audio: mediaUrl(Number(cfg.audio_id) || null) };
      if (st.kind === 'video') s.video = L.video ?? { playing: false, offset: 0, at: 0 };
      s.qIdx = L.qIdx; s.qCount = st.qs.length;
      if (q && ['buzzer', 'choice', 'number', 'order', 'vote'].includes(st.kind)) {
        const showQ = L.phase !== 'intro' && (st.kind !== 'buzzer' || L.phase !== 'ready');
        const order = st.kind === 'order' ? seededShuffle(q.choices.length, q.id) : null;
        s.q = {
          id: q.id, no: L.qIdx + 1, points: q.points, timeLimit: q.time_limit,
          prompt: showQ || st.kind !== 'buzzer' ? q.prompt : '',
          image: showQ ? mediaUrl(q.image_id) : null,
          choices: st.kind === 'order' ? order!.map((i) => ({ i, text: q.choices[i] })) : q.choices,
          answer: revealed || att.role === 'admin' ? q.answer : undefined,
          answerText: revealed || att.role === 'admin' ? this.answerText(st, q) : undefined,
          note: revealed ? q.note : undefined,
        };
        s.openAt = L.openAt; s.deadline = L.deadline;
        s.answered = Object.keys(L.answers).length;
        s.targets = this.answerTargets(st).length;
        if (st.kind === 'buzzer') {
          s.buzz = L.buzz.map((b) => ({ emp: b.emp, name: b.name, team: b.team, show: b.show, locked: L.buzzLocked.includes(b.emp) }));
          s.buzzCursor = L.buzzCursor;
        }
        if (L.survivors) s.survivors = L.survivors.length;
        if (revealed || att.role === 'admin') s.result = L.result;
        if (att.role === 'admin') s.answers = Object.entries(L.answers).map(([emp, v]) => ({ emp, name: v.name, team: v.team, a: v.a, ms: v.ms }));
      }
      if (st.kind === 'qbox') {
        s.qbox = L.qbox.map((x) => ({ id: x.id, name: att.role === 'player' ? undefined : x.name, team: x.team, text: x.text, likes: x.likes.length, mine: att.emp === x.emp, liked: att.emp ? x.likes.includes(att.emp) : false }))
          .sort((a, b) => b.likes - a.likes || a.id - b.id);
        s.picked = L.picked;
      }
      if (st.kind === 'ranking') {
        const total = st.qs.length;
        s.revealN = L.revealN; s.total = total;
        s.items = st.qs.map((x, i) => ({ rank: i + 1, name: x.prompt, sub: x.answer, note: x.note, image: mediaUrl(x.image_id) }))
          .filter((x) => att.role === 'admin' || x.rank > total - L.revealN);
      }
      if (st.kind === 'timeattack') {
        const top = Math.min(this.timeattack.length, Number(st.config.top || 10));
        s.revealN = L.revealN; s.total = top;
        s.items = this.timeattack.slice(0, top).map((x, i) => ({ rank: i + 1, name: x.name, seconds: x.seconds, note: x.note }))
          .filter((x) => att.role === 'admin' || x.rank > top - L.revealN);
      }
      if (st.kind === 'scoreboard') { s.revealN = L.revealN; s.total = 4; }
    }
    if (att.role === 'player' && att.emp && st && SALES_KINDS.includes(st.kind)) {
      // 本人のデータだけ。詳細（日ごと）は「わたしの売上」ラウンドのときだけ送る
      const ms = this.mySales.get(att.emp);
      s.mine = ms ? { months: ms.months, latest: ms.latest, days: st.kind === 'mysales' ? ms.days : undefined } : null;
    }
    if (att.role === 'admin' && st && SALES_KINDS.includes(st.kind)) s.salesLoaded = this.mySales.size;
    if (att.role === 'player' && att.emp) {
      const me = this.players.get(att.emp);
      const tm = me ? this.teams.get(me.team) : undefined;
      s.me = me ? {
        emp: att.emp, name: me.name, team: me.team, isLeader: tm?.leader === att.emp,
        answer: L.answers[att.emp]?.a ?? null,
        out: L.survivors ? !L.survivors.includes(att.emp) : false,
        buzzed: L.buzz.some((b) => b.emp === att.emp) || this.buzzPending.some((b) => b.emp === att.emp),
        locked: L.buzzLocked.includes(att.emp),
      } : null;
    }
    return s;
  }

  private answerText(st: Step, q: QItem): string {
    if (st.kind === 'choice') return q.choices[Number(q.answer)] ?? '';
    if (st.kind === 'order') return q.choices.join(' → ');
    if (st.kind === 'number') return `${q.answer}${String(st.config.unit || '')}`;
    return q.answer;
  }
}
