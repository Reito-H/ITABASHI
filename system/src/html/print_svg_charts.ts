// 印刷帳票用の軽量SVGグラフ（外部ライブラリ不使用・サーバーサイドで文字列生成）
// 詳細分析レポート（sales_detail_report_print.ts）で使用。A4に収まる viewBox 幅で描画し、width=100% で拡縮させる。
import { escHtml } from './layout';

export const C_NAVY = '#1a3a5c';
export const C_BLUE = '#2563eb';
export const C_GRAY = '#94a3b8';
export const C_GREEN = '#15803d';
export const C_RED = '#b91c1c';
export const C_AMBER = '#d97706';
const C_GRID = '#e5e7eb';
const FONT = `font-family="'Hiragino Sans','Meiryo',sans-serif"`;
const DASH = 'stroke-dasharray="5 3"';

export type Fmt = (v: number) => string;
export const fmtMan: Fmt = v => `${(v / 10000).toFixed(1)}万`;

function niceRange(lo: number, hi: number, ticks = 5): { lo: number; hi: number; step: number } {
  if (hi === lo) hi = lo + 1;
  const raw = (hi - lo) / ticks;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(s => s * mag).find(s => s >= raw) ?? 10 * mag;
  return { lo: Math.floor(lo / step) * step, hi: Math.ceil(hi / step) * step, step };
}

function frame(w: number, h: number, body: string): string {
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" xmlns="http://www.w3.org/2000/svg" ${FONT} style="display:block">${body}</svg>`;
}

function yAxis(x0: number, x1: number, y0: number, y1: number, r: { lo: number; hi: number; step: number }, fmt: Fmt, right = false): string {
  let out = '';
  for (let v = r.lo; v <= r.hi + 1e-9; v += r.step) {
    const y = y1 - (v - r.lo) / (r.hi - r.lo) * (y1 - y0);
    if (!right) {
      out += `<line x1="${x0}" x2="${x1}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${C_GRID}" stroke-width="0.8"/>`;
      out += `<text x="${x0 - 4}" y="${(y + 3).toFixed(1)}" font-size="8.5" fill="#6b7280" text-anchor="end">${escHtml(fmt(v))}</text>`;
    } else {
      out += `<text x="${x1 + 4}" y="${(y + 3).toFixed(1)}" font-size="8.5" fill="#6b7280">${escHtml(fmt(v))}</text>`;
    }
  }
  return out;
}

export type LegendItem = [name: string, color: string, kind: 'bar' | 'line' | 'dash' | 'dot'];
function legend(items: LegendItem[], x: number, y: number): string {
  let out = '';
  for (const [name, color, kind] of items) {
    if (kind === 'bar') out += `<rect x="${x}" y="${y - 7}" width="10" height="8" fill="${color}" rx="1"/>`;
    else if (kind === 'dash') out += `<line x1="${x}" x2="${x + 14}" y1="${y - 3}" y2="${y - 3}" stroke="${color}" stroke-width="2" stroke-dasharray="4 2"/>`;
    else if (kind === 'dot') out += `<circle cx="${x + 5}" cy="${y - 3}" r="2.6" fill="${color}"/>`;
    else out += `<line x1="${x}" x2="${x + 14}" y1="${y - 3}" y2="${y - 3}" stroke="${color}" stroke-width="2.2"/>`;
    out += `<text x="${x + 18}" y="${y}" font-size="9" fill="#374151">${escHtml(name)}</text>`;
    x += 26 + name.length * 9;
  }
  return out;
}

export interface LineSeries { name: string; values: Array<number | null>; color: string; dash?: boolean; width?: number; markers?: boolean; valueLabels?: boolean }

// 棒（左軸）＋折れ線（右軸）
export function comboChart(o: {
  labels: string[]; bars: Array<number | null>; lines: LineSeries[]; w?: number; h?: number;
  barFmt?: Fmt; lineFmt?: Fmt; lineLo?: number; highlight?: Set<number>; legend?: LegendItem[]; labelEvery?: number;
}): string {
  const w = o.w ?? 700, h = o.h ?? 230, barFmt = o.barFmt ?? fmtMan, lineFmt = o.lineFmt ?? fmtMan, every = o.labelEvery ?? 1;
  const x0 = 46, x1 = w - 46, y0 = 22, y1 = h - 34;
  const n = o.labels.length, bw = (x1 - x0) / Math.max(n, 1);
  const bv = o.bars.filter((b): b is number => b != null);
  const br = niceRange(0, Math.max(...bv, 1) * 1.08);
  const lv = o.lines.flatMap(l => l.values.filter((v): v is number => v != null));
  const lr = niceRange(o.lineLo ?? Math.min(...lv) * 0.9, Math.max(...lv, 1) * 1.03);
  let out = yAxis(x0, x1, y0, y1, br, barFmt) + yAxis(x0, x1, y0, y1, lr, lineFmt, true);
  o.bars.forEach((b, i) => {
    if (b == null) return;
    const bh = (b - br.lo) / (br.hi - br.lo) * (y1 - y0);
    out += `<rect x="${(x0 + i * bw + bw * 0.18).toFixed(1)}" y="${(y1 - bh).toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" height="${bh.toFixed(1)}" fill="${o.highlight?.has(i) ? C_AMBER : '#c7d2fe'}" rx="1.5"/>`;
  });
  for (const l of o.lines) {
    const pts: Array<[number, number]> = [];
    l.values.forEach((v, i) => { if (v != null) pts.push([x0 + i * bw + bw / 2, y1 - (v - lr.lo) / (lr.hi - lr.lo) * (y1 - y0)]); });
    out += `<polyline points="${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}" fill="none" stroke="${l.color}" stroke-width="2" ${l.dash ? DASH : ''}/>`;
    for (const [x, y] of pts) out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.4" fill="${l.color}"/>`;
  }
  o.labels.forEach((lb, i) => {
    if (i % every) return;
    out += `<text x="${(x0 + i * bw + bw / 2).toFixed(1)}" y="${y1 + 12}" font-size="8" fill="#4b5563" text-anchor="middle">${escHtml(lb)}</text>`;
  });
  out += `<line x1="${x0}" x2="${x1}" y1="${y1}" y2="${y1}" stroke="#9ca3af"/>`;
  if (o.legend) out += legend(o.legend, x0, h - 6);
  return frame(w, h, out);
}

// 折れ線（＋任意の散布点・参照線）
export function lineChart(o: {
  labels: string[]; lines: LineSeries[]; w?: number; h?: number; fmt?: Fmt; lo?: number; hi?: number;
  labelEvery?: number; labelPositions?: number[]; legend?: LegendItem[];
  refs?: Array<{ value: number; color: string; text: string }>;
  points?: Array<{ i: number; v: number; color: string; r?: number }>;
}): string {
  const w = o.w ?? 700, h = o.h ?? 220, fmt = o.fmt ?? fmtMan;
  const x0 = 46, x1 = w - 16, y0 = 16, y1 = h - 34;
  const n = Math.max(o.labels.length, 1);
  const allv = [...o.lines.flatMap(l => l.values.filter((v): v is number => v != null)), ...(o.points ?? []).map(p => p.v)];
  const r = niceRange(o.lo ?? Math.min(...allv), o.hi ?? Math.max(...allv));
  const X = (i: number) => x0 + (i + 0.5) * (x1 - x0) / n;
  const Y = (v: number) => y1 - (Math.min(Math.max(v, r.lo), r.hi) - r.lo) / (r.hi - r.lo) * (y1 - y0);
  let out = yAxis(x0, x1, y0, y1, r, fmt);
  for (const ref of o.refs ?? []) {
    out += `<line x1="${x0}" x2="${x1}" y1="${Y(ref.value).toFixed(1)}" y2="${Y(ref.value).toFixed(1)}" stroke="${ref.color}" stroke-width="1" stroke-dasharray="3 3"/>`;
    out += `<text x="${x1 - 2}" y="${(Y(ref.value) - 3).toFixed(1)}" font-size="8" fill="${ref.color}" text-anchor="end">${escHtml(ref.text)}</text>`;
  }
  for (const p of o.points ?? []) out += `<circle cx="${X(p.i).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="${p.r ?? 2.2}" fill="${p.color}" fill-opacity="0.55"/>`;
  for (const l of o.lines) {
    const segs: Array<Array<[number, number]>> = [];
    let cur: Array<[number, number]> = [];
    l.values.forEach((v, i) => {
      if (v == null) { if (cur.length) segs.push(cur); cur = []; } else cur.push([X(i), Y(v)]);
    });
    if (cur.length) segs.push(cur);
    for (const s of segs) {
      out += `<polyline points="${s.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}" fill="none" stroke="${l.color}" stroke-width="${l.width ?? 2}" stroke-linejoin="round" ${l.dash ? DASH : ''}/>`;
      if (l.markers) for (const [x, y] of s) out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.3" fill="${l.color}"/>`;
    }
    if (l.valueLabels) l.values.forEach((v, i) => {
      if (v != null) out += `<text x="${X(i).toFixed(1)}" y="${(Y(v) - 5).toFixed(1)}" font-size="7.5" fill="${l.color}" text-anchor="middle">${escHtml(fmt(v))}</text>`;
    });
  }
  const pos = o.labelPositions ?? o.labels.map((_, i) => i).filter(i => i % (o.labelEvery ?? 1) === 0);
  for (const i of pos) out += `<text x="${X(i).toFixed(1)}" y="${y1 + 12}" font-size="8" fill="#4b5563" text-anchor="middle">${escHtml(o.labels[i])}</text>`;
  out += `<line x1="${x0}" x2="${x1}" y1="${y1}" y2="${y1}" stroke="#9ca3af"/>`;
  if (o.legend) out += legend(o.legend, x0, h - 6);
  return frame(w, h, out);
}

// 縦棒（値ラベル付き・任意で下段に補足）
export function vBarChart(o: {
  labels: string[]; values: Array<number | null>; w?: number; h?: number; fmt?: Fmt; colors?: string[];
  sub?: string[]; lo?: number; ref?: { value: number; color: string; text: string };
}): string {
  const w = o.w ?? 340, h = o.h ?? 180, fmt = o.fmt ?? fmtMan;
  const x0 = 40, x1 = w - 8, y0 = 16, y1 = h - (o.sub ? 32 : 22);
  const n = Math.max(o.labels.length, 1), bw = (x1 - x0) / n;
  const vv = o.values.filter((v): v is number => v != null);
  const r = niceRange(o.lo ?? 0, Math.max(...vv, 1) * 1.06);
  let out = yAxis(x0, x1, y0, y1, r, fmt);
  o.values.forEach((v, i) => {
    const cx = x0 + i * bw + bw / 2;
    if (v != null) {
      const bh = Math.max((v - r.lo) / (r.hi - r.lo) * (y1 - y0), 0);
      out += `<rect x="${(cx - bw * 0.32).toFixed(1)}" y="${(y1 - bh).toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" height="${bh.toFixed(1)}" fill="${o.colors?.[i] ?? C_NAVY}" rx="1.5"/>`;
      out += `<text x="${cx.toFixed(1)}" y="${(y1 - bh - 3).toFixed(1)}" font-size="8" fill="#374151" text-anchor="middle" font-weight="700">${escHtml(fmt(v))}</text>`;
    }
    out += `<text x="${cx.toFixed(1)}" y="${y1 + 11}" font-size="8.5" fill="#374151" text-anchor="middle">${escHtml(o.labels[i])}</text>`;
    if (o.sub) out += `<text x="${cx.toFixed(1)}" y="${y1 + 22}" font-size="7.5" fill="#9ca3af" text-anchor="middle">${escHtml(o.sub[i])}</text>`;
  });
  if (o.ref) {
    const y = y1 - (o.ref.value - r.lo) / (r.hi - r.lo) * (y1 - y0);
    out += `<line x1="${x0}" x2="${x1}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${o.ref.color}" stroke-dasharray="3 3"/>`;
    out += `<text x="${x1 - 2}" y="${(y - 3).toFixed(1)}" font-size="7.5" fill="${o.ref.color}" text-anchor="end">${escHtml(o.ref.text)}</text>`;
  }
  out += `<line x1="${x0}" x2="${x1}" y1="${y1}" y2="${y1}" stroke="#9ca3af"/>`;
  return frame(w, h, out);
}

// 基準0%からの差を左右に振り分ける横棒
export function divergingChart(items: Array<{ label: string; pct: number; note: string }>, w = 345, rowH = 17, caption = ''): string {
  const ml = 100, mr = 50, h = rowH * items.length + 18;
  const x0 = ml, x1 = w - mr, cx = (x0 + x1) / 2;
  const m = (Math.max(...items.map(i => Math.abs(i.pct)), 0.1)) * 1.6;
  let out = `<line x1="${cx}" x2="${cx}" y1="2" y2="${h - 14}" stroke="#9ca3af"/>`;
  items.forEach((it, i) => {
    const y = 4 + i * rowH;
    const bw = Math.abs(it.pct) / m * (x1 - x0) / 2;
    const pos = it.pct >= 0, col = pos ? C_GREEN : C_RED;
    out += `<text x="${ml - 4}" y="${y + 10}" font-size="8.5" fill="#374151" text-anchor="end">${escHtml(it.label)}</text>`;
    out += `<rect x="${(pos ? cx : cx - bw).toFixed(1)}" y="${y + 2}" width="${bw.toFixed(1)}" height="${rowH - 6}" fill="${col}" fill-opacity="0.8" rx="1"/>`;
    out += `<text x="${(pos ? cx + bw + 3 : cx - bw - 3).toFixed(1)}" y="${y + 10}" font-size="8" fill="${col}" text-anchor="${pos ? 'start' : 'end'}" font-weight="700">${it.pct >= 0 ? '+' : ''}${it.pct.toFixed(1)}%</text>`;
    out += `<text x="${w - 2}" y="${y + 10}" font-size="7.5" fill="#9ca3af" text-anchor="end">${escHtml(it.note)}</text>`;
  });
  if (caption) out += `<text x="${cx}" y="${h - 3}" font-size="7.5" fill="#6b7280" text-anchor="middle">${escHtml(caption)}</text>`;
  return frame(w, h, out);
}
