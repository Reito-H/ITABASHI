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
