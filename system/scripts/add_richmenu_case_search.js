#!/usr/bin/env node
// 管理者用リッチメニュー(PATTERN2/3)の「あまり使わないボタン1つ」を電話検索LIFFに差し替える。
//
// LINEのリッチメニューはエリアを後から編集できないため、
//   1. 現行メニュー定義を取得し、全エリアを index 付きで表示（まず置換先を決める）
//   2. --apply --target <index> で、そのエリアの action を電話検索LIFFのURI遷移に差し替えた
//      「新しいメニュー」を作成
//   3. 画像は --image <png> があればそれを、無ければ現行画像をそのまま流用してアップロード
//   4. 管理者(general_manager / operations_manager)全員を新メニューへ再リンク
//      （宛先は D1 の line_liff_users から取得。--users で明示指定も可）
//   5. 出力された新メニューIDで wrangler.toml の RICHMENU_ID_PATTERN2 / PATTERN3 を書き換えてデプロイ
//
// 実行はすべて system/ ディレクトリから:
//   # 現状確認（置換先indexを決める）
//   LINE_TOKEN="xxx" node scripts/add_richmenu_case_search.js
//
//   # 差し替え実行（例: index 4 のボタンを電話検索に、画像も差し替え）
//   LINE_TOKEN="xxx" LIFF_ID_CASE_SEARCH="2010598812-xxxxxxxx" \
//     node scripts/add_richmenu_case_search.js --apply --target 4 --image /tmp/new_menu.png

const { execFileSync } = require('child_process');
const fs = require('fs');

const LINE_TOKEN = process.env.LINE_TOKEN;
if (!LINE_TOKEN) { console.error('LINE_TOKEN が未設定です'); process.exit(1); }

// wrangler.toml の現行 RICHMENU_ID_PATTERN2 と一致させること（PATTERN3も同じIDを共有中）。
// 変わっている場合は MENU_ID=richmenu-xxxx を環境変数で渡す。
const MENU_ID = process.env.MENU_ID || 'richmenu-a0d86ecebbaea07d6127552e5528c115';

// 電話検索LIFF。wrangler.toml の LIFF_ID_CASE_SEARCH を設定してから渡す。
const LIFF_ID = process.env.LIFF_ID_CASE_SEARCH || '';
const CASE_SEARCH_URL = LIFF_ID ? `https://liff.line.me/${LIFF_ID}` : '';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? true) : undefined;
}

// D1(本番)から管理者のLINE UIDを取得する
function managerUidsFromD1() {
  try {
    const out = execFileSync('npx', [
      'wrangler', 'd1', 'execute', 'staff-db', '--remote', '--json',
      '--command',
      "SELECT line_uid FROM line_liff_users WHERE role IN ('general_manager','operations_manager') AND line_uid IS NOT NULL",
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
    const parsed = JSON.parse(out);
    const rows = (Array.isArray(parsed) ? parsed[0]?.results : parsed?.results) || [];
    return rows.map(r => r.line_uid).filter(Boolean);
  } catch (e) {
    console.warn('D1からのUID取得に失敗しました。--users で明示指定してください。');
    return [];
  }
}

async function main() {
  const apply = process.argv.includes('--apply');
  const targetIdx = arg('--target') != null ? parseInt(arg('--target'), 10) : null;
  const imagePath = arg('--image');
  const usersArg = arg('--users'); // "U1,U2,..." で宛先を明示指定
  const skipRelink = process.argv.includes('--skip-relink');

  console.log(`メニュー ${MENU_ID} の定義を取得中...`);
  const defRes = await fetch(`https://api.line.me/v2/bot/richmenu/${MENU_ID}`, {
    headers: { Authorization: `Bearer ${LINE_TOKEN}` },
  });
  if (!defRes.ok) throw new Error(`定義取得失敗 ${defRes.status}: ${await defRes.text()}`);
  const def = await defRes.json();

  console.log(`\nサイズ: ${def.size.width} x ${def.size.height} / エリア数: ${def.areas.length}\n`);
  def.areas.forEach((a, i) => {
    console.log(`  [${i}] bounds=${JSON.stringify(a.bounds)}`);
    console.log(`      action =${JSON.stringify(a.action)}`);
  });

  if (!apply) {
    console.log('\n--- 確認モード ---');
    console.log('潰してよいボタンの index を上の一覧から選び、次を実行してください:');
    console.log('  LINE_TOKEN=... LIFF_ID_CASE_SEARCH=... \\');
    console.log('    node scripts/add_richmenu_case_search.js --apply --target <index> [--image <png>]');
    console.log('\n画像を作るときの gen_richmenu_case_search_image.py 用の値:');
    console.log(`  --menu-size ${def.size.width},${def.size.height}`);
    if (targetIdx != null && def.areas[targetIdx]) {
      const b = def.areas[targetIdx].bounds;
      console.log(`  --bounds ${b.x},${b.y},${b.width},${b.height}   (index ${targetIdx})`);
    } else {
      console.log('  --bounds <x>,<y>,<width>,<height>   (選んだ index の bounds を上からコピー)');
    }
    return;
  }

  if (targetIdx == null || !def.areas[targetIdx]) {
    throw new Error(`--target <index> が不正です（0〜${def.areas.length - 1} の範囲で指定）`);
  }
  if (!CASE_SEARCH_URL) {
    throw new Error('LIFF_ID_CASE_SEARCH が未設定です。先に LINE Developers で LIFF を作成し、その ID を環境変数で渡してください。');
  }

  const before = def.areas[targetIdx];
  console.log(`\n[${targetIdx}] を差し替えます:`);
  console.log(`  before: ${JSON.stringify(before.action)}`);
  console.log(`  after : {"type":"uri","label":"電話検索","uri":"${CASE_SEARCH_URL}"}`);

  const newAreas = def.areas.map((a, i) =>
    i === targetIdx
      ? { bounds: a.bounds, action: { type: 'uri', label: '電話検索', uri: CASE_SEARCH_URL } }
      : a
  );

  console.log('\n新メニューを作成中...');
  const createRes = await fetch('https://api.line.me/v2/bot/richmenu', {
    method: 'POST',
    headers: { Authorization: `Bearer ${LINE_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      size: def.size,
      selected: def.selected,
      name: `mgr-menu-casesearch-${Date.now().toString(36)}`,
      chatBarText: def.chatBarText || 'メニュー',
      areas: newAreas,
    }),
  });
  if (!createRes.ok) throw new Error(`作成失敗 ${createRes.status}: ${await createRes.text()}`);
  const { richMenuId: NEW_MENU_ID } = await createRes.json();
  console.log('新メニューID:', NEW_MENU_ID);

  let imgBuf, contentType;
  if (imagePath) {
    imgBuf = fs.readFileSync(imagePath);
    const lower = imagePath.toLowerCase();
    contentType = (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) ? 'image/jpeg' : 'image/png';
    console.log(`画像を差し替え: ${imagePath} (${imgBuf.byteLength} bytes)`);
    if (imgBuf.byteLength > 1024 * 1024) {
      // 1MB超はLINEが413で弾く。作りかけの新メニューを消してから中断する。
      await fetch(`https://api.line.me/v2/bot/richmenu/${NEW_MENU_ID}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${LINE_TOKEN}` },
      });
      throw new Error(`画像が1MBを超えています（${imgBuf.byteLength} bytes）。JPEGで圧縮し直してください（gen_richmenu_case_search_image.py はJPEGで1MB未満に収めます）。新メニュー ${NEW_MENU_ID} は削除しました。`);
    }
  } else {
    console.log('画像は現行のものを流用します（見た目に「電話検索」の文字は入りません。後で update_richmenu_pattern2_image.js で更新可）');
    const imgRes = await fetch(`https://api-data.line.me/v2/bot/richmenu/${MENU_ID}/content`, {
      headers: { Authorization: `Bearer ${LINE_TOKEN}` },
    });
    if (!imgRes.ok) throw new Error(`画像取得失敗 ${imgRes.status}: ${await imgRes.text()}`);
    imgBuf = Buffer.from(await imgRes.arrayBuffer());
    contentType = imgRes.headers.get('Content-Type') || 'image/png';
  }

  console.log('新メニューに画像アップロード中...');
  const up = await fetch(`https://api-data.line.me/v2/bot/richmenu/${NEW_MENU_ID}/content`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${LINE_TOKEN}`, 'Content-Type': contentType },
    body: imgBuf,
  });
  if (!up.ok) {
    const body = await up.text();
    await fetch(`https://api.line.me/v2/bot/richmenu/${NEW_MENU_ID}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${LINE_TOKEN}` },
    });
    throw new Error(`アップロード失敗 ${up.status}: ${body}（新メニュー ${NEW_MENU_ID} は削除しました）`);
  }

  if (skipRelink) {
    console.log('\n--skip-relink 指定のため再リンクは行いません。');
  } else {
    const uids = usersArg
      ? String(usersArg).split(',').map(s => s.trim()).filter(Boolean)
      : managerUidsFromD1();
    console.log(`\n管理者 ${uids.length} 名を新メニューへ再リンク中...`);
    // bulk/link は 1回500件まで
    for (let i = 0; i < uids.length; i += 500) {
      const chunk = uids.slice(i, i + 500);
      const r = await fetch('https://api.line.me/v2/bot/richmenu/bulk/link', {
        method: 'POST',
        headers: { Authorization: `Bearer ${LINE_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ richMenuId: NEW_MENU_ID, userIds: chunk }),
      });
      console.log(`  ${r.ok ? 'OK' : 'NG'} ${chunk.length}名 ${r.ok ? '' : await r.text()}`);
    }
  }

  console.log('\n--- 完了 ---');
  console.log('wrangler.toml を次のように更新して `npm run deploy` してください:');
  console.log(`  RICHMENU_ID_PATTERN2 = "${NEW_MENU_ID}"`);
  console.log(`  RICHMENU_ID_PATTERN3 = "${NEW_MENU_ID}"`);
}

main().catch(e => { console.error('エラー:', e); process.exit(1); });
