// 気象庁「過去の気象データ・検索」（東京 / prec_no=44・block_no=47662）から日別実況データを取得し、
// weather_daily テーブルへ取込む。ページはUTF-8のHTML表（認証不要・公開ページ）で、CSVダウンロードのような
// 専用APIではないため、テーブル行をHTMLから抽出するかたちで取り込む。
// 用途: AI売上分析の暦要因別分析に「雨天」「猛暑日」「冬日」を追加するため（過去実績のみが対象。将来日の天気は不明のため予想カレンダーには使用しない）。

const PREC_NO = 44;   // 東京
const BLOCK_NO = 47662; // 東京（府中ではなく気象台）

export type WeatherDayRow = {
  date: string;
  precipitationMm: number | null;
  maxTempC: number | null;
  minTempC: number | null;
  weatherDay: string | null;
  weatherNight: string | null;
};

function parseNum(raw: string | undefined): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '--' || trimmed === '///' || trimmed === ')') return null;
  const cleaned = trimmed.replace(/[^0-9.\-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseText(raw: string | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim();
  return t === '' || t === '--' ? null : t;
}

// 気象庁の日別データ表示ページ(HTML)を1ヶ月分パースする
export function parseJmaMonthlyHtml(html: string, year: number, month: number): WeatherDayRow[] {
  const rows: WeatherDayRow[] = [];
  const trRe = /<tr class="mtx" style="text-align:right;">([\s\S]*?)<\/tr>/g;
  let trMatch: RegExpExecArray | null;
  while ((trMatch = trRe.exec(html)) !== null) {
    const rowHtml = trMatch[1];
    const tds: string[] = [];
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
    let tdMatch: RegExpExecArray | null;
    while ((tdMatch = tdRe.exec(rowHtml)) !== null) tds.push(tdMatch[1]);
    if (tds.length < 21) continue;

    const dayMatch = tds[0].match(/>(\d+)<\/a>/);
    if (!dayMatch) continue;
    const day = parseInt(dayMatch[1], 10);
    if (!day || day < 1 || day > 31) continue;

    rows.push({
      date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      precipitationMm: parseNum(tds[3]),
      maxTempC: parseNum(tds[7]),
      minTempC: parseNum(tds[8]),
      weatherDay: parseText(tds[19]),
      weatherNight: parseText(tds[20]),
    });
  }
  return rows;
}

export type WeatherImportResult = { ok: true; year: number; month: number; count: number } | { ok: false; error: string };

// 指定年月の気象庁データを取得してパースする（1リクエストで完結する軽量処理）
export async function fetchJmaMonthlyWeather(year: number, month: number): Promise<WeatherDayRow[]> {
  const url = `https://www.data.jma.go.jp/stats/etrn/view/daily_s1.php?prec_no=${PREC_NO}&block_no=${BLOCK_NO}&year=${year}&month=${month}&day=&view=`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ITABASHI-sales-ai/1.0)' } });
  if (!res.ok) throw new Error(`気象庁データの取得に失敗しました (HTTP ${res.status})`);
  const html = await res.text();
  return parseJmaMonthlyHtml(html, year, month);
}

// 指定年月の気象庁データを取得してweather_dailyへupsertする
export async function importJmaMonthlyWeather(db: D1Database, year: number, month: number): Promise<WeatherImportResult> {
  try {
    const rows = await fetchJmaMonthlyWeather(year, month);
    if (!rows.length) return { ok: false, error: 'データが取得できませんでした（未来月・気象庁側の障害等の可能性があります）' };

    const stmts = rows.map(r => db.prepare(
      `INSERT INTO weather_daily (date, precipitation_mm, max_temp_c, min_temp_c, weather_day, weather_night, imported_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
       ON CONFLICT(date) DO UPDATE SET
         precipitation_mm = excluded.precipitation_mm, max_temp_c = excluded.max_temp_c, min_temp_c = excluded.min_temp_c,
         weather_day = excluded.weather_day, weather_night = excluded.weather_night, imported_at = excluded.imported_at`
    ).bind(r.date, r.precipitationMm, r.maxTempC, r.minTempC, r.weatherDay, r.weatherNight));
    await db.batch(stmts);

    return { ok: true, year, month, count: rows.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '取込中にエラーが発生しました' };
  }
}
