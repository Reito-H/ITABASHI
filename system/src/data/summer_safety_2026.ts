// 夏季の交通事故をゼロにする運動（2026）手札集計の共通定義とロジック（外部依存なし）。
//
// 実データは D1 の summer_safety_2026_people / _entries / _meta（migration_134）。
// 手札は各乗務員が1日1回、当日の乗務での眠気について 1/2/3 を記入したもの。
//   1 = 眠気を感じなかった
//   2 = 眠気を感じたので運転を停止した
//   3 = 眠気を感じたが「これぐらいは大丈夫」と判断して運転を続けた
// 回収した67枚（2026年9月4日 集約）を初期投入済み。数字は手書きスキャンのAI下読みのため要確認。

export const SS2026_TITLE = '夏季の交通事故をゼロにする運動';
export const SS2026_PERIOD_START = '2026-08-01';
export const SS2026_PERIOD_END = '2026-08-31';
export const SS2026_YEAR = 2026;
export const SS2026_MONTH = 8;
export const SS2026_DAYS_IN_MONTH = 31;

export const SS2026_SOURCE_NOTE =
  '各乗務員が毎乗務ごとに記入した手札67枚（2026年9月4日 回収・集約）を集計。' +
  '数字は手書きスキャンからのAI下読みのため、個人別の画面で修正できます。';

export const SS2026_OPTION_LABEL: Record<1 | 2 | 3, string> = {
  1: '眠気を感じなかった',
  2: '眠気を感じたので運転を停止した',
  3: '眠気を感じたが判断して運転を続けた',
};

export const SS2026_OPTION_LABEL_LONG: Record<1 | 2 | 3, string> = {
  1: '眠気を感じなかった',
  2: '眠気を感じたので運転を停止した',
  3: '眠気を感じたが「これぐらいは大丈夫」だと判断して運転を続けた',
};

export const SS2026_OPTION_COLOR: Record<1 | 2 | 3, string> = {
  1: '#16a34a', // 問題なし＝緑
  2: '#2563eb', // 眠気を感じたが正しく停止＝青
  3: '#dc2626', // 危険な判断＝赤
};

// ---- DB 行 ----
export interface SS2026PersonRow {
  person_key: string;
  emp_no: string | null;
  emp_name: string;
  team: number | null;
  division: number | null;
  sheet_no: number | null;
}
export interface SS2026EntryRow {
  person_key: string;
  day: number;
  value: number;
}

// ---- 集計結果 ----
export interface SS2026Tally {
  n1: number;
  n2: number;
  n3: number;
  total: number;
}
export interface SS2026Week extends SS2026Tally {
  label: string;
  startDay: number;
  endDay: number;
}
export interface SS2026PersonStat extends SS2026Tally {
  person_key: string;
  emp_no: string | null;
  emp_name: string;
  team: number | null;
  division: number | null;
  sheet_no: number | null;
  firstDay: number | null;
  lastDay: number | null;
  byDay: Record<number, number>; // day -> value(1/2/3)
}
export interface SS2026DivisionStat extends SS2026Tally {
  division: number | null;
  label: string;
  people: number;
}
export interface SS2026DailyPoint extends SS2026Tally {
  day: number;
}
export interface SS2026Stats {
  peopleCount: number;
  respondents: number; // 1件以上記入がある人数
  totals: SS2026Tally;
  weeks: SS2026Week[];
  daily: SS2026DailyPoint[];
  byPerson: SS2026PersonStat[];
  byDivision: SS2026DivisionStat[];
  option3: {
    entries: { person_key: string; emp_name: string; team: number | null; day: number }[];
    people: SS2026PersonStat[];
  };
}

// 8月を7日区切りの週に分ける（手札の行組みに合わせる）
const WEEK_RANGES: { label: string; startDay: number; endDay: number }[] = [
  { label: '第1週（8/1〜8/8）', startDay: 1, endDay: 8 },
  { label: '第2週（8/9〜8/15）', startDay: 9, endDay: 15 },
  { label: '第3週（8/16〜8/22）', startDay: 16, endDay: 22 },
  { label: '第4週（8/23〜8/29）', startDay: 23, endDay: 29 },
  { label: '第5週（8/30〜8/31）', startDay: 30, endDay: 31 },
];

export function divisionLabel(d: number | null): string {
  return d == null ? '不明' : `${d}課`;
}

export function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
}

function addValue(t: SS2026Tally, v: number): void {
  if (v === 1) t.n1++;
  else if (v === 2) t.n2++;
  else if (v === 3) t.n3++;
  t.total++;
}

export function computeSS2026Stats(people: SS2026PersonRow[], entries: SS2026EntryRow[]): SS2026Stats {
  const byKey = new Map<string, SS2026PersonRow>();
  for (const p of people) byKey.set(p.person_key, p);

  const personStats = new Map<string, SS2026PersonStat>();
  const ensure = (key: string): SS2026PersonStat => {
    let s = personStats.get(key);
    if (!s) {
      const p = byKey.get(key);
      s = {
        person_key: key,
        emp_no: p?.emp_no ?? null,
        emp_name: p?.emp_name ?? key,
        team: p?.team ?? null,
        division: p?.division ?? null,
        sheet_no: p?.sheet_no ?? null,
        n1: 0, n2: 0, n3: 0, total: 0,
        firstDay: null, lastDay: null, byDay: {},
      };
      personStats.set(key, s);
    }
    return s;
  };
  // 記入ゼロの人も一覧に載せる
  for (const p of people) ensure(p.person_key);

  const totals: SS2026Tally = { n1: 0, n2: 0, n3: 0, total: 0 };
  const weeks: SS2026Week[] = WEEK_RANGES.map(w => ({ ...w, n1: 0, n2: 0, n3: 0, total: 0 }));
  const daily: SS2026DailyPoint[] = [];
  for (let d = 1; d <= SS2026_DAYS_IN_MONTH; d++) daily.push({ day: d, n1: 0, n2: 0, n3: 0, total: 0 });
  const divMap = new Map<string, SS2026DivisionStat>();
  const option3Entries: { person_key: string; emp_name: string; team: number | null; day: number }[] = [];

  for (const e of entries) {
    if (e.value !== 1 && e.value !== 2 && e.value !== 3) continue;
    if (e.day < 1 || e.day > SS2026_DAYS_IN_MONTH) continue;
    const ps = ensure(e.person_key);
    ps.byDay[e.day] = e.value;
    addValue(ps, e.value);
    ps.firstDay = ps.firstDay == null ? e.day : Math.min(ps.firstDay, e.day);
    ps.lastDay = ps.lastDay == null ? e.day : Math.max(ps.lastDay, e.day);

    addValue(totals, e.value);
    addValue(daily[e.day - 1], e.value);
    const wk = weeks.find(w => e.day >= w.startDay && e.day <= w.endDay);
    if (wk) addValue(wk, e.value);

    const divKey = ps.division == null ? 'null' : String(ps.division);
    let ds = divMap.get(divKey);
    if (!ds) {
      ds = { division: ps.division, label: divisionLabel(ps.division), people: 0, n1: 0, n2: 0, n3: 0, total: 0 };
      divMap.set(divKey, ds);
    }
    addValue(ds, e.value);

    if (e.value === 3) {
      option3Entries.push({ person_key: e.person_key, emp_name: ps.emp_name, team: ps.team, day: e.day });
    }
  }

  const byPerson = [...personStats.values()].sort((a, b) => {
    const sa = a.sheet_no ?? 9999, sb = b.sheet_no ?? 9999;
    if (sa !== sb) return sa - sb;
    return a.emp_name.localeCompare(b.emp_name, 'ja');
  });

  // 課ごとの人数
  const peoplePerDiv = new Map<string, number>();
  for (const p of byPerson) {
    const k = p.division == null ? 'null' : String(p.division);
    peoplePerDiv.set(k, (peoplePerDiv.get(k) ?? 0) + 1);
  }
  const byDivision = [...divMap.values()].map(d => ({
    ...d,
    people: peoplePerDiv.get(d.division == null ? 'null' : String(d.division)) ?? 0,
  })).sort((a, b) => (a.division ?? 99) - (b.division ?? 99));

  const option3People = byPerson.filter(p => p.n3 > 0);
  option3Entries.sort((a, b) => a.day - b.day);

  return {
    peopleCount: byPerson.length,
    respondents: byPerson.filter(p => p.total > 0).length,
    totals,
    weeks,
    daily,
    byPerson,
    byDivision,
    option3: { entries: option3Entries, people: option3People },
  };
}

// ---- 一括取り込み（貼り付け）用パーサ ----
// 想定フォーマット（タブ / カンマ 区切り、1行1名）:
//   社員番号<TAB>氏名<TAB>班<TAB>1日,2日,3日,... の値（空欄=未記入。1/2/3以外は無視）
// もしくは「氏名<TAB>班<TAB>d1..d31」。ヘッダー行があれば読み飛ばす。
export interface SS2026ImportPerson {
  emp_no: string;
  emp_name: string;
  team: number | null;
  days: Record<number, number>;
  warnings: string[];
}
export interface SS2026ImportResult {
  people: SS2026ImportPerson[];
  errors: string[];
}

export function parseSS2026Import(text: string): SS2026ImportResult {
  const errors: string[] = [];
  const people: SS2026ImportPerson[] = [];
  const rawLines = text.replace(/\r\n?/g, '\n').split('\n');
  let lineNo = 0;
  for (const raw of rawLines) {
    lineNo++;
    const line = raw.trim();
    if (!line) continue;
    if (/^(社員番号|氏名|emp)/i.test(line)) continue; // ヘッダー
    const cols = line.split(/\t|,/).map(s => s.trim());
    if (cols.length < 3) { errors.push(`${lineNo}行目: 列が足りません`); continue; }

    let idx = 0;
    let emp_no = '';
    // 先頭列が数字7桁前後なら社員番号とみなす
    if (/^\d{5,}$/.test(cols[0])) { emp_no = cols[0]; idx = 1; }
    const emp_name = cols[idx] || '';
    idx++;
    const teamRaw = cols[idx] || '';
    const team = /^\d+$/.test(teamRaw) ? parseInt(teamRaw, 10) : null;
    idx++;
    if (!emp_name) { errors.push(`${lineNo}行目: 氏名がありません`); continue; }

    const dayVals = cols.slice(idx);
    const days: Record<number, number> = {};
    const warnings: string[] = [];
    for (let d = 0; d < dayVals.length && d < SS2026_DAYS_IN_MONTH; d++) {
      const v = dayVals[d];
      if (v === '' || v === '-' || v === '印' || v === '休') continue;
      const n = parseInt(v, 10);
      if (n === 1 || n === 2 || n === 3) days[d + 1] = n;
      else warnings.push(`${d + 1}日「${v}」は無視`);
    }
    people.push({ emp_no, emp_name, team, days, warnings });
  }
  if (!people.length && !errors.length) errors.push('取り込める行がありませんでした');
  return { people, errors };
}
