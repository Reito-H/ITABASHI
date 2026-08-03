// NEXCO東日本「ドラぷら」高速料金・ルート検索(SearchQuick)の結果ページを取得し、
// 公式のETC料金・距離をそのまま拝借する。
//
// 背景: 自前の距離グラフ+計算式エンジン(toll_calc.ts)は、大都市近郊区間の境界・
// 深夜割引の按分ルール・首都高とNEXCOの乗継特例など、公式サイトでしか正確に
// 反映できない例外が多く、どうしても近似になる。ドラぷらのSearchQuickページは
// JavaScript実行なしのプレーンなfetchでも結果HTMLがサーバー側で完全に描画されるため
// (JSPベースの旧来型サイトのため)、ヘッドレスブラウザなしで公式の数字を取得できる。
//
// 注意: これはドキュメント化された公開APIではなく、サイトのHTML構造に依存している。
// 構造変更で壊れる可能性があるため、必ず呼び出し側でフォールバック(toll_calc.tsの
// 自前計算)を用意すること。
//
// 参考: 出発地/到着地はIC検索API(icsearch_api.php)が返す名称(「出入口」「IC」等の
// 接尾辞なし)に近い形で渡すと解決精度が上がる。

export type DriveplazaResult = {
  fare: number;
  distanceKm: number;
};

function stripIcSuffix(name: string): string {
  return name.replace(/(出入口|出口|入口|本線|ＩＣ|IC|ＪＣＴ|JCT|ＳＩＣ|SIC|スマート)+$/u, '').trim() || name;
}

// JSTの現在時刻を基準に、depTime("HH:MM")があればその時刻、無ければ現在時刻で検索する
function buildSearchDateTime(depTime?: string): { year: number; month: number; day: number; hour: number; minute: number } {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000); // JST
  let hour = now.getUTCHours();
  let minute = now.getUTCMinutes();
  if (depTime) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(depTime.trim());
    if (m) {
      hour = parseInt(m[1], 10);
      minute = parseInt(m[2], 10);
    }
  }
  return {
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
    day: now.getUTCDate(),
    hour,
    minute,
  };
}

export async function fetchDriveplazaFare(fromName: string, toName: string, depTime?: string): Promise<DriveplazaResult | null> {
  const dt = buildSearchDateTime(depTime);
  const params = new URLSearchParams({
    startPlaceKana: stripIcSuffix(fromName),
    arrivePlaceKana: stripIcSuffix(toName),
    searchHour: String(dt.hour),
    searchMinute: String(dt.minute),
    kind: '1',       // 出発時刻基準
    carType: '1',    // 普通車
    priority: '2',   // 時間順(標準的な推奨ルート)
    keiyuPlaceKana: '', keiyuPlaceKana2: '', keiyuPlaceKana3: '', keiyuPlaceKana4: '', keiyuPlaceKana5: '',
    searchYear: String(dt.year),
    searchMonth: String(dt.month),
    searchDay: String(dt.day),
    selectickindflg: '0',
  });

  let res: Response;
  try {
    res = await fetch(`https://www.driveplaza.com/dp/SearchQuick?${params.toString()}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BentenTollCalc/1.0)' },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const html = await res.text();

  // ルート1のETC料金(<dt>ETC料金</dt> の直後に現れる最初の値。ETC2.0料金の重複行は除く)
  const fareMatch = /<dt>ETC料金<\/dt>\s*<dd><em><span id="fee_etc\d+">([\d,]+)<\/span>/.exec(html);
  const distMatch = /class="cell distance">([\d.]+)km</.exec(html);
  if (!fareMatch || !distMatch) return null;

  const fare = parseInt(fareMatch[1].replace(/,/g, ''), 10);
  const distanceKm = parseFloat(distMatch[1]);
  if (!Number.isFinite(fare) || !Number.isFinite(distanceKm)) return null;

  return { fare, distanceKm };
}
