// 高速料金「会社負担マップ」用の SVG パスを生成する（ビルド時に1回だけ実行）。
//
//   関東の高速道路網を OpenStreetMap(Overpass) から取得し、会社負担表(benri_toll_rows)に
//   出てくる放射路線ごとに「都心側の端 〜 会社負担の境界IC」までを緑区間として切り出す。
//   簡略化してローカル座標の SVG パスへ変換し system/src/html/highway_map_paths.ts に書き出す。
//
//   実行: node scripts/highway_map/build.mjs
//   ネットワーク必須（Overpass へ1回POST）。出力は静的なので本番実行時のリクエストは無い。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '../../system/src/html/highway_map_paths.ts');
const CACHE = join(__dirname, 'kanto_osm.json'); // 取得結果のローカルキャッシュ（再実行を速く・APIに優しく）
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const BBOX = [34.85, 138.85, 36.85, 141.05]; // s,w,n,e

// 会社負担表の路線 → 地図上のキーと OSM name（; 区切りのいずれかに含まれれば一致）
const ROUTES = [
  { key: 'tomei',        label: '東名',        osm: ['東名高速道路'] },
  { key: 'chuo',         label: '中央道',      osm: ['中央自動車道'] },
  { key: 'kanetsu',      label: '関越道',      osm: ['関越自動車道'] },
  { key: 'tohoku',       label: '東北道',      osm: ['東北自動車道'] },
  { key: 'joban',        label: '常磐道',      osm: ['常磐自動車道'] },
  { key: 'higashikanto', label: '東関東道',    osm: ['東関東自動車道'] },
  { key: 'keno',         label: '圏央道',      osm: ['首都圏中央連絡自動車道'] },
  { key: 'aqualine',     label: 'アクアライン', osm: ['東京湾アクアライン', '東京湾アクアライン連絡道'] },
  { key: 'daisan',       label: '第三京浜',    osm: ['第三京浜道路'] },
  { key: 'yokohama_shindo', label: '横浜新道', osm: ['横浜新道'] },
  { key: 'yokoyoko',     label: '横浜横須賀道路', osm: ['横浜横須賀道路'] },
  { key: 'odawara_atsugi', label: '小田原厚木道路', osm: ['小田原厚木道路'] },
  { key: 'tateyama',     label: '館山道',      osm: ['館山自動車道'] },
  { key: 'keiyo',        label: '京葉道路',    osm: ['京葉道路'] },
];
const ROUTE_OSM = new Set(ROUTES.flatMap(r => r.osm));
const TOKYO_LL = [139.767, 35.681]; // 日本橋あたり（会社負担の「都心側」判定に使う）

// ---- 取得 ----------------------------------------------------------------
async function fetchOsm() {
  if (existsSync(CACHE)) {
    process.stderr.write(`cache hit: ${CACHE}\n`);
    return JSON.parse(readFileSync(CACHE, 'utf8'));
  }
  const query = `[out:json][timeout:180];
(
  way["highway"="motorway"](${BBOX.join(',')});
  node["highway"="motorway_junction"](${BBOX.join(',')});
  node["barrier"="toll_booth"](${BBOX.join(',')});
);
out geom;`;
  process.stderr.write('fetching Overpass ...\n');
  const res = await fetch(OVERPASS, { method: 'POST', body: query });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  const json = await res.json();
  writeFileSync(CACHE, JSON.stringify(json));
  return json;
}

// ---- ジオメトリユーティリティ --------------------------------------------
function simplify(points, eps) {
  if (points.length < 5) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let maxD = 0, idx = -1;
    const [ax, ay] = points[s], [bx, by] = points[e];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy || 1e-20;
    for (let i = s + 1; i < e; i++) {
      const [px, py] = points[i];
      const t = ((px - ax) * dx + (py - ay) * dy) / len2;
      const cx = ax + t * dx, cy = ay + t * dy;
      const d = (px - cx) ** 2 + (py - cy) ** 2;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (idx !== -1 && Math.sqrt(maxD) > eps) { keep[idx] = 1; stack.push([s, idx], [idx, e]); }
  }
  return points.filter((_, i) => keep[i]);
}

const rkey = (lon, lat) => `${lat.toFixed(4)},${lon.toFixed(4)}`;
const chainLen = (pts) => {
  let s = 0;
  for (let i = 1; i < pts.length; i++) { const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1]; s += Math.sqrt(dx * dx + dy * dy); }
  return s;
};

const distPtChain = (chain, lonlat) => nearestIndex(chain, lonlat).dist;

// ways（[lon,lat] 群）を端点でつないでトレイル候補を列挙し、用途に合う1本を返す。
//   from/to 指定あり → from と to の両方に最も近づけるトレイル
//   whole            → 最長トレイル
function buildChain(ways, fromPt, toPt) {
  if (!ways.length) return [];
  const ends = ways.map(w => [rkey(w[0][0], w[0][1]), rkey(w[w.length - 1][0], w[w.length - 1][1])]);
  const adj = new Map();
  const push = (k, i) => { if (!adj.has(k)) adj.set(k, []); adj.get(k).push(i); };
  ends.forEach(([a, b], i) => { push(a, i); push(b, i); });

  function walkFrom(startKey, firstWay) {
    const used = new Set();
    let pts = [];
    let curKey = startKey;
    let forced = firstWay;
    while (true) {
      let cand = (adj.get(curKey) || []).filter(i => !used.has(i));
      if (forced != null) { cand = cand.filter(i => i === forced); forced = null; }
      if (!cand.length) break;
      const i = cand[0];
      used.add(i);
      const [a, b] = ends[i];
      const seg = (a === curKey) ? ways[i].slice() : ways[i].slice().reverse();
      if (pts.length) seg.shift();
      pts = pts.concat(seg);
      curKey = (a === curKey) ? b : a;
    }
    return pts;
  }

  // 候補: 全端点から walk。分岐に強くするため、各端点の各初手 way でも walk。
  const trails = [];
  for (const [k, list] of adj) {
    trails.push(walkFrom(k));
    if (list.length > 1) for (const w of list) trails.push(walkFrom(k, w));
  }
  const good = trails.filter(t => t.length >= 2);
  if (!good.length) return [];

  const D = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const span = (t) => D(t[0], t[t.length - 1]); // 端点間の直線距離（往復トレイルは小さくなる）

  if (fromPt && toPt) {
    // 2端が from / to にそれぞれ近い（どちら向きでも可）トレイルを選ぶ
    const cost = (t) => Math.min(
      D(t[0], fromPt) + D(t[t.length - 1], toPt),
      D(t[t.length - 1], fromPt) + D(t[0], toPt),
    ) - 0.15 * span(t); // 長く伸びている方を気持ち優遇
    good.sort((p, q) => cost(p) - cost(q));
    return good[0];
  }
  // whole: 端点が最も離れている（＝往復でない）トレイル
  good.sort((p, q) => span(q) - span(p) || chainLen(q) - chainLen(p));
  return good[0];
}

// ---- メイン ------------------------------------------------------------
const osm = await fetchOsm();
const els = osm.elements;
const ways = els.filter(e => e.type === 'way' && e.geometry && e.geometry.length >= 2);
const nodes = els.filter(e => e.type === 'node');

// 路線ごとに way を集める（[lon,lat] 配列に変換）
const norm = (name) => (name || '').split(';').map(s => s.replace(/（.*?）/g, '').trim());
const routeWays = new Map(ROUTES.map(r => [r.key, []]));
const baseWays = [];
for (const w of ways) {
  const parts = norm(w.tags && w.tags.name);
  const pts = w.geometry.map(g => [g.lon, g.lat]);
  let matched = null;
  for (const r of ROUTES) if (r.osm.some(o => parts.includes(o))) { matched = r.key; break; }
  if (matched) routeWays.get(matched).push(pts);
  else if (!(w.tags && /^首都高速/.test(w.tags.name || ''))) baseWays.push(pts);
  // 首都高は描画が濃くなりすぎるのでベース層からも除外（別途 shutoko 層で薄く）
}
const shutokoWays = ways.filter(w => /^首都高速/.test((w.tags && w.tags.name) || '')).map(w => w.geometry.map(g => [g.lon, g.lat]));

// ジャンクション/料金所ノード。全角ＩＣ/ＪＣＴ・空白のゆれを吸収した正規化キーでも引けるようにする
const zen2han = (s) => s.replace(/[Ａ-Ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
const jnorm = (s) => zen2han(String(s || '')).replace(/\s/g, '').replace(/(IC|JCT|ジャンクション|本線料金所|料金所|入口|出口|スマートIC|PA|SA)$/g, '');
const junctions = new Map();  // 原名 -> [lon,lat]
const jindex = new Map();     // 正規化名 -> [lon,lat]（最初のものを採用）
for (const n of nodes) {
  const nm = (n.tags && (n.tags.name || n.tags['name:ja'])) || '';
  if (!nm) continue;
  if (!junctions.has(nm)) junctions.set(nm, [n.lon, n.lat]);
  const k = jnorm(nm);
  if (k && !jindex.has(k)) jindex.set(k, [n.lon, n.lat]);
}
// 目的の地点名 → 座標。完全一致 → 正規化一致 → 前方一致 の順で探す
function resolveJ(name) {
  if (!name) return null;
  if (junctions.has(name)) return junctions.get(name);
  const k = jnorm(name);
  if (jindex.has(k)) return jindex.get(k);
  for (const [ik, v] of jindex) if (ik.startsWith(k) || k.startsWith(ik)) return v;
  return null;
}

// 路線ごとに最長チェーン → 会社負担境界で切り出し
// coverage.json: [{ key, from(境界IC), to(都心側端), fee, label }]
const coverage = JSON.parse(readFileSync(join(__dirname, 'coverage.json'), 'utf8'));
const covByKey = new Map(coverage.map(c => [c.key, c]));

function nearestIndex(chain, lonlat) {
  let bi = 0, bd = Infinity;
  for (let i = 0; i < chain.length; i++) {
    const dx = chain[i][0] - lonlat[0], dy = chain[i][1] - lonlat[1];
    const d = dx * dx + dy * dy;
    if (d < bd) { bd = d; bi = i; }
  }
  return { idx: bi, dist: Math.sqrt(bd) };
}

// 点から折れ線への最短距離と、折れ線上の位置 t(0..1)
function nearestOnPolyline(chain, p) {
  let best = { dist: Infinity, t: 0 };
  for (let i = 0; i < chain.length - 1; i++) {
    const a = chain[i], b = chain[i + 1];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const L2 = dx * dx + dy * dy || 1e-20;
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
    if (d < best.dist) best = { dist: d, t: (i + t) / (chain.length - 1) };
  }
  return best;
}

// IC/JCT・本線料金所ノード（名前つき）
const icNodes = nodes.filter(n => {
  const t = n.tags || {};
  if (t.highway === 'motorway_junction') return !!(t.name || t['name:ja']);
  if (t.barrier === 'toll_booth' && /本線料金所$/.test(t.name || '')) return true;
  return false;
});
const cleanIc = (s) => zen2han(String(s || ''))
  .replace(/[（(](上り|下り|外廻り|内廻り|外回り|内回り|上|下)[）)]?.*$/, '') // 方向表記以降を除去
  .replace(/\s*[（(][^）)]*[）)]\s*/g, '')                                   // 残りの括弧
  .replace(/(入口|出口|始点|終点)$/, '')
  .replace(/[;,、/／・].*$/, '')                                             // 「A;B」「A,スマートIC」「A/B」「A・PA」→ A
  .replace(/\s+/g, '')
  .trim();
const icDedupKey = (nm) => nm.replace(/(本線料金所|スマートIC|SIC|IC|JCT|PA|SA|TB)$/, '');
// route の chain（lon/lat）に沿った IC 一覧を作る（順路・重複整理）
function icsForChain(chain) {
  const cand = [];
  for (const n of icNodes) {
    const { dist, t } = nearestOnPolyline(chain, [n.lon, n.lat]);
    if (dist < 0.0032) cand.push({ name: cleanIc(n.tags.name || n.tags['name:ja']), t, lon: n.lon, lat: n.lat });
  }
  cand.sort((a, b) => a.t - b.t);
  const out = [], seen = new Set();
  for (const c of cand) {
    if (!c.name) continue;
    const k = icDedupKey(c.name);
    if (seen.has(k)) continue;
    if (out.length && c.t - out[out.length - 1].t < 0.017) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

const routesOut = [];
for (const r of ROUTES) {
  const cov = covByKey.get(r.key);
  const fj = cov && !cov.whole ? resolveJ(cov.from) : null;
  const tj = cov && !cov.whole ? resolveJ(cov.to) : null;
  if (cov && !cov.whole && !(fj && tj)) {
    process.stderr.write(`  ?? ${r.label}: JCT未マッチ from=${cov.from}:${!!fj} to=${cov.to}:${!!tj}\n`);
  }
  const chain0 = buildChain(routeWays.get(r.key), fj, tj);
  if (chain0.length < 2) { process.stderr.write(`  !! ${r.label}: チェーン構築失敗\n`); continue; }
  const chain = simplify(chain0, 0.0010);
  let greenIdx = null; // [a,b]
  let fromPt = null, toPt = null;
  if (cov && cov.whole) {
    greenIdx = [0, chain.length - 1];
  } else if (fj && tj) {
    // 会社負担 = 境界IC(from) から「都心に一番近いチェーン端」まで。
    // 料金所ノードが必ずしもチェーン上に無いので、都心側の端で切る方が確実。
    const a = nearestIndex(chain, fj).idx;
    const d0 = (chain[0][0] - TOKYO_LL[0]) ** 2 + (chain[0][1] - TOKYO_LL[1]) ** 2;
    const dN = (chain[chain.length - 1][0] - TOKYO_LL[0]) ** 2 + (chain[chain.length - 1][1] - TOKYO_LL[1]) ** 2;
    const tokyoEnd = d0 <= dN ? 0 : chain.length - 1;
    greenIdx = [Math.min(a, tokyoEnd), Math.max(a, tokyoEnd)];
    fromPt = fj; toPt = tj;
    const dbgN = nearestIndex(chain, tj).dist;
    process.stderr.write(`     ${r.label} chainEndTokyoDist=${Math.sqrt(Math.min(d0, dN)).toFixed(3)} tollgateOffChain=${dbgN.toFixed(3)}\n`);
  }
  routesOut.push({ ...r, chain, greenIdx, fromName: (cov && cov.from) || null, toName: (cov && cov.to) || null, fee: (cov && cov.fee) || null, fromPt, toPt });
  process.stderr.write(`  ${r.label}: ways=${routeWays.get(r.key).length} chain=${chain0.length}->${chain.length} green=${greenIdx ? greenIdx[1] - greenIdx[0] : '-'}\n`);
}

// ---- 投影 -------------------------------------------------------------
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, latSum = 0, latN = 0;
const bump = (lon, lat) => { if (lon < minX) minX = lon; if (lon > maxX) maxX = lon; if (lat < minY) minY = lat; if (lat > maxY) maxY = lat; latSum += lat; latN++; };
routesOut.forEach(r => r.chain.forEach(([lon, lat]) => bump(lon, lat)));
// ベース層は範囲を広げすぎないよう、路線範囲に入るものだけ後で描く（範囲計算には使わない）

const latMid = latSum / latN;
const kx = Math.cos(latMid * Math.PI / 180);
const PAD = 14;
const W = 1100;
const scale = (W - PAD * 2) / ((maxX - minX) * kx);
const H = (maxY - minY) * scale + PAD * 2;
const px = (lon) => +(PAD + (lon - minX) * kx * scale).toFixed(1);
const py = (lat) => +(PAD + (maxY - lat) * scale).toFixed(1);
const inView = ([lon, lat]) => lon >= minX - 0.15 && lon <= maxX + 0.15 && lat >= minY - 0.15 && lat <= maxY + 0.15;

const toPath = (chain) => chain.map((p, i) => (i ? 'L' : 'M') + px(p[0]) + ' ' + py(p[1])).join('');

const routesJson = routesOut.map(r => {
  const full = toPath(r.chain);
  const green = r.greenIdx ? toPath(r.chain.slice(r.greenIdx[0], r.greenIdx[1] + 1)) : null;
  const ics = icsForChain(r.chain).map(c => ({ name: c.name, x: px(c.lon), y: py(c.lat) }));
  // 路線の描画範囲（クリック時のズーム用）
  const xs = r.chain.map(p => px(p[0])), ys = r.chain.map(p => py(p[1]));
  const bbox = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  return {
    key: r.key, label: r.label, d: full, green,
    fee: r.fee, fromName: r.fromName, toName: r.toName,
    fromXY: r.fromPt ? { x: px(r.fromPt[0]), y: py(r.fromPt[1]) } : null,
    toXY: r.toPt ? { x: px(r.toPt[0]), y: py(r.toPt[1]) } : null,
    labelXY: (() => { const m = r.chain[Math.floor(r.chain.length * (r.greenIdx ? 0.5 : 0.3))]; return { x: px(m[0]), y: py(m[1]) }; })(),
    ics, bbox,
  };
});

const basePaths = baseWays
  .filter(w => w.some(inView))
  .map(w => toPath(simplify(w, 0.0018)))
  .filter(d => d.length > 6);

// 首都高（首都高速◯◯線）は「全線 ～1,300 会社負担」。地図では1つのグループとして扱う（クリックで首都高の会社負担行を表示）
const shutokoInView = shutokoWays.filter(w => w.some(inView));
const shutokoPaths = shutokoInView.map(w => toPath(simplify(w, 0.0016))).filter(d => d.length > 6);
const shBB = (() => {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  shutokoInView.forEach(w => w.forEach(([lo, la]) => { const x = px(lo), y = py(la); if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y; }));
  return { x: a, y: b, w: c - a, h: d - b };
})();
const shutokoLabelXY = { x: +((shBB.x + shBB.w * 0.5)).toFixed(1), y: +((shBB.y + shBB.h * 0.62)).toFixed(1) };

const tokyo = { x: px(139.767), y: py(35.681) }; // 日本橋あたり

const body = `// 自動生成ファイル — 手で編集しない。再生成: node scripts/highway_map/build.mjs
// 関東の高速道路網（OpenStreetMap, © OpenStreetMap contributors, ODbL）を簡略化して
// ローカル座標へ投影した SVG パス。会社負担表(benri_toll_rows)の放射路線ごとに、
// 都心側の端〜会社負担境界IC を green として切り出してある。

export interface HighwayIc { name: string; x: number; y: number; }
export interface HighwayRoute {
  key: string; label: string;
  d: string;            // 路線全体（この地図に入る範囲）
  green: string | null; // 会社負担区間
  fee: string | null;
  fromName: string | null; toName: string | null;
  fromXY: { x: number; y: number } | null;
  toXY: { x: number; y: number } | null;
  labelXY: { x: number; y: number };
  ics: HighwayIc[];                                  // 路線沿いの IC/JCT（順路）
  bbox: { x: number; y: number; w: number; h: number }; // クリック時のズーム範囲
}

export const HIGHWAY_MAP_VIEWBOX = '0 0 ${W} ${H.toFixed(1)}';
export const HIGHWAY_MAP_W = ${W};
export const HIGHWAY_MAP_H = ${+H.toFixed(1)};
export const HIGHWAY_MAP_TOKYO = ${JSON.stringify(tokyo)};
export const HIGHWAY_MAP_BASE: string[] = ${JSON.stringify(basePaths)};

// 首都高（全線 ～1,300 会社負担）。地図では1グループ。key='shutoko'
export const HIGHWAY_MAP_SHUTOKO: string[] = ${JSON.stringify(shutokoPaths)};
export const HIGHWAY_MAP_SHUTOKO_BBOX = ${JSON.stringify(shBB)};
export const HIGHWAY_MAP_SHUTOKO_LABEL = ${JSON.stringify(shutokoLabelXY)};

export const HIGHWAY_MAP_ROUTES: HighwayRoute[] = ${JSON.stringify(routesJson, null, 1)};
`;

writeFileSync(OUT, body);
process.stderr.write(`\nwrote ${OUT}\n  viewBox 0 0 ${W} ${H.toFixed(1)} / routes ${routesJson.length} / base ${basePaths.length} / ${(body.length / 1024).toFixed(1)}KB\n`);
