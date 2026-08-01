#!/usr/bin/env node
// 報告2をリッチメニューの「真ん中下」タップエリアに配線する。
// 使い方: LINE_TOKEN="YOUR_CHANNEL_ACCESS_TOKEN" node scripts/wire_report2_richmenu.js
//
// やること:
//   1. 現在のリッチメニュー（運行管理者・統括管理者共有）の定義を取得
//   2. bounds.y が最大（最下段）かつ x中心が画像中心に一番近いエリアを「真ん中下」として自動判定
//   3. そのエリアのactionを 報告2 LIFF への uri アクションに差し替えた新メニューを作成
//   4. 元の画像をそのまま新メニューにコピー（画像は変更しない）
//   5. 対象ユーザー全員（運行管理者・統括管理者）を新メニューに再リンク
//
// 実行後、表示される新リッチメニューIDを Claude に伝えてください
// （wrangler.toml の RICHMENU_ID_PATTERN2 / RICHMENU_ID_PATTERN3 を更新してデプロイします）。

const LINE_TOKEN = process.env.LINE_TOKEN;
if (!LINE_TOKEN) { console.error('LINE_TOKEN が未設定'); process.exit(1); }

const OLD_MENU_ID = 'richmenu-610455a3eb2e552d4d0f7c800044d5a3'; // RICHMENU_ID_PATTERN2 = PATTERN3（共有）
const REPORT2_URL = 'https://liff.line.me/2010598812-TkOArc17';

// 運行管理者・統括管理者の全ユーザー（2026-07-31時点、本番DBより取得）
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

async function main() {
  console.log('現在のリッチメニュー定義を取得中...');
  const defRes = await fetch(`https://api.line.me/v2/bot/richmenu/${OLD_MENU_ID}`, {
    headers: { Authorization: `Bearer ${LINE_TOKEN}` },
  });
  if (!defRes.ok) throw new Error(`定義取得失敗 ${defRes.status}: ${await defRes.text()}`);
  const def = await defRes.json();
  console.log(`取得OK: ${def.size.width}x${def.size.height} / エリア数 ${def.areas.length}`);

  // 「真ん中下」= 最下段（bounds.yが最大）のうち、x中心が画像中心に最も近いエリア
  const bottomY = Math.max(...def.areas.map(a => a.bounds.y));
  const bottomRow = def.areas.filter(a => a.bounds.y === bottomY);
  const centerX = def.size.width / 2;
  let target = bottomRow[0];
  let bestDist = Infinity;
  for (const a of bottomRow) {
    const areaCenterX = a.bounds.x + a.bounds.width / 2;
    const dist = Math.abs(areaCenterX - centerX);
    if (dist < bestDist) { bestDist = dist; target = a; }
  }
  console.log('真ん中下と判定したエリア:', JSON.stringify(target.bounds));
  console.log('  現在のaction:', JSON.stringify(target.action));

  const newAreas = def.areas.map(a => {
    if (a !== target) return a;
    return { bounds: a.bounds, action: { type: 'uri', uri: REPORT2_URL, label: '報告2' } };
  });

  console.log('新しいリッチメニューを作成中...');
  const createRes = await fetch('https://api.line.me/v2/bot/richmenu', {
    method: 'POST',
    headers: { Authorization: `Bearer ${LINE_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      size: def.size,
      selected: def.selected,
      name: `${def.name || 'menu'}-report2`,
      chatBarText: def.chatBarText || 'メニュー',
      areas: newAreas,
    }),
  });
  if (!createRes.ok) throw new Error(`作成失敗 ${createRes.status}: ${await createRes.text()}`);
  const { richMenuId: NEW_MENU_ID } = await createRes.json();
  console.log('新メニューID:', NEW_MENU_ID);

  console.log('元画像を取得中...');
  const imgRes = await fetch(`https://api-data.line.me/v2/bot/richmenu/${OLD_MENU_ID}/content`, {
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
  console.log('このIDを Claude に伝えてください（wrangler.toml更新・デプロイを行います）。');
}

main().catch(e => { console.error('エラー:', e); process.exit(1); });
