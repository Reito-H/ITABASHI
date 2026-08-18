// 事故データ系ページ共通の期間（開始日〜終了日）パラメータ処理
// 「直近Nヶ月」の固定バケットだけでなく、任意の日付範囲で細かく絞り込めるようにする。
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function todayIsoJST(): string {
  const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return jstNow.toISOString().slice(0, 10);
}

export function isoDateMonthsAgo(months: number, fromIso?: string): string {
  const base = fromIso && ISO_DATE_RE.test(fromIso) ? fromIso : todayIsoJST();
  const [y, m, d] = base.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 - months, d));
  return dt.toISOString().slice(0, 10);
}

export interface AccidentPeriod {
  since: string | null; // 開始日（この日を含む）
  until: string | null; // 終了日（この日を含む）
}

// クエリパラメータのバリデーション。不正・未指定ならdefaultSinceにフォールバックする（untilは未指定なら無制限＝今日まで）
export function parsePeriodParams(sinceRaw: string | undefined, untilRaw: string | undefined, defaultSince: string | null): AccidentPeriod {
  const since = sinceRaw && ISO_DATE_RE.test(sinceRaw) ? sinceRaw : defaultSince;
  const until = untilRaw && ISO_DATE_RE.test(untilRaw) ? untilRaw : null;
  return { since, until };
}

// occurred_dateへのWHERE句とバインド値を組み立てる。nextParamIndexはSQLの?N開始番号(1始まり)
export function buildPeriodWhere(period: AccidentPeriod, nextParamIndex: number): { clause: string; bindings: string[] } {
  const parts: string[] = [];
  const bindings: string[] = [];
  let idx = nextParamIndex;
  if (period.since) { parts.push(`occurred_date >= ?${idx}`); bindings.push(period.since); idx++; }
  if (period.until) { parts.push(`occurred_date <= ?${idx}`); bindings.push(period.until); idx++; }
  return { clause: parts.length ? parts.join(' AND ') : '', bindings };
}

export function periodLabel(period: AccidentPeriod, todayIso: string): string {
  const slash = (iso: string) => { const [y, m, d] = iso.split('-'); return `${y}/${parseInt(m, 10)}/${parseInt(d, 10)}`; };
  const since = period.since ? slash(period.since) : '全期間';
  const until = period.until ? slash(period.until) : slash(todayIso);
  return period.since ? `${since} 〜 ${until}` : `${since}（〜${until}）`;
}
