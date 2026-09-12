// scripts/summer_safety/build_migration.mjs
// seed_data.json から src/db/migration_134.sql を生成する。
// 手札（夏季の交通事故をゼロにする運動 2026）の集計 初期データ投入用。
//   node scripts/summer_safety/build_migration.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const data = JSON.parse(readFileSync(join(here, 'seed_data.json'), 'utf8'));

const sq = (s) => `'${String(s).replace(/'/g, "''")}'`;
const divFromTeam = (t) => (t == null ? null : Math.ceil(t / 2));

const lines = [];
lines.push('-- ===================================================');
lines.push('-- migration_134: 夏季の交通事故をゼロにする運動（2026）手札の集計');
lines.push('--');
lines.push('--   各乗務員が1日1回、当日の乗務での眠気について 1/2/3 を手札に記入。');
lines.push('--     1 = 眠気を感じなかった');
lines.push('--     2 = 眠気を感じたので運転を停止した');
lines.push('--     3 = 眠気を感じたが「これぐらいは大丈夫」と判断して運転を続けた');
lines.push('--   回収した手札67枚（2026年9月4日 集約）を初期データとして投入する。');
lines.push('--   数字は手書きスキャンからのAI下読みのため要確認（画面から個人別に修正可）。');
lines.push('--   課長ミッション →「夏季交通安全（2026）」で集計・週別傾向・個人別を表示。');
lines.push('-- ===================================================');
lines.push('');
lines.push('CREATE TABLE IF NOT EXISTS summer_safety_2026_people (');
lines.push('  person_key  TEXT PRIMARY KEY,          -- 社員番号（無ければ s<手札番号>）');
lines.push('  emp_no      TEXT,');
lines.push('  emp_name    TEXT NOT NULL,');
lines.push('  team        INTEGER,');
lines.push('  division    INTEGER,');
lines.push('  sheet_no    INTEGER,                  -- 回収した手札の並び順');
lines.push("  updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))");
lines.push(');');
lines.push('');
lines.push('CREATE TABLE IF NOT EXISTS summer_safety_2026_entries (');
lines.push('  person_key  TEXT NOT NULL,');
lines.push('  day         INTEGER NOT NULL CHECK(day BETWEEN 1 AND 31),');
lines.push('  value       INTEGER NOT NULL CHECK(value BETWEEN 1 AND 3),');
lines.push("  updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),");
lines.push('  PRIMARY KEY (person_key, day)');
lines.push(');');
lines.push('');
lines.push('CREATE INDEX IF NOT EXISTS idx_summer_safety_2026_entries_day ON summer_safety_2026_entries(day);');
lines.push('');
lines.push('CREATE TABLE IF NOT EXISTS summer_safety_2026_meta (');
lines.push('  key         TEXT PRIMARY KEY,');
lines.push('  value       TEXT NOT NULL,');
lines.push("  updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))");
lines.push(');');
lines.push('');

// ---- meta（編集可の「AIレポート」欄の初期文） ----
const aiReport = [
  '毎回の点呼で居眠り運転のリスクを繰り返し周知したことにより、乗務員一人ひとりが普段以上に休憩を取り、漫然運転（ぼんやりした状態での運転）を意識的に避ける傾向が見られました。',
  'また、「3」（眠気を感じたが運転を継続した）を選択した乗務員に対しては、その都度、当直・管理者が状況の聞き取りを行い、休憩の取り方や体調管理について個別に助言したため、重大な事故には至りませんでした。',
  '期間中（2026年8月1日〜8月31日）の居眠り事故は0件です。',
].join('\n');
lines.push(`INSERT INTO summer_safety_2026_meta (key, value) VALUES ('ai_report', ${sq(aiReport)})`);
lines.push('  ON CONFLICT(key) DO NOTHING;');
lines.push('');

// ---- 手札データ ----
let entryCount = 0;
for (const s of data.sheets) {
  const empNo = (s.emp_no || '').trim();
  const key = empNo || `s${s.sheet}`;
  const div = divFromTeam(s.team);
  lines.push(
    `INSERT INTO summer_safety_2026_people (person_key, emp_no, emp_name, team, division, sheet_no) VALUES (` +
    `${sq(key)}, ${empNo ? sq(empNo) : 'NULL'}, ${sq(s.name)}, ${s.team == null ? 'NULL' : s.team}, ${div == null ? 'NULL' : div}, ${s.sheet})` +
    ` ON CONFLICT(person_key) DO NOTHING;`
  );
  const days = Object.keys(s.days).map(Number).sort((a, b) => a - b);
  const tuples = days.map((d) => `(${sq(key)}, ${d}, ${s.days[String(d)]})`);
  for (let i = 0; i < tuples.length; i += 20) {
    lines.push(
      `INSERT INTO summer_safety_2026_entries (person_key, day, value) VALUES ` +
      tuples.slice(i, i + 20).join(', ') +
      ` ON CONFLICT(person_key, day) DO NOTHING;`
    );
  }
  entryCount += days.length;
}
lines.push('');

const out = lines.join('\n') + '\n';
writeFileSync(join(repoRoot, 'system', 'src', 'db', 'migration_134.sql'), out, 'utf8');
console.log(`wrote system/src/db/migration_134.sql  (${data.sheets.length} 名 / ${entryCount} 記入)`);
