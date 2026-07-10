#!/usr/bin/env node
// リッチメニュー上の「社員照会」と「社員照会＋」のボタンの位置（アクション）を入れ替えるスクリプト
//
// 使い方:
//   DRY_RUN=1 LINE_TOKEN="xxx" node scripts/swap_staff_lookup_buttons.js   ← まず現状のエリア配置を確認
//   LINE_TOKEN="xxx" node scripts/swap_staff_lookup_buttons.js            ← 本実行

const LINE_TOKEN = process.env.LINE_TOKEN;
if (!LINE_TOKEN) { console.error('LINE_TOKEN が未設定'); process.exit(1); }
const DRY_RUN = process.env.DRY_RUN === '1';

const OLD_MENU_ID = 'richmenu-0763e276d2aceebbbdff819fa093b31b'; // 現在のPATTERN2/3
const STAFF_LOOKUP_ID = 'vWkyVtxt';       // 社員照会
const STAFF_LOOKUP_PLUS_ID = '8spA8woR';  // 社員照会＋

const TARGET_USERS = [
  'U1a0c87213423f99151e0129de56965d4',
  'Ua0d98586de60f233d9b24a0a79c61269',
  'U3d308d18ce07fd5a8ed860c5ddaaa36c',
  'Ud79a726bd58dd8ac14a1636cb6077658',
  'U2ae7dc404e7b65b85e0deca86016c699',
  'Ufa9eede527b8db2a37e016ef72a4799e',
  'U06245a23ccd74cb295b411be97f15ff4',
];

async function main() {
  console.log('現在のリッチメニュー構造を取得中...');
  const infoRes = await fetch(`https://api.line.me/v2/bot/richmenu/${OLD_MENU_ID}`, {
    headers: { Authorization: `Bearer ${LINE_TOKEN}` },
  });
  if (!infoRes.ok) throw new Error(`取得失敗: ${infoRes.status} ${await infoRes.text()}`);
  const menu = await infoRes.json();

  menu.areas.forEach((a, i) => {
    console.log(`  [${i}] bounds=${JSON.stringify(a.bounds)} action=${JSON.stringify(a.action)}`);
  });

  const idxLookup = menu.areas.findIndex(a => (a.action.uri || '').includes(STAFF_LOOKUP_ID));
  const idxPlus = menu.areas.findIndex(a => (a.action.uri || '').includes(STAFF_LOOKUP_PLUS_ID));
  if (idxLookup === -1 || idxPlus === -1) {
    throw new Error('社員照会 または 社員照会＋ のエリアが見つかりませんでした。上の一覧を確認してください。');
  }
  console.log(`\n社員照会: [${idxLookup}] bounds=${JSON.stringify(menu.areas[idxLookup].bounds)}`);
  console.log(`社員照会＋: [${idxPlus}] bounds=${JSON.stringify(menu.areas[idxPlus].bounds)}`);
  console.log('\nこの2つのエリアの action（遷移先）を入れ替えます。');

  if (DRY_RUN) {
    console.log('\nDRY_RUN=1 のため、ここで終了します。問題なければ DRY_RUN なしで再実行してください。');
    return;
  }

  const newAreas = menu.areas.map((a, i) => {
    if (i === idxLookup) return { ...a, action: menu.areas[idxPlus].action };
    if (i === idxPlus) return { ...a, action: menu.areas[idxLookup].action };
    return a;
  });

  console.log('\n新しいリッチメニューを作成中...');
  const createRes = await fetch('https://api.line.me/v2/bot/richmenu', {
    method: 'POST',
    headers: { Authorization: `Bearer ${LINE_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      size: menu.size,
      selected: menu.selected,
      name: `${menu.name || 'PATTERN2-3'}-swap`,
      chatBarText: menu.chatBarText,
      areas: newAreas,
    }),
  });
  if (!createRes.ok) throw new Error(`作成失敗: ${createRes.status} ${await createRes.text()}`);
  const { richMenuId: NEW_MENU_ID } = await createRes.json();
  console.log(`新メニューID: ${NEW_MENU_ID}`);

  console.log('画像をコピー中...');
  const imgRes = await fetch(`https://api-data.line.me/v2/bot/richmenu/${OLD_MENU_ID}/content`, {
    headers: { Authorization: `Bearer ${LINE_TOKEN}` },
  });
  if (!imgRes.ok) throw new Error(`画像取得失敗: ${imgRes.status}`);
  const imgBuf = await imgRes.arrayBuffer();
  const uploadRes = await fetch(`https://api-data.line.me/v2/bot/richmenu/${NEW_MENU_ID}/content`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${LINE_TOKEN}`, 'Content-Type': imgRes.headers.get('Content-Type') || 'image/png' },
    body: imgBuf,
  });
  if (!uploadRes.ok) throw new Error(`画像アップロード失敗: ${uploadRes.status} ${await uploadRes.text()}`);

  console.log(`対象ユーザー ${TARGET_USERS.length} 名を新メニューに割り当て中...`);
  for (const uid of TARGET_USERS) {
    const res = await fetch(`https://api.line.me/v2/bot/user/${uid}/richmenu/${NEW_MENU_ID}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${LINE_TOKEN}` },
    });
    console.log(`  ${res.ok ? '✅' : '❌'} ${uid.slice(0, 10)}...`);
  }

  console.log('\n✅ 完了！');
  console.log(`新リッチメニューID: ${NEW_MENU_ID}`);
  console.log('このIDを教えてください。wrangler.toml を更新します。');
}

main().catch(e => { console.error('エラー:', e); process.exit(1); });
