#!/usr/bin/env node
// リッチメニュー右下の「社員照会」ボタン（社員照会＋ではない）を「その他機能」に置き換えるスクリプト
//
// 前提:
//   - 新しい画像（右下セルを「その他機能」の見た目に差し替えた 2500x1686 のフル画像）を用意しておく
//   - LINE Developers で「その他機能」LIFFアプリを作成し、LIFF IDを取得しておく
//     （エンドポイントURL: https://bentenclub.com/liff/other-features）
//
// 使い方:
//   DRY_RUN=1 LINE_TOKEN="xxx" LIFF_ID_OTHER_FEATURES="2010598812-xxxxxxxx" node scripts/replace_staff_lookup_with_other_features.js
//     ← まず現状のエリア配置と「社員照会」の位置を確認
//   LINE_TOKEN="xxx" LIFF_ID_OTHER_FEATURES="2010598812-xxxxxxxx" NEW_IMAGE_PATH="/path/to/new_full_menu.png" node scripts/replace_staff_lookup_with_other_features.js
//     ← 本実行

const LINE_TOKEN = process.env.LINE_TOKEN;
if (!LINE_TOKEN) { console.error('LINE_TOKEN が未設定'); process.exit(1); }
const LIFF_ID_OTHER_FEATURES = process.env.LIFF_ID_OTHER_FEATURES;
if (!LIFF_ID_OTHER_FEATURES) { console.error('LIFF_ID_OTHER_FEATURES が未設定'); process.exit(1); }
const DRY_RUN = process.env.DRY_RUN === '1';
const NEW_IMAGE_PATH = process.env.NEW_IMAGE_PATH;

const OLD_MENU_ID = 'richmenu-d6458fac74671e573863cf1ea7a9ff04'; // 現在のPATTERN2/3
const STAFF_LOOKUP_ID = 'vWkyVtxt'; // 社員照会（社員照会＋ ではない）

// 現在PATTERN2/3（運行管理者・統括管理者・班長・指導者・車番検索管理者）が割り当てられているユーザー
// 2026-07-11時点のスナップショット。実行前に念のため以下で最新化すること:
//   wrangler d1 execute staff-db --remote --command "SELECT line_uid FROM line_liff_users WHERE role IN ('general_manager','operations_manager')"
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

  const idx = menu.areas.findIndex(a => (a.action.uri || '').includes(STAFF_LOOKUP_ID));
  if (idx === -1) {
    throw new Error('「社員照会」のエリアが見つかりませんでした。上の一覧を確認してください（社員照会＋を間違って廃止しないよう注意）。');
  }
  console.log(`\n「社員照会」を検出: [${idx}] bounds=${JSON.stringify(menu.areas[idx].bounds)}`);
  console.log('このエリアを「その他機能」に置き換えます。');

  if (DRY_RUN) {
    console.log('\nDRY_RUN=1 のため、ここで終了します。問題なければ NEW_IMAGE_PATH を指定して再実行してください。');
    return;
  }
  if (!NEW_IMAGE_PATH) { console.error('本実行には NEW_IMAGE_PATH（差し替え後のフル画像）が必要です'); process.exit(1); }

  const newAreas = menu.areas.map((a, i) => {
    if (i !== idx) return a;
    return { bounds: a.bounds, action: { type: 'uri', label: 'その他機能', uri: `https://liff.line.me/${LIFF_ID_OTHER_FEATURES}` } };
  });

  console.log('\n新しいリッチメニューを作成中...');
  const createRes = await fetch('https://api.line.me/v2/bot/richmenu', {
    method: 'POST',
    headers: { Authorization: `Bearer ${LINE_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      size: menu.size,
      selected: menu.selected,
      name: `${menu.name || 'PATTERN2-3'}-other-features`,
      chatBarText: menu.chatBarText,
      areas: newAreas,
    }),
  });
  if (!createRes.ok) throw new Error(`作成失敗: ${createRes.status} ${await createRes.text()}`);
  const { richMenuId: NEW_MENU_ID } = await createRes.json();
  console.log(`新メニューID: ${NEW_MENU_ID}`);

  console.log('新しい画像をアップロード中...');
  const fs = await import('node:fs');
  const imgBuf = fs.readFileSync(NEW_IMAGE_PATH);
  const uploadRes = await fetch(`https://api-data.line.me/v2/bot/richmenu/${NEW_MENU_ID}/content`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${LINE_TOKEN}`, 'Content-Type': 'image/png' },
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
