// 都内タクシー営収に影響しうる暦要因の判定ユーティリティ（外部API不使用・日付だけで完結）
// 対象: 曜日 / 五十日(ごとおび) / 祝日・振替休日 / 大型連休 / 忘新年会シーズン / 送別会シーズン / 月末月初 / ボーナス月

export type DayFactors = {
  date: string;             // YYYY-MM-DD
  weekday: number;          // 0=日 〜 6=土
  weekdayLabel: string;
  isWeekend: boolean;       // 土日
  isFriOrSat: boolean;      // 金・土（深夜需要が伸びやすい）
  isGotobi: boolean;        // 五十日（ごとおび）
  isHoliday: boolean;       // 祝日・振替休日
  holidayName: string | null;
  isLongHoliday: boolean;   // GW/お盆/年末年始
  longHolidayName: string | null;
  isYearEndNewYearParty: boolean; // 忘年会・新年会シーズン
  isFarewellSeason: boolean;      // 送別会・歓送迎会シーズン
  isMonthEnd: boolean;      // 月末3日間
  isMonthStart: boolean;    // 月初3日間
  isBonusMonth: boolean;    // 6月・12月
  labels: string[];         // 該当する要因の日本語ラベル一覧（表示用）
};

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

function parseYmd(dateStr: string): { y: number; m: number; d: number } {
  const [y, m, d] = dateStr.split('-').map(Number);
  return { y, m, d };
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

// 春分・秋分日の近似計算（1980〜2099年で有効な既知の近似式）
function vernalEquinoxDay(y: number): number {
  return Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
}
function autumnalEquinoxDay(y: number): number {
  return Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
}

// 指定月の第n◯曜日（0=日）を返す
function nthWeekday(y: number, m: number, weekday: number, n: number): number {
  const first = new Date(y, m - 1, 1).getDay();
  const offset = (weekday - first + 7) % 7;
  return 1 + offset + (n - 1) * 7;
}

type FixedHoliday = { m: number; d: number; name: string };
const FIXED_HOLIDAYS: FixedHoliday[] = [
  { m: 1, d: 1, name: '元日' },
  { m: 2, d: 11, name: '建国記念の日' },
  { m: 2, d: 23, name: '天皇誕生日' },
  { m: 4, d: 29, name: '昭和の日' },
  { m: 5, d: 3, name: '憲法記念日' },
  { m: 5, d: 4, name: 'みどりの日' },
  { m: 5, d: 5, name: 'こどもの日' },
  { m: 8, d: 11, name: '山の日' },
  { m: 11, d: 3, name: '文化の日' },
  { m: 11, d: 23, name: '勤労感謝の日' },
];

// 年ごとの祝日一覧（月日ベース、振替休日・国民の休日は含まない）を計算
function nationalHolidaysOfYear(y: number): Map<string, string> {
  const map = new Map<string, string>();
  const put = (m: number, d: number, name: string) => {
    map.set(`${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, name);
  };
  for (const h of FIXED_HOLIDAYS) put(h.m, h.d, h.name);
  put(1, nthWeekday(y, 1, 1, 2), '成人の日');
  put(3, vernalEquinoxDay(y), '春分の日');
  put(7, nthWeekday(y, 7, 1, 3), '海の日');
  put(9, nthWeekday(y, 9, 1, 3), '敬老の日');
  put(9, autumnalEquinoxDay(y), '秋分の日');
  put(10, nthWeekday(y, 10, 1, 2), 'スポーツの日');
  return map;
}

function toDate(y: number, m: number, d: number): Date {
  return new Date(y, m - 1, d);
}
function ymd(dt: Date): string {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

// 振替休日・国民の休日を含めた「年→(月日文字列→祝日名)」を構築
const holidayCache = new Map<number, Map<string, string>>();
function holidaysWithSubstitutes(y: number): Map<string, string> {
  const cached = holidayCache.get(y);
  if (cached) return cached;

  // 前年12月〜翌年1月分も見て振替判定できるよう、隣接年も計算
  const base = new Map<string, string>();
  for (const yy of [y - 1, y, y + 1]) {
    const hs = nationalHolidaysOfYear(yy);
    for (const [md, name] of hs) {
      const [m, d] = md.split('-').map(Number);
      base.set(ymd(toDate(yy, m, d)), name);
    }
  }

  // 振替休日: 祝日が日曜 → 次の平日（祝日でない日）を振替休日とする
  const substitutes = new Map<string, string>();
  for (const [dateStr, name] of base) {
    const dt = new Date(dateStr);
    if (dt.getDay() === 0) {
      const next = new Date(dt);
      do { next.setDate(next.getDate() + 1); } while (base.has(ymd(next)));
      substitutes.set(ymd(next), `振替休日（${name}）`);
    }
  }

  // 国民の休日: 祝日と祝日に挟まれた平日（日曜以外）
  const kokuminNoKyujitsu = new Map<string, string>();
  for (const [dateStr] of base) {
    const dt = new Date(dateStr);
    const next2 = new Date(dt); next2.setDate(next2.getDate() + 2);
    const between = new Date(dt); between.setDate(between.getDate() + 1);
    if (base.has(ymd(next2)) && !base.has(ymd(between)) && between.getDay() !== 0) {
      kokuminNoKyujitsu.set(ymd(between), '国民の休日');
    }
  }

  const merged = new Map<string, string>(base);
  for (const [k, v] of substitutes) if (!merged.has(k)) merged.set(k, v);
  for (const [k, v] of kokuminNoKyujitsu) if (!merged.has(k)) merged.set(k, v);

  holidayCache.set(y, merged);
  return merged;
}

export function getHolidayName(dateStr: string): string | null {
  const { y } = parseYmd(dateStr);
  return holidaysWithSubstitutes(y).get(dateStr) ?? null;
}

export function isGotobi(dateStr: string): boolean {
  const { y, m, d } = parseYmd(dateStr);
  if (d % 5 === 0) return true;
  return d === daysInMonth(y, m);
}

// 大型連休（GW・お盆・年末年始）
function longHolidayName(dateStr: string): string | null {
  const { m, d } = parseYmd(dateStr);
  if (m === 4 && d >= 29) return 'ゴールデンウィーク';
  if (m === 5 && d <= 6) return 'ゴールデンウィーク';
  if (m === 8 && d >= 13 && d <= 16) return 'お盆';
  if (m === 12 && d >= 29) return '年末年始';
  if (m === 1 && d <= 3) return '年末年始';
  return null;
}

function isYearEndNewYearParty(dateStr: string): boolean {
  const { m, d } = parseYmd(dateStr);
  if (m === 12 && d >= 10) return true; // 忘年会シーズン
  if (m === 1 && d <= 10) return true;  // 新年会シーズン
  return false;
}

function isFarewellSeason(dateStr: string): boolean {
  const { m, d } = parseYmd(dateStr);
  if (m === 3 && d >= 20) return true;
  if (m === 4 && d <= 10) return true;
  return false;
}

function isMonthEndDay(dateStr: string): boolean {
  const { y, m, d } = parseYmd(dateStr);
  return d >= daysInMonth(y, m) - 2;
}

function isMonthStartDay(dateStr: string): boolean {
  const { d } = parseYmd(dateStr);
  return d <= 3;
}

export function getDayFactors(dateStr: string): DayFactors {
  const dt = new Date(dateStr);
  const weekday = dt.getDay();
  const holidayName = getHolidayName(dateStr);
  const longHol = longHolidayName(dateStr);
  const { m } = parseYmd(dateStr);

  const f: DayFactors = {
    date: dateStr,
    weekday,
    weekdayLabel: WEEKDAY_LABELS[weekday],
    isWeekend: weekday === 0 || weekday === 6,
    isFriOrSat: weekday === 5 || weekday === 6,
    isGotobi: isGotobi(dateStr),
    isHoliday: !!holidayName,
    holidayName,
    isLongHoliday: !!longHol,
    longHolidayName: longHol,
    isYearEndNewYearParty: isYearEndNewYearParty(dateStr),
    isFarewellSeason: isFarewellSeason(dateStr),
    isMonthEnd: isMonthEndDay(dateStr),
    isMonthStart: isMonthStartDay(dateStr),
    isBonusMonth: m === 6 || m === 12,
    labels: [],
  };

  const labels: string[] = [];
  if (f.isHoliday) labels.push(f.holidayName!);
  else if (f.isWeekend) labels.push(f.weekdayLabel + '曜');
  if (f.isFriOrSat && !f.isHoliday) labels.push('週末夜間');
  if (f.isGotobi) labels.push('五十日');
  if (f.isLongHoliday) labels.push(f.longHolidayName!);
  if (f.isYearEndNewYearParty) labels.push('忘新年会シーズン');
  if (f.isFarewellSeason) labels.push('送別会シーズン');
  if (f.isMonthEnd) labels.push('月末');
  if (f.isMonthStart) labels.push('月初');
  if (f.isBonusMonth) labels.push('ボーナス月');
  f.labels = labels;

  return f;
}
