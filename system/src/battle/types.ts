// ITABASHI BATTLE 2 — 共有の型・定数
export const TEAMS = ['A', 'B', 'C', 'D'] as const;
export type TeamId = typeof TEAMS[number];
export const TEAM_COLORS: Record<TeamId, string> = { A: '#ff3b6b', B: '#2fd3ff', C: '#ffd23f', D: '#7cff6b' };

export const STEP_KINDS: Array<{ v: string; l: string; desc: string }> = [
  { v: 'lobby', l: '参加受付（ロビー）', desc: 'ロゴを中央に表示。「QRを表示」で参加用QRを演出つきで出す' },
  { v: 'reveal', l: 'チーム発表', desc: 'A〜Dのチームとメンバーを発表（スマホにも自分のチームを表示）' },
  { v: 'setup', l: '代表者・チーム名決め', desc: '各チームのスマホで代表者とチーム名を決める' },
  { v: 'black', l: '黒画面', desc: 'プロジェクターを真っ黒にする（音も止める）' },
  { v: 'formal', l: '講座スライド（白・まじめ）', desc: '白い背景のまじめなスライド。ロゴ・得点・BGM・効果音を一切出さない（「実は楽しいイベントでした！」の前フリなどに）' },
  { v: 'title', l: 'タイトル・講座・休憩', desc: '見出し・本文・画像を表示（タイマーも使える）' },
  { v: 'video', l: '動画', desc: 'プロジェクターで動画を全画面再生（オープニング映像など）' },
  { v: 'buzzer', l: '早押しクイズ', desc: '画像や問題文を出して早押し。講師が○×で判定' },
  { v: 'choice', l: '選択クイズ', desc: '2〜4択（○×・どっち？・OK/NG も）。自動採点。サバイバルも可' },
  { v: 'number', l: 'ピタリ賞', desc: '数字で回答（運賃・所要時間など）。近い順に得点' },
  { v: 'order', l: '並べ替え', desc: '手順などを正しい順に並べる。正解＋早さで得点' },
  { v: 'vote', l: '投票', desc: 'ディベートなどの投票。結果をグラフ表示' },
  { v: 'qbox', l: '質問箱', desc: 'スマホから質問を投稿・いいね。講師が選んで大画面へ' },
  { v: 'ranking', l: 'ランキング発表', desc: '下位から1つずつ発表（お店ランキングなど）' },
  { v: 'timeattack', l: '車椅子タイムアタック', desc: '入力したタイムのランキングを発表' },
  { v: 'mygrowth', l: 'わたしの成長（売上）', desc: '各自のスマホに、月度ごとの平均売上と前月比の向上率を表示（本人のデータだけ）' },
  { v: 'mysales', l: 'わたしの売上（詳細・保存）', desc: '各自のスマホに、日ごとの売上一覧を表示しCSVで保存（本人のデータだけ）' },
  { v: 'prizes', l: '景品発表', desc: '賞ごとに「受賞者 → 景品」を1つずつ発表（車椅子タイムの順位・チーム順位から自動で受賞者を出せる。画像も貼れる）' },
  { v: 'announce', l: '発表（予告 → 画像・動画）', desc: '予告の文を出してから、ボタンで画像や動画つきで発表（打ち上げ会場の発表など）' },
  { v: 'scoreboard', l: '得点発表', desc: 'チームの順位をドラムロールつきで発表' },
];
export const STEP_KIND_SET = new Set(STEP_KINDS.map((k) => k.v));

export interface StepRow { id: number; game_id: number; sort_order: number; kind: string; title: string; config: string }
export interface QuestionRow {
  id: number; step_id: number; sort_order: number; prompt: string; image_id: number | null;
  choices: string; answer: string; points: number; time_limit: number; note: string; seq?: string;
}

// 景品発表の演出の順番（ib2_questions.seq）。空なら従来どおり（points=1 で景品→受賞者）
//   lines = 景品の文を「次を発表」1回につき1行ずつ出す
export const PRIZE_PARTS = ['winner', 'prize', 'lines', 'image', 'full'] as const;
export function prizeSeq(seq: string | undefined, points: number): string[] {
  const s = String(seq || '').split(',').map((x) => x.trim()).filter((x, i, a) => (PRIZE_PARTS as readonly string[]).includes(x) && a.indexOf(x) === i);
  if (s.length) return s.includes('lines') ? s.filter((x) => x !== 'prize') : s;
  return points === 1 ? ['prize', 'winner'] : ['winner', 'prize'];
}
// 実際に「次を発表」で進む1歩ずつの並び（lines は行数ぶんの line0, line1 … に展開）
export function prizeSteps(seq: string[], answer: string): string[] {
  const n = Math.max(1, String(answer || '').split('\n').filter((x) => x.trim()).length);
  return seq.flatMap((p) => (p === 'lines' ? Array.from({ length: n }, (_, i) => 'line' + i) : [p]));
}
export interface PlayerRow { id: number; game_id: number; emp_no: string; name: string; team: string; token: string }
export interface TeamRow { game_id: number; team: string; name: string; leader_emp: string }

export function parseJson<T>(s: string | null | undefined, fallback: T): T {
  try { const v = JSON.parse(String(s ?? '')); return (v ?? fallback) as T; } catch { return fallback; }
}
