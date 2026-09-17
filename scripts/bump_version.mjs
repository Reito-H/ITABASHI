// デプロイのたびに system/src/config.ts の APP_VERSION を自動で1つ増やすスクリプト。
// cf-wrangler.sh から `deploy` 実行時にのみ呼ばれる（dev や d1 execute では動かさない）。
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = join(__dirname, '..', 'system', 'src', 'config.ts');

const src = readFileSync(configPath, 'utf8');
const versionRe = /export const APP_VERSION = '(\d+)\.(\d+)\.(\d+)';/;
const match = src.match(versionRe);

if (!match) {
  console.error('bump_version: APP_VERSION が config.ts に見つかりませんでした。スキップします。');
  process.exit(0);
}

const [, major, minor, patch] = match;
const nextVersion = `${major}.${minor}.${Number(patch) + 1}`;
const updated = src.replace(versionRe, `export const APP_VERSION = '${nextVersion}';`);

writeFileSync(configPath, updated);
console.log(`bump_version: APP_VERSION を ${major}.${minor}.${patch} → ${nextVersion} に更新しました。`);
