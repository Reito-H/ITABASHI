#!/usr/bin/env node
// リッチメニュー「革命AI」エリア追加スクリプト
// 新メニューID: richmenu-16be64142b1a25492f4686f972d0d895 は作成済み
// このスクリプトは画像コピーのみ行う

const LINE_TOKEN = process.env.LINE_TOKEN;
if (!LINE_TOKEN) { console.error('LINE_TOKEN が未設定'); process.exit(1); }

const OLD_MENU_ID = 'richmenu-81a0e64f41558aeb4747a494537b80b4';
const NEW_MENU_ID = 'richmenu-16be64142b1a25492f4686f972d0d895';

async function main() {
  console.log('画像取得中...');
  const imgRes = await fetch(`https://api-data.line.me/v2/bot/richmenu/${OLD_MENU_ID}/content`, {
    headers: { Authorization: `Bearer ${LINE_TOKEN}` },
  });
  console.log('画像取得ステータス:', imgRes.status, imgRes.headers.get('Content-Type'));
  if (!imgRes.ok) {
    const txt = await imgRes.text();
    throw new Error(`画像取得失敗 ${imgRes.status}: ${txt}`);
  }

  const imgBuf = await imgRes.arrayBuffer();
  console.log('画像サイズ:', imgBuf.byteLength, 'bytes');

  console.log('新メニューに画像アップロード中...');
  const uploadRes = await fetch(`https://api-data.line.me/v2/bot/richmenu/${NEW_MENU_ID}/content`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${LINE_TOKEN}`,
      'Content-Type': imgRes.headers.get('Content-Type') || 'image/png',
    },
    body: imgBuf,
  });
  console.log('アップロードステータス:', uploadRes.status);
  if (!uploadRes.ok) throw new Error('アップロード失敗: ' + await uploadRes.text());

  console.log('');
  console.log('✅ 完了！');
  console.log(`新リッチメニューID: ${NEW_MENU_ID}`);
  console.log('');
  console.log('wrangler.toml を以下に更新してください:');
  console.log(`RICHMENU_ID_PATTERN2 = "${NEW_MENU_ID}"`);
  console.log(`RICHMENU_ID_PATTERN3 = "${NEW_MENU_ID}"`);
}

main().catch(e => { console.error('エラー:', e); process.exit(1); });
