import type { Env } from './auth';
import { getPeriodSettings, getPeriodRange, getPeriod } from './auth';

// LINE 連携済みの班長・指導者全員にプッシュ通知
async function pushToInstructors(env: Env, messages: object[]): Promise<void> {
  const at = env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!at) return;

  const rows = await env.DB.prepare(
    'SELECT line_uid FROM instructors WHERE line_uid IS NOT NULL AND is_active = 1'
  ).all<{ line_uid: string }>();

  const uids = (rows.results ?? []).map(r => r.line_uid);
  if (uids.length === 0) return;
  // Multicast API: 1リクエストで最大500人に一括送信
  await fetch('https://api.line.me/v2/bot/message/multicast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${at}` },
    body: JSON.stringify({ to: uids, messages }),
  });
}

// 朝の出勤レポート
async function sendMorningReport(env: Env, todayStr: string): Promise<void> {
  // 今日の班長出勤状況（当直・出勤のみ）
  const schedules = await env.DB.prepare(`
    SELECT i.name, s.entry
    FROM instructor_schedules s
    JOIN instructors i ON s.instructor_id = i.id
    WHERE s.date = ? AND s.entry IN ('当直', '出勤')
    ORDER BY i.sort_order, i.id
  `).bind(todayStr).all<{ name: string; entry: string }>();

  // 今月度の平均売上
  const { year, month } = getPeriod(todayStr);
  const periodCfg = await getPeriodSettings(env.DB);
  const { start } = getPeriodRange(year, month, periodCfg);

  const salesAvg = await env.DB.prepare(`
    SELECT AVG(sr.amount) as avg_amount, COUNT(DISTINCT sr.emp_id) as emp_count
    FROM sales_records sr
    JOIN employees e ON sr.emp_id = e.id
    WHERE sr.date >= ? AND sr.date <= ? AND e.is_active = 1
  `).bind(start, todayStr).first<{ avg_amount: number | null; emp_count: number }>();

  // 本日の未対応報告数
  const badCount = await env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM bad_events WHERE (admin_memo IS NULL OR admin_memo = '') AND DATE(created_at) = ?"
  ).bind(todayStr).first<{ cnt: number }>();

  const attendees = schedules.results ?? [];
  let msg = `【本日の出勤状況 ${todayStr}】\n\n`;

  if (attendees.length > 0) {
    msg += '■ 本日の担当者\n';
    for (const a of attendees) {
      msg += `・${a.name}（${a.entry}）\n`;
    }
  } else {
    msg += '■ 本日の担当者\n当直・出勤なし\n';
  }

  msg += '\n';

  if (salesAvg?.avg_amount != null) {
    const avg = Math.round(salesAvg.avg_amount);
    msg += `■ 今月度の平均売上\n${avg.toLocaleString('ja-JP')}円 / ${salesAvg.emp_count}名\n\n`;
  }

  if ((badCount?.cnt ?? 0) > 0) {
    msg += `■ 嫌なこと報告（未対応）\n${badCount!.cnt}件 → 管理画面をご確認ください`;
  } else {
    msg += '■ 嫌なこと報告\n未対応なし';
  }

  await pushToInstructors(env, [{ type: 'text', text: msg.trim() }]);
}

// 嫌なこと報告アラート（未対応があるときだけ送信）
async function sendBadEventAlert(env: Env, todayStr: string): Promise<void> {
  const badCount = await env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM bad_events WHERE admin_memo IS NULL OR admin_memo = ''"
  ).first<{ cnt: number }>();

  if ((badCount?.cnt ?? 0) === 0) return;

  const msg = `【嫌なこと報告 アラート】\n\n未対応の報告が ${badCount!.cnt}件あります。\n管理画面でご確認ください。`;
  await pushToInstructors(env, [{ type: 'text', text: msg }]);
}

// 特定の通知タイプを実行（手動送信・cron 共用）
export async function runNotification(env: Env, type: string): Promise<void> {
  const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const todayStr = nowJST.toISOString().split('T')[0];

  if (type === 'morning_report') {
    await sendMorningReport(env, todayStr);
  } else if (type === 'bad_event_alert') {
    await sendBadEventAlert(env, todayStr);
  }
}

// 退職日を迎えた社員を自動的に退職処理（is_active = 0）
async function checkRetirements(env: Env, todayStr: string): Promise<void> {
  await env.DB.prepare(`
    UPDATE employees
    SET is_active = 0, updated_at = datetime('now', 'localtime')
    WHERE is_active = 1
      AND retirement_date IS NOT NULL
      AND retirement_date != ''
      AND retirement_date <= ?
  `).bind(todayStr).run();
}

// Cron ハンドラー（毎時 0 分に実行、設定時刻と照合）
export async function handleCron(env: Env): Promise<void> {
  const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const currentHour = nowJST.getUTCHours();
  const currentMinute = nowJST.getUTCMinutes();
  const todayStr = nowJST.toISOString().split('T')[0];

  // 退職日到達チェック（毎時実行）
  await checkRetirements(env, todayStr);

  const settings = await env.DB.prepare(
    'SELECT type, send_hour, send_minute, last_sent_date FROM notification_settings WHERE is_enabled = 1'
  ).all<{ type: string; send_hour: number; send_minute: number; last_sent_date: string | null }>();

  for (const s of (settings.results ?? [])) {
    if (s.send_hour !== currentHour || s.send_minute !== currentMinute) continue;
    if (s.last_sent_date === todayStr) continue;

    await runNotification(env, s.type);

    await env.DB.prepare(
      "UPDATE notification_settings SET last_sent_date = ?, updated_at = datetime('now','localtime') WHERE type = ?"
    ).bind(todayStr, s.type).run();
  }
}
