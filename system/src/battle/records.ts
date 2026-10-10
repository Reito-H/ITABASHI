// ITABASHI BATTLE 2 — 新卒一人ひとりの記録（どの問題を間違えたか・質問箱に何を書いたか など）
//   ib2_answers（リセットで無効にしたものを除く）・名簿・チーム得点・車椅子タイムを人ごとにまとめる。
//   板橋バトル2の「記録」タブ（一覧・印刷・CSV）と、社員カルテの「バトル記録」タブで共有する。
import { escHtml } from '../html/layout';
import { STEP_KINDS } from './types';

export interface RecRow {
  id: number; game_id: number; step_id: number; question_id: number | null; emp_no: string; team: string;
  answer: string; correct: number; ms: number | null; kind: string; step_title: string; prompt: string;
  answer_label: string; correct_label: string; note: string; likes: number; picked: number; created_at: string;
}
export interface PersonRec {
  gameId: number; gameTitle: string; empNo: string; name: string; team: string; teamName: string;
  teamScore: number; teamRank: number; rows: RecRow[];
  ta: { seconds: number; rank: number; note: string } | null;
  stats: { answered: number; correct: number; wrong: number; placed: number; rate: number | null; buzzOk: number; buzzNg: number; questions: number; votes: number };
}

const QUIZ = ['choice', 'number', 'order', 'buzzer'];

export async function loadBattleRecords(db: D1Database, empNo?: string): Promise<PersonRec[]> {
  const byEmp = empNo ? ' AND emp_no = ?' : '';
  const bind = <T extends D1PreparedStatement>(st: T): T => (empNo ? (st.bind(empNo) as T) : st);
  const [games, roster, players, rows, teams, scores, ta] = await Promise.all([
    db.prepare('SELECT id, title FROM ib2_games').all<{ id: number; title: string }>(),
    bind(db.prepare(`SELECT game_id, emp_no, name, team FROM ib2_roster WHERE 1 = 1${byEmp}`)).all<{ game_id: number; emp_no: string; name: string; team: string }>(),
    bind(db.prepare(`SELECT game_id, emp_no, name, team FROM ib2_players WHERE 1 = 1${byEmp}`)).all<{ game_id: number; emp_no: string; name: string; team: string }>(),
    // 古い記録（列を足す前の分）でも題名・問題文が出るよう、ラウンドと問題を引き当てる
    bind(db.prepare(`SELECT a.id, a.game_id, a.step_id, a.question_id, a.emp_no, a.team, a.answer, a.correct, a.ms, a.likes, a.picked, a.created_at,
        COALESCE(NULLIF(a.kind, ''), s.kind, '') AS kind, COALESCE(NULLIF(a.step_title, ''), s.title, '') AS step_title,
        COALESCE(NULLIF(a.prompt, ''), q.prompt, '') AS prompt, COALESCE(NULLIF(a.answer_label, ''), a.answer) AS answer_label,
        a.correct_label, a.note
      FROM ib2_answers a LEFT JOIN ib2_steps s ON s.id = a.step_id LEFT JOIN ib2_questions q ON q.id = a.question_id
      WHERE a.voided = 0${empNo ? ' AND a.emp_no = ?' : ''} ORDER BY a.id`)).all<RecRow>(),
    db.prepare('SELECT game_id, team, name FROM ib2_teams').all<{ game_id: number; team: string; name: string }>(),
    db.prepare('SELECT game_id, team, SUM(delta) AS total FROM ib2_scores GROUP BY game_id, team').all<{ game_id: number; team: string; total: number }>(),
    db.prepare('SELECT emp_no, name, seconds, note FROM ib2_timeattack ORDER BY seconds').all<{ emp_no: string; name: string; seconds: number; note: string }>(),
  ]);
  const gTitle = new Map((games.results ?? []).map((g) => [g.id, g.title]));
  const tName = new Map((teams.results ?? []).map((t) => [t.game_id + ':' + t.team, t.name]));
  const totals = scores.results ?? [];
  const rankOf = (gid: number, team: string): { score: number; rank: number } => {
    const list = totals.filter((x) => x.game_id === gid).sort((a, b) => b.total - a.total);
    const me = list.find((x) => x.team === team);
    if (!me) return { score: 0, rank: 0 };
    return { score: me.total, rank: list.filter((x) => x.total > me.total).length + 1 };
  };
  const taAll = ta.results ?? [];

  // 対象者：参加した人（ib2_players）＋記録がある人。名前・チームは参加時のものを優先
  const people = new Map<string, { game_id: number; emp_no: string; name: string; team: string }>();
  for (const p of players.results ?? []) people.set(p.game_id + ':' + p.emp_no, p);
  const rosterMap = new Map((roster.results ?? []).map((r) => [r.game_id + ':' + r.emp_no, r]));
  for (const r of rows.results ?? []) {
    const k = r.game_id + ':' + r.emp_no;
    if (!people.has(k)) { const ro = rosterMap.get(k); people.set(k, { game_id: r.game_id, emp_no: r.emp_no, name: ro?.name ?? '', team: ro?.team ?? r.team }); }
  }

  const out: PersonRec[] = [];
  for (const p of people.values()) {
    const mine = (rows.results ?? []).filter((r) => r.game_id === p.game_id && r.emp_no === p.emp_no);
    const quiz = mine.filter((r) => QUIZ.includes(r.kind) && r.correct >= 0);
    const ok = quiz.filter((r) => r.correct === 1).length, ng = quiz.filter((r) => r.correct === 0).length, placed = quiz.filter((r) => r.correct === 2).length;
    const tIdx = taAll.findIndex((x) => x.emp_no === p.emp_no);
    const tr = rankOf(p.game_id, p.team);
    out.push({
      gameId: p.game_id, gameTitle: gTitle.get(p.game_id) ?? '', empNo: p.emp_no, name: p.name, team: p.team,
      teamName: tName.get(p.game_id + ':' + p.team) ?? '', teamScore: tr.score, teamRank: tr.rank, rows: mine,
      ta: tIdx >= 0 ? { seconds: taAll[tIdx].seconds, rank: taAll.filter((x) => x.seconds < taAll[tIdx].seconds).length + 1, note: taAll[tIdx].note } : null,
      stats: {
        answered: quiz.length, correct: ok, wrong: ng, placed, rate: quiz.length ? Math.round(((ok + placed) / quiz.length) * 100) : null,
        buzzOk: mine.filter((r) => r.kind === 'buzzer' && r.correct === 1).length, buzzNg: mine.filter((r) => r.kind === 'buzzer' && r.correct === 0).length,
        questions: mine.filter((r) => r.kind === 'qbox').length, votes: mine.filter((r) => r.kind === 'vote').length,
      },
    });
  }
  out.sort((a, b) => a.gameId - b.gameId || a.team.localeCompare(b.team) || a.empNo.localeCompare(b.empNo));
  return out;
}

const KIND_L: Record<string, string> = Object.fromEntries(STEP_KINDS.map((k) => [k.v, k.l]));
export function resultMark(r: RecRow): string {
  if (r.kind === 'vote') return '投票';
  if (r.kind === 'qbox') return '質問';
  return r.correct === 1 ? '○ 正解' : r.correct === 2 ? '△ 入賞' : r.correct === 0 ? '× 不正解' : '―';
}
function fmtMs(ms: number | null): string { return ms == null ? '' : (ms / 1000).toFixed(2) + '秒'; }
function fmtTA(sec: number): string { const m = Math.floor(sec / 60), s = sec - m * 60; return (m ? m + '分' : '') + s.toFixed(1) + '秒'; }

// 1人分の記録（明るい配色・印刷向け）。社員カルテと印刷ページで同じものを使う
export function personRecordHtml(p: PersonRec): string {
  const s = p.stats;
  const box = (label: string, val: string, color = '#1a3a5c') => `<div class="br-box"><div class="br-k">${label}</div><div class="br-v" style="color:${color}">${val}</div></div>`;
  const quiz = p.rows.filter((r) => QUIZ.includes(r.kind) && r.correct >= 0);
  const wrong = quiz.filter((r) => r.correct === 0);
  const qs = p.rows.filter((r) => r.kind === 'qbox');
  const votes = p.rows.filter((r) => r.kind === 'vote');
  const team = `チーム${escHtml(p.team)}${p.teamName ? '「' + escHtml(p.teamName) + '」' : ''}`;
  let h = `<div class="br-person">
  <div class="br-head"><div><div class="br-name">${escHtml(p.name)} <span>社員番号 ${escHtml(p.empNo)}</span></div>
  <div class="br-sub">${escHtml(p.gameTitle || 'ITABASHI BATTLE 2')}　${team}${p.teamRank ? `　チーム順位 ${p.teamRank}位（${p.teamScore}点）` : ''}</div></div></div>
  <div class="br-boxes">${box('クイズ回答', s.answered + '問')}${box('正解', s.correct + '問', '#15803d')}${box('不正解', s.wrong + '問', s.wrong ? '#b91c1c' : '#1a3a5c')}${s.placed ? box('入賞（ピタリ賞）', s.placed + '問', '#b45309') : ''}${box('正答率', s.rate == null ? '―' : s.rate + '%')}${box('早押し', s.buzzOk + '正解 / ' + s.buzzNg + 'ミス')}${box('質問箱', s.questions + '件')}${box('車椅子タイム', p.ta ? fmtTA(p.ta.seconds) + '（' + p.ta.rank + '位）' : '―')}</div>`;

  h += `<div class="br-sec"><div class="br-h">間違えた問題（${wrong.length}問）</div>`;
  h += wrong.length ? `<table class="br-tb"><tr><th>ラウンド</th><th>問題</th><th>本人の答え</th><th>正解</th></tr>${wrong.map((r) =>
    `<tr><td>${escHtml(r.step_title)}</td><td>${escHtml(r.prompt)}</td><td class="br-ng">${escHtml(r.answer_label)}${r.note ? `<div class="br-n">${escHtml(r.note)}</div>` : ''}</td><td>${escHtml(r.correct_label)}</td></tr>`).join('')}</table>`
    : '<div class="br-empty">間違えた問題はありません</div>';
  h += '</div>';

  h += `<div class="br-sec"><div class="br-h">質問箱に書いた質問（${qs.length}件）</div>`;
  h += qs.length ? `<table class="br-tb"><tr><th>ラウンド</th><th>質問</th><th>いいね</th><th>大画面で紹介</th></tr>${qs.map((r) =>
    `<tr><td>${escHtml(r.step_title)}</td><td>${escHtml(r.answer_label)}</td><td>${r.likes}</td><td>${r.picked ? '紹介された' : ''}</td></tr>`).join('')}</table>`
    : '<div class="br-empty">質問の投稿はありません</div>';
  h += '</div>';

  if (votes.length) {
    h += `<div class="br-sec"><div class="br-h">投票（ディベートなど）</div><table class="br-tb"><tr><th>ラウンド</th><th>お題</th><th>選んだもの</th></tr>${votes.map((r) =>
      `<tr><td>${escHtml(r.step_title)}</td><td>${escHtml(r.prompt)}</td><td>${escHtml(r.answer_label)}</td></tr>`).join('')}</table></div>`;
  }

  h += `<div class="br-sec"><div class="br-h">すべての回答（時間順）</div>`;
  h += quiz.length ? `<table class="br-tb"><tr><th>ラウンド</th><th>種類</th><th>問題</th><th>本人の答え</th><th>正解</th><th>結果</th><th>回答時間</th></tr>${quiz.map((r) =>
    `<tr><td>${escHtml(r.step_title)}</td><td>${escHtml(KIND_L[r.kind] ?? r.kind)}</td><td>${escHtml(r.prompt)}</td><td>${escHtml(r.answer_label)}${r.note ? `<div class="br-n">${escHtml(r.note)}</div>` : ''}</td><td>${escHtml(r.correct_label)}</td><td class="${r.correct === 1 ? 'br-ok' : r.correct === 0 ? 'br-ng' : ''}">${resultMark(r)}</td><td>${fmtMs(r.ms)}</td></tr>`).join('')}</table>`
    : '<div class="br-empty">クイズの回答記録はありません</div>';
  h += '</div></div>';
  return h;
}

export const RECORD_CSS = `
.br-person{font-family:'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif;color:#1f2937;}
.br-head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1a3a5c;padding-bottom:8px;margin-bottom:12px;}
.br-name{font-size:20px;font-weight:800;color:#1a3a5c;} .br-name span{font-size:12px;font-weight:600;color:#6b7280;margin-left:8px;}
.br-sub{font-size:12px;color:#4b5563;margin-top:4px;}
.br-boxes{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:8px;margin-bottom:14px;}
.br-box{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px;}
.br-k{font-size:10.5px;color:#6b7280;} .br-v{font-size:15px;font-weight:800;margin-top:2px;}
.br-sec{margin-bottom:14px;break-inside:auto;}
.br-h{font-size:13px;font-weight:800;color:#1a3a5c;border-left:4px solid #1a3a5c;padding-left:8px;margin-bottom:6px;}
.br-tb{width:100%;border-collapse:collapse;font-size:12px;}
.br-tb th{background:#f3f4f6;color:#4b5563;font-weight:700;text-align:left;padding:5px 7px;border:1px solid #e5e7eb;white-space:nowrap;}
.br-tb td{padding:5px 7px;border:1px solid #e5e7eb;vertical-align:top;}
.br-tb tr{break-inside:avoid;}
.br-ok{color:#15803d;font-weight:700;} .br-ng{color:#b91c1c;font-weight:700;}
.br-n{font-size:10.5px;color:#6b7280;font-weight:400;}
.br-empty{font-size:12px;color:#9ca3af;padding:4px 2px;}`;

// 印刷用ページ（1人1ページ）
export function recordsPrintPage(list: PersonRec[], title: string): string {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(title)}</title>
<style>body{margin:0;background:#e5e7eb;} .bar{position:sticky;top:0;background:#1a3a5c;color:#fff;padding:10px 16px;display:flex;gap:12px;align-items:center;font:700 14px sans-serif;}
.bar button{padding:7px 16px;border:0;border-radius:6px;background:#fff;color:#1a3a5c;font-weight:800;cursor:pointer;}
.page{background:#fff;max-width:900px;margin:16px auto;padding:24px 28px;box-shadow:0 2px 10px rgba(0,0,0,.08);}
${RECORD_CSS}
@page{size:A4;margin:12mm;} @media print{body{background:#fff;} .bar{display:none;} .page{box-shadow:none;margin:0;max-width:none;padding:0;break-after:page;} .page:last-child{break-after:auto;}}</style></head>
<body><div class="bar"><span>${escHtml(title)}（${list.length}人）</span><button onclick="window.print()">印刷・PDF保存</button></div>
${list.length ? list.map((p) => `<div class="page">${personRecordHtml(p)}</div>`).join('') : '<div class="page">記録はまだありません。</div>'}
</body></html>`;
}

// CSV（1行＝1回答）。Excelで文字化けしないようBOM付き
export function recordsCsv(list: PersonRec[]): string {
  const q = (v: unknown) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const head = ['ゲーム', '社員番号', '氏名', 'チーム', 'チーム名', 'ラウンド', '種類', '問題・お題', '本人の答え', '正解', '結果', '補足', '回答時間(秒)', 'いいね', '大画面で紹介', '日時'];
  const lines = [head.map(q).join(',')];
  for (const p of list) for (const r of p.rows) {
    lines.push([p.gameTitle, p.empNo, p.name, p.team, p.teamName, r.step_title, KIND_L[r.kind] ?? r.kind, r.prompt, r.answer_label, r.correct_label,
      resultMark(r), r.note, r.ms == null ? '' : (r.ms / 1000).toFixed(2), r.kind === 'qbox' ? r.likes : '', r.picked ? '○' : '', r.created_at].map(q).join(','));
  }
  return '﻿' + lines.join('\r\n');
}
