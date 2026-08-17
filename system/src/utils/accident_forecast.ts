// 事故データ予測AI（実態は統計処理）
// 「月別ベース率×曜日別ベース率」の乗法モデル（Poissonレート分解の簡易版）で
// 暦日ごとの「事故発生しやすさスコア」を算出する。DBアクセスなしの純粋関数のみ。
// 予測カレンダー(/accidents/forecast)と引き継ぎシート用API(/api/accidents/forecast-today)の
// 両方から共通で使う。

export interface AccidentDateLike {
  occurred_date: string; // 'YYYY-MM-DD...'
  division?: number | null;
}

export interface ForecastModel {
  insufficientData: boolean;
  totalCount: number;
  totalDays: number;
  lambda0: number;
  monthFactor: number[]; // index 0-11 = 1月-12月
  weekdayFactor: number[]; // index 0-6 = 日-土
  cellScore100: number[][]; // [month0-11][weekday0-6]
  cellTier: number[][]; // [month0-11][weekday0-6] 0-4
}

export interface DayScore {
  date: string;
  month: number; // 1-12
  weekday: number; // 0=日 ... 6=土
  score100: number;
  tier: number; // 0-4
  isAlert: boolean;
}

export const MIN_TOTAL_COUNT = 30;
export const MIN_TOTAL_DAYS = 60;
export const ALERT_SCORE_THRESHOLD = 90;

export const WEEKDAY_LABELS_JA = ['日', '月', '火', '水', '木', '金', '土'];
export const TIER_LABELS = ['非常に少ない', '少ない', '平均的', 'やや多い', '多発傾向'];
export const TIER_COLORS = [
  { bg: '#f0fdf4', fg: '#166534' },
  { bg: '#f1f5f9', fg: '#475569' },
  { bg: '#fffbeb', fg: '#d97706' },
  { bg: '#fed7aa', fg: '#c2410c' },
  { bg: '#fee2e2', fg: '#991b1b' },
];

const MS_PER_DAY = 86400000;

function parseYmd(dateStr: string): { y: number; m: number; d: number } | null {
  const m = (dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function weekdayOfYmd(y: number, m: number, d: number): number {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function utcDayNumber(y: number, m: number, d: number): number {
  return Math.floor(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[idx];
}

function emptyModel(): ForecastModel {
  return {
    insufficientData: true,
    totalCount: 0,
    totalDays: 0,
    lambda0: 0,
    monthFactor: new Array(12).fill(1),
    weekdayFactor: new Array(7).fill(1),
    cellScore100: Array.from({ length: 12 }, () => new Array(7).fill(0)),
    cellTier: Array.from({ length: 12 }, () => new Array(7).fill(0)),
  };
}

// レコード群から月別×曜日別のベース率モデルを構築する。
export function buildForecastModel(records: AccidentDateLike[]): ForecastModel {
  const dayNums: number[] = [];
  const monthOf: number[] = [];
  const weekdayOf: number[] = [];

  for (const r of records) {
    const p = parseYmd(r.occurred_date);
    if (!p) continue;
    dayNums.push(utcDayNumber(p.y, p.m, p.d));
    monthOf.push(p.m);
    weekdayOf.push(weekdayOfYmd(p.y, p.m, p.d));
  }

  const totalCount = dayNums.length;
  if (totalCount === 0) return emptyModel();

  const minDay = Math.min(...dayNums);
  const maxDay = Math.max(...dayNums);
  const totalDays = maxDay - minDay + 1;

  if (totalCount < MIN_TOTAL_COUNT || totalDays < MIN_TOTAL_DAYS) {
    return { ...emptyModel(), insufficientData: true, totalCount, totalDays };
  }

  const lambda0 = totalCount / totalDays;

  // 観測期間内で各月・各曜日が何日あったか
  const daysInMonthObserved = new Array(12).fill(0);
  const daysInWeekdayObserved = new Array(7).fill(0);
  for (let dn = minDay; dn <= maxDay; dn++) {
    const dt = new Date(dn * MS_PER_DAY);
    daysInMonthObserved[dt.getUTCMonth()]++;
    daysInWeekdayObserved[dt.getUTCDay()]++;
  }

  const countInMonth = new Array(12).fill(0);
  const countInWeekday = new Array(7).fill(0);
  for (let i = 0; i < totalCount; i++) {
    countInMonth[monthOf[i] - 1]++;
    countInWeekday[weekdayOf[i]]++;
  }

  const monthFactor = new Array(12).fill(1);
  for (let m = 0; m < 12; m++) {
    monthFactor[m] = daysInMonthObserved[m] > 0 ? (countInMonth[m] / daysInMonthObserved[m]) / lambda0 : 1;
  }
  const weekdayFactor = new Array(7).fill(1);
  for (let w = 0; w < 7; w++) {
    weekdayFactor[w] = daysInWeekdayObserved[w] > 0 ? (countInWeekday[w] / daysInWeekdayObserved[w]) / lambda0 : 1;
  }

  // 月×曜日の84セルのλを算出し、その分布の中での相対位置をスコア化する
  const cellLambda: number[][] = [];
  const flatValues: number[] = [];
  for (let m = 0; m < 12; m++) {
    const row: number[] = [];
    for (let w = 0; w < 7; w++) {
      const lam = lambda0 * monthFactor[m] * weekdayFactor[w];
      row.push(lam);
      flatValues.push(lam);
    }
    cellLambda.push(row);
  }
  const sorted = [...flatValues].sort((a, b) => a - b);
  const q20 = quantile(sorted, 0.2);
  const q40 = quantile(sorted, 0.4);
  const q60 = quantile(sorted, 0.6);
  const q80 = quantile(sorted, 0.8);

  function tierOf(v: number): number {
    if (v <= q20) return 0;
    if (v <= q40) return 1;
    if (v <= q60) return 2;
    if (v <= q80) return 3;
    return 4;
  }
  function percentileRank(v: number): number {
    let count = 0;
    for (const s of sorted) if (s <= v) count++;
    return Math.round((count / sorted.length) * 100);
  }

  const cellScore100: number[][] = [];
  const cellTier: number[][] = [];
  for (let m = 0; m < 12; m++) {
    const scoreRow: number[] = [];
    const tierRow: number[] = [];
    for (let w = 0; w < 7; w++) {
      const lam = cellLambda[m][w];
      scoreRow.push(percentileRank(lam));
      tierRow.push(tierOf(lam));
    }
    cellScore100.push(scoreRow);
    cellTier.push(tierRow);
  }

  return { insufficientData: false, totalCount, totalDays, lambda0, monthFactor, weekdayFactor, cellScore100, cellTier };
}

export function scoreForDate(model: ForecastModel, dateStr: string): DayScore | null {
  if (model.insufficientData) return null;
  const p = parseYmd(dateStr);
  if (!p) return null;
  const weekday = weekdayOfYmd(p.y, p.m, p.d);
  const score100 = model.cellScore100[p.m - 1][weekday];
  const tier = model.cellTier[p.m - 1][weekday];
  return { date: dateStr, month: p.m, weekday, score100, tier, isAlert: score100 >= ALERT_SCORE_THRESHOLD };
}

// 指定年の365/366日分のDayScoreを返す（年に依存する計算はここだけ。モデル自体は月×曜日の84セルのみ）
export function scoreYear(model: ForecastModel, year: number): DayScore[] {
  if (model.insufficientData) return [];
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const results: DayScore[] = [];
  for (let m = 1; m <= 12; m++) {
    for (let d = 1; d <= daysInMonth[m - 1]; d++) {
      const dateStr = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const s = scoreForDate(model, dateStr);
      if (s) results.push(s);
    }
  }
  return results;
}

// division絞り込みでサンプルが少なすぎる場合は自動的に全社データへフォールバックする
export function selectForecastRecords(
  all: AccidentDateLike[],
  division: number | null
): { records: AccidentDateLike[]; usedFallback: boolean } {
  if (division == null) return { records: all, usedFallback: false };
  const filtered = all.filter(r => r.division === division);
  if (filtered.length >= MIN_TOTAL_COUNT) return { records: filtered, usedFallback: false };
  return { records: all, usedFallback: true };
}
