// 点呼の表紙用: 気象庁の「府県天気予報」JSON（東京都 = 130000）から、指定日の
// 天気文言と最高/最低気温をベストエフォートで取り出す。
//   https://www.jma.go.jp/bosai/forecast/data/forecast/130000.json
// 予報APIのため当日〜数日先の見込みが取れる（当直が前夜/早朝に点呼を組む用途に合う）。
// 取れなかった項目は空文字で返し、編集画面で手入力してもらう。

export type TenkoWeather = { weather: string; tempMax: string; tempMin: string };

const FORECAST_URL = 'https://www.jma.go.jp/bosai/forecast/data/forecast/130000.json';
const TOKYO_AREA_CODE = '130010'; // 東京地方

function pickArea(areas: any): any {
  if (!Array.isArray(areas) || areas.length === 0) return undefined;
  return (
    areas.find((a: any) => a?.area?.code === TOKYO_AREA_CODE) ??
    areas.find((a: any) => String(a?.area?.name ?? '').includes('東京')) ??
    areas[0]
  );
}

function cleanWeather(s: unknown): string {
  // 気象庁の天気文言は全角スペースを区切りに使う（例「くもり　時々　晴れ」）。
  // 通常の表示に合わせて詰める（「くもり時々晴れ」）。
  return String(s ?? '')
    .replace(/[　\s]+/g, '')
    .trim();
}

export async function fetchTenkoWeather(dateStr: string): Promise<TenkoWeather> {
  const empty: TenkoWeather = { weather: '', tempMax: '', tempMin: '' };
  try {
    const res = await fetch(FORECAST_URL, {
      headers: { 'User-Agent': 'ITABASHI-tenko/1.0 (+benten)' },
      cf: { cacheTtl: 600, cacheEverything: true },
    });
    if (!res.ok) return empty;
    const data = await res.json() as any[];

    let weather = '';
    let tempMax = '';
    let tempMin = '';

    // data[0].timeSeries[0]: 天気文言（3日分・時間帯は 00:00 起点の日単位）
    const short = data?.[0]?.timeSeries?.[0];
    if (short) {
      const times: string[] = short.timeDefines ?? [];
      const area = pickArea(short.areas);
      let idx = times.findIndex(t => String(t).slice(0, 10) === dateStr);
      if (idx < 0) idx = 0;
      weather = cleanWeather(area?.weathers?.[idx]);
    }

    // data[0].timeSeries[2]: 気温（当日は 00:00=最低 / 09:00=最高、翌日以降は入らないことが多い）
    const tempTs = data?.[0]?.timeSeries?.[2];
    if (tempTs) {
      const times: string[] = tempTs.timeDefines ?? [];
      const area = pickArea(tempTs.areas);
      for (let i = 0; i < times.length; i++) {
        if (String(times[i]).slice(0, 10) !== dateStr) continue;
        const hh = String(times[i]).slice(11, 13);
        const v = area?.temps?.[i];
        if (v == null || v === '') continue;
        if (hh === '00' || hh === '06') tempMin = String(v);
        else tempMax = String(v);
      }
    }

    // data[1]（週間予報）で不足分を補完
    if (!tempMax || !tempMin) {
      const week = data?.[1]?.timeSeries?.[1];
      if (week) {
        const times: string[] = week.timeDefines ?? [];
        const area = pickArea(week.areas);
        const wi = times.findIndex(t => String(t).slice(0, 10) === dateStr);
        if (wi >= 0) {
          if (!tempMax && area?.tempsMax?.[wi]) tempMax = String(area.tempsMax[wi]);
          if (!tempMin && area?.tempsMin?.[wi]) tempMin = String(area.tempsMin[wi]);
        }
      }
    }
    if (!weather) {
      const week = data?.[1]?.timeSeries?.[0];
      if (week) {
        const times: string[] = week.timeDefines ?? [];
        const area = pickArea(week.areas);
        const wi = times.findIndex(t => String(t).slice(0, 10) === dateStr);
        if (wi >= 0 && Array.isArray(area?.weathers)) weather = cleanWeather(area.weathers[wi]);
      }
    }

    return { weather, tempMax, tempMin };
  } catch {
    return empty;
  }
}
