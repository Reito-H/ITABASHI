// 乗務員クイック検索・LINE報告の「今どの車に乗っているか／車の現在地」用データ
//
// km-operator（スマタク）の map_vehicles/get_map_vehicle（稼働中の全車両: 無線番号・乗務員名・状態・座標）を
// 配車コンソールと同じ中継（utils/km_relay.ts、社内PC経由）で取得し、ホシコンの車両マスタ（vehicles: 無線番号→車番）で
// 車番を補う。km-operator 側の get_vehicle_info には車両番号が入っていないことを実データで確認済み（carInfo=車種・色のみ）。
// 取得結果は Worker のメモリに短時間キャッシュして、画面ごとの60秒ポーリングで km-operator を叩きすぎないようにする。
import type { Env } from '../auth';
import { kmApiGet } from './km_relay';

export type LiveVehicle = {
  radio: string; vehicleId: string; lastName: string; firstName: string; name: string;
  status: number; statusLabel: string; lat: number; lon: number; excluded: boolean; onHighway: boolean;
  plate: string | null; // 車番（末尾番号。ホシコン車両マスタより）
};

const STATUS: Record<number, string> = { 0: '空車', 1: '実車', 2: '迎車', 3: '回送', 4: '支払', 6: 'サンド', 10: '端末なし', 20: '乗務員なし', 30: '休憩', 90: '配車指示中', 99: '不明' };
// 東京広域（板橋を中心に、横浜・成田を含まない範囲）。km-operator 側で営業所の車両に絞られる
const BBOX = { nwLat: 35.95, nwLon: 139.30, seLat: 35.45, seLon: 140.10 };
const CACHE_MS = 45 * 1000;

let cache: { at: number; list: LiveVehicle[] } | null = null;
let inflight: Promise<LiveVehicle[]> | null = null;
const plateMap = new Map<string, string | null>();
const addrCache = new Map<string, { at: number; address: string }>();

export type LiveResult = { ok: true; vehicles: LiveVehicle[]; fetchedAt: number; cached: boolean } | { ok: false; message: string };

async function fillPlates(db: D1Database, radios: string[]): Promise<void> {
  const need = radios.filter((r) => r && !plateMap.has(r));
  for (let i = 0; i < need.length; i += 50) {
    const chunk = need.slice(i, i + 50);
    const rows = await db.prepare(`SELECT radio_no, plate_num FROM vehicles WHERE radio_no IN (${chunk.map(() => '?').join(',')})`).bind(...chunk.map(Number)).all<{ radio_no: number; plate_num: string | null }>();
    for (const r of chunk) plateMap.set(r, null);
    for (const row of rows.results) plateMap.set(String(row.radio_no), row.plate_num || null);
  }
}

export async function liveVehicles(env: Env): Promise<LiveResult> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return { ok: true, vehicles: cache.list, fetchedAt: cache.at, cached: true };
  if (!inflight) {
    inflight = (async () => {
      const q = `?northwestLat=${BBOX.nwLat}&northwestLon=${BBOX.nwLon}&southeastLat=${BBOX.seLat}&southeastLon=${BBOX.seLon}`;
      const r = await kmApiGet(env, env.DB, 'map_vehicles/get_map_vehicle', q);
      if (!r.ok) throw new Error(r.message);
      const body = JSON.parse(r.body) as { isSuccess?: boolean; msgs?: Array<{ msg?: string }>; vehiclePointList?: Array<Record<string, string>> };
      if (!body.isSuccess) throw new Error(body.msgs?.map((m) => m.msg).join(' ') || 'km-operator から取得できませんでした');
      const raw = body.vehiclePointList ?? [];
      await fillPlates(env.DB, raw.map((v) => String(v.wirelessLineNumber ?? '')));
      const list: LiveVehicle[] = raw.map((v) => {
        const st = Number(v.status);
        const ln = String(v.lastName ?? '').trim(); const fn = String(v.firstName ?? '').trim();
        return {
          radio: String(v.wirelessLineNumber ?? ''), vehicleId: String(v.vehicleId ?? ''), lastName: ln, firstName: fn, name: [ln, fn].filter(Boolean).join(' '),
          status: st, statusLabel: STATUS[st] ?? `状態${st}`, lat: Number(v.latitude), lon: Number(v.longitude),
          excluded: v.dispatchExcluded === '1', onHighway: v.onHighway === '1', plate: plateMap.get(String(v.wirelessLineNumber ?? '')) ?? null,
        };
      });
      cache = { at: Date.now(), list };
      return list;
    })().finally(() => { inflight = null; });
  }
  try {
    const list = await inflight;
    return { ok: true, vehicles: list, fetchedAt: cache?.at ?? Date.now(), cached: false };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function resolveAddress(env: Env, lat: number, lon: number): Promise<string | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  const hit = addrCache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.address;
  const r = await kmApiGet(env, env.DB, 'trip_infos/get_address', `?latitude=${lat}&longitude=${lon}`);
  if (!r.ok) return null;
  try {
    const body = JSON.parse(r.body) as { address?: string };
    const a = body.address ?? null;
    if (a) addrCache.set(key, { at: Date.now(), address: a });
    return a;
  } catch { return null; }
}

const norm = (s: string) => String(s || '').replace(/[\s　]+/g, '').normalize('NFKC');

// 氏名（漢字）で稼働中の車を探す。LINE報告の乗務員選択・クイック検索で使う
export function findByName(list: LiveVehicle[], name: string, limit = 8): LiveVehicle[] {
  const q = norm(name);
  if (!q) return [];
  return list.filter((v) => (norm(v.lastName) + norm(v.firstName)).includes(q)).slice(0, limit);
}

// 車番（末尾番号）または無線番号で稼働中の車を探す
export function findByVehicleNo(list: LiveVehicle[], no: string): LiveVehicle | null {
  const q = norm(no);
  if (!q) return null;
  return list.find((v) => v.plate === q) ?? list.find((v) => v.radio === q) ?? null;
}

export function minutesAgo(at: number): number { return Math.max(0, Math.round((Date.now() - at) / 60000)); }
