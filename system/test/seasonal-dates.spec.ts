import { describe, expect, it } from 'vitest';
import {
  computeEasterMonthDay,
  computeDefaultRange,
  computeEffectiveRange,
  getActiveSeasonalEvent,
  type SeasonalEventRow,
} from '../src/utils/seasonal_dates';

function emptyRow(event_key: SeasonalEventRow['event_key'], is_enabled = 1): SeasonalEventRow {
  return {
    event_key,
    is_enabled,
    override_start_month: null,
    override_start_day: null,
    override_end_month: null,
    override_end_day: null,
  };
}

describe('computeEasterMonthDay', () => {
  it('既知の実際のイースター日と一致する', () => {
    expect(computeEasterMonthDay(2024)).toEqual({ month: 3, day: 31 });
    expect(computeEasterMonthDay(2025)).toEqual({ month: 4, day: 20 });
    expect(computeEasterMonthDay(2026)).toEqual({ month: 4, day: 5 });
    expect(computeEasterMonthDay(2027)).toEqual({ month: 3, day: 28 });
    expect(computeEasterMonthDay(2028)).toEqual({ month: 4, day: 16 });
    expect(computeEasterMonthDay(2030)).toEqual({ month: 4, day: 21 });
  });
});

describe('computeDefaultRange', () => {
  it('ハロウィンは10/17〜10/31', () => {
    expect(computeDefaultRange('halloween', 2026)).toEqual({ start: { month: 10, day: 17 }, end: { month: 10, day: 31 } });
  });

  it('クリスマスは12/11〜12/25', () => {
    expect(computeDefaultRange('christmas', 2026)).toEqual({ start: { month: 12, day: 11 }, end: { month: 12, day: 25 } });
  });

  it('年末年始カウントダウンは12/25〜12/31', () => {
    expect(computeDefaultRange('year_end_countdown', 2026)).toEqual({ start: { month: 12, day: 25 }, end: { month: 12, day: 31 } });
  });

  it('謹賀新年は1/1〜1/5', () => {
    expect(computeDefaultRange('new_year', 2026)).toEqual({ start: { month: 1, day: 1 }, end: { month: 1, day: 5 } });
  });

  it('イースターはイースター当日から直近15日間（2026年は4/5終了）', () => {
    expect(computeDefaultRange('easter', 2026)).toEqual({ start: { month: 3, day: 22 }, end: { month: 4, day: 5 } });
  });
});

describe('computeEffectiveRange', () => {
  it('上書きがなければ既定値を使う', () => {
    const range = computeEffectiveRange('halloween', 2026, emptyRow('halloween'));
    expect(range).toEqual({ start: { month: 10, day: 17 }, end: { month: 10, day: 31 } });
  });

  it('上書きがあればそちらを優先する', () => {
    const row: SeasonalEventRow = { ...emptyRow('halloween'), override_start_month: 10, override_start_day: 1, override_end_month: 11, override_end_day: 3 };
    const range = computeEffectiveRange('halloween', 2026, row);
    expect(range).toEqual({ start: { month: 10, day: 1 }, end: { month: 11, day: 3 } });
  });
});

describe('getActiveSeasonalEvent', () => {
  const allRows = [emptyRow('halloween'), emptyRow('christmas'), emptyRow('easter'), emptyRow('year_end_countdown'), emptyRow('new_year')];

  it('12/25はクリスマスと年末年始カウントダウンが重なるが、クリスマスが優先される', () => {
    expect(getActiveSeasonalEvent({ year: 2026, month: 12, day: 25 }, allRows)).toBe('christmas');
  });

  it('12/26は年末年始カウントダウンのみ該当', () => {
    expect(getActiveSeasonalEvent({ year: 2026, month: 12, day: 26 }, allRows)).toBe('year_end_countdown');
  });

  it('該当イベントがない日はnull', () => {
    expect(getActiveSeasonalEvent({ year: 2026, month: 6, day: 15 }, allRows)).toBeNull();
  });

  it('無効化されたイベントは対象から除外される', () => {
    const rows = [emptyRow('halloween', 0)];
    expect(getActiveSeasonalEvent({ year: 2026, month: 10, day: 20 }, rows)).toBeNull();
  });

  it('手動上書きで期間を変更するとその期間で判定される', () => {
    const row: SeasonalEventRow = { ...emptyRow('halloween'), override_start_month: 9, override_start_day: 1, override_end_month: 9, override_end_day: 30 };
    expect(getActiveSeasonalEvent({ year: 2026, month: 9, day: 15 }, [row])).toBe('halloween');
    expect(getActiveSeasonalEvent({ year: 2026, month: 10, day: 20 }, [row])).toBeNull();
  });
});
