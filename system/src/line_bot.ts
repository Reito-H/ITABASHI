// LINE Bot ステートマシン実装
// 売上記録・嫌なこと報告・シフト確認・車両検索のフローを管理

import { getPeriod } from './auth';
import type { Env } from './auth';

type Vehicle = {
  id: number;
  radio_no: number | null;
  plate_no: string | null;
  plate_num: string | null;
  car_type: string | null;
  fuel: string | null;
  grade: string | null;
  company: string | null;
  office: string | null;
  capacity: number | null;
  luggage: string | null;
  office2: string | null;
  radio_no2: number | null;
  division: string | null;
  office_phone: string | null;
};

// 車両検索（無線番号一致を先に返す。Excelと同じ完全一致）
async function searchVehicles(db: D1Database, query: string): Promise<Vehicle[]> {
  const result = await db.prepare(`
    SELECT v.*, o.phone AS office_phone,
      CASE WHEN CAST(v.radio_no AS TEXT) = ? THEN 0 ELSE 1 END AS _sort
    FROM vehicles v
    LEFT JOIN offices o ON o.name = v.office2
    WHERE CAST(v.radio_no AS TEXT) = ? OR v.plate_num = ?
    ORDER BY _sort
    LIMIT 10
  `).bind(query, query, query).all<Vehicle>();
  return result.results ?? [];
}

// 車両検索結果をLINEメッセージ用テキストに整形
function formatVehicleResults(query: string, vehicles: Vehicle[]): string {
  if (vehicles.length === 0) {
    return `🔍 「${query}」の検索結果\n\n該当する車両が見つかりませんでした。`;
  }

  const lines = [`🔍 「${query}」の検索結果（${vehicles.length}件）`];
  for (const v of vehicles) {
    const isRadioMatch = v.radio_no != null && String(v.radio_no) === query;
    const label = isRadioMatch ? '【無線番号一致】' : '【ナンバー一致】';
    lines.push('');
    lines.push(`━━ ${label} ━━`);
    if (v.radio_no != null)  lines.push(`無線番号: ${v.radio_no}`);
    if (v.plate_no)          lines.push(`車両番号: ${v.plate_no}`);
    if (v.car_type)          lines.push(`車種: ${v.car_type}`);
    if (v.office)            lines.push(`営業所: ${v.office}`);
    if (v.division)          lines.push(`課: ${v.division}`);
  }
  return lines.join('\n');
}

type ConvState = {
  state: string;
  data: Record<string, string | number>;
};

// 会話状態を取得
async function getState(db: D1Database, lineUid: string): Promise<ConvState> {
  const row = await db.prepare(
    'SELECT state, data FROM line_conv_states WHERE line_uid = ?'
  ).bind(lineUid).first<{ state: string; data: string }>();
  return {
    state: row?.state ?? 'idle',
    data: row?.data ? JSON.parse(row.data) : {}
  };
}

// 会話状態を保存
async function setState(db: D1Database, lineUid: string, state: string, data: Record<string, string | number> = {}): Promise<void> {
  await db.prepare(`
    INSERT INTO line_conv_states (line_uid, state, data, updated_at)
    VALUES (?, ?, ?, datetime('now', 'localtime'))
    ON CONFLICT(line_uid) DO UPDATE SET state = excluded.state, data = excluded.data, updated_at = excluded.updated_at
  `).bind(lineUid, state, JSON.stringify(data)).run();
}

// LINEへ返信
async function reply(token: string, accessToken: string, messages: object[]): Promise<void> {
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ replyToken: token, messages })
  });
}

// テキストメッセージ
const text = (msg: string) => ({ type: 'text', text: msg });

// リッチメニュー割り当て
async function assignRichMenu(userId: string, richMenuId: string, accessToken: string): Promise<void> {
  if (!richMenuId) return;
  await fetch(`https://api.line.me/v2/bot/user/${userId}/richmenu/${richMenuId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` }
  });
}

// リッチメニュー解除（デフォルト=パターン3に戻る）
async function removeRichMenu(userId: string, accessToken: string): Promise<void> {
  await fetch(`https://api.line.me/v2/bot/user/${userId}/richmenu`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` }
  });
}

// クイックリプライ付きテキスト
const textWithQuickReply = (msg: string, items: { label: string; text: string }[]) => ({
  type: 'text',
  text: msg,
  quickReply: {
    items: items.map(i => ({
      type: 'action',
      action: { type: 'message', label: i.label, text: i.text }
    }))
  }
});

// 今日の日付（日本時間）
function todayJST(): string {
  const now = new Date();
  // JST = UTC+9
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().split('T')[0];
}

// メインハンドラー
export async function handleLineEvent(env: Env, event: Record<string, unknown>): Promise<void> {
  const lineUid = (event.source as Record<string, string>)?.userId;
  if (!lineUid) return;
  const replyToken = event.replyToken as string;
  const at = env.LINE_CHANNEL_ACCESS_TOKEN!;

  // ===== 指導者・車番検索権限チェック（並列取得） =====
  const [vehicleSearchAdmin, instructor] = await Promise.all([
    env.DB.prepare('SELECT id, name FROM vehicle_search_admins WHERE line_uid = ?')
      .bind(lineUid).first<{ id: number; name: string }>(),
    env.DB.prepare('SELECT id, name FROM instructors WHERE line_uid = ? AND is_active = 1')
      .bind(lineUid).first<{ id: number; name: string }>(),
  ]);

  const canVehicleSearch = !!vehicleSearchAdmin || !!instructor;

  if (instructor || vehicleSearchAdmin) {
    if (event.type === 'message' && (event.message as Record<string, string>)?.type === 'text') {
      const inputText = ((event.message as Record<string, string>)?.text ?? '').trim();
      if (inputText === 'れんけいかいじょ') {
        if (instructor) {
          await env.DB.prepare('UPDATE instructors SET line_uid = NULL, can_vehicle_search = 0 WHERE id = ?').bind(instructor.id).run();
          await env.DB.prepare('DELETE FROM line_conv_states WHERE line_uid = ?').bind(lineUid).run();
        } else if (vehicleSearchAdmin) {
          await env.DB.prepare('DELETE FROM vehicle_search_admins WHERE id = ?').bind(vehicleSearchAdmin.id).run();
        }
        await removeRichMenu(lineUid, at);
        await reply(replyToken, at, [text('LINE連携を解除しました。')]);
      } else if (inputText === '車番検索') {
        await reply(replyToken, at, [text('検索したい無線番号またはナンバーの数字を入力してください。\n例）「1988」')]);
      } else if (/^\d{1,6}$/.test(inputText)) {
        if (canVehicleSearch) {
          const vehicles = await searchVehicles(env.DB, inputText);
          await reply(replyToken, at, [text(formatVehicleResults(inputText, vehicles))]);
        } else {
          await reply(replyToken, at, [text('車番検索を利用するには、管理者に権限付与を依頼してください。')]);
        }
      } else if (inputText === 'UID' || inputText === 'uid') {
        await reply(replyToken, at, [text(`あなたのLINE UID:\n${lineUid}`)]);
      } else if (canVehicleSearch) {
        await reply(replyToken, at, [text('数字を送信すると車両情報を検索します。\n例）「6677」')]);
      }
    }
    return;
  }

  // ===== 車番連携フロー（未登録ユーザー向け自己申請） =====
  const VEHICLE_LINK_PASSWORD = 'km5931#!';

  const rawMsg = (event.type === 'message' && (event.message as Record<string, string>)?.type === 'text')
    ? ((event.message as Record<string, string>)?.text ?? '').trim()
    : '';

  if (rawMsg === '車番連携') {
    await setState(env.DB, lineUid, 'vehicle_link_name');
    await reply(replyToken, at, [text('あなたの名前を漢字フルネームで入力してください。')]);
    return;
  }

  const linkConv = await getState(env.DB, lineUid);
  if (linkConv.state.startsWith('vehicle_link_')) {
    if (linkConv.state === 'vehicle_link_name') {
      await setState(env.DB, lineUid, 'vehicle_link_password', { name: rawMsg });
      await reply(replyToken, at, [text('パスワードを入力してください。')]);
      return;
    }
    if (linkConv.state === 'vehicle_link_password') {
      const name = String(linkConv.data.name ?? '');
      if (rawMsg === VEHICLE_LINK_PASSWORD) {
        await env.DB.prepare(
          'INSERT OR IGNORE INTO vehicle_search_admins (name, line_uid) VALUES (?, ?)'
        ).bind(name, lineUid).run();
        await setState(env.DB, lineUid, 'idle');
        await assignRichMenu(lineUid, env.RICHMENU_ID_PATTERN2 ?? '', at);
        await reply(replyToken, at, [text(`${name}さんの車番検索権限が登録されました。\n数字を送信すると車両情報を検索できます。\n例）「6677」`)]);
      } else {
        await setState(env.DB, lineUid, 'idle');
        await reply(replyToken, at, [text('パスワードが正しくありません。最初からやり直してください。')]);
      }
      return;
    }
  }

  // 招待コード紐付けチェック
  const lineUser = await env.DB.prepare(
    'SELECT emp_id FROM line_users WHERE line_uid = ?'
  ).bind(lineUid).first<{ emp_id: number }>();

  if (!lineUser) {
    // 未紐付け: 招待コード受付
    if (event.type === 'message' && (event.message as Record<string, string>)?.type === 'text') {
      const inputCode = ((event.message as Record<string, string>)?.text ?? '').trim().toUpperCase();

      // LINE UID確認コマンド（管理者登録用）
      if (inputCode === 'UID' || inputCode === 'LINEID') {
        await reply(replyToken, at, [text(`あなたのLINE UID:\n${lineUid}\n\n管理者に伝えてLINE管理者として登録してもらってください。`)]);
        return;
      }
      const invite = await env.DB.prepare(
        'SELECT id, emp_id, instructor_id, expires_at FROM invite_codes WHERE code = ? AND is_used = 0'
      ).bind(inputCode).first<{ id: number; emp_id: number | null; instructor_id: number | null; expires_at: string }>();

      if (invite && invite.expires_at > new Date().toISOString()) {
        await env.DB.prepare(
          'UPDATE invite_codes SET is_used = 1, used_at = datetime(\'now\', \'localtime\') WHERE id = ?'
        ).bind(invite.id).run();

        if (invite.instructor_id) {
          // 班長・指導者として紐付け → パターン2
          await env.DB.prepare(
            'UPDATE instructors SET line_uid = ? WHERE id = ?'
          ).bind(lineUid, invite.instructor_id).run();
          const inst = await env.DB.prepare('SELECT name FROM instructors WHERE id = ?').bind(invite.instructor_id).first<{ name: string }>();
          const instName = inst?.name ?? '';
          await assignRichMenu(lineUid, env.RICHMENU_ID_PATTERN2 ?? '', at);
          await reply(replyToken, at, [text(
            `✨ ${instName}さん、ITABASHIへようこそ！\n\n` +
            `頼れる管理スタッフとして登録が完了しました🎯\n` +
            `シフト状況や出勤レポートをお届けします。\n` +
            `よろしくお願いします！`
          )]);
        } else if (invite.emp_id) {
          // 新人社員として紐付け → パターン1
          await env.DB.prepare(
            'INSERT OR REPLACE INTO line_users (line_uid, emp_id) VALUES (?, ?)'
          ).bind(lineUid, invite.emp_id).run();
          const emp = await env.DB.prepare('SELECT name FROM employees WHERE id = ?').bind(invite.emp_id).first<{ name: string }>();
          const empName = emp?.name ?? '';
          await assignRichMenu(lineUid, env.RICHMENU_ID_PATTERN1 ?? '', at);
          await reply(replyToken, at, [text(
            `🎉 ${empName}さん、ITABASHIへようこそ！\n\n` +
            `困ったこと・嫌なことがあれば\nいつでも気軽に報告してください。\n` +
            `あなたのことをしっかりサポートします💪`
          )]);
        }
      } else {
        await reply(replyToken, at, [text('招待コードが正しくないか、有効期限切れです。\n管理者に確認してください。')]);
      }
    }
    return;
  }

  const empId = lineUser.emp_id;
  let { state, data } = await getState(env.DB, lineUid);

  if (event.type !== 'message' && event.type !== 'postback') return;

  let inputText = '';
  if (event.type === 'message' && (event.message as Record<string, string>)?.type === 'text') {
    inputText = ((event.message as Record<string, string>)?.text ?? '').trim();
  }
  if (event.type === 'postback') {
    inputText = (event.postback as Record<string, string>)?.data ?? '';
  }

  // キャンセル（どの状態からでも）
  if (inputText === 'キャンセル' || inputText === 'cancel') {
    await setState(env.DB, lineUid, 'idle');
    await reply(replyToken, at, [text('キャンセルしました。')]);
    return;
  }

  // メインメニュー操作によるフロー割り込み（どのステートからでも切り替え可能）
  const MENU_CMDS = ['売上記録', '売上を記録', '嫌なこと報告', '報告', 'シフト確認'];
  if (state !== 'idle' && MENU_CMDS.includes(inputText)) {
    await setState(env.DB, lineUid, 'idle');
    state = 'idle';
    data = {};
  }

  // 隠しコマンド: LINE連携解除
  if (inputText === 'れんけいかいじょ') {
    await env.DB.prepare('DELETE FROM line_users WHERE line_uid = ?').bind(lineUid).run();
    await env.DB.prepare('DELETE FROM line_conv_states WHERE line_uid = ?').bind(lineUid).run();
    await removeRichMenu(lineUid, at);
    await reply(replyToken, at, [text('LINE連携を解除しました。\n再度利用する場合は招待コードを送信してください。')]);
    return;
  }

  // ===== メニュー・エントリーポイント =====
  if (state === 'idle') {
    if (inputText === '売上記録' || inputText === '売上を記録') {
      const today = todayJST();
      const existing = await env.DB.prepare(
        'SELECT amount FROM sales_records WHERE emp_id = ? AND date = ?'
      ).bind(empId, today).first<{ amount: number }>();
      if (existing) {
        await setState(env.DB, lineUid, 'sales_confirm_overwrite', { date: today, prev: existing.amount });
        await reply(replyToken, at, [textWithQuickReply(
          `今日(${today})はすでに ${existing.amount.toLocaleString('ja-JP')}円 が記録されています。\n上書きしますか？`,
          [{ label: '上書きする', text: '上書き' }, { label: 'キャンセル', text: 'キャンセル' }]
        )]);
      } else {
        await setState(env.DB, lineUid, 'sales_amount', { date: today });
        await reply(replyToken, at, [text(`今日(${today})の売上金額を入力してください。\n（円。例: 18500）`)]);
      }
      return;
    }

    if (inputText === '嫌なこと報告' || inputText === '報告') {
      await setState(env.DB, lineUid, 'event_category');
      await reply(replyToken, at, [textWithQuickReply(
        '報告のカテゴリを選んでください。',
        [
          { label: 'クレーマー', text: 'クレーマー' },
          { label: '交通トラブル', text: '交通トラブル' },
          { label: '社内の出来事', text: '社内の出来事' },
          { label: 'その他', text: 'その他' },
        ]
      )]);
      return;
    }

    if (inputText === 'シフト確認') {
      // 当月度のシフトをテキストで返す
      const today = todayJST();
      const { getPeriod, getPeriodRange } = await import('./auth');
      const { year, month } = getPeriod(today);
      const { start, end } = getPeriodRange(year, month);
      const shifts = await env.DB.prepare(
        'SELECT date, entry_main FROM shift_entries WHERE emp_id = ? AND date >= ? AND date <= ? ORDER BY date'
      ).bind(empId, start, end).all<{ date: string; entry_main: string }>();

      const WEEKDAY = ['日', '月', '火', '水', '木', '金', '土'];
      let msg = `📅 ${year}年${month}月度のシフト\n`;
      msg += `（${start}〜${end}）\n\n`;

      const shiftMap: Record<string, string> = {};
      for (const s of (shifts.results ?? [])) {
        shiftMap[s.date] = s.entry_main ?? '';
      }

      // 今日以降のみ表示（最大10日）
      const cur = new Date(today);
      const endDate = new Date(end);
      let count = 0;
      while (cur <= endDate && count < 14) {
        const d = cur.toISOString().split('T')[0];
        const dt = new Date(d);
        const dow = WEEKDAY[dt.getUTCDay()];
        const entry = shiftMap[d] ?? '';
        if (entry) {
          msg += `${d.slice(5)} (${dow}): ${entry}\n`;
          count++;
        }
        cur.setDate(cur.getDate() + 1);
      }
      if (count === 0) msg += '（まだシフトが入力されていません）';
      await reply(replyToken, at, [text(msg)]);
      return;
    }

    // 未認識のメッセージ
    await reply(replyToken, at, [textWithQuickReply(
      'リッチメニューからご利用ください。',
      [
        { label: '売上記録', text: '売上記録' },
        { label: '嫌なこと報告', text: '嫌なこと報告' },
        { label: 'シフト確認', text: 'シフト確認' },
      ]
    )]);
    return;
  }

  // ===== 売上記録フロー =====
  if (state === 'sales_confirm_overwrite') {
    if (inputText === '上書き') {
      await setState(env.DB, lineUid, 'sales_amount', { date: data.date as string });
      await reply(replyToken, at, [text(`売上金額を入力してください。\n（円。例: 18500）`)]);
    } else {
      await setState(env.DB, lineUid, 'idle');
      await reply(replyToken, at, [text('キャンセルしました。')]);
    }
    return;
  }

  if (state === 'sales_amount') {
    const amount = parseInt(inputText.replace(/[^0-9]/g, ''));
    if (isNaN(amount) || amount < 0 || amount > 999999) {
      await reply(replyToken, at, [text('金額を正しく入力してください。\n（例: 18500）')]);
      return;
    }
    await setState(env.DB, lineUid, 'sales_rides', { ...data, amount });
    await reply(replyToken, at, [text('乗車回数を入力してください。\n（例: 8）')]);
    return;
  }

  if (state === 'sales_rides') {
    const rides = parseInt(inputText.replace(/[^0-9]/g, ''));
    if (isNaN(rides) || rides < 0 || rides > 999) {
      await reply(replyToken, at, [text('乗車回数を正しく入力してください。\n（例: 8）')]);
      return;
    }
    await setState(env.DB, lineUid, 'sales_distance', { ...data, ride_count: rides });
    await reply(replyToken, at, [text('走行距離を入力してください。\n（km。例: 120）')]);
    return;
  }

  if (state === 'sales_distance') {
    const dist = parseInt(inputText.replace(/[^0-9]/g, ''));
    if (isNaN(dist) || dist < 0 || dist > 9999) {
      await reply(replyToken, at, [text('走行距離を正しく入力してください。\n（例: 120）')]);
      return;
    }
    const newData = { ...data, distance_km: dist };
    await setState(env.DB, lineUid, 'sales_confirm', newData);
    await reply(replyToken, at, [textWithQuickReply(
      `✅ 内容確認\n\n📅 日付: ${data.date}\n💰 売上: ${(data.amount as number).toLocaleString('ja-JP')}円\n🚕 乗車: ${data.ride_count}回\n🗺️ 距離: ${dist}km\n\n登録しますか？`,
      [{ label: '✅ 登録する', text: '登録' }, { label: '❌ キャンセル', text: 'キャンセル' }]
    )]);
    return;
  }

  if (state === 'sales_confirm') {
    if (inputText === '登録') {
      const { year, month } = getPeriod(data.date as string);
      await env.DB.prepare(`
        INSERT INTO sales_records (emp_id, date, amount, ride_count, distance_km, period_year, period_month, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
        ON CONFLICT(emp_id, date) DO UPDATE SET
          amount = excluded.amount, ride_count = excluded.ride_count,
          distance_km = excluded.distance_km, updated_at = datetime('now', 'localtime')
      `).bind(empId, data.date, data.amount, data.ride_count ?? null, data.distance_km ?? null, year, month).run();
      await setState(env.DB, lineUid, 'idle');
      await reply(replyToken, at, [text(`✅ 登録しました！\n${data.date}\n売上: ${(data.amount as number).toLocaleString('ja-JP')}円`)]);
    } else {
      await setState(env.DB, lineUid, 'idle');
      await reply(replyToken, at, [text('キャンセルしました。')]);
    }
    return;
  }

  // ===== 嫌なこと報告フロー =====
  if (state === 'event_category') {
    const validCats = ['クレーマー', '交通トラブル', '社内の出来事', 'その他'];
    if (!validCats.includes(inputText)) {
      await reply(replyToken, at, [textWithQuickReply(
        'カテゴリを選択してください。',
        validCats.map(c => ({ label: c, text: c }))
      )]);
      return;
    }
    await setState(env.DB, lineUid, 'event_content', { category: inputText });
    await reply(replyToken, at, [text(`「${inputText}」について教えてください。\n\nどんな出来事があったか、経緯を詳しく書いてください。\n（送信するとき、長文でも大丈夫です）`)]);
    return;
  }

  if (state === 'event_content') {
    if (inputText.length < 5) {
      await reply(replyToken, at, [text('もう少し詳しく教えてください。')]);
      return;
    }
    await setState(env.DB, lineUid, 'event_feeling', { ...data, content: inputText });
    await reply(replyToken, at, [textWithQuickReply(
      'その時の気持ちや感想を教えてください。\n（任意。スキップすることもできます）',
      [{ label: 'スキップ', text: 'スキップ' }]
    )]);
    return;
  }

  if (state === 'event_feeling') {
    const feeling = inputText === 'スキップ' ? '' : inputText;
    // 保存
    await env.DB.prepare(
      'INSERT INTO bad_events (emp_id, category, content, feeling) VALUES (?, ?, ?, ?)'
    ).bind(empId, data.category, data.content, feeling || null).run();
    await setState(env.DB, lineUid, 'idle');
    await reply(replyToken, at, [text(
      '✅ 記録しました。\n\n話してくれてありがとうございます。\n管理者が確認します。\n\nいつでも気になることがあれば報告してください。'
    )]);
    return;
  }

  // 不明な状態はリセット
  await setState(env.DB, lineUid, 'idle');
  await reply(replyToken, at, [text('リッチメニューからご利用ください。')]);
}
