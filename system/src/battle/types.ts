// ITABASHI BATTLE 2 — 共有の型・定数
export const TEAMS = ['A', 'B', 'C', 'D'] as const;
export type TeamId = typeof TEAMS[number];
export const TEAM_COLORS: Record<TeamId, string> = { A: '#ff3b6b', B: '#2fd3ff', C: '#ffd23f', D: '#7cff6b' };

export const STEP_KINDS: Array<{ v: string; l: string; desc: string }> = [
  { v: 'title', l: 'タイトル・講座・休憩', desc: '見出し・本文・画像を表示（タイマーも使える）' },
  { v: 'buzzer', l: '早押しクイズ', desc: '画像や問題文を出して早押し。講師が○×で判定' },
  { v: 'choice', l: '選択クイズ', desc: '2〜4択（○×・どっち？・OK/NG も）。自動採点。サバイバルも可' },
  { v: 'number', l: 'ピタリ賞', desc: '数字で回答（運賃・所要時間など）。近い順に得点' },
  { v: 'order', l: '並べ替え', desc: '手順などを正しい順に並べる。正解＋早さで得点' },
  { v: 'vote', l: '投票', desc: 'ディベートなどの投票。結果をグラフ表示' },
  { v: 'qbox', l: '質問箱', desc: 'スマホから質問を投稿・いいね。講師が選んで大画面へ' },
  { v: 'ranking', l: 'ランキング発表', desc: '下位から1つずつ発表（お店ランキングなど）' },
  { v: 'timeattack', l: '車椅子タイムアタック', desc: '入力したタイムのランキングを発表' },
  { v: 'scoreboard', l: '得点発表', desc: 'チームの順位をドラムロールつきで発表' },
];
export const STEP_KIND_SET = new Set(STEP_KINDS.map((k) => k.v));

export interface StepRow { id: number; game_id: number; sort_order: number; kind: string; title: string; config: string }
export interface QuestionRow {
  id: number; step_id: number; sort_order: number; prompt: string; image_id: number | null;
  choices: string; answer: string; points: number; time_limit: number; note: string;
}
export interface PlayerRow { id: number; game_id: number; emp_no: string; name: string; team: string; token: string }
export interface TeamRow { game_id: number; team: string; name: string; leader_emp: string }

export function parseJson<T>(s: string | null | undefined, fallback: T): T {
  try { const v = JSON.parse(String(s ?? '')); return (v ?? fallback) as T; } catch { return fallback; }
}
