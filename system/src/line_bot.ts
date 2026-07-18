// LINE Bot メインハンドラー
// 権限: line_liff_users テーブルで一元管理
// role: general_manager / operations_manager / vehicle_manager / newcomer / unknown

import { getPeriod, getPeriodRange } from './auth';
import type { Env } from './auth';
import { getRichMenuForRole } from './routes/admin_liff';
import { queryManual } from './utils/manual_search';
import { isTicketQuestion, queryTicket } from './utils/ticket_bot';
import { logLineActivity } from './utils/activity_log';
import { setBentenConfig, linkBentenMember, BENTEN_MASTER_ROLES } from './benten';

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

// URIタップで直接LIFF/外部URLへ遷移するクイックリプライ（ブラウザ中継ページを挟まず、タップ1回でLIFFの
// ネイティブ表示に入れる。忘れ物対応・事故報告の既存リッチメニューボタンと同じuriアクション方式）
const textWithUriQuickReply = (msg: string, items: { label: string; uri: string }[]) => ({
  type: 'text',
  text: msg,
  quickReply: {
    items: items.map(i => ({
      type: 'action',
      action: { type: 'uri', label: i.label, uri: i.uri }
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

// 社員名の完全一致で employees.id を line_liff_users.emp_id に紐付ける（売上・ODO機能に必要）
async function linkEmployeeByName(db: D1Database, lineUid: string, name: string): Promise<void> {
  const emp = await db.prepare(
    'SELECT id FROM employees WHERE name = ? AND is_active = 1 LIMIT 1'
  ).bind(name).first<{ id: number }>();
  if (emp) {
    await db.prepare('UPDATE line_liff_users SET emp_id = ? WHERE line_uid = ?').bind(emp.id, lineUid).run();
  }
}

// ===================================================
// 利用状況ログ: 入力テキスト・会話ステートから機能を分類（管理画面「LINE利用状況」の集計用）
// ===================================================

const REG_COMMANDS = [
  '統括管理者登録', '運行管理者登録', '車番連携', 'ベンテン会員登録', 'ベンテンクラブ会員登録',
  'シフトマスター登録', 'ベンテンシフトマスター登録', '乗務社員登録',
  'LINE連携', '友達追加', '連携', '新人', '乗務社員', '弁天倶楽部会員', '車番管理者',
];

function classifyBotFeature(inputText: string, state: string): string {
  if (state.startsWith('reg_')) return '登録・連携';
  if (state.startsWith('odo_')) return 'ODO記録';
  if (state.startsWith('event_')) return '嫌なこと報告';
  if (inputText === 'uid' || inputText === 'UID') return 'UID確認';
  if (/^\d{1,6}$/.test(inputText)) return '車番検索';
  const qMatch = inputText.match(/^[?？]\s*(.+)/s);
  if (qMatch) return isTicketQuestion(qMatch[1].trim()) ? 'チケットAI' : 'マニュアルAI';
  if (inputText === '売上記録' || inputText === '売上を記録') return '売上記録';
  if (inputText === 'ODO') return 'ODO記録';
  if (inputText === '忘れ物対応' || inputText === '忘れ物') return '忘れ物対応';
  if (inputText === '事故報告' || inputText === '事故') return '事故報告';
  if (inputText === '違反報告' || inputText === '違反') return '違反報告';
  if (inputText === '嫌なこと報告') return '嫌なこと報告';
  if (inputText === '報告') return '報告メニュー';
  if (inputText === 'シフト確認') return 'シフト確認';
  if (['シフト', 'シフト表', 'ベンテンシフト', 'ベンテン'].includes(inputText)) return 'ベンテンシフト';
  if (inputText === '社員照会＋' || inputText === '社員照会プラス') return '社員照会';
  if (REG_COMMANDS.includes(inputText)) return '登録・連携';
  if (inputText === 'れんけいかいじょ') return '連携解除';
  if (inputText === '車番検索') return '車番検索';
  if (inputText === 'マイカレ') return 'マイカレ';
  if (inputText === 'AI') return 'AI';
  if (inputText === 'キャンセル' || inputText === 'cancel') return 'キャンセル';
  return 'その他';
}

// ===================================================
// メインハンドラー
// ===================================================

export async function handleLineEvent(env: Env, event: Record<string, unknown>): Promise<void> {
  const lineUid = (event.source as Record<string, string>)?.userId;
  if (!lineUid) return;
  const replyToken = event.replyToken as string;
  const at = env.LINE_CHANNEL_ACCESS_TOKEN!;

  // ===== 友達追加（follow）=====
  // 権限不明者用リッチメニュー（RICHMENU_ID_UNKNOWN）を割り当てる。
  // 「友達追加・LINE連携はこちら」ボタンを押すとステータス選択メニューが起動する（handleUnregisteredUser参照）。
  if (event.type === 'follow') {
    await logLineActivity(env.DB, lineUid, 'bot', 'follow', '友だち追加');
    const existing = await env.DB.prepare(
      'SELECT role FROM line_liff_users WHERE line_uid = ?'
    ).bind(lineUid).first<{ role: string }>();

    if (existing) {
      // 既存ユーザーの再フォロー（ブロック解除等）: 現在のロールのリッチメニューを再割り当て
      const menuId = getRichMenuForRole(existing.role, env);
      if (menuId) await assignRichMenu(lineUid, menuId, at);
      else await removeRichMenu(lineUid, at);
      if (replyToken) await reply(replyToken, at, [text('おかえりなさい！')]);
    } else {
      // 新規フォロー: 権限不明者として登録し、案内リッチメニューを割り当て
      await env.DB.prepare(`
        INSERT INTO line_liff_users (line_uid, name, role, created_at, updated_at)
        VALUES (?, '', 'unknown', datetime('now', 'localtime'), datetime('now', 'localtime'))
        ON CONFLICT(line_uid) DO NOTHING
      `).bind(lineUid).run();
      const menuId = getRichMenuForRole('unknown', env);
      if (menuId) await assignRichMenu(lineUid, menuId, at);
      if (replyToken) {
        await reply(replyToken, at, [text(
          '友だち追加ありがとうございます！\n\nリッチメニューの「LINE連携」から、あなたのステータスを選択して登録を進めてください。'
        )]);
      }
    }
    return;
  }

  // テキスト入力を取得
  let inputText = '';
  if (event.type === 'message' && (event.message as Record<string, string>)?.type === 'text') {
    inputText = ((event.message as Record<string, string>)?.text ?? '').trim();
  }
  if (event.type === 'postback') {
    inputText = (event.postback as Record<string, string>)?.data ?? '';
  }
  if (event.type === 'unfollow') {
    await logLineActivity(env.DB, lineUid, 'bot', 'unfollow', 'ブロック/友だち解除');
    return;
  }
  if (event.type !== 'message' && event.type !== 'postback') return;

  // ===== グループ内メッセージ =====
  // ベンテンクラブのLINEグループ登録コマンドのみ反応し、それ以外は無視
  const source = event.source as Record<string, string>;
  if (source?.type === 'group') {
    if (inputText === 'ベンテングループ登録') {
      const sender = await env.DB.prepare(
        'SELECT role FROM line_liff_users WHERE line_uid = ?'
      ).bind(lineUid).first<{ role: string }>();
      if (sender && BENTEN_MASTER_ROLES.includes(sender.role)) {
        await setBentenConfig(env.DB, 'line_group_id', source.groupId);
        await reply(replyToken, at, [text('✅ このグループをベンテンクラブの送信先に登録しました。\n毎日のシフト自動送信はこのグループに届きます。')]);
      } else {
        await reply(replyToken, at, [text('この操作はシフトマスターまたは統括管理者のみ実行できます。')]);
      }
    }
    return;
  }

  // ===== 会話ステート取得 =====
  const { state, data } = await getState(env.DB, lineUid);

  // ===== 利用状況ログ（1:1トークのみ。記録失敗はBot動作に影響させない）=====
  // 登録パスワード入力中の生テキストはログに残さない
  const logDetail = state.includes('password') ? '（パスワード入力）' : inputText;
  await logLineActivity(env.DB, lineUid, 'bot', String(event.type), classifyBotFeature(inputText, state), logDetail);

  // UID確認コマンド（全ユーザー共通）
  if (inputText === 'uid' || inputText === 'UID') {
    await reply(replyToken, at, [text(`あなたのLINE UID:\n${lineUid}`)]);
    return;
  }

  // ===== 登録済みユーザーかチェック =====
  const liffUser = await env.DB.prepare(
    'SELECT id, name, emp_id, role FROM line_liff_users WHERE line_uid = ?'
  ).bind(lineUid).first<LiffUser>();

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

  // ===== AI（リッチメニューから起動）=====
  if (inputText === 'AI') {
    await reply(replyToken, at, [text(
      '🤖 AI\n\nただいま準備中です。\n近日公開予定ですので、もうしばらくお待ちください！'
    )]);
    return;
  }

  // ===== マニュアル検索（全登録ユーザー共通）=====
  // 「？ 質問」または「?質問」で始まるメッセージはマニュアルBotへ
  const manualMatch = inputText.match(/^[?？]\s*(.+)/s);
  if (manualMatch && (env as any).GROQ_API_KEY) {
    const question = manualMatch[1].trim();
    // チケット関連の質問は専用Bot（知識ベース全量埋め込み）で回答
    if (isTicketQuestion(question)) {
      const answer = await queryTicket(env.DB, (env as any).GROQ_API_KEY, question, 'line', lineUid);
      await reply(replyToken, at, [text(`🎫 革命AI\n\n${answer}`)]);
      return;
    }
    const answer = await queryManual(env.DB, (env as any).GROQ_API_KEY, question, 'line', lineUid);
    await reply(replyToken, at, [text(`📖 革命AI\n\n${answer}`)]);
    return;
  }

  // ===== 登録済みユーザー: 連携解除 =====
  if (inputText === 'れんけいかいじょ') {
    await env.DB.prepare('DELETE FROM line_liff_users WHERE line_uid = ?').bind(lineUid).run();
    await env.DB.prepare('DELETE FROM line_users WHERE line_uid = ?').bind(lineUid).run();
    await env.DB.prepare('DELETE FROM line_conv_states WHERE line_uid = ?').bind(lineUid).run();
    await env.DB.prepare('UPDATE benten_members SET line_uid = NULL WHERE line_uid = ?').bind(lineUid).run();
    await removeRichMenu(lineUid, at);
    await reply(replyToken, at, [text('LINE連携を解除しました。')]);
    return;
  }

  // ===== 役割別処理 =====
  const role = liffUser.role;

  // ===== 売上記録・ODO記録（対象ロール共通）=====
  const SALES_ODO_ROLES = ['crew_member', 'newcomer', 'benten_member', 'benten_shift_master', 'general_manager'];
  if (SALES_ODO_ROLES.includes(role)) {
    const handled = await handleSalesOdoFlow(env, lineUid, replyToken, at, inputText, state, data, liffUser);
    if (handled) return;
  }

  switch (role) {
    case 'general_manager':
    case 'operations_manager':
      await handleOperationsUser(env, lineUid, replyToken, at, inputText, state, data, liffUser);
      break;
    case 'vehicle_manager':
      await handleVehicleManager(env, lineUid, replyToken, at, inputText);
      break;
    case 'newcomer':
    case 'crew_member':
      await handleNewcomer(env, lineUid, replyToken, at, inputText, state, data, liffUser);
      break;
    case 'benten_member':
    case 'benten_shift_master':
      await handleBentenUser(env, replyToken, at, inputText);
      break;
    default: // unknown（友達追加直後を含む・未登録と同じ「LINE連携」フローに合流させる）
      await handleUnregisteredUser(env, lineUid, replyToken, at, inputText, state, data);
      break;
  }
}

// ===================================================
// 登録フロー（コマンド + パスワード認証）
// ===================================================

// 「LINE連携」ステータス選択メニュー経由の登録で使うロール→パスワードの対応
// （newcomer と crew_member は同じパスワードを共有する運用）
function menuRolePassword(role: string, env: Env): string {
  switch (role) {
    case 'newcomer':
    case 'crew_member':     return env.LINE_REG_PWD_CREW_MEMBER ?? '';
    case 'benten_member':   return env.LINE_REG_PWD_BENTEN ?? '';
    case 'vehicle_manager': return env.LINE_REG_PWD_VEHICLE ?? '';
    default:                return '';
  }
}
const MENU_ROLE_LABELS: Record<string, string> = {
  newcomer: '新人',
  crew_member: '乗務社員',
  benten_member: '弁天倶楽部会員',
  vehicle_manager: '車番管理者',
};

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
    reg_general_name:       'reg_general_password',
    reg_operations_name:    'reg_operations_password',
    reg_vehicle_name:       'reg_vehicle_password',
    reg_benten_name:        'reg_benten_password',
    reg_benten_master_name: 'reg_benten_master_password',
    reg_crew_member_name:   'reg_crew_member_password',
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

  if (state === 'reg_benten_password') {
    const pwd = env.LINE_REG_PWD_BENTEN ?? '';
    if (!pwd || inputText !== pwd) {
      await setState(env.DB, lineUid, 'idle');
      await reply(replyToken, at, [text('パスワードが正しくありません。最初からやり直してください。')]);
    } else {
      await registerLiffUser(env.DB, lineUid, String(data.name), 'benten_member', null, env);
      await linkBentenMember(env.DB, lineUid, String(data.name));
      await linkEmployeeByName(env.DB, lineUid, String(data.name));
      await setState(env.DB, lineUid, 'idle');
      const liffId = env.LIFF_ID_BENTEN_SHIFT ?? '';
      const url = liffId ? `\n\n📱 シフト入力・確認はこちら:\nhttps://liff.line.me/${liffId}` : '';
      await reply(replyToken, at, [text(`あなたは ベンテンクラブ会員 で登録されました。\n\n「シフト」と送信するとシフト入力・シフト表を開けます。${url}`)]);
    }
    return true;
  }

  if (state === 'reg_benten_master_password') {
    const pwd = env.LINE_REG_PWD_BENTEN_MASTER ?? '';
    if (!pwd || inputText !== pwd) {
      await setState(env.DB, lineUid, 'idle');
      await reply(replyToken, at, [text('パスワードが正しくありません。最初からやり直してください。')]);
    } else {
      await registerLiffUser(env.DB, lineUid, String(data.name), 'benten_shift_master', null, env);
      await linkBentenMember(env.DB, lineUid, String(data.name));
      await linkEmployeeByName(env.DB, lineUid, String(data.name));
      await setState(env.DB, lineUid, 'idle');
      const liffId = env.LIFF_ID_BENTEN_SHIFT ?? '';
      const url = liffId ? `\n\n📱 シフト入力・確認はこちら:\nhttps://liff.line.me/${liffId}` : '';
      await reply(replyToken, at, [text(`あなたは ベンテンクラブシフトマスター で登録されました。\n\n全会員のシフトを編集できます。\n「シフト」と送信するとシフト入力・シフト表を開けます。${url}`)]);
    }
    return true;
  }

  if (state === 'reg_crew_member_password') {
    const pwd = env.LINE_REG_PWD_CREW_MEMBER ?? '';
    if (!pwd || inputText !== pwd) {
      await setState(env.DB, lineUid, 'idle');
      await reply(replyToken, at, [text('パスワードが正しくありません。最初からやり直してください。')]);
    } else {
      await registerLiffUser(env.DB, lineUid, String(data.name), 'crew_member', null, env);
      await linkEmployeeByName(env.DB, lineUid, String(data.name));
      await setState(env.DB, lineUid, 'idle');
      await reply(replyToken, at, [text('あなたは 乗務社員 で登録されました。\n\n「売上記録」「ODO」のボタンからご利用いただけます。')]);
    }
    return true;
  }

  // ===== ステータス選択メニュー経由の登録フロー（新人/乗務社員/弁天倶楽部会員/車番管理者）=====
  if (state === 'reg_menu_password') {
    const role = String(data.role);
    const pwd = menuRolePassword(role, env);
    if (!pwd || inputText !== pwd) {
      await setState(env.DB, lineUid, 'idle');
      await reply(replyToken, at, [text('パスワードが正しくありません。もう一度「LINE連携」からやり直してください。')]);
      return true;
    }
    if (role === 'newcomer' || role === 'crew_member') {
      await setState(env.DB, lineUid, 'reg_menu_empno', { role });
      await reply(replyToken, at, [text('社員番号（数字8桁）を入力してください。')]);
    } else {
      await setState(env.DB, lineUid, 'reg_menu_name', { role });
      await reply(replyToken, at, [text('あなたの名前を漢字フルネームで入力してください。')]);
    }
    return true;
  }

  if (state === 'reg_menu_empno') {
    const empNo = inputText.trim();
    if (!/^\d{8}$/.test(empNo)) {
      await reply(replyToken, at, [text('社員番号は数字8桁で入力してください。\n例）20230001')]);
      return true;
    }
    const emp = await env.DB.prepare('SELECT id FROM employees WHERE emp_no = ? AND is_active = 1').bind(empNo).first<{ id: number }>();
    if (!emp) {
      await reply(replyToken, at, [text('この社員番号は見つかりませんでした。もう一度入力してください。')]);
      return true;
    }
    await setState(env.DB, lineUid, 'reg_menu_name', { role: String(data.role), emp_id: emp.id });
    await reply(replyToken, at, [text('あなたの名前を漢字フルネームで入力してください。')]);
    return true;
  }

  if (state === 'reg_menu_name') {
    const role = String(data.role);
    const name = inputText;
    if (role === 'newcomer' || role === 'crew_member') {
      const empId = data.emp_id as number;
      await registerLiffUser(env.DB, lineUid, name, role, empId, env);
      await setState(env.DB, lineUid, 'idle');
      if (role === 'newcomer') {
        await reply(replyToken, at, [text(`あなたは 新人 で登録されました。\n\n🎉 ${name}さん、ITABASHIへようこそ！\n\n困ったこと・嫌なことがあれば\nいつでも気軽に報告してください。\nあなたのことをしっかりサポートします💪`)]);
      } else {
        await reply(replyToken, at, [text(`あなたは 乗務社員 で登録されました。\n\n「売上記録」「ODO」のボタンからご利用いただけます。`)]);
      }
    } else if (role === 'benten_member') {
      await registerLiffUser(env.DB, lineUid, name, 'benten_member', null, env);
      await linkBentenMember(env.DB, lineUid, name);
      await linkEmployeeByName(env.DB, lineUid, name);
      await setState(env.DB, lineUid, 'idle');
      const liffId = env.LIFF_ID_BENTEN_SHIFT ?? '';
      const url = liffId ? `\n\n📱 シフト入力・確認はこちら:\nhttps://liff.line.me/${liffId}` : '';
      await reply(replyToken, at, [text(`あなたは ベンテンクラブ会員 で登録されました。\n\n「シフト」と送信するとシフト入力・シフト表を開けます。${url}`)]);
    } else if (role === 'vehicle_manager') {
      await registerLiffUser(env.DB, lineUid, name, 'vehicle_manager', null, env);
      await setState(env.DB, lineUid, 'idle');
      await reply(replyToken, at, [text(`あなたは 車番管理者 で登録されました。\n\n数字を送信すると車両情報を検索できます。\n例）「6677」`)]);
    } else {
      await setState(env.DB, lineUid, 'idle');
      await reply(replyToken, at, [text('登録に失敗しました。もう一度「LINE連携」からやり直してください。')]);
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
  if (inputText === 'ベンテン会員登録' || inputText === 'ベンテンクラブ会員登録') {
    await setState(env.DB, lineUid, 'reg_benten_name');
    await reply(replyToken, at, [text('ベンテンクラブ会員として登録します。\nあなたの名前を漢字フルネームで入力してください。\n（シフト表の名前と同じ表記にしてください）')]);
    return;
  }
  if (inputText === 'シフトマスター登録' || inputText === 'ベンテンシフトマスター登録') {
    await setState(env.DB, lineUid, 'reg_benten_master_name');
    await reply(replyToken, at, [text('ベンテンクラブシフトマスターとして登録します。\nあなたの名前を漢字フルネームで入力してください。')]);
    return;
  }
  if (inputText === '乗務社員登録') {
    await setState(env.DB, lineUid, 'reg_crew_member_name');
    await reply(replyToken, at, [text('乗務社員として登録します。\nあなたの名前を漢字フルネームで入力してください。\n（社員名簿の表記と同じにしてください）')]);
    return;
  }

  // ===== LINE連携（ステータス選択メニュー。友達追加時のリッチメニューから起動）=====
  if (inputText === 'LINE連携' || inputText === '友達追加' || inputText === '連携') {
    await setState(env.DB, lineUid, 'idle');
    await reply(replyToken, at, [textWithQuickReply(
      'あなたのステータスを選択してください。',
      [
        { label: '新人', text: '新人' },
        { label: '乗務社員', text: '乗務社員' },
        { label: '弁天倶楽部会員', text: '弁天倶楽部会員' },
        { label: '車番管理者', text: '車番管理者' },
        { label: 'キャンセル', text: 'キャンセル' },
      ]
    )]);
    return;
  }
  if (['新人', '乗務社員', '弁天倶楽部会員', '車番管理者'].includes(inputText)) {
    const role = Object.keys(MENU_ROLE_LABELS).find(r => MENU_ROLE_LABELS[r] === inputText)!;
    await setState(env.DB, lineUid, 'reg_menu_password', { role });
    await reply(replyToken, at, [text(`${inputText}として登録します。\nパスワードを入力してください。`)]);
    return;
  }
  if (inputText === 'キャンセル' || inputText === 'cancel') {
    await setState(env.DB, lineUid, 'idle');
    await reply(replyToken, at, [text('キャンセルしました。\n\n「LINE連携」と送信するとステータス選択からやり直せます。')]);
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
    '登録されていません。\n\n「LINE連携」と送信するとステータス選択から登録できます。\n\n招待コードをお持ちの方はコードを送信してください。\n\n（UID確認: 「uid」と送信）'
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

  // 報告 → 忘れ物対応・事故報告・違反報告への直接リンクをクイックリプライで提示
  // （中継ページを挟まずタップ1回でLIFFのネイティブ表示に入る）
  if (inputText === '報告') {
    const items: { label: string; uri: string }[] = [];
    const lostItemLiffId = env.LIFF_ID_LOST_ITEM ?? '';
    if (lostItemLiffId) items.push({ label: '📦 忘れ物対応', uri: `https://liff.line.me/${lostItemLiffId}` });
    const accidentLiffId = env.LIFF_ID_ACCIDENT ?? '';
    if (accidentLiffId) items.push({ label: '🚨 事故報告', uri: `https://liff.line.me/${accidentLiffId}` });
    const violationLiffId = env.LIFF_ID_VIOLATION ?? '';
    if (violationLiffId) items.push({ label: '⚠️ 違反報告', uri: `https://liff.line.me/${violationLiffId}` });
    await reply(replyToken, at, [textWithUriQuickReply('報告する内容を選んでください。', items)]);
    return;
  }

  // 違反報告 → LIFF URLを送信
  if (inputText === '違反報告' || inputText === '違反') {
    const liffId = env.LIFF_ID_VIOLATION ?? '';
    const url = liffId ? `https://liff.line.me/${liffId}` : '';
    if (url) {
      await reply(replyToken, at, [text(`⚠️ 違反報告フォーム\n\n下をタップして開いてください:\n${url}`)]);
    }
    return;
  }

  // ベンテンクラブ シフト → LIFF URLを送信（統括管理者のみ。運行管理者はアクセス不可）
  if ((inputText === 'ベンテンシフト' || inputText === 'ベンテン') && liffUser.role === 'general_manager') {
    const liffId = env.LIFF_ID_BENTEN_SHIFT ?? '';
    if (liffId) {
      await reply(replyToken, at, [text(`🗓 ベンテンクラブ シフト\n\n下をタップして開いてください:\nhttps://liff.line.me/${liffId}`)]);
    } else {
      await reply(replyToken, at, [text('🗓 ベンテンクラブ シフト\n\nただいま準備中です。もうしばらくお待ちください！')]);
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
      { label: '報告', text: '報告' },
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
// 売上記録・ODO記録（対象ロール共通: crew_member / newcomer / benten_member / benten_shift_master / general_manager）
// ===================================================

// 売上記録（LIFFフォーム誘導）・ODO記録（会話フロー）を一括処理する。
// 戻り値 true: このメッセージを処理した（呼び出し元はこれ以上処理しない）
// 戻り値 false: 対象外のメッセージなので呼び出し元（役割別ハンドラー）に処理を委ねる
async function handleSalesOdoFlow(
  env: Env, lineUid: string, replyToken: string, at: string,
  inputText: string, state: string, data: Record<string, string | number>,
  liffUser: LiffUser,
): Promise<boolean> {
  const empId = liffUser.emp_id;

  // ===== ODOフロー継続 =====
  // 数字以外（＝他の機能のボタン・キャンセル等）が来たら入力待ちを静かに解除し、
  // そのメッセージは本来の役割別ハンドラーに渡す（保留中のODO開始記録はDBにそのまま残るので消えない）
  if (state === 'odo_awaiting_start' || state === 'odo_awaiting_end') {
    if (!/^\d{1,6}$/.test(inputText.trim())) {
      await setState(env.DB, lineUid, 'idle');
      return false;
    }
    const value = parseInt(inputText.trim(), 10);

    if (state === 'odo_awaiting_start') {
      if (!empId) {
        await setState(env.DB, lineUid, 'idle');
        await reply(replyToken, at, [text('社員情報が見つかりません。')]);
        return true;
      }
      await env.DB.prepare('INSERT INTO odo_records (emp_id, odo_start) VALUES (?, ?)').bind(empId, value).run();
      await setState(env.DB, lineUid, 'idle');
      await reply(replyToken, at, [text(`🚕 ODO始: ${value} を記録しました`)]);
      return true;
    }

    // odo_awaiting_end
    const recordId = data.record_id as number;
    const odoStart = data.odo_start as number;
    if (value < odoStart) {
      await reply(replyToken, at, [text(`ODO終(${value})がODO始(${odoStart})より小さいです。入力し直してください。`)]);
      return true;
    }
    const distance = value - odoStart;
    // 返信したらレコードは残さず削除する（集計等には使わない・その場限りの記録）
    await env.DB.prepare('DELETE FROM odo_records WHERE id = ?').bind(recordId).run();
    await setState(env.DB, lineUid, 'idle');
    await reply(replyToken, at, [text(`🚕 ODO記録が完了しました\nODO始: ${odoStart}\nODO終: ${value}\n走行距離: ${distance}km`)]);
    return true;
  }

  // ===== 新規トリガー =====
  // 売上記録 → LIFFフォームを送信（運行管理者の忘れ物対応・事故報告と同じ「ボタン→フォーム」方式）
  if (inputText === '売上記録' || inputText === '売上を記録') {
    if (!empId) { await reply(replyToken, at, [text('社員情報が見つかりません。')]); return true; }
    const liffId = env.LIFF_ID_SALES ?? '';
    const url = liffId ? `https://liff.line.me/${liffId}?tab=input` : '';
    if (url) {
      await reply(replyToken, at, [text(`💰 売上記録フォーム\n\n下をタップして開いてください:\n${url}`)]);
    } else {
      await reply(replyToken, at, [text('💰 売上記録\n\nただいま準備中です。もうしばらくお待ちください！')]);
    }
    return true;
  }

  if (inputText === 'ODO') {
    if (!empId) { await reply(replyToken, at, [text('社員情報が見つかりません。')]); return true; }
    const open = await env.DB.prepare(
      'SELECT id, odo_start FROM odo_records WHERE emp_id = ? AND odo_end IS NULL ORDER BY id DESC LIMIT 1'
    ).bind(empId).first<{ id: number; odo_start: number }>();
    if (!open) {
      await setState(env.DB, lineUid, 'odo_awaiting_start');
      await reply(replyToken, at, [text('ODO始の数値を入力してください。\n（6桁以内の数字。例: 12345）')]);
    } else {
      await setState(env.DB, lineUid, 'odo_awaiting_end', { record_id: open.id, odo_start: open.odo_start });
      await reply(replyToken, at, [text(`ODO終の数値を入力してください。\n（ODO始: ${open.odo_start}／6桁以内の数字）`)]);
    }
    return true;
  }

  return false;
}

// ===================================================
// 新人・乗務社員（共通: 嫌なこと報告・シフト確認・マイカレ）
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
  const MENU_CMDS = ['嫌なこと報告', '報告', 'シフト確認', 'マイカレ', '準備中'];
  if (state !== 'idle' && MENU_CMDS.includes(inputText)) {
    await setState(env.DB, lineUid, 'idle');
  }

  const { state: curState, data: curData } = await getState(env.DB, lineUid);

  // ===== idle =====
  if (curState === 'idle') {
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

    if (inputText === 'マイカレ') {
      await reply(replyToken, at, [text('📅 マイカレ\n\nただいま準備中です。もうしばらくお待ちください！')]);
      return;
    }

    // リッチメニュー6マス目の予備ボタン（機能未定・プレースホルダー）
    if (inputText === '準備中') {
      await reply(replyToken, at, [text('ただいま準備中です。もうしばらくお待ちください！')]);
      return;
    }

    await reply(replyToken, at, [textWithQuickReply(
      'リッチメニューからご利用ください。',
      [
        { label: '売上記録', text: '売上記録' },
        { label: 'ODO', text: 'ODO' },
        { label: '嫌なこと報告', text: '嫌なこと報告' },
        { label: 'シフト確認', text: 'シフト確認' },
        { label: 'マイカレ', text: 'マイカレ' },
      ]
    )]);
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
// ベンテンクラブ会員・シフトマスター
// ===================================================

async function handleBentenUser(
  env: Env, replyToken: string, at: string, inputText: string,
): Promise<void> {
  if (inputText === 'シフト' || inputText === 'シフト表' || inputText === 'ベンテンシフト') {
    const liffId = env.LIFF_ID_BENTEN_SHIFT ?? '';
    if (liffId) {
      await reply(replyToken, at, [text(`🗓 ベンテンクラブ シフト\n\n下をタップして開いてください:\nhttps://liff.line.me/${liffId}`)]);
    } else {
      await reply(replyToken, at, [text('🗓 ベンテンクラブ シフト\n\nただいま準備中です。もうしばらくお待ちください！')]);
    }
    return;
  }
  await reply(replyToken, at, [textWithQuickReply(
    '「シフト」と送信するとシフト入力・シフト表を開けます。',
    [{ label: 'シフト', text: 'シフト' }]
  )]);
}

