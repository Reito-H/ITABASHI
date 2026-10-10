#!/usr/bin/env node
// ロール「R」（hoshi_viewer）用リッチメニューを新規作成する。
// ボタンは「星 予定表」1つだけ（画像全体が1つのタップエリア）。押すと その他機能LIFF を ?view=hoshi 付きで開き、
// 星の予定表（シフト・出勤時間・予定メモ）だけを表示する（閲覧・PDF保存のみ）。
//
// 使い方（system/ ディレクトリで）:
//   python3 scripts/gen_richmenu_r_image.py   # 画像 scripts/richmenu_r.jpg を作る（作成済みなら不要）
//   LINE_TOKEN="YOUR_CHANNEL_ACCESS_TOKEN" node scripts/create_richmenu_r.js
//
// 実行後、表示される新リッチメニューIDを Claude に伝えてください
// （wrangler.toml の RICHMENU_ID_R に設定してデプロイします。以後Rで登録した人に自動で割り当てられます）。

const fs = require('fs');
const path = require('path');

const LINE_TOKEN = process.env.LINE_TOKEN;
if (!LINE_TOKEN) { console.error('LINE_TOKEN が未設定'); process.exit(1); }

const OTHER_FEATURES_LIFF_ID = '2010598812-C477DCKE'; // wrangler.toml の LIFF_ID_OTHER_FEATURES
const HOSHI_URL = `https://liff.line.me/${OTHER_FEATURES_LIFF_ID}?view=hoshi`;
const IMAGE = path.join(__dirname, 'richmenu_r.jpg');
const SIZE = { width: 2500, height: 843 };

async function main() {
  if (!fs.existsSync(IMAGE)) { console.error(`画像がありません: ${IMAGE}`); process.exit(1); }

  console.log('リッチメニューを作成中...');
  const createRes = await fetch('https://api.line.me/v2/bot/richmenu', {
    method: 'POST',
    headers: { Authorization: `Bearer ${LINE_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      size: SIZE,
      selected: true,
      name: 'R_星予定表',
      chatBarText: '星 予定表',
      areas: [{ bounds: { x: 0, y: 0, ...SIZE }, action: { type: 'uri', uri: HOSHI_URL, label: '星 予定表' } }],
    }),
  });
  if (!createRes.ok) throw new Error(`作成失敗 ${createRes.status}: ${await createRes.text()}`);
  const { richMenuId } = await createRes.json();

  console.log('画像をアップロード中...');
  const uploadRes = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${LINE_TOKEN}`, 'Content-Type': 'image/jpeg' },
    body: fs.readFileSync(IMAGE),
  });
  if (!uploadRes.ok) throw new Error(`画像アップロード失敗 ${uploadRes.status}: ${await uploadRes.text()}`);

  console.log('');
  console.log('完了しました。新しいリッチメニューID:');
  console.log(richMenuId);
}

main().catch(e => { console.error(e.message || e); process.exit(1); });
