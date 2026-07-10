#!/usr/bin/env node
// 既存の管理者ユーザーのリッチメニューを新メニューに更新する

const LINE_TOKEN = process.env.LINE_TOKEN;
if (!LINE_TOKEN) { console.error('LINE_TOKEN が未設定'); process.exit(1); }

const NEW_MENU_ID = 'richmenu-16be64142b1a25492f4686f972d0d895';

const users = [
  { line_uid: 'U1a0c87213423f99151e0129de56965d4', role: 'operations_manager' },
  { line_uid: 'Ua0d98586de60f233d9b24a0a79c61269', role: 'operations_manager' },
  { line_uid: 'U3d308d18ce07fd5a8ed860c5ddaaa36c', role: 'operations_manager' },
  { line_uid: 'U7221aad3731d2c08863a4e3553278daa', role: 'vehicle_manager' },
  { line_uid: 'Ud79a726bd58dd8ac14a1636cb6077658', role: 'operations_manager' },
  { line_uid: 'U2ae7dc404e7b65b85e0deca86016c699', role: 'operations_manager' },
  { line_uid: 'Ufa9eede527b8db2a37e016ef72a4799e', role: 'general_manager' },
  { line_uid: 'U06245a23ccd74cb295b411be97f15ff4', role: 'operations_manager' },
];

async function assignMenu(userId) {
  const res = await fetch(`https://api.line.me/v2/bot/user/${userId}/richmenu/${NEW_MENU_ID}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${LINE_TOKEN}` },
  });
  return res.ok;
}

async function main() {
  console.log(`管理者 ${users.length} 名のリッチメニューを更新中...`);
  for (const u of users) {
    const ok = await assignMenu(u.line_uid);
    console.log(`${ok ? '✅' : '❌'} ${u.role}: ${u.line_uid.slice(0, 10)}...`);
  }
  console.log('\n完了！全員が新リッチメニューを使用できるようになりました。');
}

main().catch(e => { console.error('エラー:', e); process.exit(1); });
