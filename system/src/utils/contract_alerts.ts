// 労共契約（乗務社員が64→65歳で移行する契約形態）の更新アラート算出。
// 外部API不使用・日付だけで完結する純粋関数のみ。
//
// ルール（ユーザー確定仕様）:
//  - 乗務社員は64歳→65歳になるタイミングで「労共契約」へ移行し、以後75歳まで毎年更新する。
//  - 契約日は「タクシーの月度」ベース（この会社は17日締め・18日スタート = auth.ts getPeriod と同じ）。
//    → 誕生日の「日」が18日以降なら翌月18日、17日以前なら当月18日。
//      例) 8/16 生まれ → 8/18 契約 ／ 8/19 生まれ → 9/18 契約
//  - 64→65歳の移行者: 契約日の 6ヶ月前 / 3ヶ月前 / 1ヶ月前 にアラート。
//  - 65〜75歳の毎年更新: 誕生日（＝契約日）の 3ヶ月前 / 1ヶ月前 にアラート。

export const GETSUDO_START_DAY = 18; // 月度の初日（17日締め・18日スタート）

export const LABOR_UNION_MIN_AGE = 65; // この歳になる時に労共契約へ移行
export const LABOR_UNION_MAX_AGE = 75; // この歳まで毎年更新

export type ContractRenewalType = 'transition65' | 'annual';
export type ContractAlertStage = '6ヶ月前' | '3ヶ月前' | '1ヶ月前' | '期限超過';

export interface ContractEmp {
  id: number;
  emp_no: string;
  name: string;
  division: number | null;
  team: number | null;
  birth_date: string | null; // YYYY-MM-DD
  contract_type?: string | null;
  is_active?: number;
}

export interface ContractAlert {
  empId: number;
  empNo: string;
  name: string;
  division: number | null;
  team: number | null;
  birthDate: string;
  ageNow: number;
  turningAge: number; // この契約日で迎える（迎えた）年齢
  renewalType: ContractRenewalType;
  birthdayDate: string; // 対象の誕生日 YYYY-MM-DD
  contractDate: string; // 月度ベース契約日 YYYY-MM-DD
  stage: ContractAlertStage;
  daysUntilContract: number; // 負数 = 超過
  monthsUntilContract: number; // 端数切り捨て（負数もあり得る）
  acked: boolean;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function parseYmd(s: string): { y: number; m: number; d: number } | null {
  const mm = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.trim());
  if (!mm) return null;
  const y = +mm[1], m = +mm[2], d = +mm[3];
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

/** 誕生日 (year, month, day) に対応する「月度ベースの契約日」YYYY-MM-DD を返す。 */
export function contractDateForBirthday(year: number, month: number, day: number): string {
  let y = year;
  let m = month;
  if (day >= GETSUDO_START_DAY) {
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return `${y}-${pad2(m)}-${pad2(GETSUDO_START_DAY)}`;
}

/** 2つのISO日付（YYYY-MM-DD）の差の日数（b - a）。 */
function diffDays(aIso: string, bIso: string): number {
  const a = Date.parse(aIso + 'T00:00:00Z');
  const b = Date.parse(bIso + 'T00:00:00Z');
  return Math.round((b - a) / 86400000);
}

/** aIso から bIso までの「満月数」（b - a、端数切り捨て、負数あり）。 */
function diffMonths(aIso: string, bIso: string): number {
  const a = parseYmd(aIso)!;
  const b = parseYmd(bIso)!;
  let months = (b.y - a.y) * 12 + (b.m - a.m);
  if (b.d < a.d) months -= 1;
  return months;
}

function fullAge(birth: { y: number; m: number; d: number }, onIso: string): number {
  const on = parseYmd(onIso)!;
  let age = on.y - birth.y;
  if (on.m < birth.m || (on.m === birth.m && on.d < birth.d)) age -= 1;
  return age;
}

/**
 * 全乗務社員から「いまアラートを出すべき契約更新」を抽出する。
 * @param emps        対象社員（is_active=1 で birth_date 保持のものを渡す想定。ここでも一応フィルタする）
 * @param todayIso    基準日 YYYY-MM-DD
 * @param ackedKeys   対応済みキー集合。キー = `${empId}:${contractDate}`
 * @param overdueGraceDays 契約日を過ぎても未対応なら「期限超過」として何日間出し続けるか（default 31日＝直近の18日ぶんのみ）
 */
export function computeContractAlerts(
  emps: ContractEmp[],
  todayIso: string,
  ackedKeys: Set<string>,
  overdueGraceDays = 31,
): ContractAlert[] {
  const today = parseYmd(todayIso);
  if (!today) return [];
  const out: ContractAlert[] = [];

  for (const e of emps) {
    if (e.is_active === 0) continue;
    if (!e.birth_date) continue;
    const b = parseYmd(e.birth_date);
    if (!b) continue;

    const ageNow = fullAge(b, todayIso);
    // 65歳到達より十分手前（8歳以上手前）／76歳以降は対象外
    if (ageNow < LABOR_UNION_MIN_AGE - 8 || ageNow > LABOR_UNION_MAX_AGE) continue;

    // 65〜75歳の各誕生日 → 契約日。未来分のうち最も近いもの＝次回更新。
    // 直近で過ぎた分は「期限超過」判定用に別途保持する。
    type Cand = { turningAge: number; birthdayIso: string; contractIso: string };
    let next: Cand | null = null;              // 契約日 >= 今日 のうち最も早い
    let recentPast: Cand | null = null;        // 契約日 < 今日 のうち最も新しい
    for (let age = LABOR_UNION_MIN_AGE; age <= LABOR_UNION_MAX_AGE; age++) {
      const by = b.y + age;
      const cand: Cand = {
        turningAge: age,
        birthdayIso: `${by}-${pad2(b.m)}-${pad2(b.d)}`,
        contractIso: contractDateForBirthday(by, b.m, b.d),
      };
      if (diffDays(todayIso, cand.contractIso) >= 0) {
        if (!next || cand.contractIso < next.contractIso) next = cand;
      } else if (!recentPast || cand.contractIso > recentPast.contractIso) {
        recentPast = cand;
      }
    }

    // (1) 直近で過ぎた更新が未対応なら「期限超過」で出す（グレース期間内のみ）
    let chosen: Cand | null = null;
    let stage: ContractAlertStage | null = null;
    if (
      recentPast &&
      -diffDays(todayIso, recentPast.contractIso) <= overdueGraceDays &&
      !ackedKeys.has(`${e.id}:${recentPast.contractIso}`)
    ) {
      chosen = recentPast;
      stage = '期限超過';
    } else if (next) {
      // (2) 次回更新がアラート窓に入っていれば出す
      const monthsLeft = diffMonths(todayIso, next.contractIso);
      if (next.turningAge === LABOR_UNION_MIN_AGE) {
        // 労共移行: 6ヶ月前から
        if (monthsLeft <= 1) stage = '1ヶ月前';
        else if (monthsLeft <= 3) stage = '3ヶ月前';
        else if (monthsLeft <= 6) stage = '6ヶ月前';
      } else {
        // 毎年更新: 3ヶ月前から
        if (monthsLeft <= 1) stage = '1ヶ月前';
        else if (monthsLeft <= 3) stage = '3ヶ月前';
      }
      if (stage) chosen = next;
    }
    if (!chosen || !stage) continue;

    const renewalType: ContractRenewalType =
      chosen.turningAge === LABOR_UNION_MIN_AGE ? 'transition65' : 'annual';

    out.push({
      empId: e.id,
      empNo: e.emp_no,
      name: e.name,
      division: e.division,
      team: e.team,
      birthDate: e.birth_date,
      ageNow,
      turningAge: chosen.turningAge,
      renewalType,
      birthdayDate: chosen.birthdayIso,
      contractDate: chosen.contractIso,
      stage,
      daysUntilContract: diffDays(todayIso, chosen.contractIso),
      monthsUntilContract: diffMonths(todayIso, chosen.contractIso),
      acked: ackedKeys.has(`${e.id}:${chosen.contractIso}`),
    });
  }

  // 契約日が近い順、同日ならステージの緊急度順
  const stageRank: Record<ContractAlertStage, number> = {
    '期限超過': 0, '1ヶ月前': 1, '3ヶ月前': 2, '6ヶ月前': 3,
  };
  out.sort((a, z) =>
    a.contractDate < z.contractDate ? -1 :
    a.contractDate > z.contractDate ? 1 :
    stageRank[a.stage] - stageRank[z.stage],
  );
  return out;
}

/**
 * 乗務社員の現在の契約形態を年齢から判定する。
 *  - 65〜75歳 → '労共'
 *  - それ以外  → '一般'
 */
export function contractTypeForAge(ageNow: number): '一般' | '労共' {
  return ageNow >= LABOR_UNION_MIN_AGE && ageNow <= LABOR_UNION_MAX_AGE ? '労共' : '一般';
}

/** 今後 monthsAhead ヶ月以内に契約日が来る 65〜75歳の更新予定を全部返す（アラート窓の有無を問わない）。 */
export function upcomingRenewals(
  emps: ContractEmp[],
  todayIso: string,
  monthsAhead: number,
  ackedKeys: Set<string>,
): ContractAlert[] {
  const today = parseYmd(todayIso);
  if (!today) return [];
  const horizon = new Date(Date.UTC(today.y, today.m - 1 + monthsAhead, today.d));
  const horizonIso = `${horizon.getUTCFullYear()}-${pad2(horizon.getUTCMonth() + 1)}-${pad2(horizon.getUTCDate())}`;
  const out: ContractAlert[] = [];

  for (const e of emps) {
    if (e.is_active === 0 || !e.birth_date) continue;
    const b = parseYmd(e.birth_date);
    if (!b) continue;
    const ageNow = fullAge(b, todayIso);
    if (ageNow < LABOR_UNION_MIN_AGE - 8 || ageNow > LABOR_UNION_MAX_AGE) continue;

    for (let age = LABOR_UNION_MIN_AGE; age <= LABOR_UNION_MAX_AGE; age++) {
      const by = b.y + age;
      const birthdayIso = `${by}-${pad2(b.m)}-${pad2(b.d)}`;
      const contractIso = contractDateForBirthday(by, b.m, b.d);
      if (contractIso < todayIso || contractIso > horizonIso) continue;
      const renewalType: ContractRenewalType =
        age === LABOR_UNION_MIN_AGE ? 'transition65' : 'annual';
      out.push({
        empId: e.id, empNo: e.emp_no, name: e.name, division: e.division, team: e.team,
        birthDate: e.birth_date, ageNow, turningAge: age, renewalType,
        birthdayDate: birthdayIso, contractDate: contractIso,
        stage: '期限超過', // 未使用（呼び出し側で無視）
        daysUntilContract: diffDays(todayIso, contractIso),
        monthsUntilContract: diffMonths(todayIso, contractIso),
        acked: ackedKeys.has(`${e.id}:${contractIso}`),
      });
    }
  }
  out.sort((a, z) => (a.contractDate < z.contractDate ? -1 : a.contractDate > z.contractDate ? 1 : 0));
  return out;
}
