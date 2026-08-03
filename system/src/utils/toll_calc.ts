// 高速道路料金計算エンジン（普通車ETC・関東+群馬(関越道)）
//
// IC間の料金を1件ずつ手入力するのではなく、IC/JCTをノード・区間をエッジとした
// 道路網グラフを持ち、NEXCO・首都高が公開している「距離比例の公式計算式」を
// そのままコードで再現することで、手入力より遥かに少ないデータ量で
// 営業エリア⇔関東全域＋群馬を計算できるようにしている。
//
// 参考(2026年8月時点。NEXCO東日本公式「料金の額及び徴収期間の公告」およびNEXCO中日本FAQで条文確認済み):
//   NEXCO普通車: (Σ区間距離×単価 × 長距離逓減の乗率 + 150円) × 1.1 を10円単位で四捨五入。
//     単価は標準区間24.6円/km、大都市近郊区間29.52円/km、圏央道は全線29.52円/km。
//     長距離逓減はトリップ全体の距離Dに対する乗率(D>200:0.70+35/D、100<D<=200:0.75+25/D、D<=100:1)を
//     基準額全体に掛ける方式（区間ごとの按分ではない。詳細はcalcNexcoFareのコメント参照）。
//     ただし圏央道は特例で長距離逓減の対象外（距離×29.52円がそのまま加算される）。
//     NEXCO東日本・中日本(・西日本)は「全国料金プール制」で計算上は1事業者として連続課金されるため、
//     会社をまたいでも料金所を出ない限り1つの連続したNEXCO運賃として扱う（後述のグルーピング参照）。
//   首都高普通車: (距離(km)×29.52円 + 150円) × 1.1 を10円単位で四捨五入（公式サイトで確認済み）。
//     下限300円、55.0km以上は上限1,950円（2026年10月改定で単価32.472円・上限2,130円に変更予定）。

export type TollOperator = 'nexco_east' | 'nexco_central' | 'nexco' | 'shutoko' | 'other';
export type TollFormula = 'distance' | 'shutoko' | 'fixed';
export type TollRateZone = 'standard' | 'metro' | 'kenou'; // kenou=圏央道（大都市近郊と同単価だが長距離逓減の対象外）

export type TollRoad = {
  id: number;
  name: string;
  operator: TollOperator;
  rate_zone: TollRateZone;
  formula: TollFormula;
  fixed_fare: number | null;
  fare_cap: number | null; // 中央道(高井戸〜八王子)のETC上限630円のような、区間限定利用時のみの上限料金
};

export type TollNode = {
  id: number;
  name: string;
  kind: 'ic' | 'jct';
  area_tag: string | null;
};

type RoadPointRow = { road_id: number; node_id: number; km_position: number };
type OverrideRow = { from_node_id: number; to_node_id: number; fixed_fare: number; note: string | null };

type Edge = { to: number; roadId: number; distanceKm: number };
type PathEdge = { fromNode: number; toNode: number; roadId: number; distanceKm: number };

export type RouteSegment = {
  roadName: string;
  operator: TollOperator | '特例';
  distanceKm: number;
  fare: number;
  isOverride: boolean;
  note?: string;
};

export type QuoteResult = {
  distanceKm: number;
  segments: RouteSegment[];
  total: number;
};

const NEXCO_RATE_STANDARD = 24.6; // 円/km
const NEXCO_RATE_METRO = 29.52;   // 円/km（大都市近郊区間）
const NEXCO_RATE_KENOU = 29.52;   // 円/km（圏央道。2016年4月以降、会社に関わらず全線この単価に統一）
const NEXCO_TERMINAL_CHARGE = 150; // 円
const TAX_RATE = 1.1;

const SHUTOKO_RATE = 29.52;       // 円/km（2026年10月改定前の現行単価）
const SHUTOKO_TERMINAL_CHARGE = 150;
const SHUTOKO_MIN_FARE = 300;
const SHUTOKO_MAX_FARE = 1950;
const SHUTOKO_MAX_DISTANCE_KM = 55.0;

function round10(yen: number): number {
  return Math.round(yen / 10) * 10;
}

// NEXCO系（距離比例）運賃。edgesは全国料金プール制のもとで連続する区間の内訳
// （NEXCO東日本・中日本(・西日本)をまたいでも会社境界では区切らず、1つの連続した課金として扱う）。
// 公式条文(NEXCO東日本「料金の額及び徴収期間の公告」/NEXCO中日本FAQ)の計算式をそのまま再現する:
//   基準額 = Σ(区間距離 × その区間の単価)  ※逓減前の素の金額（圏央道分は除く。下記参照）
//   トリップ全体の距離 D(圏央道分も含む)が
//     100km以下 : 乗率 = 1
//     100km超200km以下 : 乗率 = 0.75 + 25/D
//     200km超         : 乗率 = 0.70 + 35/D
//   料金 = (基準額 × 乗率 + 圏央道分(距離×29.52円、逓減対象外) + 150円) × 1.1 を10円単位で四捨五入
// （100km・200km地点で乗率が連続的に一致するため、区間ごとの按分ではなく
//   「トリップ全体の距離Dに対する一つの乗率」を基準額全体に掛ける仕様になっている。
//   圏央道は2016年4月以降、長距離逓減の対象外という特例があるため、その区間の基準額は
//   乗率を掛けずにそのまま加算し、Dの計算にだけ距離を含める）
function calcNexcoFare(edges: Array<{ distanceKm: number; rateZone: TollRateZone }>): number {
  let discountableBase = 0;
  let kenouCharge = 0;
  let totalDistance = 0;
  for (const e of edges) {
    totalDistance += e.distanceKm;
    if (e.rateZone === 'kenou') {
      kenouCharge += e.distanceKm * NEXCO_RATE_KENOU;
      continue;
    }
    const rate = e.rateZone === 'metro' ? NEXCO_RATE_METRO : NEXCO_RATE_STANDARD;
    discountableBase += e.distanceKm * rate;
  }
  const multiplier = totalDistance > 200 ? 0.70 + 35 / totalDistance
    : totalDistance > 100 ? 0.75 + 25 / totalDistance
    : 1;
  return round10((discountableBase * multiplier + kenouCharge + NEXCO_TERMINAL_CHARGE) * TAX_RATE);
}

function calcShutokoFare(distanceKm: number): number {
  if (distanceKm >= SHUTOKO_MAX_DISTANCE_KM) return SHUTOKO_MAX_FARE;
  const yen = round10((distanceKm * SHUTOKO_RATE + SHUTOKO_TERMINAL_CHARGE) * TAX_RATE);
  return Math.max(yen, SHUTOKO_MIN_FARE);
}

function buildGraph(points: RoadPointRow[]): Map<number, Edge[]> {
  const byRoad = new Map<number, RoadPointRow[]>();
  for (const p of points) {
    if (!byRoad.has(p.road_id)) byRoad.set(p.road_id, []);
    byRoad.get(p.road_id)!.push(p);
  }
  const adj = new Map<number, Edge[]>();
  const addEdge = (a: number, b: number, roadId: number, dist: number) => {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a)!.push({ to: b, roadId, distanceKm: dist });
  };
  for (const pts of byRoad.values()) {
    pts.sort((a, b) => a.km_position - b.km_position);
    for (let i = 0; i < pts.length - 1; i++) {
      const dist = pts[i + 1].km_position - pts[i].km_position;
      if (dist <= 0) continue; // 同一地点重複などデータ不備はスキップ
      addEdge(pts[i].node_id, pts[i + 1].node_id, pts[i].road_id, dist);
      addEdge(pts[i + 1].node_id, pts[i].node_id, pts[i].road_id, dist);
    }
  }
  return adj;
}

// 単純ダイクストラ法（ノード数が数百規模のため優先度キュー無しのO(n^2)で十分）
function dijkstra(adj: Map<number, Edge[]>, start: number, goal: number): PathEdge[] | null {
  if (start === goal) return [];
  const dist = new Map<number, number>([[start, 0]]);
  const prevEdge = new Map<number, PathEdge>();
  const visited = new Set<number>();
  for (;;) {
    let u = -1;
    let best = Infinity;
    for (const [node, d] of dist) {
      if (!visited.has(node) && d < best) { best = d; u = node; }
    }
    if (u === -1 || u === goal) break;
    visited.add(u);
    for (const e of adj.get(u) ?? []) {
      const nd = best + e.distanceKm;
      if (nd < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nd);
        prevEdge.set(e.to, { fromNode: u, toNode: e.to, roadId: e.roadId, distanceKm: e.distanceKm });
      }
    }
  }
  if (!dist.has(goal)) return null;
  const edges: PathEdge[] = [];
  let cur = goal;
  while (cur !== start) {
    const e = prevEdge.get(cur);
    if (!e) return null;
    edges.unshift(e);
    cur = e.fromNode;
  }
  return edges;
}

// 同一グループ内の道路がすべて同じ事業者ならその事業者名、複数社(NEXCO東日本/中日本混在)なら
// 汎用の'nexco'を表示用に使う（全国料金プール制で1本の請求になるため、内訳表示上は1事業者として見せる）
function displayOperator(roads: Map<number, TollRoad>, group: PathEdge[]): TollOperator {
  const ops = new Set(group.map(e => roads.get(e.roadId)?.operator).filter(Boolean));
  if (ops.size === 1) return [...ops][0] as TollOperator;
  return 'nexco';
}

function flushGroup(roads: Map<number, TollRoad>, group: PathEdge[]): RouteSegment | null {
  if (group.length === 0) return null;
  const road0 = roads.get(group[0].roadId);
  if (!road0) return null;
  const distanceKm = group.reduce((s, e) => s + e.distanceKm, 0);
  const roadNames = Array.from(new Set(group.map(e => roads.get(e.roadId)?.name ?? '')));
  const roadName = roadNames.filter(Boolean).join(' / ');

  if (road0.formula === 'fixed') {
    return { roadName, operator: road0.operator, distanceKm, fare: road0.fixed_fare ?? 0, isOverride: false };
  }
  if (road0.formula === 'shutoko') {
    return { roadName, operator: road0.operator, distanceKm, fare: calcShutokoFare(distanceKm), isOverride: false };
  }

  const edgesForFare = group.map(e => ({
    distanceKm: e.distanceKm,
    rateZone: roads.get(e.roadId)?.rate_zone ?? 'standard' as TollRateZone,
  }));
  let fare = calcNexcoFare(edgesForFare);

  // 区間限定の上限料金（例: 中央道 高井戸〜八王子のETC上限630円）。
  // グループ内の全区間が同じ上限を持つ道路だけで構成される場合のみ適用する
  // （その先の区間まで続く「通過」利用では上限の対象外になるという公式ルールを再現するため）
  const cap0 = roads.get(group[0].roadId)?.fare_cap ?? null;
  if (cap0 !== null && group.every(e => (roads.get(e.roadId)?.fare_cap ?? null) === cap0)) {
    fare = Math.min(fare, cap0);
  }

  return { roadName, operator: displayOperator(roads, group), distanceKm, fare, isOverride: false };
}

export async function loadNetwork(db: D1Database) {
  const [roadsRes, nodesRes, pointsRes, overridesRes] = await Promise.all([
    db.prepare('SELECT id, name, operator, rate_zone, formula, fixed_fare, fare_cap FROM toll_roads').all<TollRoad>(),
    db.prepare('SELECT id, name, kind, area_tag FROM toll_nodes').all<TollNode>(),
    db.prepare('SELECT road_id, node_id, km_position FROM toll_road_points').all<RoadPointRow>(),
    db.prepare('SELECT from_node_id, to_node_id, fixed_fare, note FROM toll_overrides').all<OverrideRow>(),
  ]);
  return {
    roads: new Map((roadsRes.results ?? []).map(r => [r.id, r])),
    nodes: new Map((nodesRes.results ?? []).map(n => [n.id, n])),
    points: pointsRes.results ?? [],
    overrides: overridesRes.results ?? [],
  };
}

const overrideKey = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);

// 連続課金のグルーピングキー。formula='distance'(NEXCO系)は全国料金プール制のため
// 会社(nexco_east/nexco_central)をまたいでも同じグループとして扱う
function billingGroupKey(road: TollRoad): string {
  return road.formula === 'distance' ? 'nexco_distance' : `${road.operator}|${road.formula}`;
}

export async function computeQuote(
  db: D1Database,
  fromNodeId: number,
  toNodeId: number
): Promise<QuoteResult | { error: string }> {
  const { roads, nodes, points, overrides } = await loadNetwork(db);
  if (!nodes.has(fromNodeId) || !nodes.has(toNodeId)) return { error: '出発地・到着地が見つかりません' };
  if (fromNodeId === toNodeId) return { error: '出発地と到着地が同じです' };

  const adj = buildGraph(points);
  const pathEdges = dijkstra(adj, fromNodeId, toNodeId);
  if (!pathEdges || pathEdges.length === 0) {
    return { error: 'この区間を結ぶ経路が見つかりません（データが未整備の可能性があります）' };
  }

  const overrideMap = new Map(overrides.map(o => [overrideKey(o.from_node_id, o.to_node_id), o]));

  const segments: RouteSegment[] = [];
  let pending: PathEdge[] = [];
  const currentGroupKey = (): string | null => {
    if (pending.length === 0) return null;
    const r = roads.get(pending[0].roadId);
    return r ? billingGroupKey(r) : null;
  };
  const flush = () => {
    const seg = flushGroup(roads, pending);
    if (seg) segments.push(seg);
    pending = [];
  };

  for (const edge of pathEdges) {
    const ov = overrideMap.get(overrideKey(edge.fromNode, edge.toNode));
    if (ov) {
      flush();
      segments.push({
        roadName: `${nodes.get(edge.fromNode)?.name ?? ''}〜${nodes.get(edge.toNode)?.name ?? ''}`,
        operator: '特例',
        distanceKm: edge.distanceKm,
        fare: ov.fixed_fare,
        isOverride: true,
        note: ov.note ?? undefined,
      });
      continue;
    }
    const road = roads.get(edge.roadId);
    if (!road) continue;
    const groupKey = billingGroupKey(road);
    if (road.formula === 'fixed' || (currentGroupKey() !== null && currentGroupKey() !== groupKey)) {
      flush();
    }
    pending.push(edge);
    if (road.formula === 'fixed') flush();
  }
  flush();

  const distanceKm = pathEdges.reduce((s, e) => s + e.distanceKm, 0);
  const total = segments.reduce((s, seg) => s + seg.fare, 0);
  return { distanceKm: Math.round(distanceKm * 10) / 10, segments, total };
}
