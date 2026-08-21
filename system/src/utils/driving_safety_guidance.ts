// 安全運転指導書（急発進・急加速・急減速・速度超過）のカテゴリ別集計とルールベース指導文生成
// 「AI」表記は使わない機能だが、utils/sales_trend_analysis.ts・accident_trend_analysis.ts と同じ方針で
// 外部AI/LLM APIへの通信は一切行わない。しきい値判定＋定型文のみの同期処理。
import type { DrivingSafetyRow, DrivingRiskSettings, DrivingRiskSummary } from './driving_risk_analysis';

export interface DrivingSafetyCategoryBreakdown {
  dayCount: number;
  harshStartTotal: number;
  harshAccelTotal: number;
  harshDecelTotal: number;
  maxSpeedHighway: number | null;
  maxSpeedLocal: number | null;
  speedingHighwayDays: number;
  speedingLocalDays: number;
}

// summarizeDrivingRisk()（driving_risk_analysis.ts）は3種を合算した総合指標のみを返すため、
// 指導書用にカテゴリ別（急発進／急加速／急減速）の内訳を別途算出する。既存関数はそのまま維持。
export function summarizeDrivingRiskByCategory(
  rows: DrivingSafetyRow[],
  settings: DrivingRiskSettings
): DrivingSafetyCategoryBreakdown {
  let harshStartTotal = 0, harshAccelTotal = 0, harshDecelTotal = 0;
  let maxSpeedHighway: number | null = null;
  let maxSpeedLocal: number | null = null;
  let speedingHighwayDays = 0, speedingLocalDays = 0;

  for (const r of rows) {
    harshStartTotal += (r.harshStartLoaded ?? 0) + (r.harshStartEmpty ?? 0);
    harshAccelTotal += (r.harshAccelLoaded ?? 0) + (r.harshAccelEmpty ?? 0);
    harshDecelTotal += (r.harshDecelLoaded ?? 0) + (r.harshDecelEmpty ?? 0);

    const speedHighway = r.maxSpeedLoadedHighway;
    const speedLocal = r.maxSpeedLoadedLocal;
    if (speedHighway !== null && (maxSpeedHighway === null || speedHighway > maxSpeedHighway)) maxSpeedHighway = speedHighway;
    if (speedLocal !== null && (maxSpeedLocal === null || speedLocal > maxSpeedLocal)) maxSpeedLocal = speedLocal;
    if (speedHighway !== null && speedHighway > settings.maxSpeedHighwayThreshold) speedingHighwayDays++;
    if (speedLocal !== null && speedLocal > settings.maxSpeedLocalThreshold) speedingLocalDays++;
  }

  return {
    dayCount: rows.length, harshStartTotal, harshAccelTotal, harshDecelTotal,
    maxSpeedHighway, maxSpeedLocal, speedingHighwayDays, speedingLocalDays,
  };
}

const CATEGORY_EXPLANATIONS: Record<'harshStart' | 'harshAccel' | 'harshDecel' | 'speeding', string> = {
  harshStart: '急発進は後続車に追突されるリスクを高めるほか、発進直後の乗客の急な体重移動による転倒・怪我につながります。特にシートベルト未装着時は危険性が高まります。',
  harshAccel: '急加速は前方車両との車間距離を急に詰めることになり追突事故の原因となるほか、乗客が後方へ体重移動することによる転倒・怪我のリスクを高めます。',
  harshDecel: '急減速（急ブレーキ）は後続車からの追突を招きやすく、車内では乗客が前方へ投げ出される形での転倒・打撲のリスクが高まります。',
  speeding: '法定速度・目安速度を超える走行は制動距離の増加により事故発生時の被害を拡大させるほか、事故そのものの発生確率も高めます。',
};

export interface CategoryExplanation {
  category: string;
  count: number;
  explanation: string;
}

export interface DrivingSafetyGuidanceContent {
  headline: string;
  categoryExplanations: CategoryExplanation[];
  accidentNote: string;
  closingComment: string;
}

export interface DrivingSafetyGuidanceInput {
  empName: string;
  dutyDays: number;
  breakdown: DrivingSafetyCategoryBreakdown;
  riskSummary: DrivingRiskSummary;
  settings: DrivingRiskSettings;
  accidentCount: number;
  lastAccidentDate: string | null;
  monthsSinceLastAccident: number | null;
}

function perDuty(count: number, dutyDays: number): number {
  return dutyDays > 0 ? Math.round((count / dutyDays) * 10) / 10 : 0;
}

const RISK_LEVEL_HEADLINE: Record<DrivingRiskSummary['riskLevel'], (name: string) => string> = {
  high: name => `${name}さんは総合判定「リスク高」です。急発進・急加速・急減速や最高速度のいずれかで基準を超える傾向が見られます。安全運転指導を実施してください。`,
  medium: name => `${name}さんは総合判定「リスク中」です。一部の項目で基準に近い、または基準を超える傾向が見られます。`,
  low: name => `${name}さんは総合判定「リスク低」です。目立った基準超過は見られません。`,
};

// 実績データ（カテゴリ別集計・総合判定・事故件数）から指導書の文章一式を組み立てる（外部通信なし・同期処理）
export function buildDrivingSafetyGuidance(input: DrivingSafetyGuidanceInput): DrivingSafetyGuidanceContent {
  const { empName, dutyDays, breakdown, riskSummary, settings, accidentCount, lastAccidentDate, monthsSinceLastAccident } = input;

  const headline = RISK_LEVEL_HEADLINE[riskSummary.riskLevel](empName);

  const categoryExplanations: CategoryExplanation[] = [];
  if (breakdown.harshStartTotal > 0) {
    categoryExplanations.push({
      category: '急発進', count: breakdown.harshStartTotal,
      explanation: `${CATEGORY_EXPLANATIONS.harshStart}（本人の実績：対象期間で計${breakdown.harshStartTotal}件、乗務日あたり${perDuty(breakdown.harshStartTotal, dutyDays)}件）`,
    });
  }
  if (breakdown.harshAccelTotal > 0) {
    categoryExplanations.push({
      category: '急加速', count: breakdown.harshAccelTotal,
      explanation: `${CATEGORY_EXPLANATIONS.harshAccel}（本人の実績：対象期間で計${breakdown.harshAccelTotal}件、乗務日あたり${perDuty(breakdown.harshAccelTotal, dutyDays)}件）`,
    });
  }
  if (breakdown.harshDecelTotal > 0) {
    categoryExplanations.push({
      category: '急減速', count: breakdown.harshDecelTotal,
      explanation: `${CATEGORY_EXPLANATIONS.harshDecel}（本人の実績：対象期間で計${breakdown.harshDecelTotal}件、乗務日あたり${perDuty(breakdown.harshDecelTotal, dutyDays)}件）`,
    });
  }
  const speedingDays = breakdown.speedingHighwayDays + breakdown.speedingLocalDays;
  if (speedingDays > 0) {
    const speedParts: string[] = [];
    if (breakdown.speedingHighwayDays > 0) speedParts.push(`高速道${breakdown.speedingHighwayDays}日（最高${breakdown.maxSpeedHighway ?? '—'}km/h、基準${settings.maxSpeedHighwayThreshold}km/h）`);
    if (breakdown.speedingLocalDays > 0) speedParts.push(`一般道${breakdown.speedingLocalDays}日（最高${breakdown.maxSpeedLocal ?? '—'}km/h、基準${settings.maxSpeedLocalThreshold}km/h）`);
    categoryExplanations.push({
      category: '速度超過', count: speedingDays,
      explanation: `${CATEGORY_EXPLANATIONS.speeding}（本人の実績：${speedParts.join('、')}）`,
    });
  }

  const accidentNote = accidentCount > 0
    ? `${empName}さんは在籍期間中に事故記録が${accidentCount}件あります。前回事故日は${lastAccidentDate ?? '—'}（約${monthsSinceLastAccident}ヶ月経過）です。安全運転指導の際は、過去の事故内容もあわせてご確認ください（事故分析ページで参照できます）。`
    : `${empName}さんの在籍期間中の事故記録はありません（事故分析との照合・全期間累計）。`;

  const closingComment = categoryExplanations.length > 0
    ? '安全運転の基本動作（車間距離の確保・早めのブレーキ操作・法定速度の遵守）を徹底し、次回の点呼・指導時に本紙の内容をご確認ください。'
    : '現時点で目立った基準超過は見られません。引き続き安全運転を継続してください。';

  return { headline, categoryExplanations, accidentNote, closingComment };
}
