#!/usr/bin/env node
// 権限不明者（友達追加直後）用リッチメニュー(RICHMENU_ID_UNKNOWN)の「登録はこちら」ボタンを
// テキスト送信アクション（LINE連携/友達追加/連携）から、氏名入力+QR読み取りLIFF起動(URIアクション)に変更する。
//
// 事前準備:
//   1. LINE Developers コンソールで新規LIFFアプリを作成し、エンドポイントURLを
//      https://bentenclub.com/liff/register に設定（scanCode権限を有効化）
//   2. 発行された LIFF ID を system/wrangler.toml の LIFF_ID_REGISTER に設定してデプロイ
//
// 使い方:
//   LINE_TOKEN="YOUR_CHANNEL_ACCESS_TOKEN" LIFF_ID="2010598812-xxxxxxxx" node scripts/update_richmenu_unknown_to_liff.js
//
// やること:
//   1. 現在の RICHMENU_ID_UNKNOWN の定義を取得
//   2. action が message かつ text が LINE連携/友達追加/連携 のエリアを、LIFF起動のuriアクションに差し替え
//   3. 元の画像をそのままコピーして新メニューを作成
//   4. 「登録はこちら」新メニューをアカウント全体のデフォルトリッチメニューとして設定
//      （2026-08-02時点で line_liff_users.role='unknown' のユーザーは0件のため、個別再割当は不要）
//
// 実行後、表示される新リッチメニューIDを Claude に伝えてください
// （wrangler.toml の RICHMENU_ID_UNKNOWN を更新してデプロイします）。

const LINE_TOKEN = process.env.LINE_TOKEN;
const LIFF_ID = process.env.LIFF_ID;
if (!LINE_TOKEN) { console.error('LINE_TOKEN が未設定'); process.exit(1); }
if (!LIFF_ID) { console.error('LIFF_ID が未設定（LINE Developersで作成したLIFFアプリのIDを指定してください）'); process.exit(1); }

const OLD_MENU_ID = 'richmenu-0b1281b87a1f1bf195ec5b3d4910fa3a'; // RICHMENU_ID_UNKNOWN
const REGISTER_URL = `https://liff.line.me/${LIFF_ID}`;
const TRIGGER_TEXTS = ['LINE連携', '友達追加', '連携'];

async function main() {
  console.log('現在のリッチメニュー定義を取得中...');
  const defRes = await fetch(`https://api.line.me/v2/bot/richmenu/${OLD_MENU_ID}`, {
    headers: { Authorization: `Bearer ${LINE_TOKEN}` },
  });
  if (!defRes.ok) throw new Error(`定義取得失敗 ${defRes.status}: ${await defRes.text()}`);
  const def = await defRes.json();
  console.log(`取得OK: ${def.size.width}x${def.size.height} / エリア数 ${def.areas.length}`);

  let replaced = 0;
  const newAreas = def.areas.map(a => {
    if (a.action?.type === 'message' && TRIGGER_TEXTS.includes(a.action.text)) {
      replaced++;
      return { bounds: a.bounds, action: { type: 'uri', uri: REGISTER_URL, label: '登録はこちら' } };
    }
    return a;
  });
  if (replaced === 0) {
    console.error('置き換え対象のエリアが見つかりませんでした。現在の定義:', JSON.stringify(def.areas, null, 2));
    process.exit(1);
  }
  console.log(`${replaced} 個のエリアをLIFF起動アクションに置き換えました`);

  console.log('新しいリッチメニューを作成中...');
  const createRes = await fetch('https://api.line.me/v2/bot/richmenu', {
    method: 'POST',
    headers: { Authorization: `Bearer ${LINE_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      size: def.size,
      selected: def.selected,
      name: `${def.name || 'unknown'}-liffreg`,
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

  console.log('新メニューをアカウント全体のデフォルトに設定中...');
  const defaultRes = await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${NEW_MENU_ID}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${LINE_TOKEN}` },
  });
  console.log(defaultRes.ok ? 'OK' : `NG: ${defaultRes.status} ${await defaultRes.text()}`);

  console.log('\n完了しました。');
  console.log('新リッチメニューID:', NEW_MENU_ID);
  console.log('このIDを Claude に伝えてください（wrangler.toml の RICHMENU_ID_UNKNOWN 更新・デプロイを行います）。');
}

main().catch(e => { console.error('エラー:', e); process.exit(1); });
