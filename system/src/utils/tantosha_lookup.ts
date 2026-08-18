// 担当車表（tantosha_rows）からドア番号（=板橋の無線番号）→ 勤務（シフト）を引くヘルパー
// 車両検索の結果に「H勤車（4班）」のように表示するために使う。
// 担当車表は板橋営業所の車両のみ載っているため、表示側で営業所が板橋かどうかを確認すること。

export type TantoshaShift = { shift: string; group: string };

export async function getTantoshaShiftMap(db: D1Database): Promise<Map<string, TantoshaShift>> {
  try {
    const rows = await db.prepare(`
      SELECT r.door, r.shift, g.name AS group_name
      FROM tantosha_rows r
      JOIN tantosha_groups g ON g.id = r.group_id
      WHERE r.door != '' AND g.is_active = 1
      ORDER BY g.sort_order, r.sort_order
    `).all<{ door: string; shift: string; group_name: string }>();
    const map = new Map<string, TantoshaShift>();
    for (const r of rows.results ?? []) {
      const key = (r.door ?? '').trim();
      if (key && !map.has(key)) map.set(key, { shift: (r.shift ?? '').trim(), group: r.group_name });
    }
    return map;
  } catch {
    // テーブル未作成などでも車両検索自体は動かす
    return new Map();
  }
}

// 'H' → 'H勤車（4班）'、'B/D' → 'B/D勤車（3班）'、'日勤' → '日勤車（3班）'
export function tantoshaShiftLabel(info: TantoshaShift | undefined): string {
  if (!info || !info.shift) return '';
  const base = info.shift.endsWith('勤') ? `${info.shift}車` : `${info.shift}勤車`;
  return info.group ? `${base}（${info.group}）` : base;
}

export function isItabashi(...offices: Array<string | null | undefined>): boolean {
  return offices.some(o => (o ?? '').includes('板橋'));
}

// 配車管理：車番(door)から担当車の優先順位（A=p1, B=p2, C=r「3台廻り」）を返す。
// 新テーブルを作らず、既存の担当車表(tantosha_rows)をそのまま流用する。
export type TantoshaPriority = { role: 'p1' | 'p2' | 'r'; letter: string; name: string };

export async function getTantoshaPriorityForCar(db: D1Database, carNo: string): Promise<TantoshaPriority[]> {
  const map = await getTantoshaPriorityMap(db);
  return map.get((carNo ?? '').trim()) ?? [];
}

// 全車両分を1クエリでまとめて取得する版（配車ボード等、多数の車番を一度に扱う画面向け）
export async function getTantoshaPriorityMap(db: D1Database): Promise<Map<string, TantoshaPriority[]>> {
  const map = new Map<string, TantoshaPriority[]>();
  try {
    const rows = await db.prepare(`
      SELECT r.door, r.p1_letter, r.p1_name, r.p2_letter, r.p2_name, r.r_letter, r.r_name
      FROM tantosha_rows r
      JOIN tantosha_groups g ON g.id = r.group_id
      WHERE r.door != '' AND g.is_active = 1
      ORDER BY g.sort_order, r.sort_order
    `).all<{ door: string; p1_letter: string; p1_name: string; p2_letter: string; p2_name: string; r_letter: string; r_name: string }>();
    for (const row of (rows.results ?? [])) {
      const door = (row.door ?? '').trim();
      if (!door || map.has(door)) continue;
      const list: TantoshaPriority[] = [];
      if ((row.p1_name ?? '').trim()) list.push({ role: 'p1', letter: row.p1_letter ?? '', name: row.p1_name.trim() });
      if ((row.p2_name ?? '').trim()) list.push({ role: 'p2', letter: row.p2_letter ?? '', name: row.p2_name.trim() });
      if ((row.r_name ?? '').trim()) list.push({ role: 'r', letter: row.r_letter ?? '', name: row.r_name.trim() });
      if (list.length > 0) map.set(door, list);
    }
  } catch { /* テーブル未作成等でも配車ボード自体は動かす */ }
  return map;
}
