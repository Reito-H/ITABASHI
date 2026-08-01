#!/usr/bin/env node
// リッチメニュー上の「報告」関連ボタンを全て報告2への直接uri遷移に統合する。
// 対象:
//   - action.type === 'message' で text が報告関連コマンドのもの（「報告」ボタン等。タップ→チャット送信→リンク表示になっていた）
//   - action.type === 'uri' で旧個別LIFF（忘れ物/事故/違反/一般報告）を指しているもの
// これらを全て { type: 'uri', uri: 報告2URL } に差し替える。該当しないエリアは一切変更しない。
//
// 使い方: LINE_TOKEN="xxx" node scripts/consolidate_report_richmenu.js

const LINE_TOKEN = process.env.LINE_TOKEN;
if (!LINE_TOKEN) { console.error('LINE_TOKEN が未設定'); process.exit(1); }

const MENU_ID = 'richmenu-7dae31b5d6abb8e83cbbc15a6d6eb21d'; // 現在のRICHMENU_ID_PATTERN2/3
const REPORT2_URL = 'https://liff.line.me/2010598812-TkOArc17';

const REPORT_TEXTS = ['報告', '忘れ物対応', '忘れ物', '事故報告', '事故', '違反報告', '違反', '一般報告', '一般'];
const OLD_LIFF_IDS = ['2010598812-y7oZBhGe', '2010598812-PaLPe9HP', '2010598812-GNdHG7J6', '2010598812-HftZFUKb'];

const USERS = [
  'U1a0c87213423f99151e0129de56965d4',
  'Ua0d98586de60f233d9b24a0a79c61269',
  'U3d308d18ce07fd5a8ed860c5ddaaa36c',
  'U7221aad3731d2c08863a4e3553278daa',
  'Ud79a726bd58dd8ac14a1636cb6077658',
  'U2ae7dc404e7b65b85e0deca86016c699',
  'Ufa9eede527b8db2a37e016ef72a4799e',
  'U06245a23ccd74cb295b411be97f15ff4',
  'U6e7893b673927eec912b1cafad3fe401',
  'Ub23f0ec7e06e432fe65f70e34a1c1bb6',
  'U0dc3b8465011a42e49202403b5060899',
  'Uc0cf9d3b694b33a84fe9dbc5fb16b0f3',
  'U103156390f198002c81eddf880759304',
  'Udb8efb952657ac7785434b851ece8602',
];

function needsFix(action) {
  if (action.type === 'message' && REPORT_TEXTS.includes(action.text)) return true;
  if (action.type === 'uri' && OLD_LIFF_IDS.some(id => (action.uri || '').includes(id))) return true;
  return false;
}

async function main() {
  console.log('現在のリッチメニュー定義を取得中...');
  const defRes = await fetch(`https://api.line.me/v2/bot/richmenu/${MENU_ID}`, {
    headers: { Authorization: `Bearer ${LINE_TOKEN}` },
  });
  if (!defRes.ok) throw new Error(`定義取得失敗 ${defRes.status}: ${await defRes.text()}`);
  const def = await defRes.json();

  console.log(`サイズ: ${def.size.width}x${def.size.height} / エリア数: ${def.areas.length}`);
  def.areas.forEach((a, i) => {
    console.log(`  [${i}] bounds=${JSON.stringify(a.bounds)} action=${JSON.stringify(a.action)}`);
  });

  const targets = def.areas.filter(a => needsFix(a.action));
  console.log(`\n差し替え対象: ${targets.length} 件`);
  targets.forEach(a => console.log(`  - ${JSON.stringify(a.action)}`));

  if (targets.length === 0) {
    console.log('\n差し替え対象がありません。現状のまま終了します。');
    return;
  }

  const newAreas = def.areas.map(a => {
    if (!needsFix(a.action)) return a;
    return { bounds: a.bounds, action: { type: 'uri', uri: REPORT2_URL, label: '報告2' } };
  });

  console.log('\n新しいリッチメニューを作成中...');
  const createRes = await fetch('https://api.line.me/v2/bot/richmenu', {
    method: 'POST',
    headers: { Authorization: `Bearer ${LINE_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      size: def.size,
      selected: def.selected,
      name: `${def.name || 'menu'}-report-consolidated`,
      chatBarText: def.chatBarText || 'メニュー',
      areas: newAreas,
    }),
  });
  if (!createRes.ok) throw new Error(`作成失敗 ${createRes.status}: ${await createRes.text()}`);
  const { richMenuId: NEW_MENU_ID } = await createRes.json();
  console.log('新メニューID:', NEW_MENU_ID);

  console.log('元画像を取得中...');
  const imgRes = await fetch(`https://api-data.line.me/v2/bot/richmenu/${MENU_ID}/content`, {
    headers: { Authorization: `Bearer ${LINE_TOKEN}` },
  });
  if (!imgRes.ok) throw new Error(`画像取得失敗 ${imgRes.status}: ${await imgRes.text()}`);
  const imgBuf = await imgRes.arrayBuffer();
  const contentType = imgRes.headers.get('Content-Type') || 'image/png';

  console.log('新メニューに画像アップロード中...');
  const uploadRes = await fetch(`https://api-data.line.me/v2/bot/richmenu/${NEW_MENU_ID}/content`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${LINE_TOKEN}`, 'Content-Type': contentType },
    body: imgBuf,
  });
  if (!uploadRes.ok) throw new Error(`アップロード失敗 ${uploadRes.status}: ${await uploadRes.text()}`);

  console.log(`\n対象ユーザー ${USERS.length} 名を新メニューに再リンク中...`);
  for (const uid of USERS) {
    const res = await fetch(`https://api.line.me/v2/bot/user/${uid}/richmenu/${NEW_MENU_ID}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${LINE_TOKEN}` },
    });
    console.log(`${res.ok ? 'OK' : 'NG'}: ${uid.slice(0, 10)}...`);
  }

  console.log('\n完了しました。');
  console.log('新リッチメニューID:', NEW_MENU_ID);
}

main().catch(e => { console.error('エラー:', e); process.exit(1); });
