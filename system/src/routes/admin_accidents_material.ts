// 事故防止研修「教材」ルーティング
// ページ: /accidents/material（Web冊子ビューア）, /accidents/material/print（A4縦印刷）
// ?person=<key> で対象の乗務員を指定すると、その人の事故データを分析した専用版になる
// （key は emp_no優先、なければemp_name。個人別レポートのfilterRecordsForKeyと同じキー導出）。
import { Hono } from 'hono';
import type { Env } from '../auth';
import { layout } from '../html/layout';
import { type AccidentRecord } from '../html/accidents';
import { buildIndividualRanking } from '../html/accidents_analysis';
import { filterRecordsForKey } from '../html/accidents_person';
import { accidentsMaterialViewerPage, type MaterialPersonOption } from '../html/accidents_material_viewer';
import { renderAccidentsMaterialPrintPage } from '../html/accidents_material_print';
import { buildMaterialStats, buildPersonalStats } from '../utils/accident_material_stats';
import type { PersonalStats } from '../utils/accident_material_stats';
import { ADMIN_PATH } from '../config';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

async function fetchAllRecords(c: { env: Env }): Promise<AccidentRecord[]> {
  const res = await c.env.DB.prepare('SELECT * FROM accident_records').all<AccidentRecord>();
  return res.results ?? [];
}

function resolvePersonal(records: AccidentRecord[], personKey: string | null): PersonalStats | null {
  if (!personKey) return null;
  const personRecords = filterRecordsForKey(records, personKey);
  const first = personRecords[0];
  const name = first?.emp_name || personKey;
  const division = first?.division ?? null;
  const team = first?.team ?? null;
  return buildPersonalStats(personKey, name, division, team, personRecords);
}

function toPersonOptions(records: AccidentRecord[]): MaterialPersonOption[] {
  return buildIndividualRanking(records).map(r => ({ key: r.key, name: r.name, division: r.division, team: r.team, cnt: r.cnt }));
}

app.get('/accidents/material', async (c) => {
  const records = await fetchAllRecords(c);
  const stats = buildMaterialStats(records);
  const personKey = c.req.query('person') || null;
  const personal = resolvePersonal(records, personKey);
  const content = accidentsMaterialViewerPage({ stats, personal, personKey, personOptions: toPersonOptions(records) });
  return c.html(layout('事故防止研修教材', content, 'accidents'));
});

app.get('/accidents/material/print', async (c) => {
  const records = await fetchAllRecords(c);
  const stats = buildMaterialStats(records);
  const personKey = c.req.query('person') || null;
  const personal = resolvePersonal(records, personKey);
  return c.html(renderAccidentsMaterialPrintPage({ stats, personal, backHref: `${ADMIN_PATH}/accidents/material` }));
});

export default app;
