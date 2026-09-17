// km-operator連携（乗降ピンデータ収集）共通ヘルパー。
// admin_km_pins.ts（管理画面からの手動収集・現在Cloudflare側からkm-operatorへの接続がブロックされ
// 動作しない）と public_km_pins_upload.ts（社内PCの収集スクリプトからの受け口。こちらが本来の経路。
// scripts/km_pins_collector.ps1参照）の両方から使う。
import { isItabashi } from './tantosha_lookup';
import type { KmTripInfo } from './km_operator';

// 板橋営業所の車両の無線番号一覧（office/office2いずれかに「板橋」を含む行）
export async function getItabashiRadioNumbers(db: D1Database): Promise<number[]> {
  const rows = await db.prepare(
    `SELECT radio_no, office, office2 FROM vehicles
     WHERE radio_no IS NOT NULL AND (office LIKE '%板橋%' OR office2 LIKE '%板橋%')
     ORDER BY radio_no`
  ).all<{ radio_no: number; office: string | null; office2: string | null }>();
  return (rows.results ?? [])
    .filter((r) => isItabashi(r.office, r.office2))
    .map((r) => r.radio_no);
}

export function saveTripsStmts(db: D1Database, radioNo: number, driverName: string | null, trips: KmTripInfo[]) {
  return trips.map((t) =>
    db.prepare(`
      INSERT OR IGNORE INTO km_trip_pins (
        trip_id, radio_no, driver_name, ticket_number, ticket_status,
        on_service_at, on_latitude, on_longitude,
        out_service_at, out_latitude, out_longitude,
        distance_m, drive_min, fare, customer_name_kana, passenger_name_kana
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      t.tripId, radioNo, driverName, t.ticketNumber ?? null, t.ticketStatus ?? null,
      t.onServiceAt ?? null,
      t.onServiceLatitude != null ? Number(t.onServiceLatitude) : null,
      t.onServiceLongitude != null ? Number(t.onServiceLongitude) : null,
      t.outServiceAt ?? null,
      t.outServiceLatitude != null ? Number(t.outServiceLatitude) : null,
      t.outServiceLongitude != null ? Number(t.outServiceLongitude) : null,
      t.distance != null ? parseInt(t.distance, 10) : null,
      t.driveMin != null ? parseInt(t.driveMin, 10) : null,
      t.fare != null ? parseInt(t.fare, 10) : null,
      t.customerFullNameKana ?? null, t.passengerNameKana ?? null,
    )
  );
}
