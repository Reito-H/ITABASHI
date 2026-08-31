// イベント募集フォーム（ログイン不要・完全公開・複雑なURLでのみアクセス可能）
// フロー: 社員番号入力 → 開催中のイベント一覧（掲示板） → 参加登録 → 参加詳細の確認（保存用）
// ページ: {STUDY_SESSION_PATH}   API: /api/public/study-sessions/*
// 認証は一切行わない。書き込み範囲は study_session_participants への
// upsert（同一イベント×社員番号の再登録は上書き更新のみ）に厳しく限定する。
// QR/URLはイベントごとに個別発行せず、この1ページ（掲示板）を全ポスターで共通利用する。
import { Hono } from 'hono';
import type { Env } from '../auth';
import { STUDY_SESSION_PATH } from '../config';
import {
  normalizeSettings, validateAnswer, isQType, answerForClient,
  type SurveyQType, type QSettings,
} from '../data/surveys';

const app = new Hono<{ Bindings: Env }>();

type StudySession = {
  id: number; title: string; date: string; start_time: string | null; end_time: string | null;
  location: string | null; contact_name: string | null; capacity: number; note: string | null; is_closed: number;
};

// キャンセルがこの回数に達すると、カウンターを0に戻したうえでペナルティ期間（PENALTY_MONTHS）を設定する
const PENALTY_THRESHOLD = 10;
const PENALTY_MONTHS = 3;

function toHalfWidth(s: string): string {
  return s.replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
}
function todayStr(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
function addDays(dateStr: string, delta: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
function addMonths(dateStr: string, delta: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 10);
}
async function findActiveEmployee(db: D1Database, empNo: string): Promise<{ emp_no: string } | null> {
  if (!empNo) return null;
  return db.prepare('SELECT emp_no FROM employees WHERE emp_no = ? AND is_active = 1').bind(empNo).first<{ emp_no: string }>();
}
async function getHomeOfficeId(db: D1Database): Promise<number> {
  const row = await db.prepare("SELECT value FROM system_settings WHERE key = 'home_office_id'").first<{ value: string }>();
  const n = parseInt(row?.value ?? '1', 10);
  return Number.isInteger(n) && n > 0 ? n : 1;
}
async function getHomeOfficeName(db: D1Database): Promise<string> {
  const row = await db.prepare(
    `SELECT o.short_name FROM offices o
      WHERE o.id = (SELECT CAST(value AS INTEGER) FROM system_settings WHERE key = 'home_office_id')`
  ).first<{ short_name: string }>().catch(() => null);
  const name = (row?.short_name ?? '板橋営業所').trim() || '板橋営業所';
  return name.replace(/[<>&"]/g, s => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[s] as string));
}
async function getActivePenaltyUntil(db: D1Database, empNo: string): Promise<string | null> {
  const row = await db.prepare('SELECT penalty_until FROM study_session_penalties WHERE emp_no = ?').bind(empNo).first<{ penalty_until: string | null }>();
  if (row?.penalty_until && row.penalty_until >= todayStr()) return row.penalty_until;
  return null;
}

// ===== API =====
app.get('/api/public/study-sessions', async (c) => {
  const empNo = toHalfWidth((c.req.query('emp_no') ?? '').trim());
  if (!empNo) return c.json({ error: '社員番号を入力してください' }, 400);
  const emp = await findActiveEmployee(c.env.DB, empNo);
  if (!emp) return c.json({ error: '社員番号が確認できませんでした。ご確認のうえ再度お試しください' }, 404);

  const rows = await c.env.DB.prepare(`
    SELECT s.*,
      (SELECT COUNT(*) FROM study_session_participants p WHERE p.session_id = s.id) AS participant_count,
      (SELECT COUNT(*) FROM study_session_participants p2 WHERE p2.session_id = s.id AND p2.emp_no = ?) AS registered
    FROM study_sessions s
    WHERE s.date >= ?
    ORDER BY s.date, s.start_time
  `).bind(empNo, todayStr()).all();
  const penaltyUntil = await getActivePenaltyUntil(c.env.DB, empNo);
  return c.json({ sessions: rows.results ?? [], penalty: penaltyUntil ? { until: penaltyUntil } : null });
});

// マイページ（全期間の参加記録・スタンプラリー表示用）
app.get('/api/public/study-sessions/mypage', async (c) => {
  const empNo = toHalfWidth((c.req.query('emp_no') ?? '').trim());
  if (!empNo) return c.json({ error: '社員番号を入力してください' }, 400);
  const emp = await findActiveEmployee(c.env.DB, empNo);
  if (!emp) return c.json({ error: '社員番号が確認できませんでした。ご確認のうえ再度お試しください' }, 404);

  const rows = await c.env.DB.prepare(`
    SELECT s.id, s.title, s.date, s.start_time, s.end_time, s.location, p.attended
    FROM study_session_participants p
    JOIN study_sessions s ON s.id = p.session_id
    WHERE p.emp_no = ?
    ORDER BY s.date DESC, s.start_time DESC
  `).bind(empNo).all();
  return c.json({ records: rows.results ?? [] });
});

// イベントへの要望（受けたいテーマなどの自由記入アンケート）
app.post('/api/public/study-sessions/requests', async (c) => {
  const b = await c.req.json<{ emp_no?: string; content?: string }>();
  const empNo = toHalfWidth((b.emp_no ?? '').trim());
  if (!empNo) return c.json({ error: '社員番号を入力してください' }, 400);
  const emp = await findActiveEmployee(c.env.DB, empNo);
  if (!emp) return c.json({ error: '社員番号が確認できませんでした。ご確認のうえ再度お試しください' }, 404);
  const content = (b.content ?? '').trim().slice(0, 500);
  if (!content) return c.json({ error: '内容を入力してください' }, 400);
  await c.env.DB.prepare('INSERT INTO study_session_requests (emp_no, content) VALUES (?, ?)').bind(empNo, content).run();
  return c.json({ ok: true });
});

// 営業所へのご意見（乗務員の日頃の意見・要望）。匿名希望でも emp_no は必ず保存する
app.post('/api/public/study-sessions/opinions', async (c) => {
  const b = await c.req.json<{ emp_no?: string; content?: string; category?: string; is_anonymous?: boolean | number }>();
  const empNo = toHalfWidth((b.emp_no ?? '').trim());
  if (!empNo) return c.json({ error: '社員番号を入力してください' }, 400);
  const emp = await findActiveEmployee(c.env.DB, empNo);
  if (!emp) return c.json({ error: '社員番号が確認できませんでした。ご確認のうえ再度お試しください' }, 404);
  const content = (b.content ?? '').trim().slice(0, 1000);
  if (!content) return c.json({ error: '内容を入力してください' }, 400);
  const category = (b.category ?? '').trim().slice(0, 30) || null;
  const isAnon = (b.is_anonymous === true || b.is_anonymous === 1) ? 1 : 0;
  const officeId = await getHomeOfficeId(c.env.DB);
  await c.env.DB.prepare(
    'INSERT INTO office_opinions (office_id, emp_no, is_anonymous, category, content) VALUES (?, ?, ?, ?, ?)'
  ).bind(officeId, empNo, isAnon, category, content).run();
  return c.json({ ok: true });
});

// ===== アンケート（公開・回答は何回でも可） =====
type SurveyQRow = {
  id: number; qtype: string; label: string; help: string; required: number; settings_json: string;
};

// 対象者チェック: target_all=1 なら誰でも / target_all=0 なら survey_targets に emp_no があるか
async function empCanSeeSurvey(db: D1Database, surveyId: number, empNo: string): Promise<boolean> {
  const row = await db.prepare(
    `SELECT s.target_all,
       (SELECT COUNT(*) FROM survey_targets t WHERE t.survey_id = s.id AND t.emp_no = ?) AS hit
     FROM surveys s WHERE s.id = ?`
  ).bind(empNo, surveyId).first<{ target_all: number; hit: number }>();
  if (!row) return false;
  return row.target_all === 1 || row.hit > 0;
}

app.get('/api/public/surveys', async (c) => {
  const officeId = await getHomeOfficeId(c.env.DB);
  const empNo = toHalfWidth((c.req.query('emp_no') ?? '').trim()).slice(0, 12);
  const emp = empNo
    ? await c.env.DB.prepare('SELECT emp_no FROM employees WHERE emp_no = ? AND is_active = 1').bind(empNo).first<{ emp_no: string }>()
    : null;
  const en = emp ? empNo : '';
  const rs = await c.env.DB.prepare(
    `SELECT id, title, description,
        (? != '' AND EXISTS (SELECT 1 FROM survey_responses r WHERE r.survey_id = surveys.id AND r.emp_no = ?)) AS answered
      FROM surveys
      WHERE office_id = ? AND is_closed = 0
        AND (target_all = 1 OR (? != '' AND EXISTS (SELECT 1 FROM survey_targets t WHERE t.survey_id = surveys.id AND t.emp_no = ?)))
      ORDER BY created_at DESC, id DESC`
  ).bind(en, en, officeId, en, en).all<{ id: number; title: string; description: string; answered: number }>();
  return c.json({ surveys: (rs.results ?? []).map(s => ({ ...s, answered: !!s.answered })) });
});

app.get('/api/public/surveys/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const officeId = await getHomeOfficeId(c.env.DB);
  const survey = await c.env.DB.prepare(
    'SELECT id, title, description FROM surveys WHERE id = ? AND office_id = ? AND is_closed = 0'
  ).bind(id, officeId).first<{ id: number; title: string; description: string }>();
  if (!survey) return c.json({ error: 'このアンケートは受付を終了しました' }, 404);
  const empNo = toHalfWidth((c.req.query('emp_no') ?? '').trim()).slice(0, 12);
  if (!(await empCanSeeSurvey(c.env.DB, id, empNo))) {
    return c.json({ error: 'このアンケートの対象ではありません' }, 403);
  }
  const qs = await c.env.DB.prepare(
    'SELECT id, qtype, label, help, required, settings_json FROM survey_questions WHERE survey_id = ? ORDER BY sort_order, id'
  ).bind(id).all<SurveyQRow>();
  const questions = (qs.results ?? []).map(q => {
    const qtype = (isQType(q.qtype) ? q.qtype : 'text') as SurveyQType;
    let raw: unknown = {};
    try { raw = JSON.parse(q.settings_json || '{}'); } catch { /* {} */ }
    return { id: q.id, qtype, label: q.label, help: q.help, required: !!q.required, settings: normalizeSettings(qtype, raw) };
  });

  // 前回の回答（あればフォームに復元する）
  const myAnswers: Record<string, string | string[]> = {};
  if (empNo) {
    const prev = await c.env.DB.prepare(
      'SELECT id FROM survey_responses WHERE survey_id = ? AND emp_no = ? ORDER BY id DESC LIMIT 1'
    ).bind(id, empNo).first<{ id: number }>();
    if (prev) {
      const rows = await c.env.DB.prepare(
        'SELECT question_id, value_text FROM survey_answers WHERE response_id = ?'
      ).bind(prev.id).all<{ question_id: number; value_text: string }>();
      const qtypeById = new Map(questions.map(q => [q.id, q.qtype]));
      for (const r of rows.results ?? []) {
        const qt = qtypeById.get(r.question_id);
        if (qt) myAnswers[String(r.question_id)] = answerForClient(qt, r.value_text);
      }
    }
  }
  return c.json({ ...survey, questions, myAnswers });
});

app.post('/api/public/surveys/:id/respond', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  let b: { emp_no?: string; answers?: Record<string, unknown> };
  try { b = await c.req.json(); } catch { return c.json({ error: '不正なリクエストです' }, 400); }
  const empNo = toHalfWidth((b.emp_no ?? '').trim()).slice(0, 12);
  if (!empNo) return c.json({ error: '社員番号を入力してください' }, 400);
  const emp = await c.env.DB.prepare(
    'SELECT emp_no, division, team FROM employees WHERE emp_no = ? AND is_active = 1'
  ).bind(empNo).first<{ emp_no: string; division: number | null; team: number | null }>();
  if (!emp) return c.json({ error: '社員番号が確認できませんでした。ご確認のうえ再度お試しください' }, 404);

  const officeId = await getHomeOfficeId(c.env.DB);
  const survey = await c.env.DB.prepare(
    'SELECT id FROM surveys WHERE id = ? AND office_id = ? AND is_closed = 0'
  ).bind(id, officeId).first<{ id: number }>();
  if (!survey) return c.json({ error: 'このアンケートは受付を終了しました' }, 404);
  if (!(await empCanSeeSurvey(c.env.DB, id, empNo))) {
    return c.json({ error: 'このアンケートの対象ではありません' }, 403);
  }

  const qs = await c.env.DB.prepare(
    'SELECT id, qtype, required, settings_json FROM survey_questions WHERE survey_id = ? ORDER BY sort_order, id'
  ).bind(id).all<{ id: number; qtype: string; required: number; settings_json: string }>();
  const questions = qs.results ?? [];
  if (!questions.length) return c.json({ error: '設問がありません' }, 400);

  const answers = (b.answers && typeof b.answers === 'object') ? b.answers : {};
  const toStore: { qid: number; stored: string }[] = [];
  for (const q of questions) {
    const qtype = (isQType(q.qtype) ? q.qtype : 'text') as SurveyQType;
    let raw: unknown = {};
    try { raw = JSON.parse(q.settings_json || '{}'); } catch { /* {} */ }
    const settings: QSettings = normalizeSettings(qtype, raw);
    const v = validateAnswer({ qtype, required: !!q.required, settings }, answers[String(q.id)]);
    if (!v.ok) return c.json({ error: `「設問${questions.indexOf(q) + 1}」${v.error}` }, 400);
    if (v.stored !== '') toStore.push({ qid: q.id, stored: v.stored });
  }

  // 1社員1回答: 既存があれば上書き、なければ新規
  const prev = await c.env.DB.prepare(
    'SELECT id FROM survey_responses WHERE survey_id = ? AND emp_no = ? ORDER BY id DESC LIMIT 1'
  ).bind(id, empNo).first<{ id: number }>();
  let responseId: number;
  let updated = false;
  if (prev) {
    responseId = prev.id;
    updated = true;
    await c.env.DB.prepare('DELETE FROM survey_answers WHERE response_id = ?').bind(responseId).run();
    await c.env.DB.prepare(
      "UPDATE survey_responses SET division = ?, team = ?, updated_at = datetime('now','localtime') WHERE id = ?"
    ).bind(emp.division ?? null, emp.team ?? null, responseId).run();
  } else {
    const ins = await c.env.DB.prepare(
      "INSERT INTO survey_responses (survey_id, emp_no, division, team, updated_at) VALUES (?, ?, ?, ?, datetime('now','localtime'))"
    ).bind(id, empNo, emp.division ?? null, emp.team ?? null).run();
    responseId = ins.meta.last_row_id as number;
  }

  for (const a of toStore) {
    await c.env.DB.prepare(
      'INSERT INTO survey_answers (response_id, question_id, value_text) VALUES (?, ?, ?)'
    ).bind(responseId, a.qid, a.stored).run();
  }
  return c.json({ ok: true, updated });
});

app.post('/api/public/study-sessions/:id/register', async (c) => {
  const id = parseInt(c.req.param('id'));
  const b = await c.req.json<{ emp_no?: string }>();
  const empNo = toHalfWidth((b.emp_no ?? '').trim());
  if (!empNo) return c.json({ error: '社員番号を入力してください' }, 400);
  const emp = await findActiveEmployee(c.env.DB, empNo);
  if (!emp) return c.json({ error: '社員番号が確認できませんでした。ご確認のうえ再度お試しください' }, 404);

  const already = await c.env.DB.prepare(
    'SELECT id FROM study_session_participants WHERE session_id = ? AND emp_no = ?'
  ).bind(id, empNo).first();

  if (!already) {
    const penaltyUntil = await getActivePenaltyUntil(c.env.DB, empNo);
    if (penaltyUntil) return c.json({ error: `お申し込み回数が多いため、${penaltyUntil}まで新規のお申し込みができません` }, 403);
  }

  const session = await c.env.DB.prepare('SELECT * FROM study_sessions WHERE id = ?').bind(id).first<StudySession>();
  if (!session) return c.json({ error: 'イベントが見つかりません' }, 404);
  if (session.is_closed) return c.json({ error: 'このイベントは受付を終了しています' }, 400);
  if (session.date < todayStr()) return c.json({ error: 'このイベントは開催日を過ぎています' }, 400);

  if (!already && session.capacity > 0) {
    const cnt = await c.env.DB.prepare(
      'SELECT COUNT(*) AS n FROM study_session_participants WHERE session_id = ?'
    ).bind(id).first<{ n: number }>();
    if ((cnt?.n ?? 0) >= session.capacity) {
      return c.json({ error: '満席のため受付を終了しました' }, 400);
    }
  }

  await c.env.DB.prepare(
    `INSERT INTO study_session_participants (session_id, emp_no) VALUES (?, ?)
     ON CONFLICT(session_id, emp_no) DO UPDATE SET updated_at = datetime('now','localtime')`
  ).bind(id, empNo).run();

  return c.json({ ok: true, session });
});

app.post('/api/public/study-sessions/:id/cancel', async (c) => {
  const id = parseInt(c.req.param('id'));
  const b = await c.req.json<{ emp_no?: string }>();
  const empNo = toHalfWidth((b.emp_no ?? '').trim());
  if (!empNo) return c.json({ error: '社員番号を入力してください' }, 400);
  const emp = await findActiveEmployee(c.env.DB, empNo);
  if (!emp) return c.json({ error: '社員番号が確認できませんでした。ご確認のうえ再度お試しください' }, 404);

  const session = await c.env.DB.prepare('SELECT * FROM study_sessions WHERE id = ?').bind(id).first<StudySession>();
  if (!session) return c.json({ error: 'イベントが見つかりません' }, 404);

  const existing = await c.env.DB.prepare(
    'SELECT id FROM study_session_participants WHERE session_id = ? AND emp_no = ?'
  ).bind(id, empNo).first();
  if (!existing) return c.json({ error: '参加登録が見つかりません' }, 404);

  // 開催前日・当日以降のキャンセルは不可
  if (todayStr() >= addDays(session.date, -1)) {
    return c.json({ error: '開催前日以降はキャンセルできません' }, 400);
  }

  await c.env.DB.prepare('DELETE FROM study_session_participants WHERE session_id = ? AND emp_no = ?').bind(id, empNo).run();

  const penaltyRow = await c.env.DB.prepare(
    'SELECT cancel_count FROM study_session_penalties WHERE emp_no = ?'
  ).bind(empNo).first<{ cancel_count: number }>();
  const nextCount = (penaltyRow?.cancel_count ?? 0) + 1;

  if (nextCount >= PENALTY_THRESHOLD) {
    const until = addMonths(todayStr(), PENALTY_MONTHS);
    await c.env.DB.prepare(
      `INSERT INTO study_session_penalties (emp_no, cancel_count, penalty_until, updated_at) VALUES (?, 0, ?, datetime('now','localtime'))
       ON CONFLICT(emp_no) DO UPDATE SET cancel_count = 0, penalty_until = excluded.penalty_until, updated_at = datetime('now','localtime')`
    ).bind(empNo, until).run();
  } else {
    await c.env.DB.prepare(
      `INSERT INTO study_session_penalties (emp_no, cancel_count, updated_at) VALUES (?, ?, datetime('now','localtime'))
       ON CONFLICT(emp_no) DO UPDATE SET cancel_count = excluded.cancel_count, updated_at = datetime('now','localtime')`
    ).bind(empNo, nextCount).run();
  }

  return c.json({ ok: true });
});

// ===== ページ =====
app.get(STUDY_SESSION_PATH, async (c) => {
  const officeName = await getHomeOfficeName(c.env.DB);
  return c.html(`<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>${officeName}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Hiragino Sans','Meiryo',sans-serif; background:#f5f6f8; margin:0; padding:18px; color:#1f2937; font-size:16px; }
    h1 { font-size:20px; color:#1e3a5f; margin:0 0 6px; }
    .sub { font-size:13px; color:#6b7280; margin-bottom:20px; line-height:1.6; }
    .card { background:white; border:1px solid #e5e7eb; border-radius:14px; padding:20px; margin-bottom:16px; }
    .big-input { width:100%; font-size:22px; padding:16px; border:2px solid #93c5fd; border-radius:10px; text-align:center; letter-spacing:2px; }
    .big-btn { width:100%; padding:16px; font-size:17px; font-weight:700; border:none; border-radius:10px; background:#2563eb; color:white; cursor:pointer; margin-top:14px; }
    .big-btn.secondary { background:#f3f4f6; color:#374151; }
    .big-btn.green { background:#16a34a; }
    .big-btn:disabled { opacity:0.5; }
    .err { color:#dc2626; font-size:14px; margin-top:10px; text-align:center; }
    #msg { text-align:center; padding:60px 12px; color:#6b7280; font-size:16px; }
    .step { display:none; }
    .sess-card { border:2px solid #e5e7eb; border-radius:12px; padding:16px; margin-bottom:12px; }
    .sess-card.full { opacity:0.6; }
    .sess-title { font-size:17px; font-weight:700; color:#1e3a5f; margin-bottom:8px; }
    .sess-row { font-size:14px; color:#374151; margin-bottom:4px; display:flex; gap:6px; }
    .sess-row .lb { color:#9ca3af; flex:0 0 60px; }
    .badge { display:inline-block; padding:3px 10px; border-radius:99px; font-size:11px; font-weight:700; margin-left:6px; vertical-align:middle; }
    .badge.open { background:#f0fdf4; color:#166534; }
    .badge.full { background:#fef3c7; color:#b45309; }
    .badge.closed { background:#f3f4f6; color:#6b7280; }
    .badge.done { background:#eff6ff; color:#1e3a5f; }
    .sess-btn { width:100%; margin-top:10px; padding:12px; font-size:14px; font-weight:700; border:none; border-radius:8px; background:#2563eb; color:white; cursor:pointer; }
    .sess-btn:disabled { background:#d1d5db; color:#9ca3af; cursor:default; }
    .sess-btn.cancel { background:white; color:#dc2626; border:1px solid #fca5a5; }
    .sess-btn.cancel:disabled { background:#f9fafb; color:#9ca3af; border:1px solid #e5e7eb; }
    .penalty-banner { background:#fef2f2; border:1px solid #fca5a5; color:#991b1b; font-size:13px; line-height:1.6; }
    .confirm-box { text-align:center; padding:6px 0 14px; }
    .confirm-box .ok { font-size:15px; color:#16a34a; font-weight:700; margin-bottom:14px; }
    .confirm-detail { text-align:left; background:#f8fafc; border-radius:10px; padding:16px; margin-bottom:14px; }
    .confirm-detail .t { font-size:19px; font-weight:700; color:#1e3a5f; margin-bottom:10px; }
    .confirm-detail .r { font-size:14px; color:#374151; margin-bottom:6px; display:flex; gap:8px; }
    .confirm-detail .r .lb { color:#9ca3af; flex:0 0 60px; }
    .come-note { font-size:14px; font-weight:700; color:#b45309; background:#fffbeb; border-radius:8px; padding:12px; margin-bottom:14px; }
    .save-hint { font-size:12px; color:#6b7280; margin-bottom:6px; line-height:1.6; }
    .mypage-summary { text-align:center; padding:8px 0 4px; }
    .mypage-summary .num { font-size:38px; font-weight:900; color:#2563eb; }
    .mypage-summary .lb { font-size:13px; color:#6b7280; }
    .stamp-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-top:4px; }
    .stamp-card { text-align:center; padding:10px 4px; }
    .stamp-circle { width:56px; height:56px; margin:0 auto 6px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:24px; font-weight:900; }
    .stamp-circle.filled { background:#fef9c3; border:3px solid #ca8a04; color:#ca8a04; }
    .stamp-circle.empty { background:#f9fafb; border:3px dashed #d1d5db; color:#d1d5db; }
    .stamp-title { font-size:11px; color:#374151; font-weight:600; line-height:1.4; }
    .stamp-date { font-size:10px; color:#9ca3af; }
    .topbar { display:flex; align-items:center; justify-content:space-between; gap:10px; }
    .menu-btn { display:none; flex-direction:column; align-items:center; justify-content:center; gap:4px; width:40px; height:40px; flex-shrink:0; border:1px solid #d1d5db; border-radius:8px; background:white; cursor:pointer; }
    .menu-btn span { display:block; width:18px; height:2px; background:#1e3a5f; border-radius:1px; }
    .menu-overlay { display:none; position:fixed; inset:0; background:rgba(15,23,42,0.35); z-index:30; }
    .menu-overlay.open { display:block; }
    .menu-drawer { position:fixed; top:0; right:-260px; width:240px; height:100%; background:white; box-shadow:-4px 0 20px rgba(0,0,0,0.18); z-index:31; transition:right 0.2s ease; padding:56px 0 20px; }
    .menu-drawer.open { right:0; }
    .menu-drawer-close { position:absolute; top:14px; right:16px; width:32px; height:32px; border:none; background:#f3f4f6; border-radius:8px; font-size:16px; color:#374151; cursor:pointer; }
    .menu-item { padding:14px 20px; font-size:14px; color:#1f2937; cursor:pointer; border-bottom:1px solid #f3f4f6; }
    .menu-item:active { background:#f8fafc; }
    .menu-item.secondary { color:#9ca3af; margin-top:12px; border-top:1px solid #f3f4f6; }
    .opinion-cta { margin-top:20px; background:#eff6ff; border:2px solid #bfdbfe; cursor:pointer; }
    .opinion-cta-title { font-size:17px; font-weight:800; color:#1e3a5f; margin-bottom:6px; }
    .opinion-cta-desc { font-size:13px; color:#4b5563; line-height:1.75; margin-bottom:14px; }
    .sv-card { border:2px solid #e5e7eb; border-radius:12px; padding:16px; margin-bottom:12px; }
    .sv-card .sv-t { font-size:16px; font-weight:700; color:#1e3a5f; margin-bottom:6px; }
    .sv-card .sv-d { font-size:13px; color:#6b7280; line-height:1.7; white-space:pre-wrap; margin-bottom:10px; }
    .sv-open-btn { width:100%; padding:12px; font-size:14px; font-weight:700; border:none; border-radius:8px; background:#2563eb; color:white; cursor:pointer; }
    .sv-q { padding:14px 0; border-bottom:1px solid #f0f0f2; }
    .sv-q:last-of-type { border-bottom:none; }
    .sv-q-label { font-size:14px; font-weight:700; color:#1f2937; margin-bottom:4px; }
    .sv-q-label .rq { color:#dc2626; font-size:12px; margin-left:5px; }
    .sv-q-help { font-size:12px; color:#9ca3af; margin-bottom:8px; line-height:1.6; white-space:pre-wrap; }
    .sv-opt { display:flex; align-items:flex-start; gap:9px; padding:8px 0; font-size:14px; color:#374151; }
    .sv-opt input { width:19px; height:19px; flex-shrink:0; margin-top:1px; }
    .sv-in { width:100%; box-sizing:border-box; border:1px solid #d1d5db; border-radius:8px; padding:10px; font-size:14px; font-family:inherit; }
    .sv-scale { display:flex; gap:6px; flex-wrap:wrap; }
    .sv-scale label { flex:1; min-width:52px; text-align:center; border:1px solid #d1d5db; border-radius:8px; padding:9px 4px; font-size:14px; cursor:pointer; }
    .sv-scale input { display:none; }
    .sv-scale input:checked + span { font-weight:800; color:#2563eb; }
    .sv-scale label:has(input:checked) { border-color:#2563eb; background:#eff6ff; }
    .sv-scale-ends { display:flex; justify-content:space-between; font-size:11px; color:#9ca3af; margin-top:4px; }
    .sv-other-in { margin-top:6px; margin-left:28px; }
  </style>
</head>
<body>
  <div class="topbar">
    <h1>${officeName}</h1>
    <button id="menu-btn" class="menu-btn" onclick="openMenu()"><span></span><span></span><span></span></button>
  </div>
  <div id="menu-overlay" class="menu-overlay" onclick="closeMenu()"></div>
  <div id="menu-drawer" class="menu-drawer">
    <button class="menu-drawer-close" onclick="closeMenu()">×</button>
    <div class="menu-item" onclick="closeMenu(); backToBoard();">イベント一覧（掲示板）</div>
    <div class="menu-item" onclick="closeMenu(); loadMypage();">マイページ（参加記録）</div>
    <div class="menu-item" onclick="closeMenu(); showRequestForm();">イベントへの要望を送る</div>
    <div class="menu-item" onclick="closeMenu(); showSurveyList();">アンケートに回答する</div>
    <div class="menu-item secondary" onclick="closeMenu(); backToStep1();">社員番号を入力し直す</div>
  </div>
  <div id="msg" style="display:none;">読み込み中...</div>

  <div id="step1" class="step">
    <div class="sub" id="step1-sub">社員番号を入力してください</div>
    <div class="card">
      <input id="emp-no" class="big-input" type="tel" inputmode="numeric" placeholder="12345678" maxlength="12" oninput="this.value = toHalfWidth(this.value)">
      <button class="big-btn" onclick="loadBoard()">次へ</button>
      <div id="lookup-err" class="err" style="display:none;"></div>
    </div>
  </div>

  <div id="step2" class="step">
    <div class="sub">現在受付中の一覧です。参加したいものを選んでください。</div>
    <div id="board"></div>
    <div class="card opinion-cta" onclick="showOpinionForm()">
      <div class="opinion-cta-title">営業所へのご意見・ご要望</div>
      <div class="opinion-cta-desc">車両・設備・シフト・待遇など、日頃感じていることをお聞かせください。匿名でも送れます。</div>
      <button class="big-btn" type="button" onclick="event.stopPropagation(); showOpinionForm();">営業所へご意見を送る</button>
    </div>
  </div>

  <div id="step4" class="step">
    <div class="card mypage-summary">
      <div class="num" id="stamp-count">0</div>
      <div class="lb">個のスタンプを獲得しました</div>
    </div>
    <div class="card">
      <div id="stamp-grid" class="stamp-grid"></div>
    </div>
    <button class="big-btn secondary" onclick="backToBoard()">イベント一覧に戻る</button>
  </div>

  <div id="step5" class="step">
    <div class="sub">受けたいイベントのテーマや内容があれば教えてください（例: ○○エリアの流し方講座など）。いただいた要望は今後のイベントの企画の参考にします。</div>
    <div class="card">
      <textarea id="request-content" rows="5" maxlength="500" placeholder="例: ○○エリアの流し方講座を開いてほしいです" style="width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:8px;padding:10px;font-size:14px;font-family:inherit;"></textarea>
      <button class="big-btn" onclick="submitRequest()" id="request-submit-btn">送信する</button>
      <div id="request-err" class="err" style="display:none;"></div>
      <div id="request-ok" style="display:none;text-align:center;color:#16a34a;font-size:13px;margin-top:10px;font-weight:700;">送信しました。ありがとうございました。</div>
    </div>
    <button class="big-btn secondary" onclick="backToBoard()">イベント一覧に戻る</button>
  </div>

  <div id="step6" class="step">
    <div class="sub">営業所への日頃のご意見・ご要望をお聞かせください。車両・設備・シフト・待遇など何でも構いません。</div>
    <div class="card">
      <select id="opinion-category" style="width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:8px;padding:10px;font-size:14px;margin-bottom:10px;">
        <option value="">分類を選択（任意）</option>
        <option value="車両">車両</option>
        <option value="設備・営業所">設備・営業所</option>
        <option value="シフト・勤務">シフト・勤務</option>
        <option value="待遇・制度">待遇・制度</option>
        <option value="安全">安全</option>
        <option value="その他">その他</option>
      </select>
      <textarea id="opinion-content" rows="6" maxlength="1000" placeholder="ご意見・ご要望をご記入ください" style="width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:8px;padding:10px;font-size:14px;font-family:inherit;"></textarea>
      <label style="display:flex;align-items:center;gap:8px;font-size:14px;color:#374151;margin-top:12px;">
        <input type="checkbox" id="opinion-anon" style="width:18px;height:18px;flex-shrink:0;">匿名で送信する（氏名を伏せて扱います）
      </label>
      <button class="big-btn" onclick="submitOpinion()" id="opinion-submit-btn">送信する</button>
      <div id="opinion-err" class="err" style="display:none;"></div>
      <div id="opinion-ok" style="display:none;text-align:center;color:#16a34a;font-size:13px;margin-top:10px;font-weight:700;">送信しました。ご協力ありがとうございました。</div>
    </div>
    <button class="big-btn secondary" onclick="backToBoard()">イベント一覧に戻る</button>
  </div>

  <div id="step7" class="step">
    <div class="sub">回答できるアンケートの一覧です。回答したいものを選んでください。</div>
    <div id="survey-list"></div>
    <button class="big-btn secondary" onclick="backToBoard()">イベント一覧に戻る</button>
  </div>

  <div id="step8" class="step">
    <div class="card">
      <div id="survey-head"></div>
      <div id="survey-questions"></div>
      <button class="big-btn" onclick="submitSurvey()" id="survey-submit-btn">回答を送信する</button>
      <div id="survey-err" class="err" style="display:none;"></div>
    </div>
    <div id="survey-ok" class="card" style="display:none;text-align:center;">
      <div style="font-size:16px;color:#16a34a;font-weight:800;margin-bottom:8px;" id="survey-ok-title">送信しました</div>
      <div style="font-size:13px;color:#374151;line-height:1.8;">ご回答ありがとうございました。<br>同じアンケートをもう一度開くと、この内容を修正して再送信できます。</div>
      <button class="big-btn secondary" style="margin-top:16px;" onclick="showSurveyList()">アンケート一覧に戻る</button>
    </div>
    <button class="big-btn secondary" id="survey-back-btn" onclick="showSurveyList()">アンケート一覧に戻る</button>
  </div>

  <div id="step3" class="step">
    <div class="card confirm-box">
      <div class="ok">参加登録が完了しました</div>
      <div id="confirm-detail" class="confirm-detail"></div>
      <div id="come-note" class="come-note"></div>
      <div class="save-hint">下のボタンでこの内容を画像として保存できます（保存後、写真アプリなどからいつでも確認できます）。</div>
      <div id="capture-area"></div>
      <button class="big-btn green" onclick="saveAsImage()" id="save-img-btn">この内容を画像で保存</button>
      <button class="big-btn secondary" onclick="backToBoard()">他のイベントも見る</button>
    </div>
  </div>

<script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js" integrity="sha384-ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H" crossorigin="anonymous"></script>
<script>
var _empNo = '';
var _sessions = [];
var _lastRegistered = null;
var _penalty = null;
// 入口の切り替え: ?view=surveys でアンケート一覧から / ?survey=<id> で特定アンケートを直接開く
var _startView = '', _startSurveyId = '';
try {
  var _qp = new URLSearchParams(location.search);
  _startView = _qp.get('view') || '';
  _startSurveyId = _qp.get('survey') || '';
} catch (e) {}

function escH(s) { return (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function toHalfWidth(s) { return s.replace(/[０-９]/g, function(ch) { return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0); }); }
function showStep(id) {
  ['step1','step2','step3','step4','step5','step6','step7','step8'].forEach(function(s) { document.getElementById(s).style.display = (s === id) ? 'block' : 'none'; });
}
function openMenu() {
  document.getElementById('menu-overlay').classList.add('open');
  document.getElementById('menu-drawer').classList.add('open');
}
function closeMenu() {
  document.getElementById('menu-overlay').classList.remove('open');
  document.getElementById('menu-drawer').classList.remove('open');
}
var WD = ['日','月','火','水','木','金','土'];
function fmtDate(dt) {
  var t = new Date(dt + 'T00:00:00');
  return (t.getMonth()+1) + '月' + t.getDate() + '日（' + WD[t.getDay()] + '）';
}
function timeLabel(s) {
  return (s.start_time || '') + (s.end_time ? ' 〜 ' + s.end_time : '') || '別途ご案内';
}
function todayJst() {
  return new Date(Date.now() + 9*3600*1000).toISOString().slice(0,10);
}
function addDaysStr(dateStr, delta) {
  var d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  var y = d.getFullYear(), m = ('0'+(d.getMonth()+1)).slice(-2), day = ('0'+d.getDate()).slice(-2);
  return y + '-' + m + '-' + day;
}
function cancelAllowed(s) {
  return todayJst() < addDaysStr(s.date, -1);
}

function backToStep1() {
  document.getElementById('emp-no').value = '';
  document.getElementById('menu-btn').style.display = 'none';
  showStep('step1');
}

async function loadBoard() {
  var empNo = toHalfWidth(document.getElementById('emp-no').value.trim());
  var errEl = document.getElementById('lookup-err');
  errEl.style.display = 'none';
  if (!empNo) { errEl.textContent = '社員番号を入力してください'; errEl.style.display = 'block'; return; }
  try {
    var res = await fetch('/api/public/study-sessions?emp_no=' + encodeURIComponent(empNo));
    var d = await res.json();
    if (!res.ok) { errEl.textContent = d.error || '確認できませんでした'; errEl.style.display = 'block'; return; }
    _empNo = empNo;
    _sessions = d.sessions || [];
    _penalty = d.penalty || null;
    renderBoard();
    document.getElementById('menu-btn').style.display = 'flex';
    if (_startSurveyId) { openSurvey(_startSurveyId); }
    else if (_startView === 'surveys' || _startView === 'survey') { showSurveyList(); }
    else { showStep('step2'); }
  } catch (e) {
    errEl.textContent = '確認に失敗しました。もう一度お試しください'; errEl.style.display = 'block';
  }
}

function statusOf(s) {
  var full = s.capacity > 0 && s.participant_count >= s.capacity;
  if (s.is_closed) return { label: '受付終了', cls: 'closed', disabled: true };
  if (full) return { label: '満席', cls: 'full', disabled: true };
  return { label: '募集中', cls: 'open', disabled: false };
}

function renderBoard() {
  var board = document.getElementById('board');
  var banner = _penalty ? ('<div class="card penalty-banner">現在、新規のお申し込みができません（' + escH(_penalty.until) + ' まで）。既存の参加登録の確認・キャンセルは引き続き行えます。</div>') : '';
  if (_sessions.length === 0) { board.innerHTML = banner + '<div class="card" style="text-align:center;color:#9ca3af;">現在、募集中のイベントはありません</div>'; return; }
  board.innerHTML = banner + _sessions.map(function(s) {
    var st = statusOf(s);
    var capLabel = s.capacity > 0 ? ('残り ' + Math.max(s.capacity - s.participant_count, 0) + ' 名') : '定員なし';
    var registeredBadge = s.registered ? '<span class="badge done">参加登録済み</span>' : '';
    var actions;
    if (s.registered) {
      var canCancel = cancelAllowed(s);
      actions = '<button class="sess-btn" onclick="showConfirmFor(' + s.id + ')">登録内容を確認する</button>'
        + '<button class="sess-btn cancel" ' + (canCancel ? '' : 'disabled') + ' onclick="cancelReg(' + s.id + ')">' + (canCancel ? 'キャンセルする' : '前日以降はキャンセル不可') + '</button>';
    } else {
      var disabled = st.disabled || !!_penalty;
      actions = '<button class="sess-btn" ' + (disabled ? 'disabled' : '') + ' onclick="register(' + s.id + ')">参加する</button>';
    }
    return '<div class="sess-card' + (st.disabled && !s.registered ? ' full' : '') + '">'
      + '<div class="sess-title">' + escH(s.title) + ' <span class="badge ' + st.cls + '">' + st.label + '</span>' + registeredBadge + '</div>'
      + '<div class="sess-row"><span class="lb">日時</span><span>' + fmtDate(s.date) + ' ' + escH(timeLabel(s)) + '</span></div>'
      + '<div class="sess-row"><span class="lb">場所</span><span>' + escH(s.location || '別途ご案内') + '</span></div>'
      + '<div class="sess-row"><span class="lb">担当</span><span>' + escH(s.contact_name || '別途ご案内') + '</span></div>'
      + (s.target_audience ? ('<div class="sess-row"><span class="lb">対象</span><span>' + escH(s.target_audience) + '</span></div>') : '')
      + '<div class="sess-row"><span class="lb">定員</span><span>' + capLabel + '</span></div>'
      + actions
      + '</div>';
  }).join('');
}

function showConfirmFor(id) {
  var s = _sessions.filter(function(x) { return x.id === id; })[0];
  if (s) { _lastRegistered = s; showConfirm(s); }
}

async function cancelReg(id) {
  if (!confirm('このイベントの参加登録を取り消しますか？')) return;
  try {
    var res = await fetch('/api/public/study-sessions/' + id + '/cancel', {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ emp_no: _empNo })
    });
    var d = await res.json().catch(function() { return {}; });
    if (!res.ok) { alert(d.error || '取り消しに失敗しました'); return; }
    loadBoard();
  } catch (e) {
    alert('取り消しに失敗しました。もう一度お試しください');
  }
}

async function register(id) {
  try {
    var res = await fetch('/api/public/study-sessions/' + id + '/register', {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ emp_no: _empNo })
    });
    var d = await res.json().catch(function() { return {}; });
    if (!res.ok) { alert(d.error || '登録に失敗しました'); return; }
    _lastRegistered = d.session;
    showConfirm(d.session);
  } catch (e) {
    alert('登録に失敗しました。もう一度お試しください');
  }
}

function showConfirm(s) {
  var detail = '<div class="t">' + escH(s.title) + '</div>'
    + '<div class="r"><span class="lb">日時</span><span>' + fmtDate(s.date) + ' ' + escH(timeLabel(s)) + '</span></div>'
    + '<div class="r"><span class="lb">場所</span><span>' + escH(s.location || '別途ご案内') + '</span></div>'
    + '<div class="r"><span class="lb">担当</span><span>' + escH(s.contact_name || '別途ご案内') + '</span></div>';
  document.getElementById('confirm-detail').innerHTML = detail;
  document.getElementById('come-note').textContent = 'この日時に、上記の場所へお越しください';
  showStep('step3');
}

function backToBoard() {
  loadBoard();
}

async function loadMypage() {
  showStep('step4');
  document.getElementById('stamp-grid').innerHTML = '読み込み中...';
  try {
    var res = await fetch('/api/public/study-sessions/mypage?emp_no=' + encodeURIComponent(_empNo));
    var d = await res.json();
    if (!res.ok) { alert(d.error || '読み込みに失敗しました'); showStep('step2'); return; }
    renderMypage(d.records || []);
  } catch (e) {
    document.getElementById('stamp-grid').innerHTML = '<div style="text-align:center;color:#dc2626;grid-column:1/-1;">読み込みに失敗しました</div>';
  }
}

function renderMypage(records) {
  var attendedCount = records.filter(function(r) { return r.attended; }).length;
  document.getElementById('stamp-count').textContent = attendedCount;
  if (records.length === 0) {
    document.getElementById('stamp-grid').innerHTML = '<div style="text-align:center;color:#9ca3af;grid-column:1/-1;padding:20px 0;">まだ参加登録の記録がありません</div>';
    return;
  }
  document.getElementById('stamp-grid').innerHTML = records.map(function(r) {
    var filled = !!r.attended;
    return '<div class="stamp-card">'
      + '<div class="stamp-circle ' + (filled ? 'filled' : 'empty') + '">' + (filled ? '済' : '？') + '</div>'
      + '<div class="stamp-title">' + escH(r.title) + '</div>'
      + '<div class="stamp-date">' + fmtDate(r.date) + '</div>'
      + '</div>';
  }).join('');
}

function showRequestForm() {
  document.getElementById('request-content').value = '';
  document.getElementById('request-err').style.display = 'none';
  document.getElementById('request-ok').style.display = 'none';
  showStep('step5');
}
async function submitRequest() {
  var content = document.getElementById('request-content').value.trim();
  var errEl = document.getElementById('request-err');
  var okEl = document.getElementById('request-ok');
  errEl.style.display = 'none'; okEl.style.display = 'none';
  if (!content) { errEl.textContent = '内容を入力してください'; errEl.style.display = 'block'; return; }
  var btn = document.getElementById('request-submit-btn');
  btn.disabled = true;
  try {
    var res = await fetch('/api/public/study-sessions/requests', {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ emp_no: _empNo, content: content })
    });
    var d = await res.json().catch(function() { return {}; });
    if (!res.ok) { errEl.textContent = d.error || '送信に失敗しました'; errEl.style.display = 'block'; return; }
    document.getElementById('request-content').value = '';
    okEl.style.display = 'block';
  } catch (e) {
    errEl.textContent = '送信に失敗しました。もう一度お試しください'; errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
  }
}

function showOpinionForm() {
  document.getElementById('opinion-content').value = '';
  document.getElementById('opinion-category').value = '';
  document.getElementById('opinion-anon').checked = false;
  document.getElementById('opinion-err').style.display = 'none';
  document.getElementById('opinion-ok').style.display = 'none';
  showStep('step6');
}
async function submitOpinion() {
  var content = document.getElementById('opinion-content').value.trim();
  var errEl = document.getElementById('opinion-err');
  var okEl = document.getElementById('opinion-ok');
  errEl.style.display = 'none'; okEl.style.display = 'none';
  if (!content) { errEl.textContent = '内容を入力してください'; errEl.style.display = 'block'; return; }
  var btn = document.getElementById('opinion-submit-btn');
  btn.disabled = true;
  try {
    var res = await fetch('/api/public/study-sessions/opinions', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        emp_no: _empNo,
        content: content,
        category: document.getElementById('opinion-category').value,
        is_anonymous: document.getElementById('opinion-anon').checked
      })
    });
    var d = await res.json().catch(function() { return {}; });
    if (!res.ok) { errEl.textContent = d.error || '送信に失敗しました'; errEl.style.display = 'block'; return; }
    document.getElementById('opinion-content').value = '';
    okEl.style.display = 'block';
  } catch (e) {
    errEl.textContent = '送信に失敗しました。もう一度お試しください'; errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
  }
}

function saveAsImage() {
  if (typeof html2canvas === 'undefined') { alert('画像化ライブラリの読み込みに失敗しました。通信環境を確認してください。'); return; }
  var el = document.querySelector('#step3 .confirm-box');
  if (!el) return;
  var btn = document.getElementById('save-img-btn');
  btn.disabled = true; btn.textContent = '画像を生成中...';
  html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true }).then(function(canvas) {
    return new Promise(function(resolve, reject) {
      canvas.toBlob(function(blob) {
        if (!blob) { reject(new Error('画像データの生成に失敗しました')); return; }
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.download = 'イベント_参加詳細_' + (_lastRegistered ? _lastRegistered.title : '') + '.png';
        link.href = url;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(function() { URL.revokeObjectURL(url); }, 5000);
        resolve();
      }, 'image/png');
    });
  }).catch(function(err) {
    alert('画像の生成に失敗しました: ' + (err && err.message ? err.message : String(err)));
  }).finally(function() {
    btn.disabled = false; btn.textContent = 'この内容を画像で保存';
  });
}

// ===== アンケート =====
var _survey = null;

function showSurveyList() {
  showStep('step7');
  var box = document.getElementById('survey-list');
  box.innerHTML = '<div style="color:#6b7280;font-size:14px;padding:20px 0;text-align:center;">読み込み中...</div>';
  fetch('/api/public/surveys?emp_no=' + encodeURIComponent(_empNo)).then(function(r){ return r.json(); }).then(function(d){
    var list = d.surveys || [];
    if (!list.length) { box.innerHTML = '<div class="card" style="text-align:center;color:#9ca3af;font-size:14px;">現在、回答できるアンケートはありません。</div>'; return; }
    box.innerHTML = list.map(function(s){
      var done = s.answered
        ? '<span style="display:inline-block;font-size:11px;color:#166534;background:#f0fdf4;border:1px solid #86efac;border-radius:99px;padding:1px 8px;margin-left:8px;">回答済み</span>' : '';
      return '<div class="sv-card"><div class="sv-t">' + escH(s.title) + done + '</div>'
        + (s.description ? '<div class="sv-d">' + escH(s.description) + '</div>' : '')
        + '<button class="sv-open-btn" onclick="openSurvey(' + s.id + ')">' + (s.answered ? '回答を確認・修正する' : '回答する') + '</button></div>';
    }).join('');
  }).catch(function(){ box.innerHTML = '<div class="card" style="text-align:center;color:#dc2626;">読み込みに失敗しました</div>'; });
}

function openSurvey(id) {
  showStep('step8');
  document.getElementById('survey-ok').style.display = 'none';
  document.getElementById('survey-err').style.display = 'none';
  document.getElementById('survey-questions').innerHTML = '<div style="color:#6b7280;font-size:14px;">読み込み中...</div>';
  document.getElementById('survey-head').innerHTML = '';
  document.getElementById('survey-submit-btn').style.display = '';
  document.getElementById('survey-back-btn').style.display = '';
  fetch('/api/public/surveys/' + id + '?emp_no=' + encodeURIComponent(_empNo)).then(function(r){ return r.json().then(function(d){ return { ok: r.ok, d: d }; }); }).then(function(x){
    if (!x.ok) { showSurveyList(); alert(x.d.error || '開けませんでした'); return; }
    _survey = x.d;
    renderSurveyForm(x.d);
  }).catch(function(){ showSurveyList(); alert('読み込みに失敗しました'); });
}

function svEsc(s) { return escH(s); }

function renderSurveyForm(sv) {
  var hasPrev = sv.myAnswers && Object.keys(sv.myAnswers).length > 0;
  document.getElementById('survey-head').innerHTML =
    '<div style="font-size:17px;font-weight:800;color:#1e3a5f;margin-bottom:6px;">' + svEsc(sv.title) + '</div>'
    + (sv.description ? '<div style="font-size:13px;color:#6b7280;line-height:1.7;white-space:pre-wrap;margin-bottom:6px;">' + svEsc(sv.description) + '</div>' : '')
    + '<div style="font-size:11px;color:#9ca3af;">社員番号：' + svEsc(_empNo) + '（氏名は保存されません）</div>'
    + (hasPrev ? '<div style="font-size:12px;color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:8px 10px;margin-top:8px;">前回の回答を表示しています。修正して送信すると上書きされます。</div>' : '');

  var html = sv.questions.map(function(q, i){
    var st = q.settings || {};
    var head = '<div class="sv-q" data-qid="' + q.id + '" data-qtype="' + q.qtype + '">'
      + '<div class="sv-q-label">' + (i+1) + '. ' + svEsc(q.label) + (q.required ? '<span class="rq">必須</span>' : '') + '</div>'
      + (q.help ? '<div class="sv-q-help">' + svEsc(q.help) + '</div>' : '');
    var body = '';
    if (q.qtype === 'radio' || q.qtype === 'yesno') {
      var opts = (q.qtype === 'yesno') ? [st.yesLabel || 'はい', st.noLabel || 'いいえ'] : (st.choices || []);
      body = opts.map(function(c){
        return '<label class="sv-opt"><input type="radio" name="q' + q.id + '" value="' + svEsc(c) + '">' + svEsc(c) + '</label>';
      }).join('');
      if (q.qtype === 'radio' && st.allowOther) {
        body += '<label class="sv-opt"><input type="radio" name="q' + q.id + '" value="__other__" onchange="svToggleOther(' + q.id + ',true)">その他</label>'
          + '<input class="sv-in sv-other-in" id="qo' + q.id + '" placeholder="自由記入" style="display:none;" maxlength="200">';
      }
    } else if (q.qtype === 'checkbox') {
      body = (st.choices || []).map(function(c){
        return '<label class="sv-opt"><input type="checkbox" data-cq="' + q.id + '" value="' + svEsc(c) + '">' + svEsc(c) + '</label>';
      }).join('');
      if (st.allowOther) {
        body += '<label class="sv-opt"><input type="checkbox" data-cq="' + q.id + '" value="__other__" onchange="svToggleOther(' + q.id + ',false)">その他</label>'
          + '<input class="sv-in sv-other-in" id="qco' + q.id + '" placeholder="自由記入" style="display:none;" maxlength="200">';
      }
      if (st.minSel || st.maxSel) {
        body += '<div style="font-size:11px;color:#9ca3af;margin-top:4px;">'
          + (st.minSel ? st.minSel + '個以上' : '') + (st.minSel && st.maxSel ? '・' : '') + (st.maxSel ? st.maxSel + '個まで' : '') + '</div>';
      }
    } else if (q.qtype === 'text') {
      body = '<input class="sv-in" id="q' + q.id + '" maxlength="300">';
    } else if (q.qtype === 'textarea') {
      body = '<textarea class="sv-in" id="q' + q.id + '" rows="4" maxlength="2000"></textarea>';
    } else if (q.qtype === 'number') {
      body = '<input class="sv-in" id="q' + q.id + '" type="number" inputmode="decimal">' + (st.unit ? ' <span style="font-size:13px;color:#6b7280;">' + svEsc(st.unit) + '</span>' : '');
    } else if (q.qtype === 'date') {
      body = '<input class="sv-in" id="q' + q.id + '" type="date">';
    } else if (q.qtype === 'scale') {
      var lo = st.scaleMin, hi = st.scaleMax, cells = '';
      for (var n = lo; n <= hi; n++) {
        cells += '<label><input type="radio" name="q' + q.id + '" value="' + n + '"><span>' + n + '</span></label>';
      }
      body = '<div class="sv-scale">' + cells + '</div>'
        + ((st.minLabel || st.maxLabel) ? '<div class="sv-scale-ends"><span>' + svEsc(st.minLabel || '') + '</span><span>' + svEsc(st.maxLabel || '') + '</span></div>' : '');
    }
    return head + body + '</div>';
  }).join('');
  document.getElementById('survey-questions').innerHTML = html || '<div style="color:#9ca3af;">設問がありません</div>';
  svPrefill(sv.myAnswers);
}

function svSetNamedRadio(name, val) {
  var els = document.getElementsByName(name);
  for (var i = 0; i < els.length; i++) { if (els[i].value === val) { els[i].checked = true; return true; } }
  return false;
}
function svPrefill(map) {
  if (!map || !_survey) return;
  _survey.questions.forEach(function(q) {
    var v = map[String(q.id)];
    if (v == null) return;
    var st = q.settings || {};
    if (q.qtype === 'checkbox') {
      if (!Array.isArray(v) || !v.length) return;
      var boxes = document.querySelectorAll('input[data-cq="' + q.id + '"]');
      var known = {};
      for (var i = 0; i < boxes.length; i++) known[boxes[i].value] = boxes[i];
      v.forEach(function(item) {
        if (known[item]) { known[item].checked = true; }
        else if (known['__other__']) {
          known['__other__'].checked = true;
          var oin = document.getElementById('qco' + q.id);
          if (oin) { oin.value = item; oin.style.display = 'block'; }
        }
      });
    } else if (q.qtype === 'radio' || q.qtype === 'yesno' || q.qtype === 'scale') {
      var s = String(v);
      if (s === '') return;
      if (!svSetNamedRadio('q' + q.id, s) && q.qtype === 'radio' && st.allowOther) {
        if (svSetNamedRadio('q' + q.id, '__other__')) {
          var roin = document.getElementById('qo' + q.id);
          if (roin) { roin.value = s; roin.style.display = 'block'; }
        }
      }
    } else {
      var inp = document.getElementById('q' + q.id);
      if (inp) inp.value = String(v);
    }
  });
}

function svToggleOther(qid, isRadio) {
  var box = document.getElementById((isRadio ? 'qo' : 'qco') + qid);
  if (!box) return;
  var on;
  if (isRadio) {
    var r = document.querySelector('input[name="q' + qid + '"]:checked');
    on = r && r.value === '__other__';
  } else {
    var c = document.querySelector('input[data-cq="' + qid + '"][value="__other__"]');
    on = c && c.checked;
  }
  box.style.display = on ? 'block' : 'none';
}

function collectSurveyAnswers() {
  var out = {};
  var qs = document.querySelectorAll('#survey-questions .sv-q');
  for (var i = 0; i < qs.length; i++) {
    var el = qs[i], qid = el.getAttribute('data-qid'), t = el.getAttribute('data-qtype');
    if (t === 'checkbox') {
      var vals = [];
      var cbs = document.querySelectorAll('input[data-cq="' + qid + '"]:checked');
      for (var j = 0; j < cbs.length; j++) {
        var cv = cbs[j].value;
        if (cv === '__other__') { var o = (document.getElementById('qco' + qid) || {}).value || ''; if (o.trim()) vals.push(o.trim()); }
        else vals.push(cv);
      }
      out[qid] = vals;
    } else if (t === 'radio' || t === 'yesno' || t === 'scale') {
      var r = document.querySelector('input[name="q' + qid + '"]:checked');
      var rv = r ? r.value : '';
      if (rv === '__other__') { rv = ((document.getElementById('qo' + qid) || {}).value || '').trim(); }
      out[qid] = rv;
    } else {
      out[qid] = (document.getElementById('q' + qid) || {}).value || '';
    }
  }
  return out;
}

async function submitSurvey() {
  if (!_survey) return;
  var errEl = document.getElementById('survey-err');
  errEl.style.display = 'none';
  var answers = collectSurveyAnswers();
  // クライアント側の簡易必須チェック
  for (var i = 0; i < _survey.questions.length; i++) {
    var q = _survey.questions[i];
    if (!q.required) continue;
    var a = answers[q.id];
    var empty = (q.qtype === 'checkbox') ? (!a || !a.length) : (!a || !String(a).trim());
    if (empty) { errEl.textContent = '「' + (i+1) + '. ' + q.label + '」は必須です'; errEl.style.display = 'block'; return; }
  }
  var btn = document.getElementById('survey-submit-btn');
  btn.disabled = true;
  try {
    var res = await fetch('/api/public/surveys/' + _survey.id + '/respond', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ emp_no: _empNo, answers: answers })
    });
    var d = await res.json().catch(function(){ return {}; });
    if (!res.ok || !d.ok) { errEl.textContent = d.error || '送信に失敗しました'; errEl.style.display = 'block'; btn.disabled = false; return; }
    document.getElementById('survey-ok-title').textContent = d.updated ? '回答を更新しました' : '送信しました';
    document.getElementById('survey-questions').innerHTML = '';
    document.getElementById('survey-head').innerHTML = '';
    document.getElementById('survey-submit-btn').style.display = 'none';
    document.getElementById('survey-back-btn').style.display = 'none';
    document.getElementById('survey-ok').style.display = 'block';
  } catch (e) {
    errEl.textContent = '送信に失敗しました。もう一度お試しください'; errEl.style.display = 'block'; btn.disabled = false;
  }
}

if (_startSurveyId || _startView === 'surveys' || _startView === 'survey') {
  document.getElementById('step1-sub').textContent = 'アンケートに回答します。社員番号を入力してください';
}
showStep('step1');
</script>
</body>
</html>`);
});

export default app;
