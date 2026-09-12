// 秋の全国交通安全運動 手札（A4横・片面）— パワポ風の自由配置エディタ＋印刷＋PowerPoint(.pptx)書き出し。
//
//  ドキュメント（TefudaDoc）は「要素（TefudaEl）の配置リスト」。座標・大きさは mm（キャンバス 297×210）。
//   kind: 'text' | 'rect' | 'orbis' | 'leaf' | 'idrow' | 'legend' | 'table'
//  要素はドラッグ移動・四隅リサイズ・ダブルクリックで文字編集・右パネルで書式変更・追加/複製/削除できる。
//  「案1 / 案2」はテンプレートとして読み込むだけで、以後は自由に編集する。
//
//  保存: autumn_safety_2026_tefuda（migration_146）に JSON を1行。
//  印刷ルート: ?d=<base64(JSON)> があればその内容、無ければ保存済み。?auto=1 で自動印刷。
//  PowerPoint 書き出し: ブラウザ側で pptx(zip) を生成（fflate）。テキスト＝図形、記入表＝表、
//    オービス/紅葉＝PNG化して画像で貼り付け。

import { escHtml, safeJson } from './layout';

// ============================================================ 型

export type TefudaKind = 'text' | 'rect' | 'orbis' | 'leaf' | 'idrow' | 'legend' | 'table';

export interface TefudaEl {
  id: string;
  kind: TefudaKind;
  x: number; y: number; w: number; h: number; // mm
  // text / rect / idrow / legend
  text?: string;
  size?: number;      // pt
  color?: string;     // #rrggbb
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
  valign?: 'top' | 'middle' | 'bottom';
  fill?: string;      // '' = なし
  line?: string;      // '' = なし
  lineW?: number;     // mm
  radius?: number;    // mm
  // leaf
  tint?: string;
  // legend
  items?: string[];
  // table
  rowLabels?: string[];
  startDate?: string;
  endDate?: string;
  split?: number;     // 1段目の日数（0 or 全日数以上 = 横一列）
  example?: boolean;
  stampRow?: boolean;
  tScale?: number;    // 文字サイズ倍率
}

export interface TefudaDoc {
  schema: 2;
  bg: string;
  els: TefudaEl[];
}

// ============================================================ 既定値・正規化

const CANVAS_W = 297;
const CANVAS_H = 210;
const WD = ['日', '月', '火', '水', '木', '金', '土'];

function num(v: unknown, def: number, lo: number, hi: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
}
function s(v: unknown, def: string, max = 400): string {
  return typeof v === 'string' ? v.slice(0, max) : def;
}
function hex(v: unknown, def: string): string {
  return typeof v === 'string' && /^#?[0-9a-fA-F]{6}$/.test(v) ? (v[0] === '#' ? v : '#' + v) : def;
}
function iso(v: unknown, def: string): string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : def;
}
function list3(v: unknown, def: string[]): string[] {
  const a = Array.isArray(v) ? v : [];
  return def.map((d, i) => (typeof a[i] === 'string' ? String(a[i]).slice(0, 60) : d));
}

let _uid = 0;
function uid(): string { return 'e' + (Date.now().toString(36)) + (_uid++).toString(36); }

const EFFORTS_DEFAULT = [
  '① 生活道路では法定速度30km/ｈを遵守',
  '② スマホやカーナビ注視によるながら運転の根絶',
  '③ 横断歩道・交差点では歩行者の横断が優先',
  '④ 交差点における出会いがしら・飛び出しの危険予知',
  '⑤ 交差点横断自転車への注意徹底',
  '⑥ 左折・車線変更時は死角の自転車を見逃さない',
].join('\n');

/** テンプレート（案1=blocks / 案2=row）を要素リストで返す */
export function defaultDoc(kind: 'blocks' | 'row' = 'blocks'): TefudaDoc {
  const T = (o: Partial<TefudaEl>): TefudaEl => ({
    id: uid(), kind: 'text', x: 10, y: 10, w: 80, h: 12,
    size: 12, color: '#2b241f', bold: false, align: 'left', valign: 'top',
    fill: '', line: '', lineW: 0.4, radius: 0, ...o,
  });
  const NAVY = '#5b2a1c', ACCENT = '#b8531d', GOLD = '#a9781a', DANGER = '#9c2b16';
  const CREAM = '#f8efe0', BOXLINE = '#8a4a26', ZERO = '#f2c14e', ZEROLINE = '#c98f27';

  const head = [
    T({ kind: 'rect', x: 10, y: 8, w: 277, h: kind === 'row' ? 13 : 16, fill: NAVY, line: '', radius: 2 }),
    T({ x: 14, y: kind === 'row' ? 9 : 10, w: 175, h: 12, text: '2026年　秋の全国交通安全運動', size: kind === 'row' ? 18 : 21, bold: true, color: '#fdf5e9', valign: 'middle' }),
    T({ x: 190, y: kind === 'row' ? 10 : 12, w: 95, h: 9, text: '実施期間：2026年9月21日（月）〜2026年9月30日（水）', size: 11, bold: true, color: ZERO, align: 'right', valign: 'middle' }),
  ];

  if (kind === 'row') {
    return {
      schema: 2, bg: '#fffdf8',
      els: [
        ...head,
        T({ kind: 'rect', x: 10, y: 23, w: 277, h: 27, fill: '#fbe6c8', line: ACCENT, lineW: 0.6, radius: 2 }),
        T({ kind: 'orbis', x: 15, y: 25, w: 23, h: 23 }),
        T({ x: 44, y: 25, w: 209, h: 6, text: '＜板橋営業所のスローガン＞', size: 12, bold: true, color: GOLD, align: 'center' }),
        T({ x: 44, y: 31, w: 209, h: 16, text: '「夏の疲れが出てくる時期　眠気を感じたら必ず停止」', size: 20, bold: true, color: DANGER, align: 'center', valign: 'middle' }),
        T({ kind: 'leaf', x: 259, y: 26, w: 10, h: 10, tint: ACCENT }),
        T({ kind: 'leaf', x: 270, y: 30, w: 10, h: 10, tint: GOLD }),
        T({ kind: 'rect', x: 10, y: 54, w: 150, h: 62, fill: CREAM, line: BOXLINE, radius: 1.6 }),
        T({ x: 14, y: 56, w: 142, h: 7, text: '★ 当社の実施内容', size: 13, bold: true, color: ACCENT }),
        T({ x: 14, y: 64, w: 142, h: 50, text: EFFORTS_DEFAULT, size: 11.5, bold: true, color: '#2b241f' }),
        T({ kind: 'idrow', x: 164, y: 54, w: 123, h: 12, text: '', size: 11 }),
        T({ kind: 'legend', x: 164, y: 68, w: 123, h: 14, size: 10, items: ['100％遵守した', '80％以上守れた', '出来なかった'] }),
        T({ kind: 'rect', x: 164, y: 86, w: 123, h: 20, fill: ZERO, line: ZEROLINE, radius: 1.6 }),
        T({ x: 166, y: 89, w: 119, h: 14, text: '2026年9月30日（水）　交通事故ゼロを目指す日', size: 13, bold: true, color: '#7d2c10', align: 'center', valign: 'middle' }),
        T({
          kind: 'table', x: 10, y: 120, w: 277, h: 78, size: 10, color: '#2b241f',
          rowLabels: ['法定速度30km/ｈ厳守', 'スマホ・カーナビ注視根絶', '眠気を感じたら必ず停止'],
          startDate: '2026-09-21', endDate: '2026-09-30', split: 0, example: true, stampRow: true, tScale: 1,
        }),
      ],
    };
  }

  // blocks（案1）
  return {
    schema: 2, bg: '#fffdf8',
    els: [
      ...head,
      T({ kind: 'rect', x: 10, y: 28, w: 132, h: 74, fill: CREAM, line: BOXLINE, radius: 1.6 }),
      T({ x: 14, y: 30, w: 124, h: 7, text: '★ 当社の実施内容', size: 13, bold: true, color: ACCENT }),
      T({ x: 14, y: 38, w: 124, h: 62, text: EFFORTS_DEFAULT, size: 11, bold: true, color: '#2b241f' }),
      T({ kind: 'rect', x: 10, y: 106, w: 132, h: 24, fill: '#fff7ea', line: BOXLINE, radius: 1.6 }),
      T({ x: 12, y: 108, w: 128, h: 6, text: '＜板橋営業所のスローガン＞', size: 11, bold: true, color: GOLD, align: 'center' }),
      T({ x: 12, y: 114, w: 128, h: 14, text: '「夏の疲れが出てくる時期　眠気を感じたら必ず停止」', size: 12, bold: true, color: DANGER, align: 'center', valign: 'middle' }),
      T({ kind: 'rect', x: 10, y: 134, w: 132, h: 18, fill: ZERO, line: ZEROLINE, radius: 1.6 }),
      T({ x: 12, y: 137, w: 128, h: 12, text: '2026年9月30日（水）　交通事故ゼロを目指す日', size: 12, bold: true, color: '#7d2c10', align: 'center', valign: 'middle' }),
      T({ kind: 'orbis', x: 12, y: 158, w: 23, h: 23 }),
      T({ x: 40, y: 160, w: 100, h: 22, text: '速度は控えめに。生活道路は法定速度 30km/h。自動速度取締機（オービス）が見ています。', size: 9.5, color: '#2b241f' }),
      T({ kind: 'leaf', x: 40, y: 183, w: 8, h: 8, tint: ACCENT }),
      T({ kind: 'leaf', x: 49, y: 184, w: 8, h: 8, tint: GOLD }),
      T({ kind: 'idrow', x: 147, y: 28, w: 140, h: 12, size: 10 }),
      T({ kind: 'legend', x: 147, y: 42, w: 140, h: 13, size: 9.5, items: ['100％遵守した', '80％以上守れた', '出来なかった'] }),
      T({
        kind: 'table', x: 147, y: 58, w: 140, h: 138, size: 9, color: '#2b241f',
        rowLabels: ['法定速度30km/ｈ厳守', 'スマホ・カーナビ注視根絶', '眠気を感じたら必ず停止'],
        startDate: '2026-09-21', endDate: '2026-09-30', split: 6, example: true, stampRow: true, tScale: 0.92,
      }),
    ],
  };
}

function normEl(raw: unknown): TefudaEl | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const kind = (['text', 'rect', 'orbis', 'leaf', 'idrow', 'legend', 'table'] as TefudaKind[])
    .includes(o.kind as TefudaKind) ? (o.kind as TefudaKind) : 'text';
  const w = num(o.w, 60, 4, CANVAS_W);
  const h = num(o.h, 12, 3, CANVAS_H);
  const el: TefudaEl = {
    id: typeof o.id === 'string' ? o.id.slice(0, 40) : uid(),
    kind,
    x: num(o.x, 10, -50, CANVAS_W), y: num(o.y, 10, -50, CANVAS_H), w, h,
    text: s(o.text, ''),
    size: num(o.size, 12, 5, 60),
    color: hex(o.color, '#2b241f'),
    bold: !!o.bold,
    align: (['left', 'center', 'right'] as const).includes(o.align as 'left') ? (o.align as 'left') : 'left',
    valign: (['top', 'middle', 'bottom'] as const).includes(o.valign as 'top') ? (o.valign as 'top') : 'top',
    fill: hex(o.fill, o.fill === '' ? '' : ''),
    line: hex(o.line, o.line === '' ? '' : ''),
    lineW: num(o.lineW, 0.4, 0.1, 3),
    radius: num(o.radius, 0, 0, 12),
  };
  if (typeof o.fill === 'string' && /^#?[0-9a-fA-F]{6}$/.test(o.fill)) el.fill = hex(o.fill, '');
  if (typeof o.line === 'string' && /^#?[0-9a-fA-F]{6}$/.test(o.line)) el.line = hex(o.line, '');
  if (kind === 'leaf') el.tint = hex(o.tint, '#b8531d');
  if (kind === 'legend') el.items = list3(o.items, ['100％遵守した', '80％以上守れた', '出来なかった']);
  if (kind === 'table') {
    el.rowLabels = list3(o.rowLabels, ['法定速度30km/ｈ厳守', 'スマホ・カーナビ注視根絶', '眠気を感じたら必ず停止']);
    el.startDate = iso(o.startDate, '2026-09-21');
    el.endDate = iso(o.endDate, '2026-09-30');
    el.split = num(o.split, 0, 0, 20);
    el.example = o.example !== false;
    el.stampRow = o.stampRow !== false;
    el.tScale = num(o.tScale, 1, 0.6, 1.6);
  }
  return el;
}

/** 保存 JSON / URL パラメータ → 安全な TefudaDoc（旧スキーマ・空は既定テンプレへ） */
export function normalizeAutumnTefuda(raw: unknown): TefudaDoc {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (Array.isArray(o.els)) {
    const els = o.els.map(normEl).filter((e): e is TefudaEl => !!e).slice(0, 120);
    if (els.length) return { schema: 2, bg: hex(o.bg, '#fffdf8'), els };
  }
  // 旧スキーマ（title/slogan…）は案1テンプレへ文言を移植
  if (typeof o.title === 'string' || typeof o.slogan === 'string' || Array.isArray(o.efforts)) {
    const doc = defaultDoc('blocks');
    const setText = (idx: number, v: unknown) => { if (typeof v === 'string' && v.trim()) doc.els[idx].text = v; };
    setText(1, o.title);
    if (typeof o.periodText === 'string') doc.els[2].text = o.periodText;
    if (Array.isArray(o.efforts)) {
      const ic = '①②③④⑤⑥';
      doc.els[4].text = (o.efforts as unknown[]).slice(0, 6)
        .map((t, i) => (ic[i] || (i + 1) + '') + ' ' + String(t)).join('\n');
    }
    const office = typeof o.officeName === 'string' && o.officeName.trim() ? o.officeName : '板橋営業所';
    doc.els[6].text = '＜' + office + 'のスローガン＞';
    if (typeof o.slogan === 'string' && o.slogan.trim()) doc.els[7].text = '「' + o.slogan + '」';
    const zd = typeof o.zeroDayDate === 'string' ? o.zeroDayDate : '2026年9月30日（水）';
    const zl = typeof o.zeroDayLabel === 'string' ? o.zeroDayLabel : '交通事故ゼロを目指す日';
    doc.els[9].text = zd + '　' + zl;
    const tbl = doc.els.find(e => e.kind === 'table');
    if (tbl) {
      if (Array.isArray(o.rowLabels)) tbl.rowLabels = list3(o.rowLabels, tbl.rowLabels!);
      if (typeof o.startDate === 'string') tbl.startDate = iso(o.startDate, tbl.startDate!);
      if (typeof o.endDate === 'string') tbl.endDate = iso(o.endDate, tbl.endDate!);
      if (o.firstBlockDays != null) tbl.split = num(o.firstBlockDays, 6, 0, 20);
      const lg = doc.els.find(e => e.kind === 'legend');
      if (lg && Array.isArray(o.legend)) lg.items = list3(o.legend, lg.items!);
    }
    return doc;
  }
  return defaultDoc('blocks');
}

// ============================================================ 描画（HTML・印刷/エディタ共用）

function dayCols(startIso: string, endIso: string): Array<{ d: number; wd: string }> {
  const a = Date.parse(startIso + 'T00:00:00Z');
  const b = Date.parse(endIso + 'T00:00:00Z');
  const out: Array<{ d: number; wd: string }> = [];
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return out;
  for (let t = a; t <= b && out.length < 31; t += 86400000) {
    const dt = new Date(t);
    out.push({ d: dt.getUTCDate(), wd: WD[dt.getUTCDay()] });
  }
  return out;
}

export const ORBIS_SVG = `<svg viewBox="0 0 150 150" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
<rect x="66" y="46" width="12" height="96" rx="2" fill="#7a6a58"/><rect x="48" y="140" width="48" height="8" rx="3" fill="#7a6a58"/>
<rect x="30" y="52" width="48" height="9" rx="3" fill="#7a6a58"/>
<g transform="rotate(-10 45 40)"><rect x="8" y="16" width="70" height="42" rx="6" fill="#9aa0a6" stroke="#5c6167" stroke-width="2.5"/>
<circle cx="27" cy="37" r="12.5" fill="#241f1b"/><circle cx="27" cy="37" r="12.5" fill="none" stroke="#9c2b16" stroke-width="3.6"/>
<circle cx="22.5" cy="32.5" r="3.6" fill="#e9e2d6" opacity=".85"/>
<rect x="48" y="24" width="22" height="26" rx="3" fill="#f2c14e" stroke="#c98f27" stroke-width="2"/>
<path d="M60 28 l-7 12 h6 l-5 10 12 -14 h-6 z" fill="#9c2b16"/></g>
<g stroke="#b8531d" stroke-width="4.4" stroke-linecap="round"><line x1="90" y1="12" x2="104" y2="5"/><line x1="96" y1="29" x2="113" y2="27"/><line x1="92" y1="46" x2="106" y2="54"/></g></svg>`;

const LEAF_PATH = 'M50 6 C54 22 62 26 74 24 C70 34 72 40 80 44 C72 48 70 56 74 66 C62 62 54 68 50 84 C46 68 38 62 26 66 C30 56 28 48 20 44 C28 40 30 34 26 24 C38 26 46 22 50 6 Z';
export function leafSvg(tint: string): string {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">` +
    `<path d="${LEAF_PATH}" fill="${escHtml(tint)}"/><rect x="48" y="78" width="4" height="15" rx="1.5" fill="${escHtml(tint)}"/></svg>`;
}

function tableHtml(el: TefudaEl): string {
  const cols = dayCols(el.startDate || '2026-09-21', el.endDate || '2026-09-30');
  if (!cols.length) return '<div style="color:#9c2b16;font-size:3mm;">※ 日付が不正です</div>';
  const sc = el.tScale || 1;
  const rl = (el.rowLabels && el.rowLabels.length === 3 ? el.rowLabels : ['', '', '']);
  const blocks: Array<Array<{ d: number; wd: string }>> = [];
  if (el.split && el.split > 0 && el.split < cols.length) {
    blocks.push(cols.slice(0, el.split));
    blocks.push(cols.slice(el.split));
  } else {
    blocks.push(cols);
  }
  const one = (bc: Array<{ d: number; wd: string }>, withEx: boolean): string => {
    const exH = withEx && el.example ? '<th class="ex">記入例</th>' : '';
    const exN = withEx && el.example ? '<td class="ex"><span class="exn">1</span></td>' : '';
    const head = bc.map(c => {
      const cc = c.wd === '日' ? ' sun' : c.wd === '土' ? ' sat' : '';
      return `<th class="dc${cc}">${c.d}日<br><span class="wd">（${c.wd}）</span></th>`;
    }).join('');
    const body = rl.map((lb, i) =>
      `<tr><th class="rl"><span class="rn">${i + 1}</span>（${escHtml(lb)}）</th>${exN}${bc.map(() => '<td></td>').join('')}</tr>`
    ).join('');
    const stamp = el.stampRow
      ? `<tr class="st"><th class="rl rls">印</th>${withEx && el.example ? '<td class="ex st"><span class="dn">印</span></td>' : ''}${bc.map(() => '<td class="st"></td>').join('')}</tr>`
      : '';
    return `<table class="rec"><thead><tr><th class="rl"></th>${exH}${head}</tr></thead><tbody>${body}${stamp}</tbody></table>`;
  };
  const inner = blocks.map((b, i) => one(b, i === 0)).join('<div style="height:2.4mm;"></div>');
  return `<div class="recwrap" style="font-size:${(3 * sc).toFixed(2)}mm;">${inner}</div>`;
}

function elAppearance(el: TefudaEl): string {
  let css = '';
  if (el.fill) css += `background:${el.fill};`;
  if (el.line) css += `border:${(el.lineW || 0.4).toFixed(2)}mm solid ${el.line};`;
  if (el.radius) css += `border-radius:${el.radius}mm;`;
  if (el.kind === 'text' || el.kind === 'idrow' || el.kind === 'legend') {
    css += `font-size:${el.size || 12}pt;color:${el.color || '#2b241f'};`;
    css += `font-weight:${el.bold ? 700 : 400};text-align:${el.align || 'left'};`;
    css += 'display:flex;flex-direction:column;';
    css += `justify-content:${el.valign === 'middle' ? 'center' : el.valign === 'bottom' ? 'flex-end' : 'flex-start'};`;
    css += 'padding:1mm 1.5mm;line-height:1.4;white-space:pre-wrap;overflow:hidden;';
    css += `align-items:${el.align === 'center' ? 'center' : el.align === 'right' ? 'flex-end' : 'flex-start'};`;
  }
  return css;
}

function idrowInner(el: TefudaEl): string {
  const boxes = Array.from({ length: 8 }, () => '<span class="eb"></span>').join('');
  return `<div class="idr" style="font-size:${el.size || 11}pt;">` +
    `<span class="l">社員番号</span><span class="ebs">${boxes}</span>` +
    `<span class="l">班</span><span class="ln" style="width:14mm;"></span>` +
    `<span class="l">氏名</span><span class="ln" style="width:44mm;"></span></div>`;
}
function legendInner(el: TefudaEl): string {
  const it = el.items && el.items.length === 3 ? el.items : ['', '', ''];
  return `<div class="lgd" style="font-size:${el.size || 10}pt;">` +
    it.map((t, i) => `<span class="lg${i === 2 ? ' c3' : ''}"><b>${i + 1}</b>${escHtml(t)}</span>`).join('') +
    '</div>';
}

function elInner(el: TefudaEl): string {
  if (el.kind === 'orbis') return `<div class="svgbox">${ORBIS_SVG}</div>`;
  if (el.kind === 'leaf') return `<div class="svgbox">${leafSvg(el.tint || '#b8531d')}</div>`;
  if (el.kind === 'idrow') return idrowInner(el);
  if (el.kind === 'legend') return legendInner(el);
  if (el.kind === 'table') return tableHtml(el);
  if (el.kind === 'text') return escHtml(el.text || '').replace(/\n/g, '<br>');
  return '';
}

function elDivs(doc: TefudaDoc): string {
  return doc.els.map(el =>
    `<div class="pel k-${el.kind}" style="position:absolute;left:${el.x}mm;top:${el.y}mm;width:${el.w}mm;height:${el.h}mm;${elAppearance(el)}">${elInner(el)}</div>`
  ).join('');
}

/** 印刷/エディタ共通の CSS（.sheet 内） */
const SHEET_CSS = `
  .sheet{position:relative;width:297mm;height:210mm;background:#fffdf8;overflow:hidden;
    font-family:'Hiragino Kaku Gothic ProN','Hiragino Sans','Yu Gothic','Meiryo',sans-serif;color:#2b241f;}
  .pel{box-sizing:border-box;}
  .pel .svgbox,.pel.k-orbis,.pel.k-leaf{width:100%;height:100%;}
  .pel .svgbox svg{width:100%;height:100%;display:block;}
  /* 記入者欄 */
  .idr{display:flex;align-items:center;gap:2.5mm;flex-wrap:wrap;font-weight:700;}
  .idr .l{color:#6b5844;}
  .idr .ebs{display:inline-flex;}
  .idr .ebs .eb{width:6.6mm;height:8mm;border:.4mm solid #4a3a2e;background:#fff;}
  .idr .ebs .eb + .eb{margin-left:-.4mm;}
  .idr .ebs .eb:first-child{border-radius:.7mm 0 0 .7mm;}
  .idr .ebs .eb:last-child{border-radius:0 .7mm .7mm 0;}
  .idr .ln{display:inline-block;border-bottom:.4mm solid #4a3a2e;height:7mm;}
  /* 凡例 */
  .lgd{display:flex;gap:2.5mm;width:100%;}
  .lgd .lg{flex:1;border:.4mm solid #8a4a26;border-radius:1.2mm;padding:1.4mm 2mm;background:#fff7ea;font-weight:700;
    display:flex;align-items:center;gap:1.6mm;line-height:1.3;}
  .lgd .lg b{flex:none;width:5.6mm;height:5.6mm;border-radius:50%;background:#a9781a;color:#fff;font-weight:800;
    display:flex;align-items:center;justify-content:center;}
  .lgd .lg.c3{border-color:#9c2b16;} .lgd .lg.c3 b{background:#9c2b16;}
  /* 記入表 */
  .recwrap table.rec{border-collapse:collapse;table-layout:fixed;width:100%;}
  .recwrap table.rec + table.rec{margin-top:0;}
  .recwrap th,.recwrap td{border:.3mm solid #4a3a2e;text-align:center;}
  .recwrap thead th{background:#5b2a1c;color:#fff;font-weight:800;padding:1mm 0;line-height:1.2;}
  .recwrap thead th.sun{background:#8a2b23;} .recwrap thead th.sat{background:#8a5a1e;}
  .recwrap thead th .wd{font-size:.85em;font-weight:700;}
  .recwrap th.rl{width:26%;background:#efe0c9;color:#2b241f;font-weight:700;text-align:left;padding:0 1.4mm;
    white-space:nowrap;line-height:1.15;overflow:hidden;}
  .recwrap th.rl .rn{display:inline-block;width:1.5em;height:1.5em;border-radius:50%;background:#a9781a;color:#fff;
    line-height:1.5em;text-align:center;margin-right:.5mm;font-size:.9em;}
  .recwrap th.rls{text-align:center;color:#9c2b16;font-weight:800;}
  .recwrap tbody td{height:4.6em;background:#fff;}
  .recwrap tr.st td{height:3.4em;background:#fffef7;position:relative;}
  .recwrap tr.st td::after{content:"";position:absolute;left:1.4mm;right:1.4mm;top:1.4mm;bottom:1.4mm;
    border:.25mm dashed #c39a63;border-radius:.5mm;}
  .recwrap td.ex,.recwrap th.ex{width:9%;background:#fff3df;}
  .recwrap td.ex .exn{font-weight:800;color:#b8531d;}
  .recwrap tr.st td.ex::after{display:none;}
  .recwrap tr.st td.ex .dn{display:inline-flex;align-items:center;justify-content:center;width:6mm;height:6mm;
    border:.35mm solid #9c2b16;border-radius:1mm;color:#9c2b16;font-weight:800;font-size:.9em;}
`;

// ============================================================ 印刷ドキュメント

export function autumnTefudaPrintDoc(
  doc: TefudaDoc,
  opts: { auto: boolean; backHref: string },
): string {
  const d = normalizeAutumnTefuda(doc);
  const autoScript = opts.auto
    ? `<script>window.addEventListener('load',function(){setTimeout(function(){window.print();},350);});</script>`
    : '';
  return `<!DOCTYPE html>
<html lang="ja"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>秋の全国交通安全運動 手札</title>
<style>
  *{box-sizing:border-box;}
  body{margin:0;padding:14px;background:#5b4a3a;
    font-family:'Hiragino Kaku Gothic ProN','Hiragino Sans','Yu Gothic','Meiryo',sans-serif;color:#2b241f;}
  .bar{display:flex;gap:12px;align-items:center;margin-bottom:12px;flex-wrap:wrap;}
  .bar a{color:#374151;font-size:13px;text-decoration:none;padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:#fff;}
  .bar button{padding:8px 20px;background:#b8531d;color:#fff;border:none;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer;}
  .sheet{margin:0 auto;box-shadow:0 2px 14px rgba(0,0,0,.35);}
  ${SHEET_CSS}
  @media print{ body{background:#fff;padding:0;} .sheet{box-shadow:none;} .bar{display:none;} @page{size:A4 landscape;margin:0;} }
</style>
</head><body>
  <div class="bar">
    <a href="${escHtml(opts.backHref)}">← 戻る</a>
    <button onclick="window.print()">印刷 / PDF保存</button>
  </div>
  <div class="sheet" style="background:${escHtml(d.bg)};">${elDivs(d)}</div>
  ${autoScript}
</body></html>`;
}

// ============================================================ PowerPoint 書き出し（クライアントJS）

const PPTX_CLIENT_JS = `
var PX_FFLATE = 'https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js';
var _pxFP = null;
function pxLoadFflate(){
  if (window.fflate) return Promise.resolve();
  if (_pxFP) return _pxFP;
  _pxFP = new Promise(function(res, rej){
    var sc = document.createElement('script'); sc.src = PX_FFLATE;
    sc.onload = function(){ res(); }; sc.onerror = function(){ rej(new Error('圧縮ライブラリの読み込みに失敗しました')); };
    document.head.appendChild(sc);
  });
  return _pxFP;
}
function pxEsc(v){ return String(v==null?'':v).split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;').split('"').join('&quot;'); }
var EMU = 36000;                 // 1mm
function pxE(mm){ return Math.round(mm * EMU); }
function pxHex(c){ return String(c||'#000000').replace('#','').toUpperCase(); }
function pxLines(t){ return String(t==null?'':t).split(String.fromCharCode(13)).join('').split(String.fromCharCode(10)); }

function pxRunPr(el){
  return '<a:rPr lang="ja-JP" altLang="en-US" sz="'+Math.round((el.size||12)*100)+'" b="'+(el.bold?1:0)+'" dirty="0">' +
    '<a:solidFill><a:srgbClr val="'+pxHex(el.color)+'"/></a:solidFill>' +
    '<a:latin typeface="Yu Gothic"/><a:ea typeface="Yu Gothic"/></a:rPr>';
}
function pxPara(el, line){
  var algn = el.align==='center'?'ctr':el.align==='right'?'r':'l';
  if (!line) return '<a:p><a:pPr algn="'+algn+'"/><a:endParaRPr lang="ja-JP"/></a:p>';
  return '<a:p><a:pPr algn="'+algn+'"/><a:r>'+pxRunPr(el)+'<a:t>'+pxEsc(line)+'</a:t></a:r></a:p>';
}
function pxTextBody(el){
  var anchor = el.valign==='middle'?'ctr':el.valign==='bottom'?'b':'t';
  var ps = pxLines(el.text).map(function(l){ return pxPara(el, l); }).join('');
  if (!ps) ps = pxPara(el, '');
  return '<p:txBody><a:bodyPr wrap="square" lIns="45720" tIns="27432" rIns="45720" bIns="27432" anchor="'+anchor+'"><a:normAutofit/></a:bodyPr><a:lstStyle/>'+ps+'</p:txBody>';
}
function pxSpPr(el, forceRect){
  var geom = (!forceRect && el.radius) ? 'roundRect' : 'rect';
  var fill = el.fill ? '<a:solidFill><a:srgbClr val="'+pxHex(el.fill)+'"/></a:solidFill>' : '<a:noFill/>';
  var ln = el.line ? '<a:ln w="'+pxE(el.lineW||0.4)+'"><a:solidFill><a:srgbClr val="'+pxHex(el.line)+'"/></a:solidFill></a:ln>' : '<a:ln><a:noFill/></a:ln>';
  return '<p:spPr><a:xfrm><a:off x="'+pxE(el.x)+'" y="'+pxE(el.y)+'"/><a:ext cx="'+pxE(el.w)+'" cy="'+pxE(el.h)+'"/></a:xfrm>' +
    '<a:prstGeom prst="'+geom+'"><a:avLst/></a:prstGeom>'+fill+ln+'</p:spPr>';
}
function pxShape(id, el, withText){
  return '<p:sp><p:nvSpPr><p:cNvPr id="'+id+'" name="sp'+id+'"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>' +
    pxSpPr(el, false) + (withText ? pxTextBody(el) : '<p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody>') + '</p:sp>';
}
function pxPic(id, rid, el){
  return '<p:pic><p:nvPicPr><p:cNvPr id="'+id+'" name="pic'+id+'"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>' +
    '<p:blipFill><a:blip r:embed="rId'+rid+'"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>' +
    '<p:spPr><a:xfrm><a:off x="'+pxE(el.x)+'" y="'+pxE(el.y)+'"/><a:ext cx="'+pxE(el.w)+'" cy="'+pxE(el.h)+'"/></a:xfrm>' +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>';
}
function pxTableFrame(id, el, x, y, w, h, cols, rows){
  // cols: [{w}], rows: [{h, cells:[{t, fill, sz, bold, algn, colspan}]}]
  var grid = cols.map(function(c){ return '<a:gridCol w="'+pxE(c.w)+'"/>'; }).join('');
  var trs = rows.map(function(r){
    var tcs = r.cells.map(function(cell){
      var span = cell.colspan && cell.colspan > 1 ? ' gridSpan="'+cell.colspan+'"' : '';
      var fill = cell.fill ? '<a:solidFill><a:srgbClr val="'+pxHex(cell.fill)+'"/></a:solidFill>' : '';
      var col = cell.color ? '<a:solidFill><a:srgbClr val="'+pxHex(cell.color)+'"/></a:solidFill>' : '';
      var run = cell.t ? ('<a:r><a:rPr lang="ja-JP" sz="'+Math.round((cell.sz||10)*100)+'" b="'+(cell.bold?1:0)+'">'+col+'<a:latin typeface="Yu Gothic"/><a:ea typeface="Yu Gothic"/></a:rPr><a:t>'+pxEsc(cell.t)+'</a:t></a:r>') : '';
      var b = '<a:lnL w="6350"><a:solidFill><a:srgbClr val="4A3A2E"/></a:solidFill></a:lnL><a:lnR w="6350"><a:solidFill><a:srgbClr val="4A3A2E"/></a:solidFill></a:lnR><a:lnT w="6350"><a:solidFill><a:srgbClr val="4A3A2E"/></a:solidFill></a:lnT><a:lnB w="6350"><a:solidFill><a:srgbClr val="4A3A2E"/></a:solidFill></a:lnB>';
      return '<a:tc'+span+'><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr algn="'+(cell.algn||'ctr')+'"/>'+run+'</a:p></a:txBody><a:tcPr marL="18000" marR="18000" marT="9000" marB="9000" anchor="ctr">'+b+fill+'</a:tcPr></a:tc>';
    }).join('');
    // 埋めセル（colspan の分）
    var used = r.cells.reduce(function(a,c){ return a + (c.colspan||1); }, 0);
    for (var k = used; k < cols.length; k++) tcs += '<a:tc hMerge="1"><a:txBody><a:bodyPr/><a:lstStyle/><a:p/></a:txBody><a:tcPr/></a:tc>';
    return '<a:tr h="'+pxE(r.h)+'">'+tcs+'</a:tr>';
  }).join('');
  return '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="'+id+'" name="tbl'+id+'"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>' +
    '<p:xfrm><a:off x="'+pxE(x)+'" y="'+pxE(y)+'"/><a:ext cx="'+pxE(w)+'" cy="'+pxE(h)+'"/></p:xfrm>' +
    '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl>' +
    '<a:tblPr firstRow="1"><a:tableStyleId>{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}</a:tableStyleId></a:tblPr>' +
    '<a:tblGrid>'+grid+'</a:tblGrid>'+trs+'</a:tbl></a:graphicData></a:graphic></p:graphicFrame>';
}

function pxDayCols(sIso, eIso){
  var WDX = ['日','月','火','水','木','金','土'];
  var a = Date.parse(sIso+'T00:00:00Z'), b = Date.parse(eIso+'T00:00:00Z'), out = [];
  if (isNaN(a) || isNaN(b) || b < a) return out;
  for (var t = a; t <= b && out.length < 31; t += 86400000){ var dt = new Date(t); out.push({ d: dt.getUTCDate(), wd: WDX[dt.getUTCDay()] }); }
  return out;
}
function pxTableRowsCols(el, bc, withEx){
  var sc = el.tScale || 1, base = (el.size || 10) * sc;
  var cols = [{ w: 30 }];
  if (withEx && el.example) cols.push({ w: 12 });
  var dw = (el.w - cols[0].w - (withEx && el.example ? 12 : 0)) / bc.length;
  for (var i = 0; i < bc.length; i++) cols.push({ w: Math.max(8, dw) });
  var rows = [];
  var hcells = [{ t: '', fill: '5B2A1C', sz: base }];
  if (withEx && el.example) hcells.push({ t: '記入例', fill: 'FFF3DF', color: '2B241F', sz: base*0.85 });
  bc.forEach(function(c){
    var f = c.wd==='日'?'8A2B23':c.wd==='土'?'8A5A1E':'5B2A1C';
    hcells.push({ t: c.d+'日（'+c.wd+'）', fill: f, color: 'FFFFFF', sz: base*0.85, bold: true });
  });
  rows.push({ h: 9, cells: hcells });
  var labels = (el.rowLabels && el.rowLabels.length===3) ? el.rowLabels : ['','',''];
  labels.forEach(function(lb, i){
    var cs = [{ t: (i+1)+' （'+lb+'）', fill: 'EFE0C9', color: '2B241F', sz: base, algn: 'l' }];
    if (withEx && el.example) cs.push({ t: '1', fill: 'FFF3DF', color: 'B8531D', sz: base, bold: true });
    bc.forEach(function(){ cs.push({ t: '', sz: base }); });
    rows.push({ h: 12, cells: cs });
  });
  if (el.stampRow){
    var sr = [{ t: '印', fill: 'EFE0C9', color: '9C2B16', sz: base, bold: true }];
    if (withEx && el.example) sr.push({ t: '印', fill: 'FFF3DF', color: '9C2B16', sz: base, bold: true });
    bc.forEach(function(){ sr.push({ t: '', fill: 'FFFEF7', sz: base }); });
    rows.push({ h: 9, cells: sr });
  }
  return { cols: cols, rows: rows };
}

function pxSvgToPng(svg, wpx, hpx){
  return new Promise(function(resolve){
    try {
      var img = new Image();
      img.onload = function(){
        try {
          var cv = document.createElement('canvas'); cv.width = wpx; cv.height = hpx;
          var cx = cv.getContext('2d'); cx.drawImage(img, 0, 0, wpx, hpx);
          var url = cv.toDataURL('image/png');
          resolve(url.slice(url.indexOf(',') + 1));
        } catch(e){ resolve(null); }
      };
      img.onerror = function(){ resolve(null); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    } catch(e){ resolve(null); }
  });
}
function pxB64ToU8(b64){ var bin = atob(b64); var u = new Uint8Array(bin.length); for (var i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i); return u; }

// 記入者欄 → 実際に編集できる図形（ラベル＋8マス＋班/氏名の下線）
function pxIdrowShapes(startId, el){
  var out = [], id = startId, sz = el.size || 11, col = el.color || '#2b241f';
  var h = Math.min(el.h, 9), cy = el.y + Math.max(0, (el.h - h) / 2);
  var x = el.x;
  out.push(pxShape(id++, { x:x, y:cy, w:22, h:h, text:'社員番号', size:sz, color:col, bold:true, align:'left', valign:'middle' }, true));
  x += 23;
  var bw = Math.max(5, Math.min(7, (el.w - 23 - 44) / 8));
  for (var i = 0; i < 8; i++) out.push(pxShape(id++, { x:x + i*bw, y:cy, w:bw, h:h, fill:'', line:'#4a3a2e', lineW:0.35 }, false));
  x += 8*bw + 4;
  out.push(pxShape(id++, { x:x, y:cy, w:8, h:h, text:'班', size:sz, color:col, bold:true, valign:'middle' }, true));
  x += 8;
  out.push(pxShape(id++, { x:x, y:cy + h - 1, w:14, h:1, fill:'#4a3a2e' }, false));
  x += 16;
  out.push(pxShape(id++, { x:x, y:cy, w:10, h:h, text:'氏名', size:sz, color:col, bold:true, valign:'middle' }, true));
  x += 10;
  out.push(pxShape(id++, { x:x, y:cy + h - 1, w:Math.max(18, el.x + el.w - x - 1), h:1, fill:'#4a3a2e' }, false));
  return { shapes: out, id: id };
}
// 凡例 → 3つの角丸ボックス（各々テキスト付き・PowerPointで自由編集）
function pxLegendShapes(startId, el){
  var out = [], id = startId, it = (el.items && el.items.length === 3) ? el.items : ['', '', ''];
  var gap = 2.5, w = (el.w - gap * 2) / 3;
  for (var i = 0; i < 3; i++){
    out.push(pxShape(id++, {
      x: el.x + i*(w + gap), y: el.y, w: w, h: el.h,
      fill: '#fff7ea', line: i === 2 ? '#9c2b16' : '#8a4a26', lineW: 0.4, radius: 1.2,
      text: (i + 1) + '　' + it[i], size: el.size || 10, bold: true, color: '#2b241f', align: 'left', valign: 'middle',
    }, true));
  }
  return { shapes: out, id: id };
}

async function pxExport(doc){
  await pxLoadFflate();
  var enc = new TextEncoder();
  var shapes = [], media = {}, rels = ['<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>'];
  var id = 10, rid = 100, imgN = 0;
  for (var i = 0; i < doc.els.length; i++){
    var el = doc.els[i];
    if (el.kind === 'text'){ shapes.push(pxShape(id++, el, true)); }
    else if (el.kind === 'rect'){ shapes.push(pxShape(id++, el, false)); }
    else if (el.kind === 'idrow'){
      var r1 = pxIdrowShapes(id, el); r1.shapes.forEach(function(sp){ shapes.push(sp); }); id = r1.id;
    }
    else if (el.kind === 'legend'){
      var r2 = pxLegendShapes(id, el); r2.shapes.forEach(function(sp){ shapes.push(sp); }); id = r2.id;
    }
    else if (el.kind === 'orbis' || el.kind === 'leaf'){
      var svg = el.kind === 'orbis' ? ORBIS_SVG_STR : LEAF_SVG_FN(el.tint || '#b8531d');
      var scale = 6;
      var png = await pxSvgToPng(svg, Math.round(el.w*scale), Math.round(el.h*scale));
      if (png){
        imgN++; var nm = 'image'+imgN+'.png';
        media['ppt/media/'+nm] = pxB64ToU8(png);
        rels.push('<Relationship Id="rId'+rid+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/'+nm+'"/>');
        shapes.push(pxPic(id++, rid, el)); rid++;
      } else {
        shapes.push(pxShape(id++, Object.assign({}, el, { fill: el.tint || '#e8dcc8', radius: 2 }), false));
      }
    }
    else if (el.kind === 'table'){
      var cols = pxDayCols(el.startDate || '2026-09-21', el.endDate || '2026-09-30');
      if (!cols.length) continue;
      var blocks = [];
      if (el.split && el.split > 0 && el.split < cols.length){ blocks.push(cols.slice(0, el.split)); blocks.push(cols.slice(el.split)); }
      else blocks.push(cols);
      var gap = 3, bh = (el.h - gap*(blocks.length-1)) / blocks.length;
      for (var bi = 0; bi < blocks.length; bi++){
        var rc = pxTableRowsCols(el, blocks[bi], bi === 0);
        shapes.push(pxTableFrame(id++, el, el.x, el.y + bi*(bh+gap), el.w, bh, rc.cols, rc.rows));
      }
    }
  }

  var A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
  var R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  var P = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  var GRP = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';

  var files = {};
  files['[Content_Types].xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>';
  files['_rels/.rels'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>';
  files['ppt/presentation.xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation '+A+' '+R+' '+P+'><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:sldSz cx="10692000" cy="7560000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>';
  files['ppt/_rels/presentation.xml.rels'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/></Relationships>';
  files['ppt/slideMasters/slideMaster1.xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster '+A+' '+R+' '+P+'><p:cSld><p:spTree>'+GRP+'</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>';
  files['ppt/slideMasters/_rels/slideMaster1.xml.rels'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>';
  files['ppt/slideLayouts/slideLayout1.xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout '+A+' '+R+' '+P+' type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>'+GRP+'</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>';
  files['ppt/slideLayouts/_rels/slideLayout1.xml.rels'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>';
  files['ppt/theme/theme1.xml'] = PX_THEME;
  files['ppt/slides/slide1.xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld '+A+' '+R+' '+P+'><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="'+pxHex(doc.bg||'#fffdf8')+'"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>'+GRP+shapes.join('')+'</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';
  files['ppt/slides/_rels/slide1.xml.rels'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+rels.join('')+'</Relationships>';

  var zipObj = {};
  Object.keys(files).forEach(function(k){ zipObj[k] = enc.encode(files[k]); });
  Object.keys(media).forEach(function(k){ zipObj[k] = media[k]; });
  var out = window.fflate.zipSync(zipObj, { level: 6 });
  var blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = '秋の交通安全手札.pptx';
  document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
`;

const PX_THEME_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`;

// ============================================================ 編集ページ

export function autumnTefudaEditorContent(opts: {
  data: TefudaDoc;
  backHref: string;
  printPath: string;
  savedAt: string | null;
}): string {
  const d = normalizeAutumnTefuda(opts.data);
  const btn = 'padding:7px 12px;border:1px solid #d9d2c6;border-radius:7px;background:#fff;font-size:12px;font-weight:700;cursor:pointer;color:#5b3a1e;';

  return `
  <div class="no-print" style="display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap;">
    <a href="${escHtml(opts.backHref)}" style="color:#6b7280;font-size:13px;text-decoration:none;padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:#fff;">← 課長ミッション</a>
    <h2 style="font-size:17px;font-weight:700;color:#5b2a1c;margin:0;">秋の全国交通安全運動 手札（自由編集）</h2>
    <span style="font-size:12px;color:#9ca3af;">A4横・片面／要素をドラッグで移動・四隅でサイズ変更・ダブルクリックで文字編集</span>
  </div>

  <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px;">
    <button id="add-text" style="${btn}">＋ テキスト</button>
    <button id="add-rect" style="${btn}">＋ 四角</button>
    <button id="add-orbis" style="${btn}">＋ オービス</button>
    <button id="add-leaf" style="${btn}">＋ 紅葉</button>
    <span style="width:1px;height:20px;background:#ddd;"></span>
    <button id="tpl-a" style="${btn}">テンプレ 案1</button>
    <button id="tpl-b" style="${btn}">テンプレ 案2</button>
    <span style="width:1px;height:20px;background:#ddd;"></span>
    <button id="btn-save" style="${btn}background:#166534;color:#fff;border-color:#166534;">保存</button>
    <button id="btn-print" style="${btn}background:#5b2a1c;color:#fff;border-color:#5b2a1c;">印刷ページ</button>
    <button id="btn-pptx" style="${btn}background:#b8531d;color:#fff;border-color:#b8531d;">PowerPointで書き出し</button>
    <span id="msg" style="font-size:12px;color:#166534;">${opts.savedAt ? escHtml('最終保存: ' + opts.savedAt) : ''}</span>
  </div>

  <div style="display:grid;grid-template-columns:1fr 280px;gap:16px;align-items:start;">
    <div id="stage" style="background:#8a7a66;border-radius:10px;padding:14px;overflow:auto;">
      <div id="canvas" style="position:relative;width:297mm;height:210mm;background:#fffdf8;transform-origin:top left;box-shadow:0 3px 16px rgba(0,0,0,.3);"></div>
    </div>
    <div id="props" style="position:sticky;top:12px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px;font-size:12px;color:#374151;">
      <p style="margin:0 0 8px;color:#9ca3af;">要素をクリックすると、ここで書式を変更できます。</p>
    </div>
  </div>

  <style>
    #canvas .el{position:absolute;box-sizing:border-box;cursor:move;}
    #canvas .el.sel{outline:1.5px solid #2563eb;outline-offset:1px;}
    #canvas .el .hd{position:absolute;width:10px;height:10px;background:#2563eb;border:1.5px solid #fff;border-radius:2px;z-index:5;}
    #canvas .el .hd.se{right:-6px;bottom:-6px;cursor:nwse-resize;}
    #canvas .el .hd.sw{left:-6px;bottom:-6px;cursor:nesw-resize;}
    #canvas .el .hd.ne{right:-6px;top:-6px;cursor:nesw-resize;}
    #canvas .el .hd.nw{left:-6px;top:-6px;cursor:nwse-resize;}
    #canvas .el[data-edit="1"]{cursor:text;outline:1.5px dashed #2563eb;}
    ${SHEET_CSS.replace(/\.sheet/g, '#canvas')}
    #props label{display:block;font-weight:700;margin:8px 0 3px;}
    #props input[type=text],#props textarea,#props select,#props input[type=number]{width:100%;border:1px solid #d1d5db;border-radius:5px;padding:5px 7px;font-size:12px;font-family:inherit;box-sizing:border-box;}
    #props .row{display:flex;gap:6px;} #props .row>*{flex:1;}
    #props button{margin-top:8px;padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;background:#fff;font-size:12px;cursor:pointer;}
  </style>

  <script>
  var PRINT_PATH = ${safeJson(opts.printPath)};
  var API_PATH = '/api/kacho-mission/autumn-safety-2026-tefuda';
  var DOC = ${safeJson(d)};
  var CW = 297, CH = 210, SEL = null, scale = 1;
  var ORBIS_SVG_STR = ${safeJson(ORBIS_SVG)};
  function LEAF_SVG_FN(t){ return ${safeJson('<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"><path d="' + LEAF_PATH + '" fill="TINT"/><rect x="48" y="78" width="4" height="15" rx="1.5" fill="TINT"/></svg>')}.split('TINT').join(t); }
  var PX_THEME = ${safeJson(PX_THEME_XML)};
  ${PPTX_CLIENT_JS}

  function esc(s){ return String(s==null?'':s).split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;'); }
  function uid(){ return 'e' + Date.now().toString(36) + Math.floor(Math.random()*1e6).toString(36); }
  function fitScale(){
    var host = document.getElementById('stage');
    var avail = host.clientWidth - 28;
    scale = Math.min(1, avail / (CW * 3.7795));
    document.getElementById('canvas').style.transform = 'scale(' + scale + ')';
    document.getElementById('stage').style.height = (CH * 3.7795 * scale + 28) + 'px';
  }
  var MM = 3.7795;

  function appearance(el){
    var c = '';
    if (el.fill) c += 'background:' + el.fill + ';';
    if (el.line) c += 'border:' + (el.lineW||0.4) + 'mm solid ' + el.line + ';';
    if (el.radius) c += 'border-radius:' + el.radius + 'mm;';
    if (el.kind==='text' || el.kind==='idrow' || el.kind==='legend'){
      c += 'font-size:' + (el.size||12) + 'pt;color:' + (el.color||'#2b241f') + ';font-weight:' + (el.bold?700:400) + ';';
      c += 'text-align:' + (el.align||'left') + ';display:flex;flex-direction:column;white-space:pre-wrap;line-height:1.4;padding:1mm 1.5mm;overflow:hidden;';
      c += 'justify-content:' + (el.valign==='middle'?'center':el.valign==='bottom'?'flex-end':'flex-start') + ';';
      c += 'align-items:' + (el.align==='center'?'center':el.align==='right'?'flex-end':'flex-start') + ';';
    }
    return c;
  }
  function dayColsJS(sIso, eIso){ return pxDayCols(sIso, eIso); }
  function tableInner(el){
    var cols = dayColsJS(el.startDate||'2026-09-21', el.endDate||'2026-09-30');
    if (!cols.length) return '<div style="color:#9c2b16;font-size:3mm;">日付が不正</div>';
    var sc = el.tScale||1;
    var rl = (el.rowLabels&&el.rowLabels.length===3)?el.rowLabels:['','',''];
    var blocks = [];
    if (el.split && el.split>0 && el.split<cols.length){ blocks.push(cols.slice(0,el.split)); blocks.push(cols.slice(el.split)); }
    else blocks.push(cols);
    function one(bc, wEx){
      var exH = (wEx&&el.example)?'<th class="ex">記入例</th>':'';
      var exN = (wEx&&el.example)?'<td class="ex"><span class="exn">1</span></td>':'';
      var head = bc.map(function(c){ var cc = c.wd==='日'?' sun':c.wd==='土'?' sat':''; return '<th class="dc'+cc+'">'+c.d+'日<br><span class="wd">（'+c.wd+'）</span></th>'; }).join('');
      var body = rl.map(function(lb,i){ return '<tr><th class="rl"><span class="rn">'+(i+1)+'</span>（'+esc(lb)+'）</th>'+exN+bc.map(function(){return '<td></td>';}).join('')+'</tr>'; }).join('');
      var st = el.stampRow ? '<tr class="st"><th class="rl rls">印</th>'+((wEx&&el.example)?'<td class="ex st"><span class="dn">印</span></td>':'')+bc.map(function(){return '<td class="st"></td>';}).join('')+'</tr>' : '';
      return '<table class="rec"><thead><tr><th class="rl"></th>'+exH+head+'</tr></thead><tbody>'+body+st+'</tbody></table>';
    }
    return '<div class="recwrap" style="font-size:'+(3*sc).toFixed(2)+'mm;">'+blocks.map(function(b,i){ return one(b,i===0); }).join('<div style="height:2.4mm;"></div>')+'</div>';
  }
  function elInner(el){
    if (el.kind==='orbis') return '<div class="svgbox">'+ORBIS_SVG_STR+'</div>';
    if (el.kind==='leaf') return '<div class="svgbox">'+LEAF_SVG_FN(el.tint||'#b8531d')+'</div>';
    if (el.kind==='idrow'){ var b=''; for(var i=0;i<8;i++) b+='<span class="eb"></span>';
      return '<div class="idr" style="font-size:'+(el.size||11)+'pt;"><span class="l">社員番号</span><span class="ebs">'+b+'</span><span class="l">班</span><span class="ln" style="width:14mm;"></span><span class="l">氏名</span><span class="ln" style="width:44mm;"></span></div>'; }
    if (el.kind==='legend'){ var it = (el.items&&el.items.length===3)?el.items:['','',''];
      return '<div class="lgd" style="font-size:'+(el.size||10)+'pt;">'+it.map(function(t,i){ return '<span class="lg'+(i===2?' c3':'')+'"><b>'+(i+1)+'</b>'+esc(t)+'</span>'; }).join('')+'</div>'; }
    if (el.kind==='table') return tableInner(el);
    if (el.kind==='text') return esc(el.text||'').split(String.fromCharCode(10)).join('<br>');
    return '';
  }

  function render(){
    var cv = document.getElementById('canvas');
    cv.style.background = DOC.bg || '#fffdf8';
    cv.innerHTML = DOC.els.map(function(el){
      var sel = (SEL===el.id) ? ' sel' : '';
      var h = (SEL===el.id) ? ['nw','ne','sw','se'].map(function(k){ return '<span class="hd '+k+'" data-h="'+k+'"></span>'; }).join('') : '';
      return '<div class="el k-'+el.kind+sel+'" data-id="'+el.id+'" style="left:'+el.x+'mm;top:'+el.y+'mm;width:'+el.w+'mm;height:'+el.h+'mm;'+appearance(el)+'">'+elInner(el)+h+'</div>';
    }).join('');
    wire();
    renderProps();
  }

  function elById(id){ for (var i=0;i<DOC.els.length;i++) if (DOC.els[i].id===id) return DOC.els[i]; return null; }

  var drag = null;
  function wire(){
    var cv = document.getElementById('canvas');
    cv.querySelectorAll('.el').forEach(function(node){
      node.addEventListener('pointerdown', function(ev){
        if (node.getAttribute('data-edit')==='1') return;
        var id = node.getAttribute('data-id');
        SEL = id; render();
        var el = elById(id); if (!el) return;
        var hk = ev.target && ev.target.getAttribute ? ev.target.getAttribute('data-h') : null;
        drag = { id:id, hk:hk, sx:ev.clientX, sy:ev.clientY, ox:el.x, oy:el.y, ow:el.w, oh:el.h };
        try{ ev.target.setPointerCapture(ev.pointerId); }catch(e){}
        ev.preventDefault();
      });
      node.addEventListener('dblclick', function(){
        var el = elById(node.getAttribute('data-id'));
        if (!el || (el.kind!=='text')) return;
        node.setAttribute('data-edit','1'); node.setAttribute('contenteditable','true');
        node.innerText = el.text||''; node.focus();
        var done = function(){
          node.removeAttribute('contenteditable'); node.setAttribute('data-edit','0');
          el.text = node.innerText; node.removeEventListener('blur', done); markDirty(); render();
        };
        node.addEventListener('blur', done);
      });
    });
  }
  window.addEventListener('pointermove', function(ev){
    if (!drag) return;
    var el = elById(drag.id); if (!el) return;
    var dx = (ev.clientX - drag.sx) / (scale*MM);
    var dy = (ev.clientY - drag.sy) / (scale*MM);
    if (!drag.hk){
      el.x = Math.round(Math.max(-40, Math.min(CW-4, drag.ox + dx)));
      el.y = Math.round(Math.max(-40, Math.min(CH-4, drag.oy + dy)));
    } else {
      if (drag.hk.indexOf('e')>=0) el.w = Math.max(6, Math.round(drag.ow + dx));
      if (drag.hk.indexOf('s')>=0) el.h = Math.max(4, Math.round(drag.oh + dy));
      if (drag.hk.indexOf('w')>=0){ var nw = Math.max(6, Math.round(drag.ow - dx)); el.x = Math.round(drag.ox + (drag.ow - nw)); el.w = nw; }
      if (drag.hk.indexOf('n')>=0){ var nh = Math.max(4, Math.round(drag.oh - dy)); el.y = Math.round(drag.oy + (drag.oh - nh)); el.h = nh; }
    }
    var node = document.querySelector('#canvas .el[data-id="'+drag.id+'"]');
    if (node){ node.style.left=el.x+'mm'; node.style.top=el.y+'mm'; node.style.width=el.w+'mm'; node.style.height=el.h+'mm'; }
  });
  window.addEventListener('pointerup', function(){ if (drag){ drag=null; markDirty(); renderProps(); } });

  function inp(label, val, oninput, type){
    var id = 'p_' + label.replace(/[^a-z]/gi,'');
    return '<label>'+label+'</label><input id="'+id+'" type="'+(type||'text')+'" value="'+esc(val)+'">';
  }
  function renderProps(){
    var p = document.getElementById('props');
    var el = SEL ? elById(SEL) : null;
    if (!el){ p.innerHTML = '<p style="margin:0;color:#9ca3af;">要素をクリックすると、ここで書式を変更できます。</p>'; return; }
    var h = '<div style="font-weight:800;color:#5b2a1c;margin-bottom:4px;">'+({text:'テキスト',rect:'四角',orbis:'オービス',leaf:'紅葉',idrow:'記入者欄',legend:'凡例',table:'記入表'}[el.kind]||el.kind)+'</div>';
    h += '<div class="row"><div><label>X(mm)</label><input type="number" data-k="x" value="'+el.x+'"></div><div><label>Y(mm)</label><input type="number" data-k="y" value="'+el.y+'"></div></div>';
    h += '<div class="row"><div><label>幅</label><input type="number" data-k="w" value="'+el.w+'"></div><div><label>高さ</label><input type="number" data-k="h" value="'+el.h+'"></div></div>';
    if (el.kind==='text'){
      h += '<label>文字</label><textarea data-k="text" rows="4">'+esc(el.text||'')+'</textarea>';
      h += '<div class="row"><div><label>サイズ(pt)</label><input type="number" step="0.5" data-k="size" value="'+(el.size||12)+'"></div><div><label>色</label><input type="color" data-k="color" value="'+(el.color||'#2b241f')+'"></div></div>';
      h += '<div class="row"><div><label>太字</label><select data-k="bold"><option value="0"'+(el.bold?'':' selected')+'>標準</option><option value="1"'+(el.bold?' selected':'')+'>太字</option></select></div>';
      h += '<div><label>横位置</label><select data-k="align"><option value="left"'+(el.align==='left'?' selected':'')+'>左</option><option value="center"'+(el.align==='center'?' selected':'')+'>中央</option><option value="right"'+(el.align==='right'?' selected':'')+'>右</option></select></div></div>';
      h += '<label>縦位置</label><select data-k="valign"><option value="top"'+(el.valign==='top'?' selected':'')+'>上</option><option value="middle"'+(el.valign==='middle'?' selected':'')+'>中央</option><option value="bottom"'+(el.valign==='bottom'?' selected':'')+'>下</option></select>';
    }
    if (el.kind==='text' || el.kind==='rect'){
      h += '<div class="row"><div><label>背景色</label><input type="color" data-k="fill" value="'+(el.fill||'#ffffff')+'"></div><div><label>背景</label><select data-k="fillon"><option value="0"'+(el.fill?'':' selected')+'>なし</option><option value="1"'+(el.fill?' selected':'')+'>あり</option></select></div></div>';
      h += '<div class="row"><div><label>枠線色</label><input type="color" data-k="line" value="'+(el.line||'#8a4a26')+'"></div><div><label>枠線</label><select data-k="lineon"><option value="0"'+(el.line?'':' selected')+'>なし</option><option value="1"'+(el.line?' selected':'')+'>あり</option></select></div></div>';
      h += '<label>角丸(mm)</label><input type="number" step="0.2" data-k="radius" value="'+(el.radius||0)+'">';
    }
    if (el.kind==='leaf') h += '<label>色</label><input type="color" data-k="tint" value="'+(el.tint||'#b8531d')+'">';
    if (el.kind==='legend'){
      for (var i=0;i<3;i++) h += '<label>凡例'+(i+1)+'</label><input type="text" data-k="items'+i+'" value="'+esc((el.items||['','',''])[i])+'">';
      h += '<label>サイズ(pt)</label><input type="number" step="0.5" data-k="size" value="'+(el.size||10)+'">';
    }
    if (el.kind==='table'){
      for (var j=0;j<3;j++) h += '<label>行'+(j+1)+'ラベル</label><input type="text" data-k="rowLabels'+j+'" value="'+esc((el.rowLabels||['','',''])[j])+'">';
      h += '<div class="row"><div><label>開始日</label><input type="date" data-k="startDate" value="'+(el.startDate||'')+'"></div><div><label>終了日</label><input type="date" data-k="endDate" value="'+(el.endDate||'')+'"></div></div>';
      h += '<label>1段目の日数（0＝横一列）</label><input type="number" data-k="split" value="'+(el.split||0)+'">';
      h += '<div class="row"><div><label>記入例列</label><select data-k="example"><option value="1"'+(el.example!==false?' selected':'')+'>あり</option><option value="0"'+(el.example===false?' selected':'')+'>なし</option></select></div>';
      h += '<div><label>押印行</label><select data-k="stampRow"><option value="1"'+(el.stampRow!==false?' selected':'')+'>あり</option><option value="0"'+(el.stampRow===false?' selected':'')+'>なし</option></select></div></div>';
      h += '<label>文字サイズ倍率</label><input type="number" step="0.05" data-k="tScale" value="'+(el.tScale||1)+'">';
    }
    h += '<div style="display:flex;gap:6px;flex-wrap:wrap;"><button data-act="front">前面へ</button><button data-act="back">背面へ</button><button data-act="dup">複製</button><button data-act="del" style="color:#b91c1c;">削除</button></div>';
    p.innerHTML = h;
    p.querySelectorAll('[data-k]').forEach(function(node){
      var ev = (node.tagName==='SELECT'||node.type==='color'||node.type==='date') ? 'change' : 'input';
      node.addEventListener(ev, function(){
        var k = node.getAttribute('data-k'), v = node.value;
        if (k==='fillon'){ el.fill = v==='1' ? (p.querySelector('[data-k="fill"]').value||'#ffffff') : ''; }
        else if (k==='lineon'){ el.line = v==='1' ? (p.querySelector('[data-k="line"]').value||'#8a4a26') : ''; }
        else if (k==='fill'){ if (p.querySelector('[data-k="fillon"]').value==='1') el.fill = v; }
        else if (k==='line'){ if (p.querySelector('[data-k="lineon"]').value==='1') el.line = v; }
        else if (k==='bold'){ el.bold = v==='1'; }
        else if (k==='example' || k==='stampRow'){ el[k] = v==='1'; }
        else if (['x','y','w','h','size','radius','split','tScale'].indexOf(k)>=0){ el[k] = parseFloat(v)||0; }
        else if (k.indexOf('items')===0){ el.items = el.items||['','','']; el.items[+k.slice(5)] = v; }
        else if (k.indexOf('rowLabels')===0){ el.rowLabels = el.rowLabels||['','','']; el.rowLabels[+k.slice(9)] = v; }
        else { el[k] = v; }
        markDirty(); render();
      });
    });
    p.querySelectorAll('[data-act]').forEach(function(b){
      b.addEventListener('click', function(){
        var a = b.getAttribute('data-act'), idx = DOC.els.indexOf(el);
        if (a==='del'){ DOC.els.splice(idx,1); SEL=null; }
        else if (a==='dup'){ var c = JSON.parse(JSON.stringify(el)); c.id=uid(); c.x+=4; c.y+=4; DOC.els.push(c); SEL=c.id; }
        else if (a==='front'){ DOC.els.splice(idx,1); DOC.els.push(el); }
        else if (a==='back'){ DOC.els.splice(idx,1); DOC.els.unshift(el); }
        markDirty(); render();
      });
    });
  }

  var dirtyT = null;
  function markDirty(){ if (dirtyT) clearTimeout(dirtyT); dirtyT = setTimeout(save, 1200); }
  async function save(){
    var m = document.getElementById('msg');
    try {
      var res = await fetch(API_PATH, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ data: DOC }) });
      m.style.color = res.ok ? '#166534' : '#b91c1c';
      m.textContent = res.ok ? '保存しました' : '保存に失敗しました';
    } catch(e){ m.style.color='#b91c1c'; m.textContent='保存に失敗しました'; }
  }
  function encodeData(o){ return encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(o))))); }

  function addEl(el){ el.id = uid(); DOC.els.push(el); SEL = el.id; markDirty(); render(); }
  document.getElementById('add-text').addEventListener('click', function(){ addEl({ kind:'text', x:20, y:20, w:80, h:16, text:'テキスト', size:14, color:'#2b241f', align:'left', valign:'top' }); });
  document.getElementById('add-rect').addEventListener('click', function(){ addEl({ kind:'rect', x:20, y:20, w:60, h:24, fill:'#f2c14e', line:'#c98f27', lineW:0.5, radius:1.6 }); });
  document.getElementById('add-orbis').addEventListener('click', function(){ addEl({ kind:'orbis', x:20, y:20, w:26, h:26 }); });
  document.getElementById('add-leaf').addEventListener('click', function(){ addEl({ kind:'leaf', x:20, y:20, w:12, h:12, tint:'#b8531d' }); });
  document.getElementById('tpl-a').addEventListener('click', function(){ if (confirm('案1のテンプレートを読み込みます。現在の配置は置き換わります。よろしいですか？')){ loadTpl('blocks'); } });
  document.getElementById('tpl-b').addEventListener('click', function(){ if (confirm('案2のテンプレートを読み込みます。現在の配置は置き換わります。よろしいですか？')){ loadTpl('row'); } });
  async function loadTpl(kind){
    var res = await fetch(API_PATH + '?tpl=' + kind);
    var j = await res.json(); DOC = j.data; SEL = null; markDirty(); fitScale(); render();
  }
  document.getElementById('btn-save').addEventListener('click', save);
  document.getElementById('btn-print').addEventListener('click', async function(){ await save(); window.open(PRINT_PATH + '?d=' + encodeData(DOC) + '&auto=1', '_blank'); });
  document.getElementById('btn-pptx').addEventListener('click', async function(){
    var m = document.getElementById('msg'); m.style.color='#5b2a1c'; m.textContent='PowerPoint を生成中…';
    try { await pxExport(DOC); m.style.color='#166534'; m.textContent='書き出しました'; }
    catch(e){ m.style.color='#b91c1c'; m.textContent = (e && e.message) ? e.message : '書き出しに失敗しました'; }
  });
  document.getElementById('canvas').addEventListener('pointerdown', function(ev){
    if (ev.target === this){ SEL = null; render(); }
  });

  window.addEventListener('resize', function(){ fitScale(); });
  fitScale(); render();
  </script>`;
}
