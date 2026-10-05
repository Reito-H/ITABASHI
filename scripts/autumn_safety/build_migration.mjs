// scripts/autumn_safety/build_migration.mjs
// seed_data.json から src/db/migration_175.sql を生成する。
// 秋の全国交通安全運動（2026/9/21〜9/30）手札の集計 初期データ投入用。
//   node scripts/autumn_safety/build_migration.mjs
// seed_data.json は手札スキャン（PDF 5本・259ページ）をAIで下読みし、社員名簿（employees）と照合したもの。
// transcription.txt は下読みの生データ（手札番号|記入社員番号|記入班|記入氏名|1段目|2段目|3段目|備考、'.'=空欄）。
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const sheets = JSON.parse(readFileSync(join(here, 'seed_data.json'), 'utf8'));

const sq = (s) => (s == null || s === '' ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`);
const num = (n) => (n == null ? 'NULL' : String(n));

const lines = [];
lines.push('-- ===================================================');
lines.push('-- migration_175: 秋の全国交通安全運動（2026/9/21〜9/30）手札の集計');
lines.push('--');
lines.push('--   各乗務員が乗務日ごとに、3つの最重要取組み項目を 1/2/3 で自己評価して手札に記入。');
lines.push('--     項目1 = 法定速度30km/h厳守 / 項目2 = スマホ・カーナビ注視根絶 / 項目3 = 眠気を感じたら必ず停止');
lines.push('--     1 = 100%遵守した / 2 = 80%以上守れた / 3 = 出来なかった');
lines.push('--   回収した手札258枚（2026年10月5日 スキャン）を初期データとして投入する。');
lines.push('--   数字は手書きスキャンからのAI下読み、氏名は社員名簿と照合して紐づけ（不明10枚）。画面から修正可。');
lines.push('--   課長ミッション →「秋の全国交通安全運動（2026）集計」で表示。');
lines.push('-- ===================================================');
lines.push('');
lines.push('CREATE TABLE IF NOT EXISTS autumn_safety_2026_people (');
lines.push('  person_key    TEXT PRIMARY KEY,        -- s<手札番号>');
lines.push('  emp_no        TEXT,                    -- 社員名簿に紐づいた社員番号（不明は NULL）');
lines.push('  emp_name      TEXT NOT NULL,           -- 社員名簿の氏名（不明は「不明」）');
lines.push('  written_name  TEXT,                    -- 手札に記入された氏名（読み取り）');
lines.push('  written_no    TEXT,                    -- 手札に記入された社員番号（読み取り）');
lines.push('  team          INTEGER,');
lines.push('  division      INTEGER,');
lines.push('  sheet_no      INTEGER,                 -- 回収した手札の並び順');
lines.push('  note          TEXT,                    -- 読み取り時の注記（取消線・紐づけ根拠など）');
lines.push("  updated_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))");
lines.push(');');
lines.push('');
lines.push('CREATE TABLE IF NOT EXISTS autumn_safety_2026_entries (');
lines.push('  person_key  TEXT NOT NULL,');
lines.push('  day         INTEGER NOT NULL CHECK(day BETWEEN 21 AND 30),');
lines.push('  item        INTEGER NOT NULL CHECK(item BETWEEN 1 AND 3),');
lines.push('  value       INTEGER NOT NULL CHECK(value BETWEEN 1 AND 3),');
lines.push("  updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),");
lines.push('  PRIMARY KEY (person_key, day, item)');
lines.push(');');
lines.push('');
lines.push('CREATE INDEX IF NOT EXISTS idx_autumn_safety_2026_entries_day ON autumn_safety_2026_entries(day);');
lines.push('');
lines.push('CREATE TABLE IF NOT EXISTS autumn_safety_2026_meta (');
lines.push('  key         TEXT PRIMARY KEY,');
lines.push('  value       TEXT NOT NULL,');
lines.push("  updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))");
lines.push(');');
lines.push('');

// ---- meta（編集可の「AIレポート」欄の初期文＝手札258枚の分析結果） ----
const aiReport = readFileSync(join(here, 'ai_report.txt'), 'utf8').trim();
lines.push(`INSERT INTO autumn_safety_2026_meta (key, value) VALUES ('ai_report', ${sq(aiReport)})`);
lines.push('  ON CONFLICT(key) DO NOTHING;');
lines.push('');

// ---- 手札データ ----
let entryCount = 0;
for (const s of sheets) {
  const key = `s${s.sheet}`;
  const name = s.emp_name || '不明';
  lines.push(
    'INSERT INTO autumn_safety_2026_people (person_key, emp_no, emp_name, written_name, written_no, team, division, sheet_no, note) VALUES (' +
    [sq(key), sq(s.emp_no), sq(name), sq(s.written_name), sq(s.written_no), num(s.team), num(s.division), num(s.sheet), sq(s.note)].join(', ') +
    ') ON CONFLICT(person_key) DO NOTHING;'
  );
  const tuples = [];
  for (const [d, vals] of Object.entries(s.days)) {
    vals.forEach((v, i) => { if (v) tuples.push(`(${sq(key)}, ${d}, ${i + 1}, ${v})`); });
  }
  for (let i = 0; i < tuples.length; i += 30) {
    lines.push(
      'INSERT INTO autumn_safety_2026_entries (person_key, day, item, value) VALUES ' +
      tuples.slice(i, i + 30).join(', ') +
      ' ON CONFLICT(person_key, day, item) DO NOTHING;'
    );
  }
  entryCount += tuples.length;
}
lines.push('');

writeFileSync(join(repoRoot, 'system', 'src', 'db', 'migration_175.sql'), lines.join('\n') + '\n', 'utf8');
console.log(`wrote system/src/db/migration_175.sql  (${sheets.length} 枚 / ${entryCount} 記入)`);
