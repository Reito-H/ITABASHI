// 個人別「売上推移 詳細分析レポート」＋「日別売上 全データ一覧」の集計・分析文生成
// （/sales-ai/employee/:id/detail-report/print・/sales-ai/employee/:id/daily-list/print）
// 「AI」は表示名のみで、外部AI/LLM APIへの通信は一切行わない。売上記録（sales_records）・暦要因（taxi_calendar）・
// 気象データ（weather_daily）を集計し、しきい値判定＋定型文で文章を組み立てるルールベース分析。
// 同僚比較は「本人の主な勤務区分と同じduty_codeで、その月度に5乗務以上した乗務員（本人除く）」の1乗務あたり平均日商。
import { getDayFactors, type DayFactors } from './taxi_calendar';
import { DUTY_CODE_LABELS } from './sales_trend_analysis';
import { getPeriodSettings, getPeriodRange } from '../auth';

// raw_csv_json（ホシコン収集データ42列。migration_099.sql 参照）の列番号
export const RAW = {
  date: 0, office: 1, ka: 2, team: 3, car: 4, code: 5, name: 6, kinmu: 7, kinmuType: 8, jomu: 9, aJomu: 10,
  outTime: 11, inTime: 12, kosoku: 13, kyukei: 14, handle: 15, night: 16, overtime: 17, km: 18, ekm: 19, rides: 20, amount: 21,
  hwyExclude: 22, etc: 23, pax: 24, hsLoaded: 25, hsEmpty: 26, haLoaded: 27, haEmpty: 28, hdLoaded: 29, hdEmpty: 30, nippo: 31,
  plan: 32, otherExclude: 33, spdEmptyHwy: 34, spdLoadedHwy: 35, spdEmptyLocal: 36, spdLoadedLocal: 37, tenkoOut: 38, tenkoIn: 39,
} as const;

export interface SalesDetailSourceRow {
  date: string; amount: number; ride_count: number | null; distance_km: number | null; duty_code: string | null;
  start_time: string | null; return_time: string | null; labor_hours: number | null; night_hours: number | null; overtime_hours: number | null;
  period_year: number | null; period_month: number | null; raw_csv_json: string | null;
}
// 月度ごとの同僚集計（entries は "課:平均日商" をカンマ連結したもの）
export interface PeerMonthRow { py: number; pm: number; entries: string | null; n: number; total: number; rides: number }
export interface WeatherRow { date: string; precipitation_mm: number | null; max_temp_c: number | null; min_temp_c: number | null; weather_day: string | null; weather_night: string | null }

export interface SalesDetailInput {
  emp: { id: number; name: string; emp_no: string; division: number | null; team: number | null };
  rows: SalesDetailSourceRow[];
  peers: PeerMonthRow[];
  weather: WeatherRow[];
  partialKey: string | null;     // 集計途中の月度キー（"2026-10"）
  dutyCode: string | null;       // 本人の主な勤務区分（同僚比較の基準）
}

export interface DetailDay {
  date: string; key: string; py: number; pm: number; amount: number;
  rides: number | null; km: number | null; ekm: number | null; pax: number | null; car: string;
  labor: number | null; night: number | null; ot: number | null; start: string | null; ret: string | null;
  unit: number | null; jr: number | null;
  f: DayFactors; rain: number | null; tmax: number | null; tmin: number | null; wDay: string | null; wNight: string | null;
  raw: string[] | null; dutyCode: string | null;
}

export interface DetailMonth {
  key: string; py: number; pm: number; label: string; short: string; partial: boolean;
  n: number; total: number; avg: number; max: number; min: number;
  rides: number | null; unit: number | null; km: number | null; kmTotal: number | null; jr: number | null; ph: number | null;
  laborTotal: number | null; labor: number | null; ot: number | null; ret: number | null; first: string; last: string;
  peer: null | { avg: number; divAvg: number | null; top10: number; rank: number; count: number; topPct: number; rides: number | null; unit: number | null };
}

const WD = ['日', '月', '火', '水', '木', '金', '土'];

function num(x: unknown): number | null {
  if (x == null || x === '') return null;
  const v = Number(String(x).trim());
  return Number.isFinite(v) ? v : null;
}
const sum = (v: number[]) => v.reduce((a, b) => a + b, 0);
function avg(v: Array<number | null | undefined>): number | null {
  const f = v.filter((x): x is number => x != null && Number.isFinite(x));
  return f.length ? sum(f) / f.length : null;
}
function ratioSum<T>(rs: T[], a: (r: T) => number | null, b: (r: T) => number | null): number | null {
  let sa = 0, sb = 0;
  for (const r of rs) { const x = a(r), y = b(r); if (x != null && y != null) { sa += x; sb += y; } }
  return sb > 0 ? sa / sb : null;
}
function corr(xs: number[], ys: number[]): number | null {
  if (xs.length < 10) return null;
  const mx = sum(xs) / xs.length, my = sum(ys) / ys.length;
  let sxy = 0, sx = 0, sy = 0;
  for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sx += (xs[i] - mx) ** 2; sy += (ys[i] - my) ** 2; }
  return sx && sy ? sxy / Math.sqrt(sx * sy) : null;
}
// 3桁区切り（Intl の toLocaleString は Workers のCPU時間を大きく食うため自前で整形する）
export const comma = (v: number) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
export const yen = (v: number | null) => v == null ? '—' : `¥${comma(v)}`;
export const man = (v: number) => `${(v / 10000).toFixed(1)}万`;
const pctS = (v: number, d = 1) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(d)}%`;
export function decToHm(x: unknown): string | null {
  const v = num(x);
  if (v == null || v <= 0) return null;
  const h = Math.floor(v), m = Math.round((v - h) * 60);
  return m === 60 ? `${h + 1}:00` : `${h}:${String(m).padStart(2, '0')}`;
}
export function hmToMin(s: string | null): number | null {
  if (!s) return null;
  const [h, m] = s.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}
export const minToHm = (m: number) => `${Math.floor(Math.round(m) / 60)}:${String(Math.round(m) % 60).padStart(2, '0')}`;
function addDay(d: string): string {
  const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10);
}

export function buildDetailDays(rows: SalesDetailSourceRow[], weather: WeatherRow[]): DetailDay[] {
  const wmap = new Map(weather.map(w => [w.date, w]));
  const out: DetailDay[] = [];
  for (const r of rows) {
    if (r.period_year == null || r.period_month == null) continue;
    let raw: string[] | null = null;
    if (r.raw_csv_json) { try { const a = JSON.parse(r.raw_csv_json); if (Array.isArray(a)) raw = a.map(x => x == null ? '' : String(x)); } catch { /* 生CSVなし */ } }
    const rides = r.ride_count ?? (raw ? num(raw[RAW.rides]) : null);
    const km = raw ? num(raw[RAW.km]) : r.distance_km;
    const ekm = raw ? num(raw[RAW.ekm]) : null;
    const w0 = wmap.get(r.date), w1 = wmap.get(addDay(r.date));
    const rain = (w0?.precipitation_mm != null || w1?.precipitation_mm != null) ? (w0?.precipitation_mm ?? 0) + (w1?.precipitation_mm ?? 0) : null;
    out.push({
      date: r.date, key: `${r.period_year}-${r.period_month}`, py: r.period_year, pm: r.period_month, amount: r.amount,
      rides: rides && rides > 0 ? rides : null, km: km && km > 0 ? km : null, ekm, pax: raw ? num(raw[RAW.pax]) : null,
      car: raw ? (raw[RAW.car] ?? '').trim() : '',
      labor: r.labor_hours, night: r.night_hours, ot: r.overtime_hours,
      start: r.start_time ?? (raw ? decToHm(raw[RAW.outTime]) : null), ret: r.return_time ?? (raw ? decToHm(raw[RAW.inTime]) : null),
      unit: rides && rides > 0 ? r.amount / rides : null, jr: ekm != null && km ? ekm / km : null,
      f: getDayFactors(r.date), rain, tmax: w0?.max_temp_c ?? null, tmin: w0?.min_temp_c ?? null,
      wDay: w0?.weather_day ?? null, wNight: w0?.weather_night ?? null, raw, dutyCode: r.duty_code,
    });
  }
  return out;
}

function pmLabel(py: number, pm: number) { return `${py}年${pm}月度`; }
function pmShort(py: number, pm: number) { return `${String(py).slice(2)}/${pm}月`; }

export function buildDetailMonths(days: DetailDay[], peers: PeerMonthRow[], partialKey: string | null, division: number | null): DetailMonth[] {
  const peerMap = new Map(peers.map(p => [`${p.py}-${p.pm}`, p]));
  const byKey = new Map<string, DetailDay[]>();
  for (const d of days) { if (!byKey.has(d.key)) byKey.set(d.key, []); byKey.get(d.key)!.push(d); }
  const out: DetailMonth[] = [];
  for (const [key, me] of byKey) {
    const { py, pm } = me[0];
    const total = sum(me.map(d => d.amount)), a = total / me.length;
    const p = peerMap.get(key);
    let peer: DetailMonth['peer'] = null;
    if (p && p.entries) {
      // "課:平均日商" を1回のループで数値配列に展開（オブジェクト生成を避けてCPU時間を抑える）
      const vals: number[] = [], div: number[] = [];
      for (const part of p.entries.split(',')) {
        const c = part.indexOf(':');
        const v = +part.slice(c + 1);
        if (!Number.isFinite(v)) continue;
        vals.push(v);
        if (division != null && c > 0 && +part.slice(0, c) === division) div.push(v);
      }
      if (vals.length) {
        vals.sort((x, y) => y - x);
        const rank = vals.filter(v => v > a).length + 1;
        peer = {
          avg: sum(vals) / vals.length, divAvg: div.length ? sum(div) / div.length : null,
          top10: vals[Math.max(0, Math.floor(vals.length / 10) - 1)], rank, count: vals.length + 1, topPct: rank / (vals.length + 1),
          rides: p.n ? p.rides / p.n : null, unit: p.rides ? p.total / p.rides : null,
        };
      }
    }
    const rets = me.map(retMinutes).filter((x): x is number => x != null);
    out.push({
      key, py, pm, label: pmLabel(py, pm), short: pmShort(py, pm), partial: key === partialKey,
      n: me.length, total, avg: a, max: Math.max(...me.map(d => d.amount)), min: Math.min(...me.map(d => d.amount)),
      rides: avg(me.map(d => d.rides)), unit: ratioSum(me, d => d.rides != null ? d.amount : null, d => d.rides),
      km: avg(me.map(d => d.km)), kmTotal: me.some(d => d.km != null) ? sum(me.map(d => d.km ?? 0)) : null,
      jr: ratioSum(me, d => d.ekm, d => d.ekm != null ? d.km : null),
      ph: ratioSum(me, d => d.labor != null ? d.amount : null, d => d.labor),
      laborTotal: me.some(d => d.labor != null) ? sum(me.map(d => d.labor ?? 0)) : null,
      labor: avg(me.map(d => d.labor)), ot: avg(me.map(d => d.ot)), ret: avg(rets),
      first: me[0].date, last: me[me.length - 1].date, peer,
    });
  }
  return out.sort((x, y) => x.py - y.py || x.pm - y.pm);
}
// 帰庫時刻を出庫日0時からの分に変換（出庫より早い時刻＝翌日帰庫として+24時間）
export function retMinutes(d: DetailDay): number | null {
  const r = hmToMin(d.ret), s = hmToMin(d.start);
  if (r == null) return null;
  return s != null && r < s ? r + 24 * 60 : r;
}

export interface FactorItem { label: string; pct: number; n: number; avg: number }
export interface BinItem { label: string; avg: number | null; n: number }

export interface SalesDetailAnalysis {
  days: DetailDay[]; months: DetailMonth[]; completed: DetailMonth[];
  dutyLabel: string; firstDate: string; lastDate: string;
  total: number; n: number; avg: number; sd: number; cv: number;
  best: DetailDay; worst: DetailDay; highLine: number; lowLine: number; highCount: number; lowCount: number;
  peerAvg: number | null; ratio: number | null; diffMin: number | null; diffMax: number | null; topPctMax: number | null; topPctAvg: number | null; peerCountAvg: number | null;
  bestRankMonth: DetailMonth | null; worstRankMonth: DetailMonth | null; bestMonth: DetailMonth; worstMonth: DetailMonth;
  recentAvg: number | null; priorAvg: number | null; trendChange: number | null;
  ma: Array<number | null>;
  yoy: null | { months: string; self0: number; self1: number; peer0: number | null; peer1: number | null; rides0: number | null; rides1: number | null; unit0: number | null; unit1: number | null; jr0: number | null; jr1: number | null; ph0: number | null; ph1: number | null; n0: number; n1: number; peerUnit0: number | null; peerUnit1: number | null };
  myRides: number | null; peerRides: number | null; myUnit: number | null; peerUnit: number | null;
  corrs: Array<{ label: string; r: number }>;
  hiUnit: { n: number; avg: number; rides: number | null; km: number | null } | null;
  loUnit: { n: number; avg: number; rides: number | null; km: number | null } | null;
  top20: { rides: number | null; unit: number | null; km: number | null; jr: number | null; labor: number | null };
  bot20: { rides: number | null; unit: number | null; km: number | null; jr: number | null; labor: number | null };
  all: { rides: number | null; unit: number | null; km: number | null; jr: number | null; labor: number | null; ph: number | null; night: number | null; ot: number | null; ret: number | null };
  weekdays: Array<{ label: string; wd: number; n: number; avg: number | null; rides: number | null; unit: number | null }>;
  factors: FactorItem[]; rainBins: BinItem[]; tempBins: BinItem[]; weatherN: number;
  cars: Array<{ car: string; n: number; avg: number; unit: number | null }>;
  best8: DetailDay[]; worst8: DetailDay[];
  hist: Array<{ lo: number; count: number }>; histStep: number;
  text: {
    headline: string; summary: string; points: Array<{ title: string; body: string }>;
    flow: string; yoy: string; daily: string; decomp: string; rank: string; cond: string; work: string;
    strong: string[]; weak: string[]; recs: string[]; closing: string;
  };
}

function stat20(rs: DetailDay[]) {
  return {
    rides: avg(rs.map(r => r.rides)), unit: ratioSum(rs, r => r.rides != null ? r.amount : null, r => r.rides),
    km: avg(rs.map(r => r.km)), jr: ratioSum(rs, r => r.ekm, r => r.ekm != null ? r.km : null), labor: avg(rs.map(r => r.labor)),
  };
}

export function dayNotes(d: DetailDay, rainMin = 10): string[] {
  const n: string[] = [];
  if (d.f.holidayName) n.push(d.f.holidayName);
  if (d.f.longHolidayName && !d.f.holidayName) n.push(d.f.longHolidayName);
  if (d.f.isBeforeLongWeekend) n.push('連休前日');
  if (d.rain != null && d.rain >= rainMin) n.push(`雨${Math.round(d.rain)}mm`);
  if (d.tmax != null && d.tmax >= 35) n.push('猛暑');
  return n;
}

export function analyzeSalesDetail(input: SalesDetailInput): SalesDetailAnalysis | null {
  const allDays = buildDetailDays(input.rows, input.weather);
  const days = allDays.filter(d => d.amount > 0);
  if (!days.length) return null;
  const months = buildDetailMonths(days, input.peers, input.partialKey, input.emp.division);
  const completed = months.filter(m => !m.partial).length ? months.filter(m => !m.partial) : months;
  const dutyLabel = input.dutyCode ? (DUTY_CODE_LABELS[input.dutyCode] ?? input.dutyCode) : '同じ勤務区分';

  const amounts = days.map(d => d.amount);
  const total = sum(amounts), n = days.length, a = total / n;
  const sd = Math.sqrt(sum(amounts.map(x => (x - a) ** 2)) / n), cv = sd / a;
  const best = days.reduce((x, y) => y.amount > x.amount ? y : x), worst = days.reduce((x, y) => y.amount < x.amount ? y : x);
  // 好調／不調の目安線：平均±1標準偏差を千円単位に丸めたもの
  const highLine = Math.round((a + sd) / 1000) * 1000, lowLine = Math.round((a - sd) / 1000) * 1000;
  const highCount = amounts.filter(x => x >= highLine).length, lowCount = amounts.filter(x => x < lowLine).length;

  const withPeer = completed.filter(m => m.peer);
  const peerAvg = withPeer.length ? sum(withPeer.map(m => m.peer!.avg)) / withPeer.length : null;
  const selfOnPeerMonths = withPeer.length ? sum(withPeer.map(m => m.total)) / sum(withPeer.map(m => m.n)) : null;
  const ratio = peerAvg && selfOnPeerMonths ? selfOnPeerMonths / peerAvg - 1 : null;
  const diffs = withPeer.map(m => m.avg / m.peer!.avg - 1);
  const tops = withPeer.map(m => m.peer!.topPct);
  const bestRankMonth = withPeer.length ? withPeer.reduce((x, y) => y.peer!.topPct < x.peer!.topPct ? y : x) : null;
  const worstRankMonth = withPeer.length ? withPeer.reduce((x, y) => y.peer!.topPct > x.peer!.topPct ? y : x) : null;
  const bestMonth = completed.reduce((x, y) => y.avg > x.avg ? y : x), worstMonth = completed.reduce((x, y) => y.avg < x.avg ? y : x);

  const recent = completed.slice(-3), prior = completed.slice(0, -3);
  const recentAvg = recent.length ? sum(recent.map(m => m.total)) / sum(recent.map(m => m.n)) : null;
  const priorAvg = prior.length ? sum(prior.map(m => m.total)) / sum(prior.map(m => m.n)) : null;
  const trendChange = recentAvg && priorAvg ? recentAvg / priorAvg - 1 : null;

  const W = Math.min(13, Math.max(3, Math.round(n / 15)));
  const ma = days.map((_, i) => i < Math.min(6, W - 1) ? null : avg(days.slice(Math.max(0, i - W + 1), i + 1).map(d => d.amount)));

  // 前年同期比較：直近12完了月度のうち、前年同月度にも乗務がある月度（3つ以上）を突き合わせる
  let yoy: SalesDetailAnalysis['yoy'] = null;
  {
    const byKey = new Map(completed.map(m => [m.key, m]));
    const last12 = completed.slice(-12);
    const pairs = last12.filter(m => byKey.has(`${m.py - 1}-${m.pm}`));
    if (pairs.length >= 3) {
      const cur = pairs, prev = pairs.map(m => byKey.get(`${m.py - 1}-${m.pm}`)!);
      const pick = (ms: DetailMonth[]) => { const keys = new Set(ms.map(m => m.key)); return days.filter(d => keys.has(d.key)); };
      const d0 = pick(prev), d1 = pick(cur);
      const peerOf = (ms: DetailMonth[]) => { const p = ms.filter(m => m.peer); return p.length ? sum(p.map(m => m.peer!.avg)) / p.length : null; };
      const peerUnitOf = (ms: DetailMonth[]) => { const p = ms.filter(m => m.peer?.unit); return p.length ? sum(p.map(m => m.peer!.unit!)) / p.length : null; };
      const pmList = [...new Set(cur.map(m => m.pm))];
      yoy = {
        months: pmList.length === cur.length && cur.length >= 3 ? `${cur[0].pm}〜${cur[cur.length - 1].pm}月度` : `${cur.length}月度分`,
        self0: avg(d0.map(d => d.amount))!, self1: avg(d1.map(d => d.amount))!, peer0: peerOf(prev), peer1: peerOf(cur),
        rides0: avg(d0.map(d => d.rides)), rides1: avg(d1.map(d => d.rides)),
        unit0: ratioSum(d0, d => d.rides != null ? d.amount : null, d => d.rides), unit1: ratioSum(d1, d => d.rides != null ? d.amount : null, d => d.rides),
        jr0: ratioSum(d0, d => d.ekm, d => d.ekm != null ? d.km : null), jr1: ratioSum(d1, d => d.ekm, d => d.ekm != null ? d.km : null),
        ph0: ratioSum(d0, d => d.labor != null ? d.amount : null, d => d.labor), ph1: ratioSum(d1, d => d.labor != null ? d.amount : null, d => d.labor),
        n0: d0.length, n1: d1.length, peerUnit0: peerUnitOf(prev), peerUnit1: peerUnitOf(cur),
      };
    }
  }

  const all = {
    rides: avg(days.map(d => d.rides)), unit: ratioSum(days, d => d.rides != null ? d.amount : null, d => d.rides),
    km: avg(days.map(d => d.km)), jr: ratioSum(days, d => d.ekm, d => d.ekm != null ? d.km : null), labor: avg(days.map(d => d.labor)),
    ph: ratioSum(days, d => d.labor != null ? d.amount : null, d => d.labor), night: avg(days.map(d => d.night)), ot: avg(days.map(d => d.ot)),
    ret: avg(months.map(m => m.ret)),
  };
  const peerRidesMs = withPeer.filter(m => m.peer!.rides != null), peerUnitMs = withPeer.filter(m => m.peer!.unit != null);
  const myRides = all.rides, peerRides = peerRidesMs.length ? sum(peerRidesMs.map(m => m.peer!.rides!)) / peerRidesMs.length : null;
  const myUnit = all.unit, peerUnit = peerUnitMs.length ? sum(peerUnitMs.map(m => m.peer!.unit!)) / peerUnitMs.length : null;

  const cfun = (label: string, pick: (d: DetailDay) => number | null) => {
    const rs = days.filter(d => pick(d) != null);
    const r = corr(rs.map(d => pick(d)!), rs.map(d => d.amount));
    return r == null ? null : { label, r };
  };
  const corrs = [cfun('走行距離', d => d.km), cfun('客単価', d => d.unit), cfun('実車率', d => d.jr), cfun('営業回数', d => d.rides)]
    .filter((x): x is { label: string; r: number } => x != null).sort((x, y) => y.r - x.r);

  const unitDays = days.filter(d => d.unit != null).sort((x, y) => x.unit! - y.unit!);
  const q = Math.floor(unitDays.length / 4);
  const qs = (rs: DetailDay[]) => ({ n: rs.length, avg: avg(rs.map(r => r.amount))!, rides: avg(rs.map(r => r.rides)), km: avg(rs.map(r => r.km)) });
  const loUnit = q >= 5 ? qs(unitDays.slice(0, q)) : null, hiUnit = q >= 5 ? qs(unitDays.slice(-q)) : null;
  const sorted = [...days].sort((x, y) => y.amount - x.amount);
  const k = Math.min(20, Math.max(3, Math.floor(n / 10)));
  const top20 = stat20(sorted.slice(0, k)), bot20 = stat20(sorted.slice(-k));

  const weekdays = [1, 2, 3, 4, 5, 6, 0].map(wd => {
    const rs = days.filter(d => d.f.weekday === wd);
    return { label: WD[wd], wd, n: rs.length, avg: avg(rs.map(r => r.amount)), rides: avg(rs.map(r => r.rides)), unit: ratioSum(rs, r => r.rides != null ? r.amount : null, r => r.rides) };
  });

  const FACTORS: Array<[string, (d: DetailDay) => boolean]> = [
    ['連休前日', d => d.f.isBeforeLongWeekend], ['金・土曜の夜', d => d.f.isFriOrSat && !d.f.isHoliday], ['送別会シーズン', d => d.f.isFarewellSeason],
    ['月末(3日間)', d => d.f.isMonthEnd], ['大型連休', d => d.f.isLongHoliday], ['五十日', d => d.f.isGotobi],
    ['忘新年会シーズン', d => d.f.isYearEndNewYearParty], ['ボーナス月', d => d.f.isBonusMonth], ['月初(3日間)', d => d.f.isMonthStart],
    ['連休明け', d => d.f.isAfterLongWeekend], ['祝日', d => d.f.isHoliday], ['土日', d => d.f.isWeekend],
  ];
  const factors: FactorItem[] = [];
  for (const [label, pred] of FACTORS) {
    const t = days.filter(pred), f = days.filter(d => !pred(d));
    if (t.length < 3 || f.length < 3) continue;
    const at = avg(t.map(d => d.amount))!, af = avg(f.map(d => d.amount))!;
    factors.push({ label, pct: (at / af - 1) * 100, n: t.length, avg: at });
  }
  factors.sort((x, y) => y.pct - x.pct);

  const wdays = days.filter(d => d.rain != null);
  const bin = (rs: DetailDay[], label: string, pred: (d: DetailDay) => boolean): BinItem => { const t = rs.filter(pred); return { label, n: t.length, avg: avg(t.map(d => d.amount)) }; };
  const rainBins = [bin(wdays, '降水なし', d => d.rain! < 0.5), bin(wdays, '小雨(〜10mm)', d => d.rain! >= 0.5 && d.rain! < 10), bin(wdays, '雨(10mm〜)', d => d.rain! >= 10)];
  const tdays = days.filter(d => d.tmax != null);
  const tempBins = [bin(tdays, '〜10℃', d => d.tmax! < 10), bin(tdays, '10〜20℃', d => d.tmax! >= 10 && d.tmax! < 20), bin(tdays, '20〜30℃', d => d.tmax! >= 20 && d.tmax! < 30),
    bin(tdays, '30〜35℃', d => d.tmax! >= 30 && d.tmax! < 35), bin(tdays, '35℃〜', d => d.tmax! >= 35)];

  const carMap = new Map<string, DetailDay[]>();
  for (const d of days) { const c = d.car || '不明'; if (!carMap.has(c)) carMap.set(c, []); carMap.get(c)!.push(d); }
  const cars = [...carMap].map(([car, rs]) => ({ car, n: rs.length, avg: avg(rs.map(r => r.amount))!, unit: ratioSum(rs, r => r.rides != null ? r.amount : null, r => r.rides) })).sort((x, y) => y.n - x.n);

  const histStep = a >= 60000 ? 5000 : a >= 30000 ? 2500 : 1000;
  const hlo = Math.floor(Math.min(...amounts) / histStep) * histStep, hhi = Math.max(...amounts);
  const hist: Array<{ lo: number; count: number }> = [];
  for (let lo = hlo; lo <= hhi; lo += histStep) hist.push({ lo, count: amounts.filter(x => x >= lo && x < lo + histStep).length });

  const base = {
    days: allDays, months, completed, dutyLabel, firstDate: days[0].date, lastDate: days[days.length - 1].date,
    total, n, avg: a, sd, cv, best, worst, highLine, lowLine, highCount, lowCount,
    peerAvg, ratio, diffMin: diffs.length ? Math.min(...diffs) : null, diffMax: diffs.length ? Math.max(...diffs) : null,
    topPctMax: tops.length ? Math.max(...tops) : null, topPctAvg: tops.length ? sum(tops) / tops.length : null,
    peerCountAvg: withPeer.length ? sum(withPeer.map(m => m.peer!.count)) / withPeer.length : null,
    bestRankMonth, worstRankMonth, bestMonth, worstMonth, recentAvg, priorAvg, trendChange, ma, yoy,
    myRides, peerRides, myUnit, peerUnit, corrs, hiUnit, loUnit, top20, bot20, all, weekdays, factors, rainBins, tempBins, weatherN: wdays.length,
    cars, best8: sorted.slice(0, 8), worst8: [...sorted].reverse().slice(0, 8), hist, histStep,
  };
  return { ...base, text: buildTexts(base, input) };
}

type Base = Omit<SalesDetailAnalysis, 'text'>;

function buildTexts(s: Base, input: SalesDetailInput): SalesDetailAnalysis['text'] {
  const name = input.emp.name.replace(/[\s　]+/g, '');
  const sei = input.emp.name.split(/[\s　]+/)[0] || name;
  const D = s.dutyLabel;
  const nm = s.completed.length;
  const pct0 = (v: number) => `${Math.round(v * 100)}%`;

  // ---- 見出し・総評 ----
  let headline = `平均日商は${yen(s.avg)}。`;
  if (s.peerAvg != null && s.ratio != null && s.diffMin != null && s.diffMax != null) {
    if (s.diffMin > 0) headline += `同じ${D}の乗務員平均${yen(s.peerAvg)}を毎月${pct0(s.diffMin)}〜${pct0(s.diffMax)}上回り、`;
    else if (s.diffMax < 0) headline += `同じ${D}の乗務員平均${yen(s.peerAvg)}を毎月下回っており（${pctS(s.ratio)}）、`;
    else headline += `同じ${D}の乗務員平均${yen(s.peerAvg)}に対して平均${pctS(s.ratio)}で、`;
    if (s.topPctMax != null && s.topPctMax <= 0.25) headline += `全${nm}月度すべてで上位${pct0(s.topPctMax)}以内を維持しています。`;
    else if (s.topPctAvg != null) headline += `順位は平均で上位${pct0(s.topPctAvg)}です。`;
  }
  if (s.trendChange != null) {
    if (s.trendChange >= 0.03) headline += `直近3月度は平均${yen(s.recentAvg)}（それ以前比${pctS(s.trendChange)}）と上昇しています。`;
    else if (s.trendChange <= -0.03) headline += `直近3月度は平均${yen(s.recentAvg)}（それ以前比${pctS(s.trendChange)}）と下がっています。`;
    else headline += `直近3月度も平均${yen(s.recentAvg)}と安定しています。`;
  }

  const mAvgs = s.completed.map(m => m.avg);
  let summary = `集計対象は${s.firstDate.replace(/-/g, '/')}〜${s.lastDate.replace(/-/g, '/')}の全${s.n}乗務で、累計税込収入は${yen(s.total)}です。`
    + `月度ごとの平均日商は${man(Math.min(...mAvgs))}〜${man(Math.max(...mAvgs))}円の範囲で推移し、最も高かったのは${s.bestMonth.label}（${yen(s.bestMonth.avg)}）、最も低かったのは${s.worstMonth.label}（${yen(s.worstMonth.avg)}）です。`;
  if (s.trendChange != null) summary += `直近3月度の平均は${yen(s.recentAvg)}で、それ以前の平均${yen(s.priorAvg)}と比べて${pctS(s.trendChange)}です。`;

  // 最も低い月度の要因（回数と単価のどちらが下がったか）
  const wm = s.worstMonth;
  let worstCause = '';
  if (wm.rides != null && wm.unit != null && s.all.rides && s.all.unit) {
    const dr = wm.rides / s.all.rides - 1, du = wm.unit / s.all.unit - 1;
    worstCause = du < dr
      ? `${wm.label}の落ち込みは、営業回数（平均${wm.rides.toFixed(1)}回）は${dr < -0.03 ? 'やや少なめ' : '普段並み'}でしたが、それ以上に客単価が${yen(wm.unit)}と期間平均（${yen(s.all.unit)}）より低かったことが主な原因です。「お客様の数」より「長い距離のお客様」が少なかった時期でした。`
      : `${wm.label}の落ち込みは、客単価（${yen(wm.unit)}）より営業回数が平均${wm.rides.toFixed(1)}回と期間平均（${s.all.rides.toFixed(1)}回）を下回ったことが主な原因です。お客様の数そのものが少なかった時期でした。`;
  }

  // ---- 流れ ----
  const half = Math.floor(s.completed.length / 2);
  const h0 = s.completed.slice(0, half), h1 = s.completed.slice(half);
  const keys0 = new Set(h0.map(m => m.key)), keys1 = new Set(h1.map(m => m.key));
  const d0 = s.days.filter(d => d.amount > 0 && keys0.has(d.key)), d1 = s.days.filter(d => d.amount > 0 && keys1.has(d.key));
  const maV = s.ma.filter((x): x is number => x != null);
  let flow = maV.length ? `約1か月分の移動平均で見ると、日商は${man(Math.min(...maV))}〜${man(Math.max(...maV))}円の範囲で推移しています。` : '';
  if (d0.length >= 5 && d1.length >= 5) {
    const a0 = avg(d0.map(d => d.amount))!, a1 = avg(d1.map(d => d.amount))!;
    const hi0 = d0.filter(d => d.amount >= s.highLine).length, hi1 = d1.filter(d => d.amount >= s.highLine).length;
    flow += `期間の前半（${h0[0].label}〜${h0[h0.length - 1].label}）の平均${yen(a0)}に対し、後半（${h1[0].label}〜${h1[h1.length - 1].label}）は${yen(a1)}（${pctS(a1 / a0 - 1)}）です。`
      + `${man(s.highLine)}円以上の好調な乗務は、前半${d0.length}乗務中${hi0}回（${pct0(hi0 / d0.length)}）、後半${d1.length}乗務中${hi1}回（${pct0(hi1 / d1.length)}）でした。`;
  }
  flow += worstCause;

  // ---- 前年比 ----
  let yoyText = '';
  if (s.yoy) {
    const y = s.yoy, ch = y.self1 / y.self0 - 1;
    yoyText = `前年同期（${y.months}）で比べると、本人の平均日商は${yen(y.self0)} → ${yen(y.self1)}（${pctS(ch)}）`;
    if (y.peer0 && y.peer1) {
      const pc = y.peer1 / y.peer0 - 1;
      yoyText += `、同僚${D}平均は${yen(y.peer0)} → ${yen(y.peer1)}（${pctS(pc)}）でした。`;
      yoyText += ch > pc + 0.01 ? `会社全体の伸びを上回っており、同僚との差は${pct0(y.self0 / y.peer0 - 1)}→${pct0(y.self1 / y.peer1 - 1)}に広がっています。`
        : ch < pc - 0.01 ? `会社全体の売上水準の上がり方と比べると本人の伸びはやや小さく、同僚との差は${pct0(y.self0 / y.peer0 - 1)}→${pct0(y.self1 / y.peer1 - 1)}に縮まっています。`
          : `会社全体とほぼ同じペースで推移しています。`;
    } else yoyText += 'でした。';
    if (y.rides0 && y.rides1 && y.unit0 && y.unit1) {
      const rc = y.rides1 / y.rides0 - 1, uc = y.unit1 / y.unit0 - 1;
      yoyText += `中身を分けると、営業回数は${y.rides0.toFixed(1)}回→${y.rides1.toFixed(1)}回（${pctS(rc)}）、客単価は${yen(y.unit0)}→${yen(y.unit1)}（${pctS(uc)}）で、`
        + (Math.abs(uc) > Math.abs(rc) ? '増減の主な要因は客単価です。' : '増減の主な要因は営業回数です。');
      if (y.peerUnit0 && y.peerUnit1 && Math.abs(uc) > Math.abs(rc)) yoyText += `同僚平均の客単価も${pctS(y.peerUnit1 / y.peerUnit0 - 1)}動いているため、単価の変化には会社全体の需要動向（運賃水準・長距離需要など）も含まれます。`;
    }
  } else yoyText = '前年同期と比較できるデータがありません（対象期間の中に、前年の同じ月度の乗務が3月度分以上含まれていると表示されます。比較したい場合は期間を13か月度以上にしてください）。';

  // ---- 日々の売上を左右するもの ----
  const unitLeads = s.corrs.findIndex(c => c.label === '客単価') < s.corrs.findIndex(c => c.label === '営業回数');
  let daily = s.corrs.length ? `1乗務ごとの売上と関係が強い順に、${s.corrs.map(c => `${c.label}（相関係数${c.r.toFixed(2)}）`).join('、')}です。` : '';
  if (s.hiUnit && s.loUnit) {
    daily += `客単価が高い上位1/4の乗務は平均${s.hiUnit.rides?.toFixed(1) ?? '—'}回・走行${s.hiUnit.km?.toFixed(0) ?? '—'}kmで日商${yen(s.hiUnit.avg)}、客単価が低い下位1/4の乗務は${s.loUnit.rides?.toFixed(1) ?? '—'}回・走行${s.loUnit.km?.toFixed(0) ?? '—'}kmで日商${yen(s.loUnit.avg)}でした。`;
    daily += unitLeads ? '好調日は「長い距離のお客様をつかめた日」、不調日は「短距離のお客様が続いた日」です。' : '好調日は「お客様を多く乗せられた日」、不調日は「乗車回数が伸びなかった日」です。';
  }
  daily += `日商のばらつき（標準偏差）は${yen(s.sd)}（変動係数${(s.cv * 100).toFixed(1)}%）で、${s.cv < 0.12 ? '波の小さい安定型' : s.cv < 0.2 ? '標準的なばらつき' : '日による波が大きめ'}の乗務スタイルです。`;

  // ---- 分解（同僚比較） ----
  let decomp = '';
  if (s.myRides && s.peerRides && s.myUnit && s.peerUnit) {
    const rr = s.myRides / s.peerRides - 1, ur = s.myUnit / s.peerUnit - 1;
    decomp = `同僚との比較では、本人の営業回数は1乗務あたり${s.myRides.toFixed(1)}回で同僚（${s.peerRides.toFixed(1)}回）より${pctS(rr, 0)}、客単価は${yen(s.myUnit)}で同僚（${yen(s.peerUnit)}）より${pctS(ur, 0)}です。`;
    decomp += Math.abs(rr) >= Math.abs(ur)
      ? (rr >= 0 ? '同僚との差を生んでいるのは主に「回数」、つまり空車時間を短くしてお客様を次々に乗せる力です。' : '同僚との差は主に「回数」の少なさから来ており、空車時間の短縮が課題です。')
      : (ur >= 0 ? '同僚との差を生んでいるのは主に「客単価」、つまり長い距離のお客様をつかむ力です。' : '同僚との差は主に「客単価」の低さから来ており、長距離のお客様の確保が課題です。');
  }
  if (s.yoy?.rides0 && s.yoy.rides1 && s.yoy.unit0 && s.yoy.unit1) {
    decomp += `前年同期比では営業回数${pctS(s.yoy.rides1 / s.yoy.rides0 - 1)}、客単価${pctS(s.yoy.unit1 / s.yoy.unit0 - 1)}でした。`;
  }

  // ---- 順位 ----
  let rank = '';
  if (s.bestRankMonth?.peer && s.worstRankMonth?.peer) {
    rank = `同僚${D}乗務員（毎月約${Math.round(s.peerCountAvg ?? 0)}人）の中で、順位が最も高かったのは${s.bestRankMonth.label}（${s.bestRankMonth.peer.rank}位/${s.bestRankMonth.peer.count}人・上位${(s.bestRankMonth.peer.topPct * 100).toFixed(1)}%）、`
      + `最も低かったのは${s.worstRankMonth.label}（${s.worstRankMonth.peer.rank}位/${s.worstRankMonth.peer.count}人・上位${(s.worstRankMonth.peer.topPct * 100).toFixed(1)}%）です。`;
  }

  // ---- 条件別 ----
  const wds = s.weekdays.filter(w => w.n >= 5 && w.avg != null).sort((x, y) => y.avg! - x.avg!);
  let cond = '';
  const freq = s.weekdays.filter(w => w.n > 0).sort((x, y) => y.n - x.n).slice(0, 3);
  if (freq.length && freq[0].n / s.n > 0.25) cond += `乗務は${freq.map(w => `${w.label}曜${w.n}回`).join('・')}が中心です。`;
  if (wds.length >= 2) {
    const b = wds[0], w = wds[wds.length - 1];
    cond += `曜日別（5回以上）では${b.label}曜が${yen(b.avg)}で最も高く、${w.label}曜が${yen(w.avg)}で最も低い結果です。`;
    if (w.rides != null && w.unit != null && s.all.rides && s.all.unit) {
      cond += (w.rides / s.all.rides) < (w.unit / s.all.unit)
        ? `${w.label}曜は客単価（${yen(w.unit)}）は平均並みですが、営業回数が${w.rides.toFixed(1)}回と少なく、お客様の数そのものが少ない曜日です。`
        : `${w.label}曜は営業回数（${w.rides.toFixed(1)}回）より客単価（${yen(w.unit)}）の低さが目立ち、短距離のお客様が多い曜日です。`;
    }
  }
  if (s.factors.length) {
    const fb = s.factors[0], fw = s.factors[s.factors.length - 1];
    cond += `暦要因では「${fb.label}」が${fb.pct >= 0 ? '+' : ''}${fb.pct.toFixed(1)}%と最もプラスで、「${fw.label}」は${fw.pct >= 0 ? '+' : ''}${fw.pct.toFixed(1)}%でした。`;
  }
  const rNone = s.rainBins[0], rHeavy = s.rainBins[2];
  const rainDiff = rNone.avg && rHeavy.avg && rNone.n >= 5 && rHeavy.n >= 5 ? rHeavy.avg / rNone.avg - 1 : null;
  if (rainDiff != null) cond += `天候では、雨の日（10mm以上）の平均が${yen(rHeavy.avg)}で降水なしの日（${yen(rNone.avg)}）より${pctS(rainDiff)}${rainDiff >= 0.02 ? 'と高く、雨の日の需要をしっかり取り込めています。' : rainDiff <= -0.02 ? 'と低く、雨の日の需要を取り切れていない可能性があります。' : 'で、天候による差はほとんどありません。'}`;
  const hot = s.tempBins.filter(b => b.n >= 5 && b.avg != null);
  if (hot.length >= 2) {
    const hb = hot.reduce((x, y) => y.avg! > x.avg! ? y : x);
    cond += `最高気温別では「${hb.label}」の日が${yen(hb.avg)}で最も高くなっています。`;
  }

  // ---- 勤務 ----
  const starts = s.days.map(d => d.start).filter(Boolean) as string[];
  const startMode = starts.length ? [...starts.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>())].sort((x, y) => y[1] - x[1])[0] : null;
  let work = '';
  if (startMode) work += `出庫は${startMode[1] === starts.length ? '全乗務' : '主に'}${startMode[0]}、`;
  if (s.all.ret != null) work += `帰庫は平均${s.all.ret >= 24 * 60 ? '翌' : ''}${minToHm(s.all.ret % (24 * 60))}です。`;
  if (s.all.labor != null) work += `実働は平均${s.all.labor.toFixed(1)}時間（うち深夜${s.all.night?.toFixed(1) ?? '—'}時間・残業${s.all.ot?.toFixed(1) ?? '—'}時間）、実働1時間あたりの売上は${yen(s.all.ph)}です。`;
  if (s.all.km != null) work += `1乗務の走行は平均${s.all.km.toFixed(0)}km${s.all.jr != null ? `、実車率は${(s.all.jr * 100).toFixed(1)}%` : ''}です。`;
  if (s.cars.length) {
    const main = s.cars.filter(c => c.n >= 5);
    work += `使用車両は${s.cars.length}台で、最も多いのは${s.cars[0].car}号車（${s.cars[0].n}回）です。`;
    if (main.length >= 2) {
      const spread = Math.max(...main.map(c => c.avg)) / Math.min(...main.map(c => c.avg)) - 1;
      work += spread < 0.1 ? '車両による売上差は小さく、車両を問わず同水準を出せています。' : '';
    }
  }
  const w8low = s.all.unit ? s.worst8.filter(d => d.unit != null && d.unit < s.all.unit! * 0.95) : [];
  if (w8low.length >= 5) work += `ワースト8乗務のうち${w8low.length}乗務は客単価が${yen(Math.min(...w8low.map(d => d.unit!)))}〜${yen(Math.max(...w8low.map(d => d.unit!)))}と低く、短距離のお客様が続いたことが主な原因です。`;

  // ---- 強み・弱点・提案 ----
  const strong: string[] = [], weak: string[] = [], recs: string[] = [], focus: string[] = [];
  if (s.ratio != null && s.ratio > 0.05 && s.diffMin != null && s.diffMax != null) {
    strong.push(`同僚${D}平均を${s.diffMin > 0 ? `毎月${pct0(s.diffMin)}〜${pct0(s.diffMax)}` : `平均${pct0(s.ratio)}`}上回り${s.topPctMax != null && s.topPctMax <= 0.25 ? `、全月度で上位${pct0(s.topPctMax)}以内` : ''}${s.bestRankMonth?.peer ? `（最高は${s.bestRankMonth.label}の${s.bestRankMonth.peer.rank}位/${s.bestRankMonth.peer.count}人）` : ''}`);
  } else if (s.ratio != null && s.ratio < -0.05) {
    weak.push(`平均日商が同僚${D}平均より${pct0(-s.ratio)}低い（本人${yen(s.avg)}・同僚${yen(s.peerAvg)}）`);
  }
  if (s.myRides && s.peerRides) {
    const rr = s.myRides / s.peerRides - 1;
    if (rr >= 0.1) strong.push(`1乗務の営業回数が${s.myRides.toFixed(1)}回と同僚（${s.peerRides.toFixed(1)}回）より${pct0(rr)}多い。空車時間を短くしてお客様を乗せ続ける力が強み`);
    else if (rr <= -0.1) { weak.push(`1乗務の営業回数が${s.myRides.toFixed(1)}回と同僚（${s.peerRides.toFixed(1)}回）より${pct0(-rr)}少ない`); focus.push('空車時間を減らして乗車回数を増やすこと'); recs.push('空車で流している時間が長くなっていないか見直し、無線・アプリ配車や駅の付け待ちを組み合わせて乗車回数を増やす'); }
  }
  if (s.myUnit && s.peerUnit) {
    const ur = s.myUnit / s.peerUnit - 1;
    if (ur >= 0.08) strong.push(`客単価が${yen(s.myUnit)}と同僚（${yen(s.peerUnit)}）より${pct0(ur)}高く、長い距離のお客様をつかむ力がある`);
    else if (ur <= -0.08) { weak.push(`客単価が${yen(s.myUnit)}と同僚（${yen(s.peerUnit)}）より${pct0(-ur)}低く、短距離のお客様が多い`); focus.push('長距離のお客様を意識した営業'); recs.push('深夜帯の繁華街・ターミナル駅など、長距離の帰宅需要が見込めるエリアと時間帯を意識して営業する'); }
  }
  if (s.cv < 0.12) strong.push(`日商のばらつき（変動係数${(s.cv * 100).toFixed(1)}%）が小さく、最低日商でも${yen(s.worst.amount)}。天候・曜日に左右されにくい安定した稼ぎ方ができている`);
  else if (s.cv >= 0.2) { weak.push(`日商の変動係数が${(s.cv * 100).toFixed(1)}%と日による波が大きい`); focus.push('好調日の動き方を再現すること'); recs.push('好調日と不調日の営業エリア・時間帯の違いを日報で振り返り、好調日の動き方を「型」にする'); }
  const before = s.factors.find(f => f.label === '連休前日');
  if (rainDiff != null && rainDiff >= 0.03) strong.push(`雨の日（10mm以上）は降水なしの日より${pct0(rainDiff)}高く${before && before.pct >= 5 ? `、連休前日も+${before.pct.toFixed(0)}%と` : '、'}需要が増える日を確実に売上へつなげている`);
  else if (rainDiff != null && rainDiff <= -0.03) { weak.push(`雨の日（10mm以上）の日商が降水なしの日より${pct0(-rainDiff)}低い`); focus.push('雨の日の稼働確保'); recs.push('雨の日は流しでも需要を拾いやすいため、稼働時間をしっかり確保し、駅・商業施設周辺の需要を意識する'); }
  else if (before && before.pct >= 5) strong.push(`連休前日は通常日より+${before.pct.toFixed(0)}%と大きく伸びており、需要の山をつかむ力がある`);
  if (s.trendChange != null && s.trendChange >= 0.03) strong.push(`直近3月度は平均${yen(s.recentAvg)}と、それ以前（${yen(s.priorAvg)}）から${pctS(s.trendChange)}伸びている`);
  else if (s.trendChange != null && s.trendChange <= -0.03) { weak.push(`直近3月度は平均${yen(s.recentAvg)}と、それ以前（${yen(s.priorAvg)}）から${pctS(s.trendChange)}下がっている`); focus.push('直近の働き方の振り返り'); recs.push('直近の乗務日報を振り返り、稼働時間・休憩の取り方・営業エリアに変化がないか確認する'); }

  if (wds.length >= 2) {
    const w = wds[wds.length - 1];
    if (w.avg! / s.avg - 1 <= -0.03) {
      const fewRides = w.rides != null && w.unit != null && s.all.rides && s.all.unit && (w.rides / s.all.rides) < (w.unit / s.all.unit);
      weak.push(`${w.label}曜の日商が平均${yen(w.avg)}と最も低い（全体平均より${pct0(1 - w.avg! / s.avg)}低い）${fewRides ? `。営業回数が${w.rides!.toFixed(1)}回と少ない` : ''}${w.n / s.n >= 0.2 ? `。乗務の約${Math.round(w.n / s.n * 10)}割が${w.label}曜のため全体への影響が大きい` : ''}`);
      focus.push(fewRides ? `${w.label}曜の空車時間を減らすこと` : `${w.label}曜に長距離のお客様を狙うこと`);
      recs.push(fewRides
        ? `${w.label}曜はお客様の数そのものが少ない日。流し営業だけに頼らず、無線・アプリ配車や駅の付け待ちを組み合わせて空車時間を減らす`
        : `${w.label}曜は短距離のお客様が多い日。長距離の需要が見込める時間帯・エリアへ早めに移動する`);
    }
  }
  if (unitLeads && s.loUnit && s.hiUnit && s.hiUnit.avg / s.loUnit.avg - 1 >= 0.1) {
    weak.push(`短距離のお客様が続くと、回数をこなしても日商が伸びない（客単価下位1/4の乗務は平均${s.loUnit.rides?.toFixed(1) ?? '—'}回で${yen(s.loUnit.avg)}）`);
    focus.push('短距離が続く日に長距離のお客様を狙いにいく切り替え'); recs.push('短距離が続いている日は、深夜帯に長距離の帰宅需要が見込める繁華街・ターミナル駅へ早めに移動するなど、営業エリアを切り替える');
    const b8 = s.best8.filter(d => d.unit != null && d.km != null);
    if (b8.length >= 4) recs.push(`ベスト乗務（客単価${yen(Math.min(...b8.map(d => d.unit!)))}〜${yen(Math.max(...b8.map(d => d.unit!)))}・走行${Math.min(...b8.map(d => d.km!)).toFixed(0)}〜${Math.max(...b8.map(d => d.km!)).toFixed(0)}km）の日の時間帯・エリアを日報で振り返り、長距離のお客様をつかむ動き方を再現する`);
  }
  if (s.worstRankMonth?.peer && s.worstMonth.avg < s.avg * 0.95) {
    weak.push(`${s.worstMonth.label}は平均日商${yen(s.worstMonth.avg)}と期間中で最も低かった${s.worstRankMonth.key === s.worstMonth.key ? `（順位も上位${pct0(s.worstRankMonth.peer.topPct)}と最も低い）` : ''}`);
    recs.push(`${s.worstMonth.pm}月前後の閑散期は、送別会シーズン・連休前日など数少ない需要の山の日に稼働を集中させる`);
  }
  if (s.yoy?.peer0 && s.yoy.peer1) {
    const ch = s.yoy.self1 / s.yoy.self0 - 1, pc = s.yoy.peer1 / s.yoy.peer0 - 1;
    if (ch < pc - 0.01) weak.push(`前年同期比の伸び（${pctS(ch)}）が同僚平均の伸び（${pctS(pc)}）を下回り、同僚との差がわずかに縮小している`);
    else if (ch > pc + 0.01) strong.push(`前年同期比${pctS(ch)}と、同僚平均（${pctS(pc)}）を上回るペースで伸びている`);
  }
  if (s.ratio != null && s.ratio > 0.15) recs.push('強みは維持しつつ、若手・新人乗務員へのノウハウ共有（同乗研修や勉強会での事例紹介）にも生かす');
  if (!strong.length) strong.push('特筆すべき強みは見られませんでした');
  if (!weak.length) weak.push('特筆すべき弱点は見られませんでした');
  if (!recs.length) recs.push('現在の営業スタイルを維持しつつ、好調日の動き方を日報で振り返って再現性を高める');

  // ---- 分析のポイント ----
  const points: Array<{ title: string; body: string }> = [];
  if (s.ratio != null && s.topPctMax != null) {
    points.push(s.ratio > 0.05
      ? { title: s.topPctMax <= 0.25 ? '安定した上位層' : '同僚平均を上回る', body: `全${nm}月度の同僚${D}乗務員（毎月約${Math.round(s.peerCountAvg ?? 0)}人）との比較で、平均${pctS(s.ratio, 0)}。${s.topPctMax <= 0.25 ? `全月度で上位${pct0(s.topPctMax)}以内。` : ''}` }
      : { title: '同僚平均との比較', body: `同僚${D}乗務員の平均と比べて${pctS(s.ratio, 0)}（順位は平均で上位${pct0(s.topPctAvg ?? 0)}）。` });
  }
  if (s.trendChange != null) points.push({ title: s.trendChange >= 0.03 ? '直近は上昇傾向' : s.trendChange <= -0.03 ? '直近は下降傾向' : '直近も安定', body: `直近3月度の平均日商は${yen(s.recentAvg)}（それ以前比${pctS(s.trendChange)}）。${s.yoy ? `前年同期比${pctS(s.yoy.self1 / s.yoy.self0 - 1)}。` : ''}` });
  points.push(unitLeads
    ? { title: '好不調を分けるのは「長距離客」', body: `日々の好不調は客単価（長距離のお客様の有無）でほぼ決まる。${weak.length && !weak[0].startsWith('特筆') ? '詳しくは「総合評価と改善提案」参照。' : ''}` }
    : { title: '好不調を分けるのは「回数」', body: '日々の好不調は営業回数（乗せたお客様の数）でほぼ決まる。空車時間の短縮が売上に直結する。' });

  const closing = `${sei}さんは、全${s.n}乗務の平均日商${yen(s.avg)}`
    + (s.ratio != null ? `で、同僚${D}平均${s.ratio >= 0 ? 'を' + pct0(s.ratio) + '上回る' : 'を' + pct0(-s.ratio) + '下回る'}成績です。` : 'の成績です。')
    + (s.trendChange != null ? (s.trendChange >= 0.03 ? '直近は成績が伸びており、良い流れが続いています。' : s.trendChange <= -0.03 ? '直近は成績が下がっているため、早めに原因を振り返ることをおすすめします。' : '直近も安定した成績を保っています。') : '')
    + (focus.length ? `今後は${focus.slice(0, 2).join('と、')}を意識することで、さらなる成績向上が期待できます。` : '好調日の動き方を振り返り再現性を高めることで、さらなる成績向上が期待できます。');

  return { headline, summary, points, flow, yoy: yoyText, daily, decomp, rank, cond, work, strong, weak, recs, closing };
}

// DBから1社員分の分析入力を読み込む（本人の全売上記録＋同僚の月度別集計＋気象データ）
// 同僚集計はSQL側で「月度×社員」に集約し、さらに月度ごとに "課:平均日商" をGROUP_CONCATした1行に畳んで返す
// （数千行をWorkerに持ち込まずに済ませ、CPU時間を抑えるため）。
// range: 対象月度の範囲（YYYYMM の数値。null＝制限なし＝全期間）
export async function loadSalesDetailInput(db: D1Database, empId: number, range: { from: number | null; to: number | null } = { from: null, to: null }): Promise<SalesDetailInput | null> {
  const emp = await db.prepare('SELECT id, name, emp_no, division, team FROM employees WHERE id = ?')
    .bind(empId).first<{ id: number; name: string; emp_no: string; division: number | null; team: number | null }>();
  if (!emp) return null;
  const rs = await db.prepare(
    `SELECT date, amount, ride_count, distance_km, duty_code, start_time, return_time, labor_hours, night_hours, overtime_hours,
            period_year, period_month, raw_csv_json
     FROM sales_records WHERE emp_id = ?
       AND (period_year * 100 + period_month) BETWEEN ? AND ?
     ORDER BY date`
  ).bind(empId, range.from ?? 0, range.to ?? 999999).all<SalesDetailSourceRow>();
  const rows = rs.results ?? [];
  if (!rows.length) return { emp, rows, peers: [], weather: [], partialKey: null, dutyCode: null };

  const cnt = new Map<string, number>();
  for (const r of rows) if (r.duty_code && r.amount > 0) cnt.set(r.duty_code, (cnt.get(r.duty_code) ?? 0) + 1);
  const dutyCode = [...cnt].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const keyed = rows.filter(r => r.period_year != null && r.period_month != null);
  const minKey = keyed.length ? Math.min(...keyed.map(r => r.period_year! * 100 + r.period_month!)) : 0;
  const maxKey = keyed.length ? Math.max(...keyed.map(r => r.period_year! * 100 + r.period_month!)) : 0;
  const first = rows[0].date, last = rows[rows.length - 1].date;

  const [peerRes, weatherRes, settings] = await Promise.all([
    dutyCode ? db.prepare(
      `SELECT py, pm, GROUP_CONCAT(COALESCE(division, '') || ':' || CAST(total / n AS INTEGER)) AS entries,
              SUM(n) AS n, SUM(total) AS total, SUM(rides) AS rides
       FROM (
         SELECT s.period_year AS py, s.period_month AS pm, s.emp_id, e.division, COUNT(*) AS n, SUM(s.amount) AS total,
                SUM(COALESCE(s.ride_count, 0)) AS rides
         FROM sales_records s JOIN employees e ON e.id = s.emp_id
         WHERE s.duty_code = ? AND s.amount > 0 AND s.emp_id != ? AND s.period_year IS NOT NULL
           AND (s.period_year * 100 + s.period_month) BETWEEN ? AND ?
         GROUP BY s.period_year, s.period_month, s.emp_id
         HAVING COUNT(*) >= 5
       ) GROUP BY py, pm`
    ).bind(dutyCode, empId, minKey, maxKey).all<PeerMonthRow>() : Promise.resolve({ results: [] as PeerMonthRow[] }),
    db.prepare(
      `SELECT date, precipitation_mm, max_temp_c, min_temp_c, weather_day, weather_night FROM weather_daily
       WHERE date BETWEEN ? AND date(?, '+1 day')`
    ).bind(first, last).all<WeatherRow>().catch(() => ({ results: [] as WeatherRow[] })),
    getPeriodSettings(db),
  ]);

  // 最新の月度が今日時点でまだ締まっていなければ「集計途中」扱い
  let partialKey: string | null = null;
  if (maxKey) {
    const py = Math.floor(maxKey / 100), pm = maxKey % 100;
    const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    if (getPeriodRange(py, pm, settings).end >= today) partialKey = `${py}-${pm}`;
  }
  return { emp, rows, peers: peerRes.results ?? [], weather: weatherRes.results ?? [], partialKey, dutyCode };
}

// ===================================================
// CSV取込状況（売上CSVがいつからいつまで入っているか）
// sales_records には取込履歴テーブルがないため、記録そのものの日付分布から判定する。
// - 全社: 最初〜最後の日付、日数、記録が1件もない日、件数が普段（中央値）の3割未満の日（取込漏れの疑い）
// - 社員: その社員の最初〜最後の乗務日と乗務数
// - 最終更新: updated_at の最大値（D1の datetime('now','localtime') はUTCのため+9時間して日本時間で返す）
// ===================================================
export interface CsvCoverage {
  first: string | null; last: string | null; days: number; medianCount: number;
  missing: string[]; sparse: Array<{ date: string; n: number }>; lastUpdated: string | null;
  emp: { first: string | null; last: string | null; n: number } | null;
}

export async function loadCsvCoverage(db: D1Database, empId: number | null): Promise<CsvCoverage> {
  const [byDate, upd, emp] = await Promise.all([
    db.prepare('SELECT date, COUNT(*) AS n FROM sales_records GROUP BY date ORDER BY date').all<{ date: string; n: number }>(),
    db.prepare('SELECT MAX(updated_at) AS u FROM sales_records').first<{ u: string | null }>(),
    empId != null
      ? db.prepare('SELECT MIN(date) AS first, MAX(date) AS last, COUNT(*) AS n FROM sales_records WHERE emp_id = ?').bind(empId).first<{ first: string | null; last: string | null; n: number }>()
      : Promise.resolve(null),
  ]);
  const rows = byDate.results ?? [];
  const counts = rows.map(r => r.n).sort((a, b) => a - b);
  const median = counts.length ? counts[Math.floor(counts.length / 2)] : 0;
  const missing: string[] = [];
  if (rows.length) {
    const have = new Set(rows.map(r => r.date));
    for (let d = rows[0].date; d <= rows[rows.length - 1].date; d = addDay(d)) if (!have.has(d)) missing.push(d);
  }
  let lastUpdated: string | null = null;
  if (upd?.u) {
    const t = new Date(upd.u.replace(' ', 'T') + 'Z');
    if (!isNaN(t.getTime())) { const j = new Date(t.getTime() + 9 * 3600 * 1000).toISOString(); lastUpdated = `${j.slice(0, 10)} ${j.slice(11, 16)}`; }
  }
  return {
    first: rows[0]?.date ?? null, last: rows[rows.length - 1]?.date ?? null, days: rows.length, medianCount: median,
    missing, sparse: rows.filter(r => r.n < median * 0.3).map(r => ({ date: r.date, n: r.n })), lastUpdated,
    emp: emp ? { first: emp.first, last: emp.last, n: emp.n } : null,
  };
}

// 帳票・画面向けの1行要約（例: "2025/04/21〜2026/09/30（528日分）"）
export function coverageRangeText(c: CsvCoverage): string {
  if (!c.first || !c.last) return 'データなし';
  return `${c.first.replace(/-/g, '/')}〜${c.last.replace(/-/g, '/')}（${c.days}日分）`;
}
