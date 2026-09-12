// scripts/daihon/apply_remote_148.mjs
// migration_148.sql（台本デッキ「乗務を極める マインド講座（営業所研修版）」追加）を
// 本番 D1 (staff-db) に適用してから wrangler deploy する。
//   node scripts/daihon/apply_remote_148.mjs
// `wrangler d1 execute --file` は D1 import API を通り OAuth トークンだと 10000 で落ちるため、
// SQL を文ごとに分割し --command（通常のクエリAPI）へまとめて流し込む。
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const systemDir = join(here, '..', '..', 'system');
const sqlPath = join(systemDir, 'src', 'db', 'migration_148.sql');

const raw = readFileSync(sqlPath, 'utf8');
// コメント行・空行を除去
const cleaned = raw
  .split('\n')
  .filter((l) => !/^\s*--/.test(l))
  .join('\n');
// 文字列リテラル内に ';' は無い前提で分割
const statements = cleaned
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean);

console.log(`migration_148: ${statements.length} 文を本番 staff-db へ適用します`);

const CHUNK = 40;
for (let i = 0; i < statements.length; i += CHUNK) {
  const batch = statements.slice(i, i + CHUNK).join(';\n') + ';';
  process.stdout.write(`  ${Math.min(i + CHUNK, statements.length)}/${statements.length} ... `);
  execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'staff-db', '--remote', '--yes', '--command', batch],
    { cwd: systemDir, stdio: ['ignore', 'ignore', 'inherit'] }
  );
  console.log('ok');
}

console.log('\n確認:');
execFileSync(
  'npx',
  ['wrangler', 'd1', 'execute', 'staff-db', '--remote', '--yes', '--command',
    "SELECT d.id, d.title, (SELECT COUNT(*) FROM daihon_slides s WHERE s.deck_id=d.id) AS slides FROM daihon_decks d WHERE d.title LIKE '%営業所研修版%';"],
  { cwd: systemDir, stdio: 'inherit' }
);

console.log('\nwrangler deploy:');
execFileSync('npx', ['wrangler', 'deploy'], { cwd: systemDir, stdio: 'inherit' });

console.log('\n完了。');
