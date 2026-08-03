// 深夜割引モジュール（toll_calc.ts の計算結果に対する後段処理として分離）
//
// 現行ルール(2026年8月時点。NEXCO東日本公式「料金の額及び徴収期間の公告」で条文確認済み):
//   NEXCO系: ETC限定、入口・出口いずれかの料金所通過時刻が深夜0時〜4時なら区間全体が3割引
//   首都高: ETC限定、深夜0時〜4時の間に「入口料金所」を通過すると当該区間が2割引（公式サイトで確認済み）
//   （NEXCOは入口/出口どちらでも良いが、首都高は入口のみが基準になる点が異なる）
// 区間ごとの実際の通過時刻は分からないため、出発予定時刻と仮定平均速度から
// 各区間の入口・出口時刻を概算して判定する（渋滞等は考慮しない簡易推定であることをUI側にも明示する）。
// 将来、深夜割引が「走行した距離の分だけ按分」ルールに変わった場合は、このファイルの中身だけを
// 差し替えれば呼び出し側(API)は変更不要な設計にしている。

import type { RouteSegment, TollOperator } from './toll_calc';

const ASSUMED_SPEED_KMH = 80; // 区間の概算通過時刻を出すための仮定平均速度（高速道路の巡航速度の目安）

const NEXCO_NIGHT_DISCOUNT_RATE = 0.30;
const SHUTOKO_NIGHT_DISCOUNT_RATE = 0.20;

export type NightDiscountSegment = RouteSegment & { fareAfterDiscount: number; nightDiscounted: boolean };

export type NightDiscountResult = {
  applied: boolean;
  totalBeforeDiscount: number;
  totalAfterDiscount: number;
  segments: NightDiscountSegment[];
  note: string;
};

function minutesInDay(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mi = parseInt(m[2], 10);
  return h * 60 + mi;
}

function isDeepNight(totalMinutes: number): boolean {
  const m = ((totalMinutes % 1440) + 1440) % 1440; // 日をまたいでも0-1439に正規化
  return m < 4 * 60;
}

function segmentDiscountRate(operator: TollOperator | '特例'): number {
  if (operator === 'shutoko') return SHUTOKO_NIGHT_DISCOUNT_RATE;
  if (operator === '特例') return 0; // 固定額特例区間（アクアライン等）は本ルールの対象外（要個別確認）
  return NEXCO_NIGHT_DISCOUNT_RATE;
}

// depTime: 出発予定時刻 "HH:MM"（未入力なら深夜割引の判定自体を行わない）
export function applyNightDiscount(segments: RouteSegment[], depTime?: string): NightDiscountResult {
  const totalBeforeDiscount = segments.reduce((s, seg) => s + seg.fare, 0);
  const startMin = depTime ? minutesInDay(depTime) : null;

  if (startMin === null) {
    return {
      applied: false,
      totalBeforeDiscount,
      totalAfterDiscount: totalBeforeDiscount,
      segments: segments.map(s => ({ ...s, fareAfterDiscount: s.fare, nightDiscounted: false })),
      note: '出発時刻が未入力のため深夜割引は判定していません',
    };
  }

  let cursorMin = startMin;
  let anyApplied = false;
  const discounted = segments.map(seg => {
    const durationMin = (seg.distanceKm / ASSUMED_SPEED_KMH) * 60;
    const entryMin = cursorMin;
    const exitMin = cursorMin + durationMin;
    cursorMin = exitMin;

    // 首都高=入口通過時刻のみが基準、NEXCO系=入口・出口いずれかが深夜帯なら対象
    const nightDiscounted = seg.operator === 'shutoko' ? isDeepNight(entryMin)
      : seg.operator === '特例' ? false
      : isDeepNight(entryMin) || isDeepNight(exitMin);
    const rate = nightDiscounted ? segmentDiscountRate(seg.operator) : 0;
    const fareAfterDiscount = nightDiscounted ? Math.round((seg.fare * (1 - rate)) / 10) * 10 : seg.fare;
    if (nightDiscounted) anyApplied = true;
    return { ...seg, fareAfterDiscount, nightDiscounted };
  });

  const totalAfterDiscount = discounted.reduce((s, seg) => s + seg.fareAfterDiscount, 0);
  return {
    applied: anyApplied,
    totalBeforeDiscount,
    totalAfterDiscount,
    segments: discounted,
    note: anyApplied
      ? `出発時刻から平均時速${ASSUMED_SPEED_KMH}km/hと仮定して概算した区間ごとの通過時刻をもとに深夜割引を適用しました（首都高は入口通過時刻、NEXCO系は入口・出口いずれかが深夜帯かで判定。実際の所要時間により結果が前後する場合があります）。`
      : '深夜0時〜4時の通過に該当する区間はありませんでした（出発時刻からの概算）',
  };
}
