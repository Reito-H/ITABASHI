#!/usr/bin/env node
// 運行管理者・統括管理者用リッチメニュー（RICHMENU_ID_PATTERN2 = PATTERN3 共有）のデザイン刷新。
// ボタンの位置・動作は現行メニューの定義をそのままコピーし、画像だけ scripts/richmenu_manager.jpg に差し替えた
// 新メニューを作成して、指定ユーザー（運行管理者・統括管理者）を新メニューへ切り替える。
//
// 使い方（system/ ディレクトリで）:
//   python3 scripts/gen_richmenu_manager_image.py
//   LINE_TOKEN="..." USER_IDS="Uxxx,Uyyy,..." node scripts/apply_richmenu_manager_redesign.js
//
// 実行後、表示される新リッチメニューIDを wrangler.toml の RICHMENU_ID_PATTERN2 / PATTERN3 に設定してデプロイする
// （以後に登録・権限変更した人にも新メニューが割り当てられる）。

const fs = require('fs');
const path = require('path');

const LINE_TOKEN = process.env.LINE_TOKEN;
const USER_IDS = (process.env.USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
if (!LINE_TOKEN) { console.error('LINE_TOKEN が未設定'); process.exit(1); }

const OLD_MENU_ID = 'richmenu-a7e9455f5aa958d9cd26e109d1946180'; // 現行 RICHMENU_ID_PATTERN2 = PATTERN3
const IMAGE = path.join(__dirname, 'richmenu_manager.jpg');
const H = { Authorization: `Bearer ${LINE_TOKEN}` };

async function main() {
  const defRes = await fetch(`https://api.line.me/v2/bot/richmenu/${OLD_MENU_ID}`, { headers: H });
  if (!defRes.ok) throw new Error(`定義取得失敗 ${defRes.status}: ${await defRes.text()}`);
  const def = await defRes.json();
  console.log(`現行メニュー: ${def.size.width}x${def.size.height} / ボタン ${def.areas.length}個`);

  const createRes = await fetch('https://api.line.me/v2/bot/richmenu', {
    method: 'POST',
    headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      size: def.size, selected: def.selected, chatBarText: def.chatBarText || 'メニュー',
      name: 'mgr-menu-2026-10-redesign', areas: def.areas,
    }),
  });
  if (!createRes.ok) throw new Error(`作成失敗 ${createRes.status}: ${await createRes.text()}`);
  const { richMenuId } = await createRes.json();
  console.log('新メニューID:', richMenuId);

  const up = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
    method: 'POST', headers: { ...H, 'Content-Type': 'image/jpeg' }, body: fs.readFileSync(IMAGE),
  });
  if (!up.ok) throw new Error(`画像アップロード失敗 ${up.status}: ${await up.text()}`);
  console.log('画像アップロードOK');

  // 一括切替（bulk/link は最大500件）
  for (let i = 0; i < USER_IDS.length; i += 500) {
    const chunk = USER_IDS.slice(i, i + 500);
    const r = await fetch('https://api.line.me/v2/bot/richmenu/bulk/link', {
      method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
      body: JSON.stringify({ richMenuId, userIds: chunk }),
    });
    if (!r.ok) throw new Error(`切替失敗 ${r.status}: ${await r.text()}`);
  }
  console.log(`${USER_IDS.length}人を新メニューに切り替えました`);
  console.log(richMenuId);
}

main().catch(e => { console.error(e.message || e); process.exit(1); });
