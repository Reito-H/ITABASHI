// 報告センター: 車番未入力の報告に割り当てる4桁の案件ID（全報告種別を横断してユニークな連番）
export async function issueCaseNoIfEmpty(db: D1Database, vehicleNo: string | null | undefined): Promise<string | null> {
  if (vehicleNo && vehicleNo.trim()) return null;
  const result = await db.prepare('INSERT INTO report_case_seq DEFAULT VALUES').run();
  const n = result.meta.last_row_id as number;
  return String(n).padStart(4, '0');
}
