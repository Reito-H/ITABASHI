#!/usr/bin/env node
// 運行管理者・統括管理者向けリッチメニュー（PATTERN2/3）の「真ん中下」エリアを
// 「QR読み取り（売上確認）」への直接リンクに差し替える。
//
// 背景:
//   従来は「その他機能」LIFFの中のボタン→location.href で売上確認LIFF(?tab=qr)へJS遷移
//   →liff.scanCodeV2() という2段階の遷移だった。この「LIFFの中から別LIFFへ location.href
//   で飛ぶ」方式だと、LINE側が毎回「新規に開かれたページ」として扱い、QRカメラのアクセス
//   許可確認が都度表示されてしまう。リッチメニューのボタンから直接そのLIFFアプリを開く
//   （ネイティブのuriアクション）方式にすれば、確認は初回だけになる。
//
//   なお「真ん中下」は現在「報告2」への重複リンクになっている（報告2は左上にも既にあるため
//   実質不要）。ユーザーの了承のもと、ここを本機能に差し替える。
//
// 使い方（2段階）:
//   1) 現状確認＋現行画像のダウンロード（画像編集の下準備）:
//      LINE_TOKEN="xxx" node scripts/wire_sales_qr_richmenu.js
//        → 対象エリアのbounds・menu-sizeが表示され、現行画像が
//          ./richmenu_pattern23_current.jpg に保存される。
//
//   2) 画像を編集:
//      python3 scripts/gen_richmenu_sales_qr_image.py \
//        --in richmenu_pattern23_current.jpg --out richmenu_pattern23_new.jpg \
//        --menu-size <表示されたサイズ> --bounds <表示されたbounds>
//
//   3) 本実行（新メニュー作成・画像アップロード・対象ユーザー再割当）:
//      LINE_TOKEN="xxx" NEW_IMAGE_PATH=richmenu_pattern23_new.jpg node scripts/wire_sales_qr_richmenu.js
//
//   実行後に表示される新リッチメニューIDを wrangler.toml の
//   RICHMENU_ID_PATTERN2 / RICHMENU_ID_PATTERN3 に反映してデプロイすること。

const LINE_TOKEN = process.env.LINE_TOKEN;
if (!LINE_TOKEN) { console.error('LINE_TOKEN が未設定'); process.exit(1); }
const NEW_IMAGE_PATH = process.env.NEW_IMAGE_PATH;

const OLD_MENU_ID = 'richmenu-ff06b9f597db71b89ddac53ad16e48c4'; // wrangler.toml の RICHMENU_ID_PATTERN2 / PATTERN3
const REPORT2_LIFF_ID = 'TkOArc17'; // 報告2（左上に既存、真ん中下は重複のため差し替え対象）
const SALES_QR_URL = 'https://liff.line.me/2010598812-deTtkaIz?tab=qr'; // LIFF_ID_SALES

// 対象ユーザー（運行管理者・統括管理者）。2026-07-31時点のスナップショット。
// 実行前に念のため以下で最新化すること:
//   wrangler d1 execute staff-db --remote --command "SELECT line_uid FROM line_liff_users WHERE role IN ('operations_manager','general_manager')"
const TARGET_USERS = [
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

function findTargetArea(def) {
  const report2Areas = def.areas.filter(
    (a) => a.action && a.action.type === 'uri' && (a.action.uri || '').includes(REPORT2_LIFF_ID)
  );
  if (report2Areas.length < 2) {
    throw new Error(
      `想定外: 報告2への参照が ${report2Areas.length} 件しか見つかりません（左上＋真ん中下の重複=2件を想定）。` +
      `以下のエリア一覧を確認し、差し替え対象を手動で特定してください。`
    );
  }
  const bottomY = Math.max(...report2Areas.map((a) => a.bounds.y));
  const bottomRow = report2Areas.filter((a) => a.bounds.y === bottomY);
  const centerX = def.size.width / 2;
  let target = bottomRow[0];
  let bestDist = Infinity;
  for (const a of bottomRow) {
    const dist = Math.abs(a.bounds.x + a.bounds.width / 2 - centerX);
    if (dist < bestDist) { bestDist = dist; target = a; }
  }
  return target;
}

async function main() {
  console.log('現在のリッチメニュー定義を取得中...');
  const defRes = await fetch(`https://api.line.me/v2/bot/richmenu/${OLD_MENU_ID}`, {
    headers: { Authorization: `Bearer ${LINE_TOKEN}` },
  });
  if (!defRes.ok) throw new Error(`定義取得失敗 ${defRes.status}: ${await defRes.text()}`);
  const def = await defRes.json();
  console.log(`取得OK: ${def.size.width}x${def.size.height} / エリア数 ${def.areas.length}`);
  def.areas.forEach((a, i) => {
    console.log(`  [${i}] bounds=${JSON.stringify(a.bounds)} action=${JSON.stringify(a.action)}`);
  });

  const target = findTargetArea(def);
  console.log('\n差し替え対象（真ん中下・報告2の重複）と判定:');
  console.log('  bounds:', JSON.stringify(target.bounds));
  console.log('  現在のaction:', JSON.stringify(target.action));

  if (!NEW_IMAGE_PATH) {
    console.log('\n--- 画像準備モード ---');
    console.log('現行画像をダウンロード中...');
    const imgRes = await fetch(`https://api-data.line.me/v2/bot/richmenu/${OLD_MENU_ID}/content`, {
      headers: { Authorization: `Bearer ${LINE_TOKEN}` },
    });
    if (!imgRes.ok) throw new Error(`画像取得失敗 ${imgRes.status}: ${await imgRes.text()}`);
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const fs = await import('node:fs');
    fs.writeFileSync('richmenu_pattern23_current.jpg', buf);
    console.log('保存: richmenu_pattern23_current.jpg');
    console.log('\n次のコマンドで画像を編集してください:');
    console.log(
      `  python3 scripts/gen_richmenu_sales_qr_image.py --in richmenu_pattern23_current.jpg ` +
      `--out richmenu_pattern23_new.jpg --menu-size ${def.size.width},${def.size.height} ` +
      `--bounds ${target.bounds.x},${target.bounds.y},${target.bounds.width},${target.bounds.height}`
    );
    console.log('\n編集後、NEW_IMAGE_PATH=richmenu_pattern23_new.jpg を付けて本スクリプトを再実行してください。');
    return;
  }

  console.log('\n--- 本実行モード ---');
  const newAreas = def.areas.map((a) => {
    if (a !== target) return a;
    return { bounds: a.bounds, action: { type: 'uri', label: 'QR読み取り(売上確認)', uri: SALES_QR_URL } };
  });

  console.log('新しいリッチメニューを作成中...');
  const createRes = await fetch('https://api.line.me/v2/bot/richmenu', {
    method: 'POST',
    headers: { Authorization: `Bearer ${LINE_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      size: def.size,
      selected: def.selected,
      name: `${def.name || 'menu'}-sales-qr`,
      chatBarText: def.chatBarText || 'メニュー',
      areas: newAreas,
    }),
  });
  if (!createRes.ok) throw new Error(`作成失敗 ${createRes.status}: ${await createRes.text()}`);
  const { richMenuId: NEW_MENU_ID } = await createRes.json();
  console.log('新メニューID:', NEW_MENU_ID);

  console.log('編集済み画像をアップロード中...');
  const fs = await import('node:fs');
  const imgBuf = fs.readFileSync(NEW_IMAGE_PATH);
  const contentType = NEW_IMAGE_PATH.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
  const uploadRes = await fetch(`https://api-data.line.me/v2/bot/richmenu/${NEW_MENU_ID}/content`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${LINE_TOKEN}`, 'Content-Type': contentType },
    body: imgBuf,
  });
  if (!uploadRes.ok) throw new Error(`画像アップロード失敗 ${uploadRes.status}: ${await uploadRes.text()}`);

  console.log(`\n対象ユーザー ${TARGET_USERS.length} 名を新メニューに再リンク中...`);
  for (const uid of TARGET_USERS) {
    const res = await fetch(`https://api.line.me/v2/bot/user/${uid}/richmenu/${NEW_MENU_ID}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${LINE_TOKEN}` },
    });
    console.log(`  ${res.ok ? 'OK' : 'NG'}: ${uid.slice(0, 10)}...`);
  }

  console.log('\n完了しました。');
  console.log('新リッチメニューID:', NEW_MENU_ID);
  console.log('このIDを wrangler.toml の RICHMENU_ID_PATTERN2 / RICHMENU_ID_PATTERN3 に反映してデプロイしてください。');
}

main().catch((e) => { console.error('エラー:', e.message); process.exit(1); });
