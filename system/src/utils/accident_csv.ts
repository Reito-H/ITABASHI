// 事故データCSV（保険会社システム出力）の共通パーサー・DB反映ロジック
// ブラウザのCSVドラッグ&ドロップ（admin_accidents.ts /api/accidents/import 経由でJSON化済みを受け取る）と、
// 社内PCの監視スクリプトからの無人アップロード（public_accidents_upload.ts、生CSVを受け取る）の両方から使う。

export interface AccidentImportRow {
  accident_no?: string;
  office?: string | null;
  vehicle_code?: string | null;
  plate_no?: string | null;
  division?: number | null;
  team?: string | null;
  emp_no?: string | null;
  emp_name?: string | null;
  accident_category?: string | null;
  occurred_date?: string;
  occurred_time?: string | null;
  weather?: string | null;
  loc_city?: string | null;
  loc_town?: string | null;
  loc_addr?: string | null;
  fault_pct_planned?: number | null;
  fault_pct_final?: number | null;
  damage_amount?: number | null;
  accident_target?: string | null;
  accident_form?: string | null;
  road_condition?: string | null;
  business_status?: string | null;
  emp_age?: number | null;
  emp_tenure_years?: number | null;
  memo?: string | null;
  past3y_accident_count?: number | null;
  road_shape?: string | null;
  cause_reason?: string | null;
  cause_direct?: string | null;
}

// 引用符対応の簡易CSV行パーサー（Memo列に将来カンマが含まれても崩れないようにする）
function parseCsvLine(line: string): string[] {
  const cols: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else { inQuotes = false; }
      } else { cur += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { cols.push(cur); cur = ''; }
      else { cur += ch; }
    }
  }
  cols.push(cur);
  return cols.map(c => c.trim());
}

function normalizeDate(raw: string | undefined): string | null {
  const m = (raw ?? '').match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}
function normalizeTime(raw: string | undefined): string | null {
  const m = (raw ?? '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}
function toIntOrNull(raw: string | undefined): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = parseInt(String(raw).replace(/,/g, ''), 10);
  return isNaN(n) ? null : n;
}

export type ParseCsvResult =
  | { ok: true; records: AccidentImportRow[] }
  | { ok: false; error: string };

// CSVテキスト（デコード済み文字列）を AccidentImportRow[] に変換する
export function parseAccidentCsv(text: string): ParseCsvResult {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { ok: false, error: 'データ行がありません。' };

  const header = parseCsvLine(lines[0]);
  const idx = (name: string) => header.indexOf(name);
  const col = {
    no: idx('事故番号'), office: idx('営業所'), vcode: idx('車両コード'), plate: idx('ナンバープレート'),
    div: idx('課'), team: idx('班'), empNo: idx('コード'), empName: idx('氏　名'),
    cat: idx('事故区分'), date: idx('発生日付'), time: idx('発生時間'), weather: idx('発生天候'),
    city: idx('場所_市町村'), town: idx('場所_町名'), addr: idx('場所_番地'),
    faultP: idx('基本_予定_過失％'), faultF: idx('基本_確定_過失％'), damage: idx('基本_確定_損害額'),
    target: idx('基本_事故対象'), form: idx('基本_事故形態'), road: idx('基本_道状_路面状況'),
    biz: idx('基本_営業状況'), age: idx('社員_年齢○'), tenure: idx('社員_勤続年数○'), memo: idx('Memo○'),
    past3y: idx('社員_過去3年間の事故'), shape: idx('環境_道路形態２○'), causeR: idx('他_分析_原因の引起理'), causeD: idx('他_分析_直接原因○'),
  };
  if (col.no < 0 || col.date < 0) {
    return { ok: false, error: 'CSVの形式が想定と異なります（事故番号・発生日付の列が見つかりません）。' };
  }

  const records: AccidentImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const accidentNo = cols[col.no];
    const occurredDate = normalizeDate(cols[col.date]);
    if (!accidentNo || !occurredDate) continue;
    records.push({
      accident_no: accidentNo,
      office: cols[col.office] || null,
      vehicle_code: cols[col.vcode] || null,
      plate_no: cols[col.plate] || null,
      division: toIntOrNull(cols[col.div]),
      team: cols[col.team] || null,
      emp_no: cols[col.empNo] || null,
      emp_name: cols[col.empName] || null,
      accident_category: cols[col.cat] || null,
      occurred_date: occurredDate,
      occurred_time: normalizeTime(cols[col.time]),
      weather: cols[col.weather] || null,
      loc_city: cols[col.city] || null,
      loc_town: cols[col.town] || null,
      loc_addr: cols[col.addr] || null,
      fault_pct_planned: toIntOrNull(cols[col.faultP]),
      fault_pct_final: toIntOrNull(cols[col.faultF]),
      damage_amount: toIntOrNull(cols[col.damage]),
      accident_target: cols[col.target] || null,
      accident_form: cols[col.form] || null,
      road_condition: cols[col.road] || null,
      business_status: cols[col.biz] || null,
      emp_age: toIntOrNull(cols[col.age]),
      emp_tenure_years: toIntOrNull(cols[col.tenure]),
      memo: cols[col.memo] || null,
      past3y_accident_count: toIntOrNull(cols[col.past3y]),
      road_shape: cols[col.shape] || null,
      cause_reason: cols[col.causeR] || null,
      cause_direct: cols[col.causeD] || null,
    });
  }

  if (!records.length) return { ok: false, error: '取り込めるデータ行がありませんでした。' };
  return { ok: true, records };
}

export interface UpsertResult {
  ok: boolean;
  imported: number;
  errors: string[];
}

// accident_no をキーに upsert する（既存データは上書き更新、新しい事故は追加）
export async function upsertAccidentRecords(db: D1Database, rows: AccidentImportRow[]): Promise<UpsertResult> {
  const valid = rows.filter(r => r.accident_no && /^\d{4}-\d{2}-\d{2}$/.test(r.occurred_date ?? ''));
  if (valid.length === 0) return { ok: false, imported: 0, errors: ['有効なデータがありません'] };

  type D1Stmt = ReturnType<typeof db.prepare>;
  const statements: D1Stmt[] = valid.map(r => db.prepare(`
    INSERT INTO accident_records (
      accident_no, office, vehicle_code, plate_no, division, team, emp_no, emp_name,
      accident_category, occurred_date, occurred_time, weather, loc_city, loc_town, loc_addr,
      fault_pct_planned, fault_pct_final, damage_amount, accident_target, accident_form,
      road_condition, business_status, emp_age, emp_tenure_years, memo, past3y_accident_count,
      road_shape, cause_reason, cause_direct, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now','localtime'))
    ON CONFLICT(accident_no) DO UPDATE SET
      office = excluded.office, vehicle_code = excluded.vehicle_code, plate_no = excluded.plate_no,
      division = excluded.division, team = excluded.team, emp_no = excluded.emp_no, emp_name = excluded.emp_name,
      accident_category = excluded.accident_category, occurred_date = excluded.occurred_date,
      occurred_time = excluded.occurred_time, weather = excluded.weather,
      loc_city = excluded.loc_city, loc_town = excluded.loc_town, loc_addr = excluded.loc_addr,
      fault_pct_planned = excluded.fault_pct_planned, fault_pct_final = excluded.fault_pct_final,
      damage_amount = excluded.damage_amount, accident_target = excluded.accident_target,
      accident_form = excluded.accident_form, road_condition = excluded.road_condition,
      business_status = excluded.business_status, emp_age = excluded.emp_age,
      emp_tenure_years = excluded.emp_tenure_years, memo = excluded.memo,
      past3y_accident_count = excluded.past3y_accident_count, road_shape = excluded.road_shape,
      cause_reason = excluded.cause_reason, cause_direct = excluded.cause_direct,
      updated_at = datetime('now','localtime')
  `).bind(
    String(r.accident_no), r.office ?? null, r.vehicle_code ?? null, r.plate_no ?? null,
    r.division ?? null, r.team ?? null, r.emp_no ?? null, r.emp_name ?? null,
    r.accident_category ?? null, String(r.occurred_date), r.occurred_time ?? null, r.weather ?? null,
    r.loc_city ?? null, r.loc_town ?? null, r.loc_addr ?? null,
    r.fault_pct_planned ?? null, r.fault_pct_final ?? null, r.damage_amount ?? null,
    r.accident_target ?? null, r.accident_form ?? null, r.road_condition ?? null, r.business_status ?? null,
    r.emp_age ?? null, r.emp_tenure_years ?? null, r.memo ?? null, r.past3y_accident_count ?? null,
    r.road_shape ?? null, r.cause_reason ?? null, r.cause_direct ?? null
  ));

  const CHUNK = 50;
  const errors: string[] = [];
  for (let i = 0; i < statements.length; i += CHUNK) {
    try {
      await db.batch(statements.slice(i, i + CHUNK));
    } catch (e) {
      errors.push(`batch[${i}-${i + CHUNK - 1}]: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { ok: errors.length === 0, imported: valid.length, errors };
}
