// 売上データの集計→テンプレート文への変換（AI売上分析：個人別レポート）
// 「AI」は表示名のみで、外部AI/LLM APIへの通信は一切行わない。ルールベースの頻度集計＋しきい値判定＋定型文のみ。
// 構成方針は utils/accident_trend_analysis.ts と同一。

// duty_code の表示ラベル（routes/admin_staff.ts の WORK_TYPE_MAP と対応）
export const DUTY_CODE_LABELS: Record<string, string> = {
  a: '日勤A', b: '日勤B', B: 'B勤（隔日）', D: 'D勤（隔日）', H: 'H勤（隔日）',
};

export interface SalesAnalysisInput {
  empName: string;
  weekdayBreakdown: Array<{ label: string; avg: number | null; count: number }>;
  factorBreakdown: Array<{ label: string; avgTrue: number | null; avgFalse: number | null; countTrue: number; countFalse: number; diffPct: number | null }>;
  trend: { recentAvg: number; earlyAvg: number; changePct: number | null; recentMonths: string[]; earlyMonths: string[] } | null;
  relative: {
    periodLabel: string;
    selfAvg: number;
    peerAvg: number | null;
    peerCount: number;
    divisionDiffPct: number | null;
    dutyComparison: Array<{ dutyCode: string; selfAvg: number; peerAvg: number | null; diffPct: number | null; selfCount: number }>;
  } | null;
  returnTime: { avg: string | null; count: number; sufficientData: boolean };
  wageEstimate: {
    periodLabel: string;
    commissionEstimate: number;
    perRideImpact: number;
    monthlyIfEveryDayImpact: number;
    dutyDaysInMonth: number;
    farePerRide: number;
    fareSource: 'actual' | 'assumed';
    wageCategoryLabel: string;
    nightAllowance: number;
    overtimeAllowance: number;
  } | null;
}

export interface SalesAnalysisContent {
  headline: string;
  trend_summary: string;
  weak_points: string[];
  strong_points: string[];
  recommendations: string[];
  closing_comment: string;
  labor_demand_note: string;
  wage_summary: string;
}

const WEAK_POINT_RECOMMENDATIONS: Array<{ match: RegExp; advice: string }> = [
  { match: /曜日/, advice: '振るわない曜日は、需要が読みにくい時間帯の流し営業より、無線・アプリ配車の活用比率を上げてみる' },
  { match: /連休前日/, advice: '連休前日は行楽・帰省の送り需要が伸びやすいため、駅・空港・ターミナル方面への需要を意識する' },
  { match: /連休明け/, advice: '連休明けは行楽・帰省の帰りの需要が伸びやすいため、駅・空港周辺での付け待ちを検討する' },
  { match: /雨天/, advice: '雨天は流し営業でも需要を拾いやすいため、雨の日は稼働時間を確保することを意識する' },
  { match: /猛暑日/, advice: '猛暑日は徒歩・自転車移動を避けたい需要が伸びやすいため、商業施設・駅周辺での付け待ちを検討する' },
  { match: /冬日/, advice: '冬日（低温）は徒歩移動を避けたい需要が伸びやすいため、住宅街・駅周辺での需要を意識する' },
  { match: /祝日|連休/, advice: '祝日・連休期は観光需要や行楽帰りの需要を狙い、ターミナル駅・行楽地周辺の付け待ちを検討する' },
  { match: /忘新年会|送別会/, advice: '宴会シーズンは夜間の繁華街・駅周辺での深夜需要を重点的に狙う' },
  { match: /ボーナス月/, advice: 'ボーナス月は行楽・買い物需要が伸びやすいため、商業施設周辺を意識した営業を検討する' },
  { match: /同じ.*課|同条件/, advice: '好調な同僚の稼働エリア・時間帯を参考に、営業ルートを見直してみる' },
  { match: /低下傾向/, advice: '直近の乗務日報を振り返り、稼働時間・休憩の取り方に変化がないか確認する' },
];

function pickRecommendations(weakPoints: string[]): string[] {
  const recs: string[] = [];
  for (const w of weakPoints) {
    const rule = WEAK_POINT_RECOMMENDATIONS.find(r => r.match.test(w));
    if (rule && !recs.includes(rule.advice)) recs.push(rule.advice);
    if (recs.length >= 4) break;
  }
  if (recs.length === 0) {
    recs.push('特筆すべき弱点は見られません。現在の営業スタイルを継続しつつ、繁忙時間帯の取りこぼしがないか意識するとさらに安定します。');
  }
  return recs;
}

// 売上データを集計し、SalesAnalysisContent形式のテンプレート文を組み立てる（外部通信なし・同期処理）
export function buildRuleBasedSalesAnalysis(input: SalesAnalysisInput): SalesAnalysisContent {
  const weak_points: string[] = [];
  const strong_points: string[] = [];

  // 曜日別: 件数3件以上のうち、全体平均比±10%以上のものを抽出
  const wdCounted = input.weekdayBreakdown.filter(w => w.avg !== null && w.count >= 3);
  const wdTotalCount = wdCounted.reduce((s, w) => s + w.count, 0);
  const overallWdAvg = wdTotalCount > 0
    ? Math.round(wdCounted.reduce((s, w) => s + (w.avg ?? 0) * w.count, 0) / wdTotalCount)
    : null;
  if (overallWdAvg !== null) {
    for (const w of wdCounted) {
      const diff = ((w.avg! - overallWdAvg) / overallWdAvg) * 100;
      if (diff <= -10) weak_points.push(`${w.label}曜日の平均売上が全体平均より${Math.abs(Math.round(diff))}%低くなっています。`);
      else if (diff >= 10) strong_points.push(`${w.label}曜日の平均売上が全体平均より${Math.round(diff)}%高く、得意曜日と言えます。`);
    }
  }

  // 暦要因別: 該当日件数3件以上のうち、非該当日との差が小さい/マイナスのものを抽出
  for (const f of input.factorBreakdown) {
    if (f.countTrue < 3 || f.diffPct === null) continue;
    if (f.diffPct < 0) weak_points.push(`${f.label}は本来売上が伸びやすい要因ですが、該当日の平均が非該当日を${Math.abs(f.diffPct)}%下回っています。`);
    else if (f.diffPct >= 10) strong_points.push(`${f.label}の日は非該当日より平均${f.diffPct}%高く、うまく活かせています。`);
  }

  // 個人内トレンド
  if (input.trend && input.trend.changePct !== null) {
    if (input.trend.changePct <= -5) {
      weak_points.push(`直近（${input.trend.recentMonths.join('・')}）の平均日商が、それ以前（${input.trend.earlyMonths.join('・')}）と比べて${Math.abs(input.trend.changePct)}%低下傾向です。`);
    } else if (input.trend.changePct >= 5) {
      strong_points.push(`直近（${input.trend.recentMonths.join('・')}）の平均日商が、それ以前と比べて${input.trend.changePct}%上昇傾向です。`);
    }
  }

  // 同条件比較（相対評価）
  if (input.relative) {
    if (input.relative.divisionDiffPct !== null && input.relative.peerCount >= 2) {
      if (input.relative.divisionDiffPct <= -10) {
        weak_points.push(`${input.relative.periodLabel}の平均日商が、同じ課の他の乗務員平均（${input.relative.peerCount}名）より${Math.abs(input.relative.divisionDiffPct)}%低くなっています。`);
      } else if (input.relative.divisionDiffPct >= 10) {
        strong_points.push(`${input.relative.periodLabel}の平均日商が、同じ課の他の乗務員平均（${input.relative.peerCount}名）より${input.relative.divisionDiffPct}%高くなっています。`);
      }
    }
    for (const d of input.relative.dutyComparison) {
      if (d.selfCount < 3 || d.diffPct === null) continue;
      const label = DUTY_CODE_LABELS[d.dutyCode] ?? d.dutyCode;
      if (d.diffPct <= -10) weak_points.push(`同じ${label}の他の乗務員平均と比べて、${label}の日の平均売上が${Math.abs(d.diffPct)}%低くなっています。`);
      else if (d.diffPct >= 10) strong_points.push(`同じ${label}の他の乗務員平均と比べて、${label}の日の平均売上が${d.diffPct}%高くなっています。`);
    }
  }

  // ヘッドライン
  let headline: string;
  if (weak_points.length === 0 && strong_points.length === 0) {
    headline = 'データが十分でないか、特筆すべき偏りは見られませんでした。';
  } else if (weak_points.length > strong_points.length) {
    headline = `全体として${weak_points.length}件の改善余地が見られます。特に「${weak_points[0]}」に注目してください。`;
  } else if (strong_points.length > 0) {
    headline = `全体として堅調に推移しています。特に「${strong_points[0]}」が強みです。`;
  } else {
    headline = '良い点・改善点がバランス良く見られます。';
  }

  // 傾向分析
  const trendParts: string[] = [];
  if (input.trend) {
    trendParts.push(input.trend.changePct !== null
      ? `直近の平均日商は${input.trend.recentAvg.toLocaleString('ja-JP')}円で、以前（${input.trend.earlyAvg.toLocaleString('ja-JP')}円）と比べて${input.trend.changePct >= 0 ? '+' : ''}${input.trend.changePct}%です。`
      : 'トレンド算出に十分なデータがありません。');
  }
  if (input.relative) {
    trendParts.push(`${input.relative.periodLabel}の平均日商は${input.relative.selfAvg.toLocaleString('ja-JP')}円です。`);
  }
  if (input.returnTime.sufficientData && input.returnTime.avg) {
    trendParts.push(`平均帰庫時刻は${input.returnTime.avg}です（${input.returnTime.count}件のデータより算出）。`);
  } else {
    trendParts.push('帰庫時刻のデータはまだ蓄積中のため、傾向判定には至っていません。');
  }
  const trend_summary = trendParts.join('');

  const recommendations = pickRecommendations(weak_points);

  const closing_comment = weak_points.length > 0
    ? '上記の改善余地を意識しつつ、安全運転を第一に営業を続けてください。'
    : '引き続き安定した乗務を継続してください。';

  // 労働需要の背景（平日=通勤・出張等のビジネス需要 vs 土日=レジャー需要。既存の曜日別データのみで完結）
  const weekdayIdx = [1, 2, 3, 4, 5]; // 月〜金
  const weekendIdx = [0, 6]; // 日・土
  const weighted = (idxs: number[]) => {
    const items = idxs.map(i => input.weekdayBreakdown[i]).filter((w): w is { label: string; avg: number | null; count: number } => !!w && w.avg !== null);
    const cnt = items.reduce((s, w) => s + w.count, 0);
    if (cnt === 0) return null;
    return Math.round(items.reduce((s, w) => s + (w.avg ?? 0) * w.count, 0) / cnt);
  };
  const weekdayAvg = weighted(weekdayIdx);
  const weekendAvg = weighted(weekendIdx);
  let labor_demand_note: string;
  if (weekdayAvg !== null && weekendAvg !== null) {
    const cmp = weekdayAvg >= weekendAvg
      ? `平日の方が${Math.round(((weekdayAvg - weekendAvg) / weekendAvg) * 100)}%高く、通勤・出張利用を中心とした安定需要をうまく取り込めています。`
      : `土日の方が${Math.round(((weekendAvg - weekdayAvg) / weekdayAvg) * 100)}%高く、平日のビジネス需要を取り込む余地があります。`;
    labor_demand_note = `平日（月〜金）はサラリーマン・ビジネス利用者の通勤・出張需要が中心で、安定した需要が見込めます。一方、土日はレジャー・行楽需要が中心です。${input.empName}さんの平日平均は${weekdayAvg.toLocaleString('ja-JP')}円、土日平均は${weekendAvg.toLocaleString('ja-JP')}円で、${cmp}`;
  } else {
    labor_demand_note = '平日（通勤・出張などのビジネス需要）と土日（レジャー需要）を比較するにはデータが不足しています。';
  }

  // 賃金インパクト試算（概算・成果手当のみ）
  let wage_summary = '';
  if (input.wageEstimate) {
    const we = input.wageEstimate;
    const fareLabel = we.fareSource === 'actual' ? '実績' : '想定';
    wage_summary = `${we.periodLabel}の概算成果手当（${we.wageCategoryLabel}・歩合部分のみ）は${we.commissionEstimate.toLocaleString('ja-JP')}円です。客単価${we.farePerRide.toLocaleString('ja-JP')}円（${fareLabel}）で計算すると、あと1組多く乗せるごとに概算+${we.perRideImpact.toLocaleString('ja-JP')}円。乗務日（${we.dutyDaysInMonth}日）ごとに続けると、月換算で概算+${we.monthlyIfEveryDayImpact.toLocaleString('ja-JP')}円の計算になります。`;
    if (we.nightAllowance > 0 || we.overtimeAllowance > 0) {
      wage_summary += `深夜手当は概算${we.nightAllowance.toLocaleString('ja-JP')}円、残業手当は概算${we.overtimeAllowance.toLocaleString('ja-JP')}円です（服務手当・段階分け・法定内外区分を省略した簡易計算のため、実際の給与とは異なります）。`;
    }
  }

  return { headline, trend_summary, weak_points, strong_points, recommendations, closing_comment, labor_demand_note, wage_summary };
}
