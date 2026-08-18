// 配車管理：車両の前後勤務の時間関係からアラートレベルを判定する共通ロジック。
// 配車ボード・車両ローテーション表の両方から利用する想定。
// 完全自動配車は行わない方針のため、ここでの判定はあくまで表示用（保存は常に許可する）。
import type { Env } from '../auth';

export type DispatchAlertLevel = 'normal' | 'caution' | 'strong_caution' | 'overlap';

// 出庫日を0日目とした「HH:MM + 経過日数」表現（隔勤は翌日帰庫のため daysOffset=1 になりうる）
export type TimeSpec = { time: string; daysOffset: number };

export type ShiftTimeMasterRow = {
  id: number; shift_code: string; variant_label: string;
  departure_time: string; standard_return_time: string; return_days_offset: number;
  max_overtime_return_time: string; overtime_days_offset: number; is_default: number;
};

function toMinutes(spec: TimeSpec): number {
  const [h, m] = spec.time.split(':').map(Number);
  return spec.daysOffset * 1440 + h * 60 + m;
}

// 前勤務の帰庫見込み(定時/残業MAX)と次勤務の出庫を比較して4段階のアラートを判定する。
// 注意閾値(分)は運用しながら調整できるよう定数として外出ししている。
const CAUTION_THRESHOLD_MIN = 60;

export function evalCarTransition(
  prevReturn: { standard: TimeSpec; max: TimeSpec } | null,
  nextDeparture: TimeSpec | null,
): { level: DispatchAlertLevel; gapStandardMin: number | null } {
  if (!prevReturn || !nextDeparture) return { level: 'normal', gapStandardMin: null };
  const stdReturn = toMinutes(prevReturn.standard);
  const maxReturn = toMinutes(prevReturn.max);
  const nextDep = toMinutes(nextDeparture);
  const gapStandard = nextDep - stdReturn;

  if (nextDep < maxReturn) return { level: 'overlap', gapStandardMin: gapStandard };
  if (nextDep < stdReturn) return { level: 'strong_caution', gapStandardMin: gapStandard };
  if (gapStandard < CAUTION_THRESHOLD_MIN) return { level: 'caution', gapStandardMin: gapStandard };
  return { level: 'normal', gapStandardMin: gapStandard };
}

// shift_code -> 既定(is_default=1)の時刻マスタ行のMapを作る
export function buildDefaultTimeMasterMap(rows: ShiftTimeMasterRow[]): Map<string, ShiftTimeMasterRow> {
  const map = new Map<string, ShiftTimeMasterRow>();
  for (const r of rows) {
    if (r.is_default) map.set(r.shift_code, r);
    else if (!map.has(r.shift_code)) map.set(r.shift_code, r); // is_default未設定の記号はフォールバックで先頭行を採用
  }
  return map;
}

export function departureSpec(row: ShiftTimeMasterRow): TimeSpec {
  return { time: row.departure_time, daysOffset: 0 };
}
export function returnSpec(row: ShiftTimeMasterRow): { standard: TimeSpec; max: TimeSpec } {
  return {
    standard: { time: row.standard_return_time, daysOffset: row.return_days_offset },
    max: { time: row.max_overtime_return_time, daysOffset: row.overtime_days_offset },
  };
}

export type CarAssignmentForAlert = { car_no: string; shift_code: string };

// 前日assignments・当日assignmentsから、車両ごとの「日またぎアラート」「当日内アラート」を計算する。
// 戻り値は car_no -> { boundary: レベル(前日最終→当日最初), withinDay: レベル(当日内、複数勤務がある場合のみ) }
export function computeDailyAlerts(
  prevDayAssignments: CarAssignmentForAlert[],
  todayAssignments: CarAssignmentForAlert[],
  timeMasterMap: Map<string, ShiftTimeMasterRow>,
): Map<string, { boundary: DispatchAlertLevel; withinDay: DispatchAlertLevel }> {
  const result = new Map<string, { boundary: DispatchAlertLevel; withinDay: DispatchAlertLevel }>();

  const prevByCarLatestReturn = new Map<string, { standard: TimeSpec; max: TimeSpec }>();
  for (const a of prevDayAssignments) {
    const m = timeMasterMap.get(a.shift_code);
    if (!m) continue;
    const ret = returnSpec(m);
    const existing = prevByCarLatestReturn.get(a.car_no);
    if (!existing || toMinutes(ret.standard) > toMinutes(existing.standard)) {
      prevByCarLatestReturn.set(a.car_no, ret);
    }
  }

  const todayByCar = new Map<string, CarAssignmentForAlert[]>();
  for (const a of todayAssignments) {
    if (!todayByCar.has(a.car_no)) todayByCar.set(a.car_no, []);
    todayByCar.get(a.car_no)!.push(a);
  }

  for (const [carNo, list] of todayByCar) {
    const withDeparture = list
      .map(a => ({ a, m: timeMasterMap.get(a.shift_code) }))
      .filter((x): x is { a: CarAssignmentForAlert; m: ShiftTimeMasterRow } => !!x.m)
      .sort((x, y) => toMinutes(departureSpec(x.m)) - toMinutes(departureSpec(y.m)));
    if (withDeparture.length === 0) continue;

    const boundary = evalCarTransition(prevByCarLatestReturn.get(carNo) ?? null, departureSpec(withDeparture[0].m)).level;

    let withinDay: DispatchAlertLevel = 'normal';
    for (let i = 1; i < withDeparture.length; i++) {
      const prevReturn = returnSpec(withDeparture[i - 1].m);
      const nextDep = departureSpec(withDeparture[i].m);
      const lv = evalCarTransition(prevReturn, nextDep).level;
      if (levelRank(lv) > levelRank(withinDay)) withinDay = lv;
    }

    result.set(carNo, { boundary, withinDay });
  }
  return result;
}

function levelRank(level: DispatchAlertLevel): number {
  return { normal: 0, caution: 1, strong_caution: 2, overlap: 3 }[level];
}

export async function loadTimeMasterMap(db: Env['DB']): Promise<Map<string, ShiftTimeMasterRow>> {
  const res = await db.prepare(
    `SELECT id, shift_code, variant_label, departure_time, standard_return_time, return_days_offset,
            max_overtime_return_time, overtime_days_offset, is_default
     FROM dispatch_shift_time_master WHERE is_active = 1 ORDER BY sort_order`
  ).all<ShiftTimeMasterRow>();
  return buildDefaultTimeMasterMap(res.results ?? []);
}
