// km-operator 配車コンソール（新UI）の静的ファイル（km-ui/ui/）を、Worker に埋め込める TypeScript モジュールへ変換する。
// 正本は km-ui/ui/ 側。ui を直したら `npm run build:km-console` で src/assets/km_console_ui.ts を作り直す。
//
// index.html はそのまま文字列として持ち、配信時（routes/admin_km_console.ts）に
//   ・Google Fonts の <link>（ホシコンの CSP で許可していない）を外す
//   ・<script src="screens.js"> 等を ホシコン配下のパス（?v=ハッシュ付き）に書き換える
//   ・window.__KMX_BASE を埋め込む
// という変換を行う。ここでは変換せず、素の内容とハッシュだけを出力する。
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const uiDir = join(here, '..', '..', 'km-ui', 'ui');
const outFile = join(here, '..', 'src', 'assets', 'km_console_ui.ts');

const files = {
  INDEX_HTML: 'index.html',
  SCREENS_JS: 'screens.js',
  MAP_JS: 'map.js',
  LIVE_JS: 'live.js',
};
const extra = { DRIVER_FINDER_JS: 'driver-finder.js' };

let out = '// 自動生成ファイル（scripts/build_km_console_assets.mjs）。直接編集せず km-ui/ui/ を直して再生成すること。\n';
out += '// km-operator 配車コンソール（新UI）の静的ファイル一式。\n\n';
const hash = createHash('sha256');
for (const [name, file] of Object.entries(files)) {
  const text = readFileSync(join(uiDir, file), 'utf8');
  hash.update(text);
  out += `export const KM_CONSOLE_${name} = ${JSON.stringify(text)};\n\n`;
}
out += `export const KM_CONSOLE_VERSION = ${JSON.stringify(hash.digest('hex').slice(0, 12))};\n`;
// 乗務員クイック検索（管理画面全ページの右下。routes/admin_driver_finder.ts が配信）
for (const [name, file] of Object.entries(extra)) {
  const text = readFileSync(join(uiDir, file), 'utf8');
  out += `\nexport const ${name} = ${JSON.stringify(text)};\n`;
  out += `export const ${name.replace(/_JS$/, '_VERSION')} = ${JSON.stringify(createHash('sha256').update(text).digest('hex').slice(0, 12))};\n`;
}
writeFileSync(outFile, out);
console.log('wrote', outFile);
