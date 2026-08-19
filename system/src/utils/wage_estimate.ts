// 賃金インパクト試算（成果手当＝歩合部分の概算＋簡易割増賃金）
// 賃金規則PDF（隔日勤務者／昼日勤務者／夜日勤務者）の成果手当・割増賃金計算式を元にした簡易計算。
// 服務手当・能率手当・残業の段階分け(25%/50%)・法定内外区分・試用期間中の差等は含まれない概算であり、
// 実際の給与明細とは異なる。設定値は /settings/wage-estimate で確認・修正できる。
import { getDayFactors } from './taxi_calendar';

export type WageCategory = 'hiru' | 'yoru' | 'kakujitsu'; // 昼日勤務 / 夜日勤務 / 隔日勤務

export interface WageCategoryRates {
  weekday: number; // 火〜金 曜日別基準額（通常）
  satMon: number;  // 土・月 曜日別基準額（通常）
  holiday: number; // 日祝 曜日別基準額（通常）
  commissionRate: number; // 歩合率（通常）
  baseSalary: number; // 基本給I（1乗務あたり・本採用額の概算。試用/本採用の区別は持たない）
  kokyuWeekday: number; // 火〜金 曜日別基準額（公出）
  kokyuSatMon: number;  // 土・月 曜日別基準額（公出）
  kokyuHoliday: number; // 日祝 曜日別基準額（公出）
  kokyuCommissionRate: number; // 歩合率（公出）
}

export interface WageEstimateSettings {
  hiru: WageCategoryRates;
  yoru: WageCategoryRates;
  kakujitsu: WageCategoryRates;
  assumedFarePerRide: number;
  minimumWageHourly: number; // 最低賃金時給（暫定値。必ず現行法定額に更新する）
}

export const WAGE_CATEGORY_LABELS: Record<WageCategory, string> = {
  hiru: '昼日勤務', yoru: '夜日勤務', kakujitsu: '隔日勤務',
};

// 公出の閾値（月間乗務数）。これを超えた乗務が「公出」扱いとなる（賃金規則PDFおよびユーザー確認より）。
// 隔日勤務: 11乗務、昼日勤務・夜日勤務（日勤）: 22乗務
const KOKYU_THRESHOLD: Record<WageCategory, number> = { hiru: 22, yoru: 22, kakujitsu: 11 };

// employees.duty_code → 区分。'a'=昼日, 'b'=夜日, それ以外(B/D/H等)=隔日
export function wageCategoryOfDuty(dutyCode: string | null): WageCategory {
  if (dutyCode === 'a') return 'hiru';
  if (dutyCode === 'b') return 'yoru';
  return 'kakujitsu';
}

// 日付の曜日区分（火〜金／土・月／日祝）に応じた基準額を返す（通常/公出は呼び出し側で選択済みのrates想定）
function weekdayAmount(dateStr: string, weekday: number, satMon: number, holiday: number): number {
  const f = getDayFactors(dateStr);
  if (f.isHoliday || f.weekday === 0) return holiday; // 日祝
  if (f.weekday === 6 || f.weekday === 1) return satMon; // 土・月
  return weekday; // 火水木金
}

// Σ_日ごと[ (当日売上 − 当日基準額) × 当日の歩合率 ] を合計し、0未満は0に丸める。
// 区分（duty_codeから判定）ごとに日付昇順で乗務を数え、公出閾値（隔日11・日勤22）を超えた乗務は
// 公出用の基準額・歩合率を使う（賃金規則PDFの①所定内／②公出の分割を反映）。
export function estimateCommissionPay(
  rows: Array<{ date: string; amount: number; dutyCode: string | null }>,
  settings: WageEstimateSettings
): number {
  const sorted = [...rows].sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  const seqByCategory: Record<WageCategory, number> = { hiru: 0, yoru: 0, kakujitsu: 0 };
  let total = 0;
  for (const r of sorted) {
    const category = wageCategoryOfDuty(r.dutyCode);
    const rates = settings[category];
    seqByCategory[category] += 1;
    const isKokyu = seqByCategory[category] > KOKYU_THRESHOLD[category];
    const base = isKokyu
      ? weekdayAmount(r.date, rates.kokyuWeekday, rates.kokyuSatMon, rates.kokyuHoliday)
      : weekdayAmount(r.date, rates.weekday, rates.satMon, rates.holiday);
    const rate = isKokyu ? rates.kokyuCommissionRate : rates.commissionRate;
    total += (r.amount - base) * rate;
  }
  return Math.max(0, Math.round(total));
}

// 「あと1組」試算：客単価×該当区分の歩合率（通常分のみ。公出分は考慮しない簡易版）
// farePerRide は呼び出し側で「本人の実績客単価（税込収入÷営業回数）」を優先的に渡し、
// 実績が無い場合に限り settings.assumedFarePerRide をフォールバックとして渡す
export function estimateExtraRideImpact(
  dutyCode: string | null,
  farePerRide: number,
  settings: WageEstimateSettings,
  dutyDaysInMonth: number
): { perRide: number; monthlyIfEveryDay: number } {
  const rates = settings[wageCategoryOfDuty(dutyCode)];
  const perRide = Math.round(farePerRide * rates.commissionRate);
  return { perRide, monthlyIfEveryDay: perRide * dutyDaysInMonth };
}

export interface AllowanceEstimate {
  nightAllowance: number;
  overtimeAllowance: number;
  total: number;
}

// 深夜手当・残業手当の概算: (成果手当 ÷ 総労働時間) × 0.25 × 対象時間
// 服務手当・能率手当は含まない、残業の25%/50%段階分け・法定内外区分もしない簡易計算。
export function estimateNightAndOvertimeAllowance(
  commissionEstimate: number,
  laborHoursTotal: number,
  nightHoursTotal: number,
  overtimeHoursTotal: number
): AllowanceEstimate {
  if (laborHoursTotal <= 0) return { nightAllowance: 0, overtimeAllowance: 0, total: 0 };
  const hourlyRate = commissionEstimate / laborHoursTotal;
  const nightAllowance = Math.round(hourlyRate * 0.25 * nightHoursTotal);
  const overtimeAllowance = Math.round(hourlyRate * 0.25 * overtimeHoursTotal);
  return { nightAllowance, overtimeAllowance, total: nightAllowance + overtimeAllowance };
}

export interface MinimumWageCheckResult {
  estimatedPay: number;         // 概算給与（基本給I×乗務日数 + 概算成果手当 + 深夜/残業手当概算）
  guaranteedPay: number;        // 最低賃金保障額（最低賃金時給×実労働時間合計）
  shortfall: number;            // guaranteedPay - estimatedPay（0未満は0）
  isMinimumWageEarner: boolean; // shortfall > 0
  laborHoursTotal: number;
  laborHoursDayCount: number;
  sufficientData: boolean;      // labor_hoursが十分な日数分あるか（目安: 5日分以上）
}

// 最低賃金判定（概算）: 基本給I＋歩合部分＋深夜/残業手当の概算給与 と、最低賃金時給×実労働時間 を比較する。
// commissionEstimate は estimateCommissionPay() の戻り値、allowanceTotal は estimateNightAndOvertimeAllowance().total をそのまま渡す。
// 服務手当・能率手当・試用期間中の差・法定内外公出手当等は含まれない概算であり、実際の給与とは異なる。
export function checkMinimumWage(
  dutyDaysInMonth: number,
  commissionEstimate: number,
  allowanceTotal: number,
  laborHoursRows: number[],
  repDutyCode: string | null,
  settings: WageEstimateSettings
): MinimumWageCheckResult {
  const rates = settings[wageCategoryOfDuty(repDutyCode)];
  const estimatedPay = rates.baseSalary * dutyDaysInMonth + commissionEstimate + allowanceTotal;

  const laborHoursTotal = Math.round(laborHoursRows.reduce((s, h) => s + h, 0) * 100) / 100;
  const laborHoursDayCount = laborHoursRows.length;
  const sufficientData = laborHoursDayCount >= 5;

  const guaranteedPay = Math.round(settings.minimumWageHourly * laborHoursTotal);
  const shortfall = sufficientData ? Math.max(0, guaranteedPay - estimatedPay) : 0;

  return {
    estimatedPay, guaranteedPay, shortfall,
    isMinimumWageEarner: sufficientData && shortfall > 0,
    laborHoursTotal, laborHoursDayCount, sufficientData,
  };
}
