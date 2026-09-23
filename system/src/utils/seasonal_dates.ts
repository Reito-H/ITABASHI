export type SeasonalEventKey = 'halloween' | 'christmas' | 'easter' | 'year_end_countdown' | 'new_year';

export const SEASONAL_EVENT_KEYS: SeasonalEventKey[] = ['halloween', 'christmas', 'easter', 'year_end_countdown', 'new_year'];

export const SEASONAL_EVENT_LABELS: Record<SeasonalEventKey, string> = {
  halloween: 'ハロウィン',
  christmas: 'クリスマス',
  easter: 'イースター',
  year_end_countdown: '年末年始カウントダウン',
  new_year: '謹賀新年',
};

// 優先順位（同日に複数該当した場合、配列の先頭側を優先）。
// 設計上は重ならない想定だが、手動上書きで意図せず重なるケースに備えて総順序を決めておく。
// 唯一の既定重複はクリスマス(12/11-12/25)と年末年始カウントダウン(12/25-12/31)の12/25。
// 12/25はクリスマス当日そのものなのでクリスマスを優先する。
export const SEASONAL_EVENT_PRIORITY: SeasonalEventKey[] = ['christmas', 'year_end_countdown', 'new_year', 'halloween', 'easter'];

export type SeasonalEventRow = {
  event_key: SeasonalEventKey;
  is_enabled: number;
  override_start_month: number | null;
  override_start_day: number | null;
  override_end_month: number | null;
  override_end_day: number | null;
};

export type MonthDay = { month: number; day: number };

// アノニマス・グレゴリオ暦アルゴリズム（Meeus/Jones/Butcher）で西方教会イースター（復活祭）を算出
export function computeEasterMonthDay(year: number): MonthDay {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const value = h + l - 7 * m + 114;
  return { month: Math.floor(value / 31), day: (value % 31) + 1 }; // month: 3=3月, 4=4月
}

// UTC日付として (year, month, day) から days-1 日前を計算する（月をまたいでも正しく戻る）
function daysBefore(year: number, month: number, day: number, days: number): MonthDay {
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return { month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

const FIXED_END: Record<Exclude<SeasonalEventKey, 'easter'>, { month: number; day: number; days: number }> = {
  halloween: { month: 10, day: 31, days: 15 },
  christmas: { month: 12, day: 25, days: 15 },
  year_end_countdown: { month: 12, day: 31, days: 7 },
  new_year: { month: 1, day: 5, days: 5 },
};

// 指定イベント・指定年の既定期間（開始・終了とも当年内に収まる。年またぎの計算は不要）
export function computeDefaultRange(key: SeasonalEventKey, year: number): { start: MonthDay; end: MonthDay } {
  if (key === 'easter') {
    const end = computeEasterMonthDay(year);
    return { start: daysBefore(year, end.month, end.day, 15), end };
  }
  const def = FIXED_END[key];
  return { start: daysBefore(year, def.month, def.day, def.days), end: { month: def.month, day: def.day } };
}

function monthDayValue(md: MonthDay): number {
  return md.month * 100 + md.day;
}

export function computeEffectiveRange(key: SeasonalEventKey, year: number, row: SeasonalEventRow): { start: MonthDay; end: MonthDay } {
  const def = computeDefaultRange(key, year);
  const start =
    row.override_start_month != null && row.override_start_day != null
      ? { month: row.override_start_month, day: row.override_start_day }
      : def.start;
  const end =
    row.override_end_month != null && row.override_end_day != null
      ? { month: row.override_end_month, day: row.override_end_day }
      : def.end;
  return { start, end };
}

// 現在(JST)の年月日と設定行から「今アクティブなイベント」を1つだけ返す（優先順位順）。なければnull
export function getActiveSeasonalEvent(
  now: { year: number; month: number; day: number },
  rows: SeasonalEventRow[]
): SeasonalEventKey | null {
  const nowValue = monthDayValue({ month: now.month, day: now.day });
  for (const key of SEASONAL_EVENT_PRIORITY) {
    const row = rows.find((r) => r.event_key === key);
    if (!row || !row.is_enabled) continue;
    const range = computeEffectiveRange(key, now.year, row);
    if (nowValue >= monthDayValue(range.start) && nowValue <= monthDayValue(range.end)) return key;
  }
  return null;
}
