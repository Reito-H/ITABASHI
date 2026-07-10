// LINE Bot メインハンドラー
// 権限: line_liff_users テーブルで一元管理
// role: general_manager / operations_manager / vehicle_manager / newcomer / unknown

import { getPeriod, getPeriodRange } from './auth';
import type { Env } from './auth';
import { getRichMenuForRole } from './routes/admin_liff';
import { queryManual } from './utils/manual_search';

// ===================================================
// 型定義
// ===================================================

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
  team: string | null;
  office_phone: string | null;
};

type LiffUser = {
  id: number;
  name: string;
  emp_id: number | null;
  role: string;
};

type ConvState = {
  state: string;
  data: Record<string, string | number>;
};

// ===================================================
// ユーティリティ
// ===================================================

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

function formatVehicleResults(query: string, vehicles: Vehicle[]): string {
  if (vehicles.length === 0) {
    return `「${query}」に該当する車両が見つかりませんでした。`;
  }
  const blocks: string[] = [];
  for (const v of vehicles) {
    const lines: string[] = [];
    if (v.radio_no != null) lines.push(`無線番号: ${v.radio_no}`);
    if (v.plate_no)         lines.push(`車両番号: ${v.plate_no}`);
    if (v.car_type)         lines.push(`車種: ${v.car_type}`);
    if (v.office)           lines.push(`営業所: ${v.office}`);
    // 課・班（班データがある場合のみ表示）
    if (v.division || v.team) {
      const divTeam = v.division
        ? (v.team ? `${v.division}${v.team}班` : v.division)
        : `${v.team}班`;
      lines.push(divTeam);
    }
    blocks.push(lines.join('\n'));
  }
  return blocks.join('\n\n──────\n\n');
}

async function getState(db: D1Database, lineUid: string): Promise<ConvState> {
  const row = await db.prepare(
    'SELECT state, data FROM line_conv_states WHERE line_uid = ?'
  ).bind(lineUid).first<{ state: string; data: string }>();
  return {
    state: row?.state ?? 'idle',
    data: row?.data ? JSON.parse(row.data) : {}
  };
}

async function setState(db: D1Database, lineUid: string, state: string, data: Record<string, string | number> = {}): Promise<void> {
  await db.prepare(`
    INSERT INTO line_conv_states (line_uid, state, data, updated_at)
    VALUES (?, ?, ?, datetime('now', 'localtime'))
    ON CONFLICT(line_uid) DO UPDATE SET state = excluded.state, data = excluded.data, updated_at = excluded.updated_at
  `).bind(lineUid, state, JSON.stringify(data)).run();
}

async function reply(token: string, accessToken: string, messages: object[]): Promise<void> {
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ replyToken: token, messages }),
  });
}

const text = (msg: string) => ({ type: 'text', text: msg });

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

async function assignRichMenu(userId: string, richMenuId: string, accessToken: string): Promise<void> {
  if (!richMenuId) return;
  const res = await fetch(`https://api.line.me/v2/bot/user/${userId}/richmenu/${richMenuId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    console.error(`assignRichMenu failed: ${res.status} ${await res.text()}`);
  }
}

async function removeRichMenu(userId: string, accessToken: string): Promise<void> {
  await fetch(`https://api.line.me/v2/bot/user/${userId}/richmenu`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

function todayJST(): string {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return jst.toISOString().split('T')[0];
}

// ===================================================
// 登録・リッチメニュー割り当て
// ===================================================

async function registerLiffUser(
  db: D1Database,
  lineUid: string,
  name: string,
  role: string,
  empId: number | null,
  env: Env,
): Promise<void> {
  await db.prepare(`
    INSERT INTO line_liff_users (line_uid, name, emp_id, role, created_at, updated_at)
    VALUES (?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
    ON CONFLICT(line_uid) DO UPDATE SET
      name = excluded.name, role = excluded.role, emp_id = excluded.emp_id,
      updated_at = datetime('now', 'localtime')
  `).bind(lineUid, name, empId, role).run();

  const at = env.LINE_CHANNEL_ACCESS_TOKEN ?? '';
  const menuId = getRichMenuForRole(role, env);
  if (menuId) {
    await assignRichMenu(lineUid, menuId, at);
  } else {
    await removeRichMenu(lineUid, at);
  }
}

// ===================================================
// メインハンドラー
// ===================================================

export async function handleLineEvent(env: Env, event: Record<string, unknown>): Promise<void> {
  const lineUid = (event.source as Record<string, string>)?.userId;
  if (!lineUid) return;
  const replyToken = event.replyToken as string;
  const at = env.LINE_CHANNEL_ACCESS_TOKEN!;

  // テキスト入力を取得
  let inputText = '';
  if (event.type === 'message' && (event.message as Record<string, string>)?.type === 'text') {
    inputText = ((event.message as Record<string, string>)?.text ?? '').trim();
  }
  if (event.type === 'postback') {
    inputText = (event.postback as Record<string, string>)?.data ?? '';
  }
  if (event.type !== 'message' && event.type !== 'postback') return;

  // UID確認コマンド（全ユーザー共通）
  if (inputText === 'uid' || inputText === 'UID') {
    await reply(replyToken, at, [text(`あなたのLINE UID:\n${lineUid}`)]);
    return;
  }

  // ===== 登録済みユーザーかチェック =====
  const liffUser = await env.DB.prepare(
    'SELECT id, name, emp_id, role FROM line_liff_users WHERE line_uid = ?'
  ).bind(lineUid).first<LiffUser>();

  // ===== 会話ステート取得 =====
  const { state, data } = await getState(env.DB, lineUid);

  // ===== 登録フロー処理 =====
  // 登録中の状態がある場合、またはまだ未登録の場合に登録フローを処理
  if (state.startsWith('reg_')) {
    const handled = await handleRegistrationFlow(env, lineUid, replyToken, at, inputText, state, data);
    if (handled) return;
  }

  // ===== 未登録ユーザーの処理 =====
  if (!liffUser) {
    await handleUnregisteredUser(env, lineUid, replyToken, at, inputText, state, data);
    return;
  }

  // ===== 革命AI（リッチメニューから起動）=====
  if (inputText === '革命AI') {
    await reply(replyToken, at, [text(
      '🤖 革命AI\n\nただいま準備中です。\n近日公開予定ですので、もうしばらくお待ちください！'
    )]);
    return;
  }

  // ===== マニュアル検索（全登録ユーザー共通）=====
  // 「？ 質問」または「?質問」で始まるメッセージはマニュアルBotへ
  const manualMatch = inputText.match(/^[?？]\s*(.+)/s);
  if (manualMatch && (env as any).GROQ_API_KEY) {
    const question = manualMatch[1].trim();
    const answer = await queryManual(env.DB, (env as any).GROQ_API_KEY, question, 'line', lineUid);
    await reply(replyToken, at, [text(`📖 革命AI\n\n${answer}`)]);
    return;
  }

  // ===== 登録済みユーザー: 連携解除 =====
  if (inputText === 'れんけいかいじょ') {
    await env.DB.prepare('DELETE FROM line_liff_users WHERE line_uid = ?').bind(lineUid).run();
    await env.DB.prepare('DELETE FROM line_users WHERE line_uid = ?').bind(lineUid).run();
    await env.DB.prepare('DELETE FROM line_conv_states WHERE line_uid = ?').bind(lineUid).run();
    await removeRichMenu(lineUid, at);
    await reply(replyToken, at, [text('LINE連携を解除しました。')]);
    return;
  }

  // ===== 役割別処理 =====
  const role = liffUser.role;

  switch (role) {
    case 'general_manager':
    case 'operations_manager':
      await handleOperationsUser(env, lineUid, replyToken, at, inputText, state, data, liffUser);
      break;
    case 'vehicle_manager':
      await handleVehicleManager(env, lineUid, replyToken, at, inputText);
      break;
    case 'newcomer':
      await handleNewcomer(env, lineUid, replyToken, at, inputText, state, data, liffUser);
      break;
    default: // unknown
      await handleUnknownRole(replyToken, at, liffUser.name);
      break;
  }
}

// ===================================================
// 登録フロー（コマンド + パスワード認証）
// ===================================================

async function handleRegistrationFlow(
  env: Env, lineUid: string, replyToken: string, at: string,
  inputText: string, state: string, data: Record<string, string | number>,
): Promise<boolean> {
  // キャンセル
  if (inputText === 'キャンセル' || inputText === 'cancel') {
    await setState(env.DB, lineUid, 'idle');
    await reply(replyToken, at, [text('登録をキャンセルしました。')]);
    return true;
  }

  // 名前入力待ち
  const nameStates: Record<string, string> = {
    reg_general_name:    'reg_general_password',
    reg_operations_name: 'reg_operations_password',
    reg_vehicle_name:    'reg_vehicle_password',
  };
  if (nameStates[state]) {
    await setState(env.DB, lineUid, nameStates[state], { name: inputText });
    await reply(replyToken, at, [text('パスワードを入力してください。')]);
    return true;
  }

  // パスワード確認・登録
  if (state === 'reg_general_password') {
    const pwd = env.LINE_REG_PWD_GENERAL ?? '';
    if (!pwd || inputText !== pwd) {
      await setState(env.DB, lineUid, 'idle');
      await reply(replyToken, at, [text('パスワードが正しくありません。最初からやり直してください。')]);
    } else {
      await registerLiffUser(env.DB, lineUid, String(data.name), 'general_manager', null, env);
      await setState(env.DB, lineUid, 'idle');
      await reply(replyToken, at, [text(`あなたは 統括管理者 で登録されました。\n\n車番検索・忘れ物対応・事故報告などすべての機能をご利用いただけます。\n\n数字を送信すると車両情報を検索できます。`)]);
    }
    return true;
  }

  if (state === 'reg_operations_password') {
    const pwd = env.LINE_REG_PWD_OPERATIONS ?? '';
    if (!pwd || inputText !== pwd) {
      await setState(env.DB, lineUid, 'idle');
      await reply(replyToken, at, [text('パスワードが正しくありません。最初からやり直してください。')]);
    } else {
      await registerLiffUser(env.DB, lineUid, String(data.name), 'operations_manager', null, env);
      await setState(env.DB, lineUid, 'idle');
      await reply(replyToken, at, [text(`あなたは 運行管理者 で登録されました。\n\n車番検索・忘れ物対応・事故報告の機能をご利用いただけます。\n\n数字を送信すると車両情報を検索できます。`)]);
    }
    return true;
  }

  if (state === 'reg_vehicle_password') {
    const pwd = env.LINE_REG_PWD_VEHICLE ?? '';
    if (!pwd || inputText !== pwd) {
      await setState(env.DB, lineUid, 'idle');
      await reply(replyToken, at, [text('パスワードが正しくありません。最初からやり直してください。')]);
    } else {
      await registerLiffUser(env.DB, lineUid, String(data.name), 'vehicle_manager', null, env);
      await setState(env.DB, lineUid, 'idle');
      await reply(replyToken, at, [text(`あなたは 車番管理者 で登録されました。\n\n数字を送信すると車両情報を検索できます。\n例）「6677」`)]);
    }
    return true;
  }

  return false;
}

// ===================================================
// 未登録ユーザー
// ===================================================

async function handleUnregisteredUser(
  env: Env, lineUid: string, replyToken: string, at: string,
  inputText: string, state: string, data: Record<string, string | number>,
): Promise<void> {
  // 登録コマンド → 名前入力フローへ
  if (inputText === '統括管理者登録') {
    await setState(env.DB, lineUid, 'reg_general_name');
    await reply(replyToken, at, [text('統括管理者として登録します。\nあなたの名前を漢字フルネームで入力してください。')]);
    return;
  }
  if (inputText === '運行管理者登録') {
    await setState(env.DB, lineUid, 'reg_operations_name');
    await reply(replyToken, at, [text('運行管理者として登録します。\nあなたの名前を漢字フルネームで入力してください。')]);
    return;
  }
  if (inputText === '車番連携') {
    await setState(env.DB, lineUid, 'reg_vehicle_name');
    await reply(replyToken, at, [text('車番管理者として登録します。\nあなたの名前を漢字フルネームで入力してください。')]);
    return;
  }

  // 招待コード（新人登録）
  const inputCode = inputText.toUpperCase();
  const invite = await env.DB.prepare(
    'SELECT id, emp_id, expires_at FROM invite_codes WHERE code = ? AND is_used = 0'
  ).bind(inputCode).first<{ id: number; emp_id: number | null; expires_at: string }>();

  if (invite && invite.expires_at > new Date().toISOString()) {
    if (invite.emp_id) {
      await env.DB.prepare(
        'UPDATE invite_codes SET is_used = 1, used_at = datetime(\'now\', \'localtime\') WHERE id = ?'
      ).bind(invite.id).run();

      // line_users への追加（後方互換）
      await env.DB.prepare(
        'INSERT OR REPLACE INTO line_users (line_uid, emp_id) VALUES (?, ?)'
      ).bind(lineUid, invite.emp_id).run();

      const emp = await env.DB.prepare('SELECT name FROM employees WHERE id = ?')
        .bind(invite.emp_id).first<{ name: string }>();
      const empName = emp?.name ?? '';

      await registerLiffUser(env.DB, lineUid, empName, 'newcomer', invite.emp_id, env);
      await reply(replyToken, at, [text(
        `あなたは 新人 で登録されました。\n\n🎉 ${empName}さん、ITABASHIへようこそ！\n\n困ったこと・嫌なことがあれば\nいつでも気軽に報告してください。\nあなたのことをしっかりサポートします💪`
      )]);
    }
    return;
  }

  // 未認識
  await reply(replyToken, at, [text(
    '登録されていません。\n\n招待コードをお持ちの方はコードを送信してください。\n\n管理者から登録コマンドを受け取った方は、そのコマンドを送信してください。\n\n（UID確認: 「uid」と送信）'
  )]);
}

// ===================================================
// 運行管理者・統括管理者
// ===================================================

async function handleOperationsUser(
  env: Env, lineUid: string, replyToken: string, at: string,
  inputText: string, state: string, data: Record<string, string | number>,
  liffUser: LiffUser,
): Promise<void> {
  // キャンセル
  if (inputText === 'キャンセル' || inputText === 'cancel') {
    await setState(env.DB, lineUid, 'idle');
    await reply(replyToken, at, [text('キャンセルしました。')]);
    return;
  }

  // 数字 → 車番検索
  if (/^\d{1,6}$/.test(inputText)) {
    const vehicles = await searchVehicles(env.DB, inputText);
    await reply(replyToken, at, [text(formatVehicleResults(inputText, vehicles))]);
    return;
  }

  // 忘れ物対応 → LIFF URLを送信
  if (inputText === '忘れ物対応' || inputText === '忘れ物') {
    const liffId = env.LIFF_ID_LOST_ITEM ?? '';
    const url = liffId ? `https://liff.line.me/${liffId}` : '';
    if (url) {
      await reply(replyToken, at, [text(`📦 忘れ物対応フォーム\n\n下をタップして開いてください:\n${url}`)]);
    }
    return;
  }

  // 事故報告 → LIFF URLを送信
  if (inputText === '事故報告' || inputText === '事故') {
    const liffId = env.LIFF_ID_ACCIDENT ?? '';
    const url = liffId ? `https://liff.line.me/${liffId}` : '';
    if (url) {
      await reply(replyToken, at, [text(`🚨 事故報告フォーム\n\n下をタップして開いてください:\n${url}`)]);
    }
    return;
  }

  // 社員照会＋（課選択→絞り込み検索）→ LIFF URLを送信
  if (inputText === '社員照会＋' || inputText === '社員照会プラス') {
    const liffId = env.LIFF_ID_STAFF_LOOKUP_PLUS ?? '';
    const url = liffId ? `https://liff.line.me/${liffId}` : '';
    if (url) {
      await reply(replyToken, at, [text(`👥 社員照会＋（課別検索）\n\n下をタップして開いてください:\n${url}`)]);
    } else {
      await reply(replyToken, at, [text('👥 社員照会＋\n\nただいま準備中です。もうしばらくお待ちください！')]);
    }
    return;
  }

  // 車番検索ガイド
  if (inputText === '車番検索') {
    await reply(replyToken, at, [text('検索したい無線番号またはナンバーの数字を入力してください。\n例）「5232」')]);
    return;
  }

  // その他
  await reply(replyToken, at, [textWithQuickReply(
    'リッチメニューからご利用ください。\n数字を送信すると車番検索ができます。',
    [
      { label: '忘れ物対応', text: '忘れ物対応' },
      { label: '事故報告', text: '事故報告' },
      { label: '車番検索', text: '車番検索' },
    ]
  )]);
}

// ===================================================
// 車番管理者
// ===================================================

async function handleVehicleManager(
  env: Env, lineUid: string, replyToken: string, at: string,
  inputText: string,
): Promise<void> {
  if (/^\d{1,6}$/.test(inputText)) {
    const vehicles = await searchVehicles(env.DB, inputText);
    await reply(replyToken, at, [text(formatVehicleResults(inputText, vehicles))]);
    return;
  }
  if (inputText === '車番検索') {
    await reply(replyToken, at, [text('検索したい無線番号またはナンバーの数字を入力してください。\n例）「5232」')]);
    return;
  }
  await reply(replyToken, at, [text('数字を送信すると車両情報を検索します。\n例）「6677」')]);
}

// ===================================================
// 新人
// ===================================================

async function handleNewcomer(
  env: Env, lineUid: string, replyToken: string, at: string,
  inputText: string, state: string, data: Record<string, string | number>,
  liffUser: LiffUser,
): Promise<void> {
  const empId = liffUser.emp_id;

  // キャンセル
  if (inputText === 'キャンセル' || inputText === 'cancel') {
    await setState(env.DB, lineUid, 'idle');
    await reply(replyToken, at, [text('キャンセルしました。')]);
    return;
  }

  // メニューコマンドによるフロー割り込み
  const MENU_CMDS = ['売上記録', '売上を記録', '嫌なこと報告', '報告', 'シフト確認'];
  if (state !== 'idle' && MENU_CMDS.includes(inputText)) {
    await setState(env.DB, lineUid, 'idle');
  }

  const { state: curState, data: curData } = await getState(env.DB, lineUid);

  // ===== idle =====
  if (curState === 'idle') {
    if (inputText === '売上記録' || inputText === '売上を記録') {
      if (!empId) { await reply(replyToken, at, [text('社員情報が見つかりません。')]); return; }
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
      if (!empId) { await reply(replyToken, at, [text('社員情報が見つかりません。')]); return; }
      const today = todayJST();
      const { year, month } = getPeriod(today);
      const { start, end } = getPeriodRange(year, month);
      const shifts = await env.DB.prepare(
        'SELECT date, entry_main FROM shift_entries WHERE emp_id = ? AND date >= ? AND date <= ? ORDER BY date'
      ).bind(empId, start, end).all<{ date: string; entry_main: string }>();

      const WEEKDAY = ['日', '月', '火', '水', '木', '金', '土'];
      let msg = `📅 ${year}年${month}月度のシフト\n（${start}〜${end}）\n\n`;
      const shiftMap: Record<string, string> = {};
      for (const s of (shifts.results ?? [])) { shiftMap[s.date] = s.entry_main ?? ''; }
      const cur = new Date(today);
      const endDate = new Date(end);
      let count = 0;
      while (cur <= endDate && count < 14) {
        const d = cur.toISOString().split('T')[0];
        const dt = new Date(d);
        const dow = WEEKDAY[dt.getUTCDay()];
        const entry = shiftMap[d] ?? '';
        if (entry) { msg += `${d.slice(5)} (${dow}): ${entry}\n`; count++; }
        cur.setDate(cur.getDate() + 1);
      }
      if (count === 0) msg += '（まだシフトが入力されていません）';
      await reply(replyToken, at, [text(msg)]);
      return;
    }

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
  if (curState === 'sales_confirm_overwrite') {
    if (inputText === '上書き') {
      await setState(env.DB, lineUid, 'sales_amount', { date: curData.date as string });
      await reply(replyToken, at, [text('売上金額を入力してください。\n（円。例: 18500）')]);
    } else {
      await setState(env.DB, lineUid, 'idle');
      await reply(replyToken, at, [text('キャンセルしました。')]);
    }
    return;
  }

  if (curState === 'sales_amount') {
    const amount = parseInt(inputText.replace(/[^0-9]/g, ''));
    if (isNaN(amount) || amount < 0 || amount > 999999) {
      await reply(replyToken, at, [text('金額を正しく入力してください。\n（例: 18500）')]); return;
    }
    await setState(env.DB, lineUid, 'sales_rides', { ...curData, amount });
    await reply(replyToken, at, [text('乗車回数を入力してください。\n（例: 8）')]);
    return;
  }

  if (curState === 'sales_rides') {
    const rides = parseInt(inputText.replace(/[^0-9]/g, ''));
    if (isNaN(rides) || rides < 0 || rides > 999) {
      await reply(replyToken, at, [text('乗車回数を正しく入力してください。\n（例: 8）')]); return;
    }
    await setState(env.DB, lineUid, 'sales_distance', { ...curData, ride_count: rides });
    await reply(replyToken, at, [text('走行距離を入力してください。\n（km。例: 120）')]);
    return;
  }

  if (curState === 'sales_distance') {
    const dist = parseInt(inputText.replace(/[^0-9]/g, ''));
    if (isNaN(dist) || dist < 0 || dist > 9999) {
      await reply(replyToken, at, [text('走行距離を正しく入力してください。\n（例: 120）')]); return;
    }
    const newData = { ...curData, distance_km: dist };
    await setState(env.DB, lineUid, 'sales_confirm', newData);
    await reply(replyToken, at, [textWithQuickReply(
      `✅ 内容確認\n\n📅 日付: ${curData.date}\n💰 売上: ${(curData.amount as number).toLocaleString('ja-JP')}円\n🚕 乗車: ${curData.ride_count}回\n🗺️ 距離: ${dist}km\n\n登録しますか？`,
      [{ label: '✅ 登録する', text: '登録' }, { label: '❌ キャンセル', text: 'キャンセル' }]
    )]);
    return;
  }

  if (curState === 'sales_confirm') {
    if (inputText === '登録') {
      if (!empId) { await reply(replyToken, at, [text('社員情報が見つかりません。')]); return; }
      const { year, month } = getPeriod(curData.date as string);
      await env.DB.prepare(`
        INSERT INTO sales_records (emp_id, date, amount, ride_count, distance_km, period_year, period_month, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
        ON CONFLICT(emp_id, date) DO UPDATE SET
          amount = excluded.amount, ride_count = excluded.ride_count,
          distance_km = excluded.distance_km, updated_at = datetime('now', 'localtime')
      `).bind(empId, curData.date, curData.amount, curData.ride_count ?? null, curData.distance_km ?? null, year, month).run();
      await setState(env.DB, lineUid, 'idle');
      await reply(replyToken, at, [text(`✅ 登録しました！\n${curData.date}\n売上: ${(curData.amount as number).toLocaleString('ja-JP')}円`)]);
    } else {
      await setState(env.DB, lineUid, 'idle');
      await reply(replyToken, at, [text('キャンセルしました。')]);
    }
    return;
  }

  // ===== 嫌なこと報告フロー =====
  if (curState === 'event_category') {
    const validCats = ['クレーマー', '交通トラブル', '社内の出来事', 'その他'];
    if (!validCats.includes(inputText)) {
      await reply(replyToken, at, [textWithQuickReply('カテゴリを選択してください。', validCats.map(c => ({ label: c, text: c })))]);
      return;
    }
    await setState(env.DB, lineUid, 'event_content', { category: inputText });
    await reply(replyToken, at, [text(`「${inputText}」について教えてください。\n\nどんな出来事があったか、経緯を詳しく書いてください。`)]);
    return;
  }

  if (curState === 'event_content') {
    if (inputText.length < 5) {
      await reply(replyToken, at, [text('もう少し詳しく教えてください。')]); return;
    }
    await setState(env.DB, lineUid, 'event_feeling', { ...curData, content: inputText });
    await reply(replyToken, at, [textWithQuickReply(
      'その時の気持ちや感想を教えてください。\n（任意。スキップすることもできます）',
      [{ label: 'スキップ', text: 'スキップ' }]
    )]);
    return;
  }

  if (curState === 'event_feeling') {
    const feeling = inputText === 'スキップ' ? '' : inputText;
    if (!empId) { await reply(replyToken, at, [text('社員情報が見つかりません。')]); return; }
    await env.DB.prepare(
      'INSERT INTO bad_events (emp_id, category, content, feeling) VALUES (?, ?, ?, ?)'
    ).bind(empId, curData.category, curData.content, feeling || null).run();
    await setState(env.DB, lineUid, 'idle');
    await reply(replyToken, at, [text(
      '✅ 記録しました。\n\n話してくれてありがとうございます。\n管理者が確認します。\n\nいつでも気になることがあれば報告してください。'
    )]);
    return;
  }

  await setState(env.DB, lineUid, 'idle');
  await reply(replyToken, at, [text('リッチメニューからご利用ください。')]);
}

// ===================================================
// 権限不明者
// ===================================================

async function handleUnknownRole(replyToken: string, at: string, name: string): Promise<void> {
  await reply(replyToken, at, [text(
    `${name ? name + 'さん、' : ''}現在 権限不明者 として登録されています。\n\n統括管理者に連絡して、権限の割り当てを依頼してください。`
  )]);
}
