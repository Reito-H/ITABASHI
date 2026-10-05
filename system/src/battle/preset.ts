// ITABASHI BATTLE 2 — 「おすすめ構成を一括作成」で入るメニュー（例題つき。あとで管理画面から自由に直す）
//   正解が地域の実情に左右される問題（交差点・運賃・お店）は「講師が入力」の仮置きにしてある。
export interface PresetQ { prompt: string; choices?: string[]; answer?: string; points?: number; time_limit?: number; note?: string }
export interface PresetStep { kind: string; title: string; config?: Record<string, unknown>; qs?: PresetQ[] }

const OX = ['○', '×'];
const OKNG = ['OK', 'NG'];

export const BATTLE_PRESET: PresetStep[] = [
  { kind: 'video', title: 'オープニング映像', config: { autoplay: true, bgm: 'none' } },
  { kind: 'title', title: 'オープニング', config: { subtitle: '繁忙期を勝ち抜け！ チーム対抗バトル', body: '1日を通してチームで得点を競います\n優勝チームには表彰あり！', bgm: 'builtin:battle' } },
  {
    kind: 'choice', title: '○×サバイバル（ウォーミングアップ）', config: { survival: true, survivalPoints: 10, mode: 'all' },
    qs: [
      { prompt: 'お客様が降りたら、毎回車内の忘れ物を確認する', choices: OX, answer: '0', time_limit: 10, note: '降車ごとの確認が、忘れ物を早くお返しする一番の近道' },
      { prompt: '渋滞で遅れそうなときは、到着してから謝ればよい', choices: OX, answer: '1', time_limit: 10, note: '遅れそうな時点で先に伝えるのが正解' },
      { prompt: '行き先が聞き取れたら、復唱しなくてもよい', choices: OX, answer: '1', time_limit: 10, note: '復唱は聞き間違いを防ぐ一番の方法' },
      { prompt: '危ないと感じたお客様の対応は、一人で抱えず営業所に連絡する', choices: OX, answer: '0', time_limit: 10 },
      { prompt: '休憩は、眠くなってから取ればよい', choices: OX, answer: '1', time_limit: 10, note: '休憩は疲れる前に。眠気を感じたら迷わず仮眠' },
    ],
  },
  { kind: 'title', title: '講座 第1部', config: { subtitle: '繁忙期の売上と出番数', body: '45分' } },
  {
    kind: 'buzzer', title: '交差点名クイズ', config: { zoom: true, bgm: 'builtin:battle2' },
    qs: [
      { prompt: 'この交差点の名前は？', answer: '（講師が入力）', points: 10, note: '画像は「素材」タブでアップロードして、この問題に設定してください' },
      { prompt: 'この交差点の名前は？', answer: '（講師が入力）', points: 10 },
      { prompt: 'この交差点の名前は？', answer: '（講師が入力）', points: 10 },
    ],
  },
  { kind: 'title', title: '休憩', config: { subtitle: '15分', timer: 15, bgm: 'builtin:chill' } },
  {
    kind: 'number', title: '運賃ピタリ賞', config: { unit: '円', mode: 'leader' },
    qs: [
      { prompt: '営業所 → 羽田空港（昼・高速利用）の運賃はいくら？', answer: '', points: 10, time_limit: 30, note: '正解は講師が入力してください' },
      { prompt: '池袋駅 → 営業所（深夜）の運賃はいくら？', answer: '', points: 10, time_limit: 30, note: '正解は講師が入力してください' },
    ],
  },
  { kind: 'title', title: '講座 第2部', config: { subtitle: 'トラブル・クレーム防止', body: '45分' } },
  {
    kind: 'choice', title: 'OK・NG 瞬間ジャッジ', config: { mode: 'all', bgm: 'builtin:chip' },
    qs: [
      { prompt: '「知りません」', choices: OKNG, answer: '1', points: 3, time_limit: 8, note: '→「確認いたします」' },
      { prompt: '「〇〇通りでよろしいでしょうか」', choices: OKNG, answer: '0', points: 3, time_limit: 8 },
      { prompt: '「ナビ通りなんで」', choices: OKNG, answer: '1', points: 3, time_limit: 8, note: '→「こちらのルートでよろしいでしょうか」' },
      { prompt: '「この先が混雑しておりまして、10分ほど遅れそうです」', choices: OKNG, answer: '0', points: 3, time_limit: 8 },
      { prompt: '「混んでるんで」', choices: OKNG, answer: '1', points: 3, time_limit: 8, note: '→「この先が混雑しておりまして」' },
      { prompt: '「お忘れ物はございませんか」', choices: OKNG, answer: '0', points: 3, time_limit: 8 },
    ],
  },
  { kind: 'title', title: '昼休憩', config: { subtitle: '60分', timer: 60, bgm: 'builtin:jazz' } },
  {
    kind: 'vote', title: '付け待ち vs 流し ディベート', config: { mode: 'all', bgm: 'builtin:battle' },
    qs: [{ prompt: '繁忙期の金曜夜、稼げるのはどっち？', choices: ['付け待ち派', '流し派'], time_limit: 30 }],
  },
  { kind: 'qbox', title: '先輩の稼ぎ方インタビュー', config: {} },
  { kind: 'title', title: '休憩', config: { subtitle: '15分', timer: 15, bgm: 'builtin:lobby' } },
  {
    kind: 'order', title: '並べ替え：車椅子スロープの手順', config: { mode: 'leader', bgm: 'builtin:battle' },
    qs: [{
      prompt: '車椅子のお客様をお乗せする手順を、正しい順に並べよう',
      choices: ['スライドドアを開ける', 'スロープを引き出して設置する', '声をかけながら車椅子をゆっくり乗せる', '車椅子を固定する', 'スロープを収納してドアを閉める', '運転席に戻る'],
      points: 10, time_limit: 60, note: '実際の車両の手順に合わせて講師が修正してください',
    }],
  },
  {
    kind: 'ranking', title: '美味しかったお店ランキング', config: { bgm: 'builtin:result' },
    qs: [
      { prompt: '（お店の名前）', answer: '（ジャンル・エリア）', note: '' },
      { prompt: '（お店の名前）', answer: '（ジャンル・エリア）', note: '' },
      { prompt: '（お店の名前）', answer: '（ジャンル・エリア）', note: '' },
    ],
  },
  { kind: 'timeattack', title: '車椅子タイムアタック ランキング', config: { top: 10, bgm: 'builtin:result' } },
  { kind: 'mygrowth', title: 'わたしの成長', config: { bgm: 'builtin:anthem' } },
  { kind: 'mysales', title: 'わたしの売上', config: { bgm: 'builtin:chill' } },
  { kind: 'scoreboard', title: '最終結果発表', config: { final: true, bgm: 'builtin:anthem' } },
];

// 新しく作るラウンドの初期値
export function defaultStepConfig(kind: string): Record<string, unknown> {
  if (kind === 'choice') return { mode: 'all', survival: false, survivalPoints: 10 };
  if (kind === 'number') return { mode: 'all', unit: '' };
  if (kind === 'order' || kind === 'vote') return { mode: 'all' };
  if (kind === 'buzzer') return { zoom: false };
  if (kind === 'timeattack') return { top: 10 };
  if (kind === 'scoreboard') return { final: false };
  if (kind === 'video') return { autoplay: true, bgm: 'none' };
  return {};
}
export function defaultQuestion(kind: string): PresetQ {
  if (kind === 'choice') return { prompt: '', choices: ['選択肢1', '選択肢2', '選択肢3', '選択肢4'], answer: '0', points: 10, time_limit: 20 };
  if (kind === 'vote') return { prompt: '', choices: ['A派', 'B派'], time_limit: 30 };
  if (kind === 'order') return { prompt: '正しい順に並べよう', choices: ['1番目', '2番目', '3番目', '4番目'], points: 10, time_limit: 45 };
  if (kind === 'number') return { prompt: '', answer: '', points: 10, time_limit: 30 };
  if (kind === 'ranking') return { prompt: '（名前）', answer: '', note: '' };
  return { prompt: '', answer: '', points: 10, time_limit: 20 };
}
