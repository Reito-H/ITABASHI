// 安全運転リスク分析（ホシコン収集データCSV由来の急発進・急加速・急減速・最高速度から算出）
// ルールベースのしきい値判定のみ（外部AI通信なし）。utils/accident_trend_analysis.ts と同じ方針。
// 実際の事故記録ではなく運転挙動データからの参考指標であり、事故データ機能とは別物。

export interface DrivingRiskSettings {
  harshEventDailyThreshold: number; // 1日の急発進+急加速+急減速合計がこれ以上で「要注意」
  maxSpeedHighwayThreshold: number; // km/h。実車最高速度がこれを超えたら速度超過
  maxSpeedLocalThreshold: number;   // km/h
}

export interface DrivingSafetyRow {
  date: string;
  harshStartLoaded: number | null; harshStartEmpty: number | null;
  harshAccelLoaded: number | null; harshAccelEmpty: number | null;
  harshDecelLoaded: number | null; harshDecelEmpty: number | null;
  maxSpeedLoadedHighway: number | null;
  maxSpeedLoadedLocal: number | null;
}

export interface DrivingRiskSummary {
  dayCount: number;
  totalHarshEvents: number;       // 急発進+急加速+急減速の合計（実車+空車）
  harshEventsPerDuty: number;     // 乗務日あたりの平均件数
  overThresholdDays: number;      // 1日の合計がharshEventDailyThresholdを超えた日数
  maxSpeedHighway: number | null; // 期間中の実車最高速度(高速道)の最大値
  maxSpeedLocal: number | null;   // 期間中の実車最高速度(一般道)の最大値
  speedingDays: number;           // 実車最高速度がいずれかの閾値を超えた日数
  riskLevel: 'low' | 'medium' | 'high';
}

function dailyHarshTotal(r: DrivingSafetyRow): number {
  return (r.harshStartLoaded ?? 0) + (r.harshStartEmpty ?? 0)
    + (r.harshAccelLoaded ?? 0) + (r.harshAccelEmpty ?? 0)
    + (r.harshDecelLoaded ?? 0) + (r.harshDecelEmpty ?? 0);
}

export function summarizeDrivingRisk(
  rows: DrivingSafetyRow[],
  dutyDays: number,
  settings: DrivingRiskSettings
): DrivingRiskSummary {
  let totalHarshEvents = 0;
  let overThresholdDays = 0;
  let speedingDays = 0;
  let maxSpeedHighway: number | null = null;
  let maxSpeedLocal: number | null = null;

  for (const r of rows) {
    const daily = dailyHarshTotal(r);
    totalHarshEvents += daily;
    if (daily >= settings.harshEventDailyThreshold) overThresholdDays++;

    const speedHighway = r.maxSpeedLoadedHighway;
    const speedLocal = r.maxSpeedLoadedLocal;
    if (speedHighway !== null && (maxSpeedHighway === null || speedHighway > maxSpeedHighway)) maxSpeedHighway = speedHighway;
    if (speedLocal !== null && (maxSpeedLocal === null || speedLocal > maxSpeedLocal)) maxSpeedLocal = speedLocal;
    const isSpeeding = (speedHighway !== null && speedHighway > settings.maxSpeedHighwayThreshold)
      || (speedLocal !== null && speedLocal > settings.maxSpeedLocalThreshold);
    if (isSpeeding) speedingDays++;
  }

  const harshEventsPerDuty = dutyDays > 0 ? Math.round((totalHarshEvents / dutyDays) * 10) / 10 : 0;

  let riskLevel: 'low' | 'medium' | 'high' = 'low';
  if (speedingDays > 0 || overThresholdDays >= Math.max(3, Math.round(rows.length * 0.3))) {
    riskLevel = 'high';
  } else if (overThresholdDays > 0 || harshEventsPerDuty >= settings.harshEventDailyThreshold * 0.6) {
    riskLevel = 'medium';
  }

  return {
    dayCount: rows.length, totalHarshEvents, harshEventsPerDuty, overThresholdDays,
    maxSpeedHighway, maxSpeedLocal, speedingDays, riskLevel,
  };
}
