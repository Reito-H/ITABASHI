// 秋の全国交通安全運動（2026/9/21〜9/30）手札集計の共通定義とロジック（外部依存なし）。
//
// 実データは D1 の autumn_safety_2026_people / _entries / _meta（migration_175）。
// 手札は各乗務員が乗務日ごとに、3つの最重要取組み項目を 1/2/3 で自己評価したもの。
//   項目1 = 法定速度30km/h厳守 / 項目2 = スマホ・カーナビ注視根絶 / 項目3 = 眠気を感じたら必ず停止
//   1 = 100%遵守した / 2 = 80%以上守れた / 3 = 出来なかった
// 回収した258枚（2026年10月5日 スキャン）を初期投入済み。数字は手書きスキャンのAI下読み、
// 氏名は社員名簿と照合して紐づけ（読み取れなかった手札は「不明」）。

export const AS2026_TITLE = '秋の全国交通安全運動';
export const AS2026_PERIOD_START = '2026-09-21';
export const AS2026_PERIOD_END = '2026-09-30';
export const AS2026_FIRST_DAY = 21;
export const AS2026_LAST_DAY = 30;
export const AS2026_DAYS: number[] = Array.from({ length: AS2026_LAST_DAY - AS2026_FIRST_DAY + 1 }, (_, i) => AS2026_FIRST_DAY + i);
export const AS2026_ZERO_DAY = 30; // 交通事故ゼロを目指す日

export const AS2026_SOURCE_NOTE =
  '各乗務員が乗務日ごとに記入した手札258枚（2026年10月5日 回収・スキャン）を集計。' +
  '数字は手書きスキャンからのAI下読み、氏名は社員名簿と照合して紐づけています（読み取れなかった手札は「不明」）。';

export type AS2026Item = 1 | 2 | 3;
export const AS2026_ITEMS: AS2026Item[] = [1, 2, 3];
export const AS2026_ITEM_LABEL: Record<AS2026Item, string> = {
  1: '法定速度30km/h厳守',
  2: 'スマホ・カーナビ注視根絶',
  3: '眠気を感じたら必ず停止',
};
export const AS2026_ITEM_SHORT: Record<AS2026Item, string> = {
  1: '速度30km/h',
  2: 'スマホ・ナビ',
  3: '眠気で停止',
};

export const AS2026_OPTION_LABEL: Record<1 | 2 | 3, string> = {
  1: '100%遵守した',
  2: '80%以上守れた',
  3: '出来なかった',
};

export const AS2026_OPTION_COLOR: Record<1 | 2 | 3, string> = {
  1: '#16a34a', // 遵守＝緑
  2: '#d97706', // おおむね＝橙
  3: '#dc2626', // 出来なかった＝赤
};

// ---- DB 行 ----
export interface AS2026PersonRow {
  person_key: string;
  emp_no: string | null;
  emp_name: string;
  written_name: string | null;
  written_no: string | null;
  team: number | null;
  division: number | null;
  sheet_no: number | null;
  note: string | null;
}
export interface AS2026EntryRow {
  person_key: string;
  day: number;
  item: number;
  value: number;
}

// ---- 集計結果 ----
export interface AS2026Tally {
  n1: number;
  n2: number;
  n3: number;
  total: number;
}
export type AS2026ItemTallies = Record<AS2026Item, AS2026Tally>;

export interface AS2026PersonStat extends AS2026PersonRow {
  items: AS2026ItemTallies;
  days: number;          // 記入のある乗務日数
  perfectDays: number;   // 3項目すべて「1」の乗務日数
  n3: number;            // 「3」の件数（全項目合計）
  lastDay: number | null;
  byDay: Record<number, Partial<Record<AS2026Item, number>>>; // day -> item -> value
}
export interface AS2026DayStat {
  day: number;
  shifts: number;        // その日に記入のある乗務員数
  perfect: number;
  items: AS2026ItemTallies;
}
export interface AS2026DivisionStat {
  division: number | null;
  label: string;
  people: number;
  shifts: number;
  items: AS2026ItemTallies;
}
export interface AS2026Option3Entry {
  person_key: string;
  emp_name: string;
  emp_no: string | null;
  team: number | null;
  day: number;
  items: AS2026Item[];   // 「3」をつけた項目
}
export interface AS2026Stats {
  peopleCount: number;
  linkedCount: number;   // 社員名簿に紐づいた人数
  shifts: number;        // 乗務 延べ日数
  perfectShifts: number; // 3項目すべて「1」の乗務日
  perfectPeople: number; // 全乗務日で3項目すべて「1」の人数
  marks: number;         // 記入 延べ件数（項目単位）
  items: AS2026ItemTallies;
  daily: AS2026DayStat[];
  byDivision: AS2026DivisionStat[];
  byPerson: AS2026PersonStat[];
  option3: { entries: AS2026Option3Entry[]; people: AS2026PersonStat[] };
  chronicItem1Two: number; // 全乗務日で速度を「2」とした人数
}

export function divisionLabel(d: number | null): string {
  return d == null ? '不明' : `${d}課`;
}

export function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
}

const emptyTally = (): AS2026Tally => ({ n1: 0, n2: 0, n3: 0, total: 0 });
const emptyItems = (): AS2026ItemTallies => ({ 1: emptyTally(), 2: emptyTally(), 3: emptyTally() });

function addValue(t: AS2026Tally, v: number): void {
  if (v === 1) t.n1++;
  else if (v === 2) t.n2++;
  else if (v === 3) t.n3++;
  t.total++;
}

export function computeAS2026Stats(people: AS2026PersonRow[], entries: AS2026EntryRow[]): AS2026Stats {
  const personStats = new Map<string, AS2026PersonStat>();
  for (const p of people) {
    personStats.set(p.person_key, { ...p, items: emptyItems(), days: 0, perfectDays: 0, n3: 0, lastDay: null, byDay: {} });
  }

  const items = emptyItems();
  for (const e of entries) {
    if (e.value !== 1 && e.value !== 2 && e.value !== 3) continue;
    if (e.item !== 1 && e.item !== 2 && e.item !== 3) continue;
    if (e.day < AS2026_FIRST_DAY || e.day > AS2026_LAST_DAY) continue;
    const ps = personStats.get(e.person_key);
    if (!ps) continue;
    (ps.byDay[e.day] ??= {})[e.item as AS2026Item] = e.value;
    addValue(ps.items[e.item as AS2026Item], e.value);
    addValue(items[e.item as AS2026Item], e.value);
    if (e.value === 3) ps.n3++;
  }

  const daily: AS2026DayStat[] = AS2026_DAYS.map(day => ({ day, shifts: 0, perfect: 0, items: emptyItems() }));
  const divMap = new Map<string, AS2026DivisionStat>();
  const option3Entries: AS2026Option3Entry[] = [];
  let shifts = 0, perfectShifts = 0;

  for (const ps of personStats.values()) {
    const divKey = ps.division == null ? 'null' : String(ps.division);
    let ds = divMap.get(divKey);
    if (!ds) {
      ds = { division: ps.division, label: divisionLabel(ps.division), people: 0, shifts: 0, items: emptyItems() };
      divMap.set(divKey, ds);
    }
    ds.people++;
    for (const [dStr, vals] of Object.entries(ps.byDay)) {
      const day = Number(dStr);
      const ds2 = daily[day - AS2026_FIRST_DAY];
      const filled = AS2026_ITEMS.filter(i => vals[i] != null);
      if (!filled.length) continue;
      ps.days++;
      ps.lastDay = ps.lastDay == null ? day : Math.max(ps.lastDay, day);
      shifts++;
      ds.shifts++;
      ds2.shifts++;
      const perfect = filled.every(i => vals[i] === 1);
      if (perfect) { ps.perfectDays++; perfectShifts++; ds2.perfect++; }
      const threes: AS2026Item[] = [];
      for (const i of filled) {
        addValue(ds2.items[i], vals[i]!);
        addValue(ds.items[i], vals[i]!);
        if (vals[i] === 3) threes.push(i);
      }
      if (threes.length) {
        option3Entries.push({ person_key: ps.person_key, emp_name: ps.emp_name, emp_no: ps.emp_no, team: ps.team, day, items: threes });
      }
    }
  }

  const byPerson = [...personStats.values()].sort((a, b) => (a.sheet_no ?? 9999) - (b.sheet_no ?? 9999));
  const byDivision = [...divMap.values()].sort((a, b) => (a.division ?? 99) - (b.division ?? 99));
  option3Entries.sort((a, b) => a.day - b.day || (a.emp_name).localeCompare(b.emp_name, 'ja'));

  return {
    peopleCount: byPerson.length,
    linkedCount: byPerson.filter(p => p.emp_no).length,
    shifts,
    perfectShifts,
    perfectPeople: byPerson.filter(p => p.days > 0 && p.perfectDays === p.days).length,
    marks: items[1].total + items[2].total + items[3].total,
    items,
    daily,
    byDivision,
    byPerson,
    option3: { entries: option3Entries, people: byPerson.filter(p => p.n3 > 0) },
    chronicItem1Two: byPerson.filter(p => p.days > 0 && p.items[1].n2 === p.days).length,
  };
}
