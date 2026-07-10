#!/usr/bin/env node
// 「社員照会＋」ボタンをリッチメニューに配線するスクリプト
// PATTERN2/3リッチメニュー（2500x1686、2行グリッド）は右下(x:1667,y:843,833x843)が
// 未使用のまま空いていることをDRY_RUNで確認済み。既存4エリアには一切手を触れず、
// その空き領域に新エリアを追加した新メニューを作成し、対象ユーザーに再割り当てする。
//
// 使い方:
//   DRY_RUN=1 LINE_TOKEN="xxx" node scripts/wire_staff_lookup_plus.js   ← まずこれで現状を確認
//   LINE_TOKEN="xxx" node scripts/wire_staff_lookup_plus.js            ← 本実行

const LINE_TOKEN = process.env.LINE_TOKEN;
if (!LINE_TOKEN) { console.error('LINE_TOKEN が未設定'); process.exit(1); }
const DRY_RUN = process.env.DRY_RUN === '1';

const OLD_MENU_ID = 'richmenu-d17fca9069a72a78c10af69d6c2ae763'; // 現在のPATTERN2/3
const NEW_LIFF_URL = 'https://liff.line.me/2010598812-8spA8woR'; // 社員照会＋

// 現在PATTERN2/3（運行管理者・統括管理者）が割り当てられているユーザー（2026-07-11時点、D1から取得済み）
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
  if (!infoRes.ok) throw new Error(`リッチメニュー取得失敗: ${infoRes.status} ${await infoRes.text()}`);
  const menu = await infoRes.json();

  console.log(`サイズ: ${menu.size.width}x${menu.size.height}, エリア数: ${menu.areas.length}`);
  menu.areas.forEach((a, i) => {
    console.log(`  [${i}] bounds=${JSON.stringify(a.bounds)} action=${JSON.stringify(a.action)}`);
  });

  // 右下の空き領域を検出（どのエリアの矩形にも重ならない領域があるか確認）
  const targetBounds = { x: 1667, y: 843, width: 833, height: 843 };
  const overlapping = menu.areas.find(a => {
    const b = a.bounds;
    return !(targetBounds.x >= b.x + b.width || targetBounds.x + targetBounds.width <= b.x
      || targetBounds.y >= b.y + b.height || targetBounds.y + targetBounds.height <= b.y);
  });
  if (overlapping) {
    throw new Error(`右下(${JSON.stringify(targetBounds)})が既存エリアと重なっています: ${JSON.stringify(overlapping)}。想定と異なる配置のため中断します。`);
  }
  console.log(`\n→ 右下の空き領域を確認: ${JSON.stringify(targetBounds)}（既存エリアと重複なし）`);

  if (DRY_RUN) {
    console.log('\nDRY_RUN=1 のため、ここで終了します。問題なければ DRY_RUN なしで再実行してください。');
    return;
  }

  // 既存エリアはそのまま維持し、右下に新エリアを追加するだけ
  const newAreas = [
    ...menu.areas,
    { bounds: targetBounds, action: { type: 'uri', label: '社員照会＋', uri: NEW_LIFF_URL } },
  ];

  console.log('\n新しいリッチメニューを作成中...');
  const createRes = await fetch('https://api.line.me/v2/bot/richmenu', {
    method: 'POST',
    headers: { Authorization: `Bearer ${LINE_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      size: menu.size,
      selected: menu.selected,
      name: `${menu.name || 'PATTERN2-3'}-staff-lookup-plus`,
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
  console.log('このIDを教えてください。wrangler.toml の RICHMENU_ID_PATTERN2 / RICHMENU_ID_PATTERN3 を更新します。');
}

main().catch(e => { console.error('エラー:', e); process.exit(1); });
