// LINE利用状況ログ（line_activity_logs への書き込みヘルパー）
// 記録失敗がBot応答・LIFF APIの動作を壊さないよう、必ず握りつぶす。

export async function logLineActivity(
  db: D1Database,
  lineUid: string,
  channel: 'bot' | 'liff',
  eventType: string,
  feature: string,
  detail: string = '',
): Promise<void> {
  try {
    await db.prepare(
      'INSERT INTO line_activity_logs (line_uid, channel, event_type, feature, detail) VALUES (?, ?, ?, ?, ?)'
    ).bind(lineUid, channel, eventType, feature, detail.slice(0, 200)).run();
  } catch (e) {
    console.error('logLineActivity failed:', e);
  }
}
