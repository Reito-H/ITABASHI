// タクコン（TAXCON）→ ホシコン CSV 自動連携（pull 方式）
//
// 板橋PCの takcon-sync（共有フォルダ監視）が http://127.0.0.1:8766 で pull API を出している。
// それを Cloudflare Tunnel（km-relay）の Public Hostname https://takcon.bentenclub.com で公開し
// （Cloudflare Access のサービストークンで保護）、ホシコンの Worker が cron（毎時）と手動実行で取りに行く。
//   GET  /health            → { ok, pending, sources:[{label,reachable}], time }
//   GET  /files             → { files:[{ name, kind, size, modified, source }] }   kind: ホシコン収集データ / 事故データCSV / 日報データCSV / 駐車料金 / オット / その他
//   GET  /file/{name}       → CSV 本体（Shift-JIS）
//   POST /ack/{name}        → 処理済みにする（次回から一覧に出ない）
//   認証: Authorization: Bearer <TAKCON_SERVE_TOKEN>（板橋PC側 config.json の serveToken と同じ値）
//
// 取込の対応状況:
//   事故データCSV       → utils/accident_csv.ts（保険会社システム出力の既存パーサー）で accidents へ upsert
//   ホシコン収集データ   → 42列形式を解析し sales_records / driving_safety_records へ upsert（社員台帳の属性は更新しない。
//                         既存の「データセンター」からの手動取込と同じ列解釈。台帳に無い社員番号の行は読み飛ばす）
//   日報データCSV / 駐車料金 / オット / その他 → 取込処理が未定義のため R2 に保存だけして status='stored'
// 元ファイルは種別を問わず R2（DOCUMENTS_BUCKET）の takcon/<種別>/<ファイル名> に保存する。
import type { Env } from '../auth';
import { getPeriod } from '../auth';
import { parseAccidentCsv, upsertAccidentRecords } from './accident_csv';

export const TAKCON_ORIGIN = 'https://takcon.bentenclub.com';
const TIMEOUT_MS = 20000;
const MAX_FILES_PER_RUN = 8; // Workers のサブリクエスト上限（50）と CPU 時間を考慮して1回あたりの件数を抑える

export type TakconFile = { name: string; kind: string; size?: number; modified?: string; source?: string };
export type TakconHealth = { ok: boolean; pending?: number; sources?: Array<{ label: string; reachable: boolean }>; time?: string };

type TakconEnv = Env & { DOCUMENTS_BUCKET?: R2Bucket; TAKCON_SERVE_TOKEN?: string; TAKCON_NO_ACK?: string };

// ローカル検証用: .dev.vars に TAKCON_NO_ACK=1 を置くと ack を送らない（板橋PC側の未処理一覧を消費しない）
async function ackFile(env: TakconEnv, name: string): Promise<boolean> {
  if (env.TAKCON_NO_ACK === '1') return true;
  const res = await call(env, `/ack/${encodeURIComponent(name)}`, { method: 'POST' }).catch(() => null);
  return !!res && res.ok;
}

function headers(env: TakconEnv, extra?: Record<string, string>): Headers {
  const h = new Headers({ 'User-Agent': 'BentenTakconSync/1.0', Accept: 'application/json, text/csv, */*' });
  if (env.KM_RELAY_ACCESS_ID && env.KM_RELAY_ACCESS_SECRET) {
    h.set('CF-Access-Client-Id', env.KM_RELAY_ACCESS_ID);
    h.set('CF-Access-Client-Secret', env.KM_RELAY_ACCESS_SECRET);
  }
  if (env.TAKCON_SERVE_TOKEN) h.set('Authorization', `Bearer ${env.TAKCON_SERVE_TOKEN}`);
  for (const [k, v] of Object.entries(extra ?? {})) h.set(k, v);
  return h;
}

async function call(env: TakconEnv, path: string, init: { method?: string } = {}): Promise<Response> {
  return fetch(TAKCON_ORIGIN + path, { method: init.method ?? 'GET', headers: headers(env), redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
}

function problem(res: Response): string | null {
  if ([502, 503, 522, 524, 530].includes(res.status)) return '板橋PC（takcon-sync）に接続できません。PCの電源・ログオン状態を確認してください。';
  if (res.headers.get('cf-access-domain') || (res.headers.get('location') ?? '').includes('cloudflareaccess.com')) return 'Cloudflare Access の認証に失敗しました（KM_RELAY_ACCESS_ID/SECRET）。';
  if (res.status === 401 || res.status === 403) return `takcon-sync の認証に失敗しました（serveToken 不一致。HTTP ${res.status}）。`;
  return null;
}

export type TakconHealthResult = { ok: true; health: TakconHealth } | { ok: false; message: string };
export async function takconHealth(env: TakconEnv): Promise<TakconHealthResult> {
  try {
    const res = await call(env, '/health');
    const p = problem(res); if (p) return { ok: false, message: p };
    const j = await res.json<TakconHealth>().catch(() => null);
    if (!j) return { ok: false, message: `/health の応答を解析できません（HTTP ${res.status}）` };
    return { ok: true, health: j };
  } catch (e) {
    return { ok: false, message: e instanceof Error && e.name === 'TimeoutError' ? '板橋PCへの接続がタイムアウトしました。' : '板橋PCに接続できませんでした。' };
  }
}

function decodeCsv(buf: ArrayBuffer): string {
  try { return new TextDecoder('shift-jis').decode(buf); } catch { return new TextDecoder('utf-8').decode(buf); }
}

// ---------- ホシコン収集データ（42列）→ 売上・安全運転データ ----------
const WORK_TYPE_MAP: Record<string, string> = {
  '日勤A': 'a', '日勤Ａ': 'a', '日勤B': 'b', '日勤Ｂ': 'b',
  'D勤': 'D', 'Ｄ勤': 'D', 'B勤': 'B', 'Ｂ勤': 'B',
  'H勤': 'H', 'Ｈ勤': 'H', '公H': 'H', '公Ｈ': 'H',
  '公B': 'b', '公Ｂ': 'b', '公D': 'D', '公Ｄ': 'D', '公a': 'a', '公ａ': 'a', '公b': 'B', '公ｂ': 'B',
  'A勤': 'a', 'Ａ勤': 'a',
};
const DUTY_CODES = ['a', 'b', 'B', 'D', 'H'];
function fmtHours(h: number | null): string | null {
  if (h == null || isNaN(h) || h < 0) return null;
  const hr = Math.floor(h) % 24, mn = Math.round((h - Math.floor(h)) * 60);
  return `${String(hr).padStart(2, '0')}:${String(Math.min(mn, 59)).padStart(2, '0')}`;
}

export type CollectionImportResult = { ok: boolean; rows: number; sales: number; safety: number; unknownEmp: number; skipped: number; errors: string[] };

export async function importCollectionCsv(db: D1Database, text: string, fromLine = 1, maxLines = Infinity): Promise<CollectionImportResult & { nextLine: number; totalLines: number; done: boolean }> {
  const lines = text.split(/\r?\n/);
  const totalLines = lines.length;
  const endLine = Math.min(totalLines, Math.max(fromLine, 1) + maxLines);
  const first = (lines[0] ?? '').split(',');
  const isHoshicon = first[0]?.trim() === '日付' && first.length >= 38;
  if (!isHoshicon) return { ok: false, rows: 0, sales: 0, safety: 0, unknownEmp: 0, skipped: 0, errors: ['ホシコン収集データの形式（1行目が「日付」で38列以上）ではありません'], nextLine: totalLines, totalLines, done: true };

  type SalesEntry = { empNo: string; date: string; dutyCode: string; amount: number; startTime: string | null; returnTime: string | null; rideCount: number | null; distanceKm: number | null; laborHours: number | null; nightHours: number | null; overtimeHours: number | null; rawCsv: string };
  type SafetyEntry = { empNo: string; date: string; v: Array<number | null> };
  const sales: SalesEntry[] = []; const safety: SafetyEntry[] = []; let rows = 0; let skipped = 0;
  const num = (s: string | undefined) => { const n = parseInt((s ?? '').trim(), 10); return isNaN(n) ? null : n; };

  for (let i = Math.max(fromLine, 1); i < endLine; i++) {
    const line = lines[i]; if (!line || !line.trim()) continue;
    const cols = line.split(','); if (cols.length < 40) { skipped++; continue; }
    rows++;
    const dateRaw = cols[0]?.trim(); const empNo = cols[5]?.trim(); const workRaw = cols[8]?.trim();
    if (!empNo || !/^\d{8}$/.test(empNo)) { skipped++; continue; }
    const m = dateRaw?.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    const isoDate = m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null;
    if (!isoDate) { skipped++; continue; }
    const duty = WORK_TYPE_MAP[workRaw ?? ''];
    const amount = parseInt(cols[21]?.trim() ?? '', 10);
    const startRaw = parseFloat(cols[38]?.trim() ?? ''); const retRaw = parseFloat(cols[39]?.trim() ?? '');
    const constraintRaw = parseFloat(cols[13]?.trim() ?? ''); const breakRaw = parseFloat(cols[14]?.trim() ?? '');
    let laborHours: number | null = null;
    if (!isNaN(constraintRaw) && !isNaN(breakRaw)) { const lh = constraintRaw - breakRaw; if (lh > 0 && lh < 24) laborHours = lh; }
    const nightRaw = parseFloat(cols[16]?.trim() ?? ''); const overtimeRaw = parseFloat(cols[17]?.trim() ?? '');
    const rideCount = num(cols[20]); const distanceRaw = parseFloat(cols[18]?.trim() ?? '');
    if (duty && !isNaN(amount) && amount >= 0 && amount <= 999999) {
      sales.push({
        empNo, date: isoDate, dutyCode: duty, amount,
        startTime: !isNaN(startRaw) && startRaw > 0 ? fmtHours(startRaw) : null,
        returnTime: !isNaN(retRaw) && retRaw > 0 ? fmtHours(retRaw) : null,
        rideCount, distanceKm: !isNaN(distanceRaw) ? Math.round(distanceRaw) : null,
        laborHours, nightHours: !isNaN(nightRaw) && nightRaw >= 0 ? nightRaw : null, overtimeHours: !isNaN(overtimeRaw) && overtimeRaw >= 0 ? overtimeRaw : null,
        rawCsv: JSON.stringify(cols),
      });
    }
    const sv = [num(cols[25]), num(cols[26]), num(cols[27]), num(cols[28]), num(cols[29]), num(cols[30]), num(cols[35]), num(cols[34]), num(cols[37]), num(cols[36])];
    if (sv.some((v) => v != null)) safety.push({ empNo, date: isoDate, v: sv });
  }

  // 社員番号 → employees.id
  const empNos = [...new Set([...sales.map((s) => s.empNo), ...safety.map((s) => s.empNo)])];
  const idMap = new Map<string, number>();
  for (let i = 0; i < empNos.length; i += 50) {
    const chunk = empNos.slice(i, i + 50);
    const r = await db.prepare(`SELECT id, emp_no FROM employees WHERE emp_no IN (${chunk.map(() => '?').join(',')})`).bind(...chunk).all<{ id: number; emp_no: string }>();
    for (const row of r.results) idMap.set(row.emp_no, row.id);
  }
  const unknownEmp = empNos.filter((n) => !idMap.has(n)).length;
  const errors: string[] = [];
  type Stmt = ReturnType<D1Database['prepare']>;
  const stmts: Stmt[] = [];
  for (const s of sales) {
    const empId = idMap.get(s.empNo); if (!empId || !DUTY_CODES.includes(s.dutyCode)) continue;
    const { year, month } = getPeriod(s.date);
    stmts.push(db.prepare(`
      INSERT INTO sales_records (emp_id, date, amount, duty_code, period_year, period_month, start_time, return_time, ride_count, distance_km, labor_hours, night_hours, overtime_hours, raw_csv_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
      ON CONFLICT(emp_id, date) DO UPDATE SET
        amount = excluded.amount, duty_code = excluded.duty_code, period_year = excluded.period_year, period_month = excluded.period_month,
        start_time = COALESCE(excluded.start_time, sales_records.start_time), return_time = COALESCE(excluded.return_time, sales_records.return_time),
        ride_count = COALESCE(excluded.ride_count, sales_records.ride_count), distance_km = COALESCE(excluded.distance_km, sales_records.distance_km),
        labor_hours = COALESCE(excluded.labor_hours, sales_records.labor_hours), night_hours = COALESCE(excluded.night_hours, sales_records.night_hours),
        overtime_hours = COALESCE(excluded.overtime_hours, sales_records.overtime_hours), raw_csv_json = COALESCE(excluded.raw_csv_json, sales_records.raw_csv_json),
        updated_at = datetime('now', 'localtime')`).bind(empId, s.date, s.amount, s.dutyCode, year, month, s.startTime, s.returnTime, s.rideCount, s.distanceKm, s.laborHours, s.nightHours, s.overtimeHours, s.rawCsv));
  }
  let salesN = 0;
  for (let i = 0; i < stmts.length; i += 50) {
    const chunk = stmts.slice(i, i + 50);
    try { await db.batch(chunk); salesN += chunk.length; } catch (e) { errors.push(`sales[${i}]: ${e instanceof Error ? e.message : String(e)}`); }
  }
  const sstmts: Stmt[] = [];
  for (const s of safety) {
    const empId = idMap.get(s.empNo); if (!empId) continue;
    sstmts.push(db.prepare(`
      INSERT INTO driving_safety_records (emp_id, date, harsh_start_loaded, harsh_start_empty, harsh_accel_loaded, harsh_accel_empty, harsh_decel_loaded, harsh_decel_empty, max_speed_loaded_highway, max_speed_empty_highway, max_speed_loaded_local, max_speed_empty_local, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
      ON CONFLICT(emp_id, date) DO UPDATE SET
        harsh_start_loaded = excluded.harsh_start_loaded, harsh_start_empty = excluded.harsh_start_empty, harsh_accel_loaded = excluded.harsh_accel_loaded, harsh_accel_empty = excluded.harsh_accel_empty,
        harsh_decel_loaded = excluded.harsh_decel_loaded, harsh_decel_empty = excluded.harsh_decel_empty, max_speed_loaded_highway = excluded.max_speed_loaded_highway, max_speed_empty_highway = excluded.max_speed_empty_highway,
        max_speed_loaded_local = excluded.max_speed_loaded_local, max_speed_empty_local = excluded.max_speed_empty_local, updated_at = datetime('now', 'localtime')`).bind(empId, s.date, ...s.v));
  }
  let safetyN = 0;
  for (let i = 0; i < sstmts.length; i += 50) {
    const chunk = sstmts.slice(i, i + 50);
    try { await db.batch(chunk); safetyN += chunk.length; } catch (e) { errors.push(`safety[${i}]: ${e instanceof Error ? e.message : String(e)}`); }
  }
  return { ok: errors.length === 0, rows, sales: salesN, safety: safetyN, unknownEmp, skipped, errors, nextLine: endLine, totalLines, done: endLine >= totalLines };
}

// ---------- 1回分の同期 ----------
export type SyncResult = { ok: boolean; message: string; pending: number; processed: number; imported: number; stored: number; errors: number; queuedRemaining: number; items: Array<{ name: string; kind: string; status: string; detail: string }> };

export async function runTakconSync(env: TakconEnv, trigger: 'cron' | 'manual'): Promise<SyncResult> {
  const db = env.DB;
  const run = await db.prepare('INSERT INTO takcon_sync_runs (trigger) VALUES (?)').bind(trigger).run();
  const runId = run.meta.last_row_id;
  const result: SyncResult = { ok: false, message: '', pending: 0, processed: 0, imported: 0, stored: 0, errors: 0, queuedRemaining: 0, items: [] };
  const finish = async () => {
    await db.prepare('UPDATE takcon_sync_runs SET finished_at = datetime(\'now\', \'localtime\'), ok = ?, pending = ?, processed = ?, imported = ?, stored = ?, errors = ?, message = ? WHERE id = ?')
      .bind(result.ok ? 1 : 0, result.pending, result.processed, result.imported, result.stored, result.errors, result.message.slice(0, 500), runId).run();
    return result;
  };
  try {
    let list: Response;
    try { list = await call(env, '/files'); } catch (e) {
      result.message = e instanceof Error && e.name === 'TimeoutError' ? '板橋PCへの接続がタイムアウトしました。' : '板橋PCに接続できませんでした。'; return finish();
    }
    const p = problem(list); if (p) { result.message = p; return finish(); }
    const j = await list.json<{ files?: TakconFile[] }>().catch(() => null);
    if (!j || !Array.isArray(j.files)) { result.message = `/files の応答を解析できません（HTTP ${list.status}）`; return finish(); }
    result.pending = j.files.length;
    const files = j.files.slice(0, MAX_FILES_PER_RUN);

    for (const f of files) {
      const name = String(f.name ?? ''); const kind = String(f.kind ?? 'その他');
      if (!name || /[\/\\]|\.\./.test(name)) { result.errors++; result.items.push({ name, kind, status: 'error', detail: 'ファイル名が不正' }); continue; }
      let status = 'error'; let detail = '';
      try {
        const res = await call(env, `/file/${encodeURIComponent(name)}`);
        const pp = problem(res);
        if (pp) throw new Error(pp);
        if (!res.ok) throw new Error(`取得失敗 HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        // 元ファイルを R2 に保存（取込の成否に関わらず残す）
        const r2Key = `takcon/${kind}/${name}`;
        if (env.DOCUMENTS_BUCKET) {
          await env.DOCUMENTS_BUCKET.put(r2Key, buf, { httpMetadata: { contentType: 'text/csv; charset=Shift_JIS' }, customMetadata: { kind, source: String(f.source ?? ''), modified: String(f.modified ?? '') } });
        }
        const text = decodeCsv(buf);
        if (kind === '事故データCSV') {
          const parsed = parseAccidentCsv(text);
          if (!parsed.ok) throw new Error(parsed.error);
          const up = await upsertAccidentRecords(db, parsed.records);
          if (!up.ok && up.imported === 0) throw new Error(up.errors[0] ?? '取込に失敗');
          status = 'imported'; detail = `事故 ${up.imported}件を反映${up.errors.length ? `（警告 ${up.errors.length}件）` : ''}`;
        } else if (kind === 'ホシコン収集データ') {
          // 数十万バイトになるので1回で処理せず、R2 に置いてから数回に分けて取り込む（下の processQueue）
          if (!env.DOCUMENTS_BUCKET) throw new Error('R2（DOCUMENTS_BUCKET）が未設定のため分割取込できません');
          const first = (text.split(/\r?\n/, 1)[0] ?? '').split(',');
          if (first[0]?.trim() !== '日付' || first.length < 38) throw new Error('ホシコン収集データの形式（1行目が「日付」で38列以上）ではありません');
          status = 'queued'; detail = '保存済み。分割取込を開始します';
        } else {
          status = 'stored'; detail = 'この種別の取込処理は未定義のため、ファイルを保存のみ（R2 takcon/ 配下）';
        }
        // 成功した場合だけ ack（失敗は次回再試行。queued は取込完了時に ack）
        if (status !== 'queued') {
          if (!(await ackFile(env, name))) detail += '／ack 失敗（次回再取得の可能性）';
        }
        await db.prepare(`INSERT INTO takcon_sync_files (name, kind, size, modified, source, r2_key, status, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(name) DO UPDATE SET kind = excluded.kind, size = excluded.size, modified = excluded.modified, source = excluded.source, r2_key = excluded.r2_key, status = excluded.status, detail = excluded.detail, attempts = takcon_sync_files.attempts + 1, updated_at = datetime('now', 'localtime')`)
          .bind(name, kind, f.size ?? null, f.modified ?? null, f.source ?? null, r2Key, status, detail).run();
        result.processed++; if (status === 'imported') result.imported++; else if (status === 'stored') result.stored++;
      } catch (e) {
        detail = e instanceof Error ? e.message : String(e); result.errors++; result.processed++;
        await db.prepare(`INSERT INTO takcon_sync_files (name, kind, size, modified, source, status, detail) VALUES (?, ?, ?, ?, ?, 'error', ?)
          ON CONFLICT(name) DO UPDATE SET status = 'error', detail = excluded.detail, attempts = takcon_sync_files.attempts + 1, updated_at = datetime('now', 'localtime')`)
          .bind(name, kind, f.size ?? null, f.modified ?? null, f.source ?? null, detail.slice(0, 500)).run();
      }
      result.items.push({ name, kind, status, detail });
    }
    // 分割取込の続き（1回の実行で最大 QUEUE_CHUNKS 回分）
    const q = await processQueue(env, result);
    result.queuedRemaining = q.remaining;
    result.ok = result.errors === 0;
    const parts: string[] = [];
    if (result.pending === 0 && q.chunks === 0) parts.push('未処理のファイルはありません');
    if (result.pending > 0) parts.push(`${result.processed}件処理（取込 ${result.imported}・保存のみ ${result.stored}・失敗 ${result.errors}）${result.pending > files.length ? `、残り ${result.pending - files.length}件は次回` : ''}`);
    if (q.chunks > 0) parts.push(q.note);
    if (q.remaining > 0) parts.push(`分割取込の続きが ${q.remaining}件あります`);
    result.message = parts.join('。');
    return finish();
  } catch (e) {
    result.message = '同期中にエラー: ' + (e instanceof Error ? e.message : String(e));
    return finish();
  }
}

// ---------- 分割取込（queued のファイルを少しずつ取り込む） ----------
const QUEUE_LINES_PER_CHUNK = 1200; // 1回に読む行数（Workers の CPU 時間制限を超えないように）
const QUEUE_CHUNKS = 2;             // 1回の実行で進める回数

async function processQueue(env: TakconEnv, result: SyncResult): Promise<{ chunks: number; remaining: number; note: string }> {
  const db = env.DB; let chunks = 0; const notes: string[] = [];
  for (let n = 0; n < QUEUE_CHUNKS; n++) {
    const row = await db.prepare("SELECT id, name, kind, r2_key, progress_line FROM takcon_sync_files WHERE status = 'queued' ORDER BY id LIMIT 1").first<{ id: number; name: string; kind: string; r2_key: string; progress_line: number }>();
    if (!row) break;
    try {
      const obj = env.DOCUMENTS_BUCKET ? await env.DOCUMENTS_BUCKET.get(row.r2_key) : null;
      if (!obj) throw new Error('R2 に元ファイルがありません');
      const text = decodeCsv(await obj.arrayBuffer());
      const r = await importCollectionCsv(db, text, Math.max(row.progress_line, 1), QUEUE_LINES_PER_CHUNK);
      chunks++;
      if (r.done) {
        const ackNote = (await ackFile(env, row.name)) ? '' : '／ack 失敗（次回再取得の可能性）';
        await db.prepare("UPDATE takcon_sync_files SET status = 'imported', progress_line = ?, total_lines = ?, detail = ?, updated_at = datetime('now', 'localtime') WHERE id = ?")
          .bind(r.nextLine, r.totalLines, `分割取込 完了（${r.totalLines - 1}行）${r.errors.length ? `／警告 ${r.errors.length}件` : ''}${ackNote}`, row.id).run();
        result.imported++; notes.push(`${row.name}: 取込完了`);
        result.items.push({ name: row.name, kind: row.kind, status: 'imported', detail: '分割取込 完了' });
      } else {
        await db.prepare("UPDATE takcon_sync_files SET progress_line = ?, total_lines = ?, detail = ?, updated_at = datetime('now', 'localtime') WHERE id = ?")
          .bind(r.nextLine, r.totalLines, `分割取込 途中（${r.nextLine - 1} / ${r.totalLines - 1}行）。売上 ${r.sales}件・安全運転 ${r.safety}件反映`, row.id).run();
        notes.push(`${row.name}: ${r.nextLine - 1}/${r.totalLines - 1}行`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await db.prepare("UPDATE takcon_sync_files SET status = 'error', detail = ?, attempts = attempts + 1, updated_at = datetime('now', 'localtime') WHERE id = ?").bind(('分割取込でエラー: ' + msg).slice(0, 500), row.id).run();
      result.errors++; notes.push(`${row.name}: エラー ${msg}`);
      break;
    }
  }
  const rem = await db.prepare("SELECT COUNT(*) AS n FROM takcon_sync_files WHERE status = 'queued'").first<{ n: number }>();
  return { chunks, remaining: rem?.n ?? 0, note: notes.join('、') };
}
