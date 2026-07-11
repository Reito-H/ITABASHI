#!/usr/bin/env node
// PATTERN2/3リッチメニュー（運行管理者・統括管理者用）の画像だけを差し替える
// 機能（タップ領域・アクション）は変更しない。画像のみ更新。
// 使い方: LINE_TOKEN="YOUR_CHANNEL_ACCESS_TOKEN" node scripts/update_richmenu_pattern2_image.js <画像パス>

const LINE_TOKEN = process.env.LINE_TOKEN;
if (!LINE_TOKEN) { console.error('LINE_TOKEN が未設定'); process.exit(1); }

const imagePath = process.argv[2];
if (!imagePath) { console.error('使い方: node scripts/update_richmenu_pattern2_image.js <画像パス>'); process.exit(1); }

const MENU_ID = 'richmenu-7786c6e2999428d2051f48d74ca6921e'; // wrangler.toml の RICHMENU_ID_PATTERN2 / PATTERN3

const fs = require('fs');

async function main() {
  const imgBuf = fs.readFileSync(imagePath);
  console.log('画像サイズ:', imgBuf.byteLength, 'bytes');

  console.log(`リッチメニュー ${MENU_ID} に画像アップロード中...`);
  const uploadRes = await fetch(`https://api-data.line.me/v2/bot/richmenu/${MENU_ID}/content`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${LINE_TOKEN}`,
      'Content-Type': imagePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg',
    },
    body: imgBuf,
  });
  console.log('アップロードステータス:', uploadRes.status);
  if (!uploadRes.ok) throw new Error('アップロード失敗: ' + await uploadRes.text());

  console.log('');
  console.log('✅ 完了！画像のみ差し替えました（タップ領域・アクションは変更なし）');
}

main().catch(e => { console.error('エラー:', e); process.exit(1); });
