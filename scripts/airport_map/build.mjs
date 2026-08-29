// 羽田空港定額マップ用の SVG パスを生成する（ビルド時に1回だけ実行）。
//
//   東京23区 ＋ 武蔵野市・三鷹市 の行政区域ポリゴンを smartnews-smri/japan-topography
//   （国土数値情報 N03 を 1% 簡略化したもの）から取得し、Douglas-Peucker で更に軽く間引いて
//   ローカル座標の SVG パスへ変換、system/src/html/airport_map_paths.ts に定数として書き出す。
//
//   実行: node scripts/airport_map/build.mjs
//   ネットワーク必須（GitHub raw から GeoJSON を1ファイル取得）。出力は静的なので本番実行時のリクエストは無い。
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '../../system/src/html/airport_map_paths.ts');
const SRC = 'https://raw.githubusercontent.com/smartnews-smri/japan-topography/main/data/municipality/geojson/s0010/N03-21_13_210101.json';

// JISコード(N03_007) → 表示ラベル。羽田空港定額の対象/対象外エリア（対象外はDB側で判定）
const AREAS = new Map([
  ['13101', '千代田区'], ['13102', '中央区'], ['13103', '港区'], ['13104', '新宿区'],
  ['13105', '文京区'], ['13106', '台東区'], ['13107', '墨田区'], ['13108', '江東区'],
  ['13109', '品川区'], ['13110', '目黒区'], ['13111', '大田区'], ['13112', '世田谷区'],
  ['13113', '渋谷区'], ['13114', '中野区'], ['13115', '杉並区'], ['13116', '豊島区'],
  ['13117', '北区'], ['13118', '荒川区'], ['13119', '板橋区'], ['13120', '練馬区'],
  ['13121', '足立区'], ['13122', '葛飾区'], ['13123', '江戸川区'],
  ['13203', '武蔵野市'], ['13204', '三鷹市'],
]);

// ---- ジオメトリユーティリティ --------------------------------------------------
function ringArea(ring) {
  let a = 0;
  for (let i = 0, n = ring.length, j = n - 1; i < n; j = i++) {
    a += (ring[j][0] * ring[i][1]) - (ring[i][0] * ring[j][1]);
  }
  return a / 2;
}

function ringCentroid(ring) {
  let x = 0, y = 0, a = 0;
  for (let i = 0, n = ring.length, j = n - 1; i < n; j = i++) {
    const f = (ring[j][0] * ring[i][1]) - (ring[i][0] * ring[j][1]);
    x += (ring[j][0] + ring[i][0]) * f;
    y += (ring[j][1] + ring[i][1]) * f;
    a += f;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-12) {
    const mx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
    const my = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    return [mx, my];
  }
  return [x / (6 * a), y / (6 * a)];
}

function pointInRing(pt, ring) {
  let inside = false;
  for (let i = 0, n = ring.length, j = n - 1; i < n; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

// Douglas-Peucker（緯度経度の度単位で epsilon 指定）
function simplify(points, eps) {
  if (points.length < 5) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let maxD = 0, idx = -1;
    const [ax, ay] = points[s];
    const [bx, by] = points[e];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy || 1e-20;
    for (let i = s + 1; i < e; i++) {
      const [px, py] = points[i];
      const t = ((px - ax) * dx + (py - ay) * dy) / len2;
      const cx = ax + t * dx, cy = ay + t * dy;
      const d = (px - cx) ** 2 + (py - cy) ** 2;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (idx !== -1 && Math.sqrt(maxD) > eps) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

// ---- 取得 -----------------------------------------------------------------
const res = await fetch(SRC);
if (!res.ok) throw new Error(`source HTTP ${res.status}`);
const gj = await res.json();

const byCode = new Map();
for (const f of gj.features) {
  const code = f.properties?.N03_007;
  if (!AREAS.has(code)) continue;
  const g = f.geometry;
  const groups = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  const rings = groups.map(poly => poly[0]).filter(r => r && r.length >= 4); // 穴は無視
  const prev = byCode.get(code) ?? [];
  byCode.set(code, prev.concat(rings));
}

const EPS = 0.00035; // 約28m。1%簡略版を更に軽く整える
const COORD_DP = 1;

const raw = [];
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
let latSum = 0, latCount = 0;

for (const [code, label] of AREAS) {
  const polys = (byCode.get(code) ?? []).slice().sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)));
  if (!polys.length) throw new Error(`no geometry for ${code} ${label}`);
  const maxA = Math.abs(ringArea(polys[0]));
  const kept = polys.filter((r, i) => i === 0 || Math.abs(ringArea(r)) > maxA * 0.015).slice(0, 8);
  const simplified = kept.map(r => simplify(r, EPS)).filter(r => r.length >= 4);
  for (const r of simplified) for (const [lon, lat] of r) {
    if (lon < minX) minX = lon; if (lon > maxX) maxX = lon;
    if (lat < minY) minY = lat; if (lat > maxY) maxY = lat;
    latSum += lat; latCount++;
  }
  raw.push({ code, label, rings: simplified });
  process.stderr.write(`  ${label} (${code}): ${polys.length}poly -> ${simplified.length}, ${simplified.reduce((s, r) => s + r.length, 0)}pts\n`);
}

// 羽田空港（大田区の東端・滑走路あたりの目安）
const HANEDA = [139.7825, 35.5494];
if (HANEDA[0] > maxX) maxX = HANEDA[0];
if (HANEDA[1] < minY) minY = HANEDA[1];

// ---- 投影（正距円筒・緯度補正）----------------------------------------------
const latMid = latSum / latCount;
const kx = Math.cos((latMid * Math.PI) / 180);
const PAD = 6;
const W = 1000;
const innerW = W - PAD * 2;
const scale = innerW / ((maxX - minX) * kx);
const H = (maxY - minY) * scale + PAD * 2;

const px = (lon) => PAD + (lon - minX) * kx * scale;
const py = (lat) => PAD + (maxY - lat) * scale; // y反転

function toPath(ring) {
  let d = '';
  for (let i = 0; i < ring.length; i++) {
    d += (i === 0 ? 'M' : 'L') + px(ring[i][0]).toFixed(COORD_DP) + ' ' + py(ring[i][1]).toFixed(COORD_DP);
  }
  return d + 'Z';
}

const out = raw.map(({ code, label, rings }) => {
  const d = rings.map(toPath).join(' ');
  const big = rings.slice().sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)))[0];
  let c = ringCentroid(big);
  if (!pointInRing(c, big)) {
    c = [big.reduce((s, p) => s + p[0], 0) / big.length, big.reduce((s, p) => s + p[1], 0) / big.length];
  }
  return { key: code, label, d, lx: +px(c[0]).toFixed(COORD_DP), ly: +py(c[1]).toFixed(COORD_DP) };
});

const haneda = { x: +px(HANEDA[0]).toFixed(COORD_DP), y: +py(HANEDA[1]).toFixed(COORD_DP) };

// 目的地マーカー。haneda は地図内（大田区）、narita/tdr は地図の東縁（都外なので枠の外側方向）に置く。
const findLy = (code, fb) => (out.find(o => o.key === code)?.ly ?? fb);
const EDGE_X = +(W - 24).toFixed(COORD_DP); // 円(r=14)が枠内に収まる右端
const MARKERS = {
  haneda: { x: haneda.x, y: haneda.y, label: '羽田空港', edge: false },
  // 成田は北東〜東。葛飾区の緯度あたりから更に上、右端。
  narita: { x: EDGE_X, y: +(findLy('13122', H * 0.28) - 34).toFixed(COORD_DP), label: '成田空港', edge: true },
  // ディズニー(浦安)は江戸川区の南東。江戸川区ラベルより下・右端（ラベルと重ならない位置）。
  tdr: { x: EDGE_X, y: +(findLy('13123', H * 0.58) + 62).toFixed(COORD_DP), label: 'ディズニー', edge: true },
};

const body = `// 自動生成ファイル — 手で編集しない。再生成: node scripts/airport_map/build.mjs
// 東京23区＋武蔵野市・三鷹市の行政区域（国土数値情報 N03 の1%簡略版, smartnews-smri/japan-topography）を
// Douglas-Peucker(eps≈${EPS}deg)で更に間引き、正距円筒図法でローカル座標へ投影した SVG パス。
// key は JISコード(N03_007)。定額の対象/対象外は DB(airport_flat_fares) 側で判定する。

export interface AirportMapArea {
  key: string;   // JISコード（DBの area_key と一致）
  label: string; // 区・市名
  d: string;     // SVG path（複数リングはスペース区切りで連結）
  lx: number;    // ラベル基準 X
  ly: number;    // ラベル基準 Y
}

export interface AirportMapMarker { x: number; y: number; label: string; edge: boolean; }

export const AIRPORT_MAP_VIEWBOX = '0 0 ${W.toFixed(1)} ${H.toFixed(1)}';
export const AIRPORT_MAP_W = ${W.toFixed(1)};
export const AIRPORT_MAP_H = ${H.toFixed(1)};

// 羽田空港マーカーの座標（大田区東端・滑走路付近の目安）
export const AIRPORT_MAP_HANEDA = { x: ${haneda.x}, y: ${haneda.y} };

// 目的地ごとのマーカー（haneda|narita|tdr）。edge=true は地図外方向（東縁）に置く簡易マーカー。
export const AIRPORT_MAP_MARKERS: Record<string, AirportMapMarker> = ${JSON.stringify(MARKERS, null, 2)};

export const AIRPORT_MAP_AREAS: AirportMapArea[] = ${JSON.stringify(out, null, 2)};
`;

writeFileSync(OUT, body);
process.stderr.write(`\nwrote ${OUT}\n  viewBox 0 0 ${W.toFixed(1)} ${H.toFixed(1)} / ${out.length} areas / ${(body.length / 1024).toFixed(1)}KB\n`);
