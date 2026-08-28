// カナの正規化。
//   ・半角カナ（濁点/半濁点の結合含む）→ 全角カナ
//   ・ひらがな → 全角カタカナ
//   ・連続する空白（全角スペース含む）→ 半角スペース1個、前後トリム
//
// 人事システムから出力される動態表 xlsx の「社員名（カナ）」が半角カナで来るため、
// DB へ保存する前に必ずこれを通し、name_kana は全角カタカナで統一する。
// 検索クエリ側にも同じ関数を通すことで、ひらがな・半角カナで打っても
// 全角カタカナの name_kana に一致する。

const HANKAKU_KANA: Record<string, string> = {
  'ｦ': 'ヲ', 'ｧ': 'ァ', 'ｨ': 'ィ', 'ｩ': 'ゥ', 'ｪ': 'ェ', 'ｫ': 'ォ',
  'ｬ': 'ャ', 'ｭ': 'ュ', 'ｮ': 'ョ', 'ｯ': 'ッ', 'ｰ': 'ー',
  'ｱ': 'ア', 'ｲ': 'イ', 'ｳ': 'ウ', 'ｴ': 'エ', 'ｵ': 'オ',
  'ｶ': 'カ', 'ｷ': 'キ', 'ｸ': 'ク', 'ｹ': 'ケ', 'ｺ': 'コ',
  'ｻ': 'サ', 'ｼ': 'シ', 'ｽ': 'ス', 'ｾ': 'セ', 'ｿ': 'ソ',
  'ﾀ': 'タ', 'ﾁ': 'チ', 'ﾂ': 'ツ', 'ﾃ': 'テ', 'ﾄ': 'ト',
  'ﾅ': 'ナ', 'ﾆ': 'ニ', 'ﾇ': 'ヌ', 'ﾈ': 'ネ', 'ﾉ': 'ノ',
  'ﾊ': 'ハ', 'ﾋ': 'ヒ', 'ﾌ': 'フ', 'ﾍ': 'ヘ', 'ﾎ': 'ホ',
  'ﾏ': 'マ', 'ﾐ': 'ミ', 'ﾑ': 'ム', 'ﾒ': 'メ', 'ﾓ': 'モ',
  'ﾔ': 'ヤ', 'ﾕ': 'ユ', 'ﾖ': 'ヨ',
  'ﾗ': 'ラ', 'ﾘ': 'リ', 'ﾙ': 'ル', 'ﾚ': 'レ', 'ﾛ': 'ロ',
  'ﾜ': 'ワ', 'ﾝ': 'ン',
  '｡': '。', '｢': '「', '｣': '」', '､': '、', '･': '・', '　': ' ',
};

const HANKAKU_DAKUTEN: Record<string, string> = {
  'ｶ': 'ガ', 'ｷ': 'ギ', 'ｸ': 'グ', 'ｹ': 'ゲ', 'ｺ': 'ゴ',
  'ｻ': 'ザ', 'ｼ': 'ジ', 'ｽ': 'ズ', 'ｾ': 'ゼ', 'ｿ': 'ゾ',
  'ﾀ': 'ダ', 'ﾁ': 'ヂ', 'ﾂ': 'ヅ', 'ﾃ': 'デ', 'ﾄ': 'ド',
  'ﾊ': 'バ', 'ﾋ': 'ビ', 'ﾌ': 'ブ', 'ﾍ': 'ベ', 'ﾎ': 'ボ',
  'ｳ': 'ヴ', 'ﾜ': 'ヷ', 'ｦ': 'ヺ',
};

const HANKAKU_HANDAKUTEN: Record<string, string> = {
  'ﾊ': 'パ', 'ﾋ': 'ピ', 'ﾌ': 'プ', 'ﾍ': 'ペ', 'ﾎ': 'ポ',
};

const HW_DAKUTEN = 'ﾞ';      // ﾞ
const HW_HANDAKUTEN = 'ﾟ';   // ﾟ

/**
 * カナを全角カタカナへ正規化する。null/undefined はそのまま返す。
 * 空文字（トリム後に空）になった場合は null を返す。
 */
export function normalizeKana(input: string | null | undefined): string | null {
  if (input == null) return null;
  const s = String(input);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const next = s[i + 1];
    if (next === HW_DAKUTEN && HANKAKU_DAKUTEN[ch]) { out += HANKAKU_DAKUTEN[ch]; i++; continue; }
    if (next === HW_HANDAKUTEN && HANKAKU_HANDAKUTEN[ch]) { out += HANKAKU_HANDAKUTEN[ch]; i++; continue; }
    if (HANKAKU_KANA[ch]) { out += HANKAKU_KANA[ch]; continue; }
    if (ch === HW_DAKUTEN) { out += '゛'; continue; }   // 単独の半角濁点 → 全角濁点
    if (ch === HW_HANDAKUTEN) { out += '゜'; continue; }
    out += ch;
  }
  // ひらがな → カタカナ
  out = out.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
  // 空白を半角スペース1個へ集約
  out = out.replace(/\s+/g, ' ').trim();
  return out === '' ? null : out;
}
