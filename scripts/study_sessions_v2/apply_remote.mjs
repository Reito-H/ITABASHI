// scripts/study_sessions_v2/apply_remote.mjs
// migration_136.sql（板橋イベント: 回/カテゴリー/対象者絞り込み）を本番 D1 (staff-db) に適用する。
//   node scripts/study_sessions_v2/apply_remote.mjs
// `wrangler d1 execute --file` は D1 import API を通り OAuth トークンだと 10000 で落ちるため、
// SQL を文ごとに分割し --command（通常のクエリAPI）へまとめて流し込む。
// ※ study_session_participants を作り直すので一度だけ実行すること。
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const systemDir = join(here, '..', '..', 'system');
const sqlPath = join(systemDir, 'src', 'db', 'migration_136.sql');

const raw = readFileSync(sqlPath, 'utf8');
const cleaned = raw
  .split('\n')
  .filter((l) => !/^\s*--/.test(l))
  .join('\n');
// 文字列リテラル内に ';' は無い前提で分割
const statements = cleaned
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean);

console.log(`migration_136: ${statements.length} 文を本番 staff-db へ適用します`);

// 依存順があるため 1 コマンドにまとめて順次実行させる
const batch = statements.join(';\n') + ';';
execFileSync(
  'npx',
  ['wrangler', 'd1', 'execute', 'staff-db', '--remote', '--yes', '--command', batch],
  { cwd: systemDir, stdio: ['ignore', 'ignore', 'inherit'] },
);
console.log('適用 ok');

console.log('\n確認:');
execFileSync(
  'npx',
  ['wrangler', 'd1', 'execute', 'staff-db', '--remote', '--yes', '--command',
    "SELECT (SELECT COUNT(*) FROM study_sessions) AS sessions, "
    + "(SELECT COUNT(*) FROM study_session_slots) AS slots, "
    + "(SELECT COUNT(*) FROM study_session_participants) AS participants, "
    + "(SELECT COUNT(*) FROM study_session_participants WHERE slot_id IS NOT NULL) AS participants_with_slot, "
    + "(SELECT COUNT(*) FROM study_session_categories) AS categories, "
    + "(SELECT COUNT(*) FROM sqlite_master WHERE name='study_session_participants_old') AS leftover_old;"],
  { cwd: systemDir, stdio: 'inherit' },
);

console.log('\n完了。問題なければ system で `npx wrangler deploy` を実行してください。');
