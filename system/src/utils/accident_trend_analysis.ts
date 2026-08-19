// 事故記録データの集計→テンプレート文への変換（個人別レポート・課別レポート共通）
// 「AI」は表示名のみで、外部AI/LLM APIへの通信は一切行わない。ルールベースの頻度集計＋しきい値判定＋定型文のみ。
import { type AccidentRecord, bucketHourBands, bucketWeekday, hourBandLabel, WEEKDAY_LABELS_JA } from '../html/accidents';

export interface TrendAnalysisContent {
  headline: string;          // 一言の総評
  trend_summary: string;     // 傾向分析（複数文）
  main_causes: string[];     // 主な原因
  risk_pattern: string;      // リスクパターンの説明
  recommendations: string[]; // 改善提案
  closing_comment: string;   // 結びのコメント
  weekday_breakdown: Array<{ label: string; cnt: number }>; // 曜日別件数（日〜土、常に7件）
}

export function freqRanking(records: AccidentRecord[], keyFn: (r: AccidentRecord) => string | null | undefined): Array<{ key: string; cnt: number }> {
  const map = new Map<string, number>();
  for (const r of records) {
    const v = keyFn(r);
    if (!v) continue;
    map.set(v, (map.get(v) || 0) + 1);
  }
  return Array.from(map.entries()).map(([key, cnt]) => ({ key, cnt })).sort((a, b) => b.cnt - a.cnt);
}

export function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

// 原因の主要キーワードに対する定型の改善提案（データに基づく原因が見つかった場合のみ使う）
const CAUSE_RECOMMENDATION_RULES: Array<{ match: RegExp; advice: string }> = [
  { match: /安全確認|目視|死角/, advice: '発進・後退・車線変更の前に、目視とミラー確認を必ず一時停止して行う' },
  { match: /前方不注意|わき見|漫然/, advice: '走行中はスマートフォンや車内機器の操作を避け、前方への注意を保つ' },
  { match: /車間|追突/, advice: '車間距離を普段より広めにとり、早めのブレーキを心がける' },
  { match: /バック|後退/, advice: '後退時は必ず降車確認または同乗者の誘導を活用する' },
  { match: /出会い頭|交差点/, advice: '交差点進入時は徐行し、左右の安全確認を徹底する' },
  { match: /スリップ|雨|凍結|悪天候/, advice: '悪天候時は速度を落とし、急ハンドル・急ブレーキを避ける' },
  { match: /駐車|接触/, advice: '駐車・幅寄せ時は焦らず、必要に応じて一度停止して周囲を確認する' },
  { match: /右折|左折/, advice: '右左折時は歩行者・自転車の巻き込みに注意し、減速して曲がる' },
  { match: /速度|スピード/, advice: '法定速度・制限速度を厳守し、余裕を持った運行スケジュールを意識する' },
];

function pickRecommendations(causeRanking: Array<{ key: string; cnt: number }>): string[] {
  const recs: string[] = [];
  for (const cause of causeRanking) {
    const rule = CAUSE_RECOMMENDATION_RULES.find(r => r.match.test(cause.key));
    if (rule && !recs.includes(rule.advice)) recs.push(rule.advice);
    if (recs.length >= 3) break;
  }
  if (recs.length === 0) {
    recs.push('出庫前点検と安全確認の基本動作を今一度徹底する', '運行前に当日のルート・天候・交通状況を確認しておく');
  }
  return recs.slice(0, 5);
}

// 事故記録データを集計し、TrendAnalysisContent形式のテンプレート文を組み立てる（外部通信なし・同期処理）
export function buildRuleBasedTrendAnalysis(records: AccidentRecord[]): TrendAnalysisContent {
  const cnt = records.length;

  const targets = freqRanking(records, r => r.accident_target);
  const forms = freqRanking(records, r => r.accident_form);
  const causesDirect = freqRanking(records, r => r.cause_direct);
  const causesReason = freqRanking(records, r => r.cause_reason);
  const weathers = freqRanking(records, r => r.weather);
  const roadConds = freqRanking(records, r => r.road_condition);
  const causeRanking = causesDirect.length ? causesDirect : causesReason;

  const hourBands = bucketHourBands(records.map(r => r.occurred_time));
  const hourMaxIdx = hourBands.reduce((best, v, i) => (v > hourBands[best] ? i : best), 0);
  const hourMax = hourBands[hourMaxIdx];

  const weekdayBands = bucketWeekday(records.map(r => r.occurred_date));
  const weekdayMaxIdx = weekdayBands.reduce((best, v, i) => (v > weekdayBands[best] ? i : best), 0);
  const weekdayMax = weekdayBands[weekdayMaxIdx];
  const weekday_breakdown = WEEKDAY_LABELS_JA.map((label, i) => ({ label, cnt: weekdayBands[i] }));

  // ヘッドライン
  let headline: string;
  if (cnt < 2) {
    headline = `事故記録は${cnt}件のみのため、傾向と呼べるほどのデータはまだありません。`;
  } else if (causeRanking.length && pct(causeRanking[0].cnt, cnt) >= 40) {
    headline = `全${cnt}件のうち${causeRanking[0].cnt}件（${pct(causeRanking[0].cnt, cnt)}%）が「${causeRanking[0].key}」に関連して発生しています。`;
  } else if (targets.length && pct(targets[0].cnt, cnt) >= 40) {
    headline = `全${cnt}件のうち${targets[0].cnt}件（${pct(targets[0].cnt, cnt)}%）が「${targets[0].key}」との事故です。`;
  } else {
    headline = `全${cnt}件の事故記録があります。特定の状況への大きな偏りは見られません。`;
  }

  // 傾向分析
  const trendParts: string[] = [`対象期間中の事故件数は${cnt}件です。`];
  if (targets.length) trendParts.push(`事故対象で最も多いのは「${targets[0].key}」（${targets[0].cnt}件、${pct(targets[0].cnt, cnt)}%）です。`);
  if (forms.length) trendParts.push(`事故形態としては「${forms[0].key}」が${forms[0].cnt}件（${pct(forms[0].cnt, cnt)}%）と最多です。`);
  if (cnt >= 3 && causeRanking.length && pct(causeRanking[0].cnt, cnt) < 40) {
    trendParts.push('原因は複数の要因に分散しており、単一の傾向には偏っていません。');
  }
  const trend_summary = trendParts.join('');

  // 主な原因
  const main_causes = causeRanking.slice(0, 5).map(c => `${c.key}（${c.cnt}件、全体の${pct(c.cnt, cnt)}%）`);

  // リスクパターン（時間帯・曜日・天候・道路状況）
  const riskParts: string[] = [];
  if (cnt >= 3 && hourMax >= Math.max(2, Math.ceil(cnt * 0.3))) {
    riskParts.push(`発生時間帯は${hourBandLabel(hourMaxIdx)}台が${hourMax}件と多く、この時間帯に注意が必要です。`);
  }
  if (cnt >= 3 && weekdayMax >= Math.max(2, Math.ceil(cnt * 0.3))) {
    riskParts.push(`曜日別では${WEEKDAY_LABELS_JA[weekdayMaxIdx]}曜日に${weekdayMax}件と集中しています。`);
  }
  if (weathers.length && !weathers[0].key.includes('晴') && pct(weathers[0].cnt, cnt) >= 30) {
    riskParts.push(`「${weathers[0].key}」の際の事故が${weathers[0].cnt}件（${pct(weathers[0].cnt, cnt)}%）を占めています。`);
  }
  if (roadConds.length && pct(roadConds[0].cnt, cnt) >= 40) {
    riskParts.push(`道路状況は「${roadConds[0].key}」の場面が${roadConds[0].cnt}件と多くなっています。`);
  }
  const risk_pattern = riskParts.length ? riskParts.join('') : '時間帯・曜日・天候について、特に目立った偏りは見られませんでした。';

  // 改善提案
  const recommendations = pickRecommendations(causeRanking);

  // 結び
  const half = Math.floor(cnt / 2);
  const recentHalf = records.slice(0, half).length; // records は発生日降順なので前半＝直近側
  const olderHalf = records.slice(half).length;
  let closing_comment: string;
  if (cnt >= 4 && recentHalf < olderHalf) {
    closing_comment = '直近の期間では事故件数が減少傾向にあります。この調子で安全運転を継続してください。';
  } else if (cnt >= 4 && recentHalf > olderHalf) {
    closing_comment = '直近の期間で事故件数がやや増加しています。上記の傾向を踏まえ、基本動作の再確認をお願いします。';
  } else {
    closing_comment = '記録された事故の傾向を踏まえ、日々の基本動作の徹底で再発防止に努めてください。';
  }

  return { headline, trend_summary, main_causes, risk_pattern, recommendations, closing_comment, weekday_breakdown };
}
