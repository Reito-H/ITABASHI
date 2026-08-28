// 労共契約・契約更新アラート（乗務社員が64→65歳で労共契約へ移行、以後75歳まで毎年更新）
import { escHtml } from './layout';
import { ADMIN_PATH } from '../config';
import type { ContractAlert } from '../utils/contract_alerts';

const TH = 'padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;border-bottom:1px solid #e5e7eb;white-space:nowrap;';
const TD = 'padding:8px 10px;border-bottom:1px solid #f3f4f6;font-size:13px;';

export type ContractTargetRow = {
  id: number;
  emp_no: string;
  name: string;
  division: number | null;
  team: number | null;
  birth_date: string;
  ageNow: number;
  contractType: '一般' | '労共';
  nextBirthday: string;
  nextContractDate: string;
};

function divLabel(d: number | null): string {
  return d ? `${d}課` : '—';
}

function stageBadge(a: ContractAlert): string {
  const color =
    a.stage === '期限超過' ? '#b91c1c' :
    a.stage === '1ヶ月前' ? '#c2410c' :
    a.stage === '3ヶ月前' ? '#a16207' : '#1d4ed8';
  const bg =
    a.stage === '期限超過' ? '#fee2e2' :
    a.stage === '1ヶ月前' ? '#ffedd5' :
    a.stage === '3ヶ月前' ? '#fef9c3' : '#dbeafe';
  return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;color:${color};background:${bg};">${a.stage}</span>`;
}

function typeBadge(t: 'transition65' | 'annual'): string {
  return t === 'transition65'
    ? `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;color:#5b21b6;background:#ede9fe;">労共移行(65歳)</span>`
    : `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;color:#155e75;background:#cffafe;">毎年更新</span>`;
}

export function staffContractsPage(params: {
  today: string;
  alerts: ContractAlert[];
  upcoming: ContractAlert[];
  targets: ContractTargetRow[];
  ka?: string;        // 'all' | '1'..'4'（表示中の課）
  basePath?: string;  // 課タブ・戻るリンクのベース（未指定なら /kacho-mission/contracts）
  backHref?: string;
  backLabel?: string;
}): string {
  const { today, alerts, upcoming, targets } = params;
  const ka = params.ka ?? 'all';
  const basePath = params.basePath ?? `${ADMIN_PATH}/kacho-mission/contracts`;
  const backHref = params.backHref ?? `${ADMIN_PATH}/kacho-mission`;
  const backLabel = params.backLabel ?? '← 課長ミッション';

  const kaTabs = [['all', '全課'], ['1', '1課'], ['2', '2課'], ['3', '3課'], ['4', '4課']].map(([v, l]) =>
    `<a href="${basePath}?ka=${v}" style="padding:6px 14px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;border:1px solid ${ka === v ? '#1a3a5c' : '#d1d5db'};background:${ka === v ? '#1a3a5c' : 'white'};color:${ka === v ? 'white' : '#374151'};">${l}</a>`
  ).join('');

  const activeAlerts = alerts.filter(a => !a.acked);
  const ackedAlerts = alerts.filter(a => a.acked);

  const alertRow = (a: ContractAlert) => `
    <tr data-acked="${a.acked ? 1 : 0}"${a.acked ? ' style="opacity:.55;"' : ''}>
      <td style="${TD}">${stageBadge(a)}</td>
      <td style="${TD}">${typeBadge(a.renewalType)}</td>
      <td style="${TD}white-space:nowrap;">
        <a href="${ADMIN_PATH}/staff/${a.empId}" style="color:#1d4ed8;text-decoration:none;font-weight:600;">${escHtml(a.name)}</a>
        <span style="color:#9ca3af;font-size:11px;margin-left:4px;">${escHtml(a.empNo)}</span>
      </td>
      <td style="${TD}">${divLabel(a.division)}</td>
      <td style="${TD}white-space:nowrap;">${escHtml(a.birthDate)}<span style="color:#9ca3af;font-size:11px;">（現${a.ageNow}歳）</span></td>
      <td style="${TD}white-space:nowrap;">${escHtml(a.birthdayDate)}<span style="color:#9ca3af;font-size:11px;">→${a.turningAge}歳</span></td>
      <td style="${TD}white-space:nowrap;font-weight:700;">${escHtml(a.contractDate)}</td>
      <td style="${TD}white-space:nowrap;color:#6b7280;">${a.daysUntilContract >= 0 ? `あと${a.daysUntilContract}日` : `${-a.daysUntilContract}日超過`}</td>
      <td style="${TD}white-space:nowrap;text-align:right;">
        ${a.acked
          ? `<button onclick="ackContract(${a.empId}, '${a.contractDate}', '${a.renewalType}', '${a.birthdayDate}', true)" style="padding:4px 10px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;font-size:12px;cursor:pointer;">対応を取消</button>`
          : `<button onclick="ackContract(${a.empId}, '${a.contractDate}', '${a.renewalType}', '${a.birthdayDate}', false)" style="padding:4px 12px;background:#166534;color:white;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">対応済みにする</button>`}
      </td>
    </tr>`;

  const alertTable = (rows: ContractAlert[], emptyMsg: string) => `
    <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;min-width:920px;">
        <thead style="background:#f9fafb;">
          <tr>
            <th style="${TH}">アラート</th><th style="${TH}">区分</th><th style="${TH}">氏名</th>
            <th style="${TH}">課</th><th style="${TH}">生年月日</th><th style="${TH}">対象誕生日</th>
            <th style="${TH}">契約日(月度)</th><th style="${TH}">残り</th><th style="${TH}text-align:right;">操作</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length ? rows.map(alertRow).join('') : `<tr><td colspan="9" style="padding:22px;text-align:center;color:#9ca3af;">${emptyMsg}</td></tr>`}
        </tbody>
      </table>
    </div>`;

  // 今後12ヶ月の更新予定（月ごとにまとめる）
  const byMonth = new Map<string, ContractAlert[]>();
  for (const u of upcoming) {
    const key = u.contractDate.slice(0, 7);
    (byMonth.get(key) ?? byMonth.set(key, []).get(key)!).push(u);
  }
  const upcomingHtml = byMonth.size
    ? [...byMonth.entries()].map(([mon, list]) => `
      <div style="margin-bottom:14px;">
        <div style="font-size:12px;font-weight:700;color:#1e3a5f;margin-bottom:6px;">${mon.replace('-', '年')}月度（契約日 ${mon}-18）… ${list.length}名</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${list.map(u => `<a href="${ADMIN_PATH}/staff/${u.empId}" style="text-decoration:none;display:inline-flex;align-items:center;gap:6px;padding:4px 10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:12px;color:#334155;">
            <span style="font-weight:600;">${escHtml(u.name)}</span>
            <span style="color:#94a3b8;">${divLabel(u.division)}</span>
            <span style="color:#94a3b8;">${u.turningAge}歳</span>
            ${u.renewalType === 'transition65' ? '<span style="color:#7c3aed;font-weight:700;">労共移行</span>' : ''}
            ${u.acked ? '<span style="color:#16a34a;">✓対応済</span>' : ''}
          </a>`).join('')}
        </div>
      </div>`).join('')
    : '<p style="color:#9ca3af;font-size:13px;">今後12ヶ月に契約日を迎える対象者はいません。</p>';

  // 労共対象者一覧（64〜75歳、課別）
  const targetsByDiv = new Map<number, ContractTargetRow[]>();
  for (const t of targets) {
    const d = t.division ?? 0;
    (targetsByDiv.get(d) ?? targetsByDiv.set(d, []).get(d)!).push(t);
  }
  const targetsHtml = targets.length
    ? [...targetsByDiv.entries()].sort((a, b) => a[0] - b[0]).map(([d, list]) => `
      <div style="margin-bottom:12px;">
        <div style="font-size:12px;font-weight:700;color:#1e3a5f;margin-bottom:6px;">${d ? d + '課' : '課未設定'} … ${list.length}名</div>
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;min-width:640px;">
            <thead style="background:#f9fafb;"><tr>
              <th style="${TH}">氏名</th><th style="${TH}">生年月日</th><th style="${TH}">満年齢</th>
              <th style="${TH}">契約形態</th><th style="${TH}">次回誕生日</th><th style="${TH}">次回契約日(月度)</th>
            </tr></thead>
            <tbody>
              ${list.map(t => `<tr>
                <td style="${TD}"><a href="${ADMIN_PATH}/staff/${t.id}" style="color:#1d4ed8;text-decoration:none;font-weight:600;">${escHtml(t.name)}</a> <span style="color:#9ca3af;font-size:11px;">${escHtml(t.emp_no)}</span></td>
                <td style="${TD}">${escHtml(t.birth_date)}</td>
                <td style="${TD}">${t.ageNow}歳</td>
                <td style="${TD}">${t.contractType === '労共'
                  ? '<span style="color:#5b21b6;font-weight:700;">労共</span>'
                  : '<span style="color:#6b7280;">一般</span>'}</td>
                <td style="${TD}">${escHtml(t.nextBirthday)}</td>
                <td style="${TD}font-weight:600;">${escHtml(t.nextContractDate)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`).join('')
    : '<p style="color:#9ca3af;font-size:13px;">64〜75歳の在籍乗務社員がいません。</p>';

  return `
  <div class="no-print" style="display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap;">
    <a href="${backHref}" style="color:#6b7280;font-size:13px;text-decoration:none;padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:white;">${escHtml(backLabel)}</a>
    <h2 style="font-size:17px;font-weight:700;color:#1e3a5f;">労共契約・契約更新アラート</h2>
    <span style="font-size:12px;color:#9ca3af;">基準日 ${escHtml(today)}</span>
  </div>
  <div class="no-print" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;">${kaTabs}</div>

  <p style="font-size:12px;color:#6b7280;max-width:820px;line-height:1.7;margin:0 0 16px;">
    乗務社員は64歳→65歳になるタイミングで<strong>労共契約</strong>へ移行し、以後75歳まで毎年（誕生日ごとに）契約を更新します。
    契約日はタクシーの月度（17日締め・18日スタート）ベースで、誕生日が18日以降なら翌月18日・17日以前なら当月18日です。
    労共移行者は契約日の <strong>6ヶ月前 / 3ヶ月前 / 1ヶ月前</strong>、毎年更新は <strong>3ヶ月前 / 1ヶ月前</strong> にここへアラートが出ます。
    生年月日はデータセンターの「動態表」取込で更新されます。
  </p>

  <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px;">
    <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:14px 18px;min-width:150px;">
      <div style="font-size:11px;color:#6b7280;">要対応アラート</div>
      <div style="font-size:24px;font-weight:800;color:${activeAlerts.length ? '#b91c1c' : '#16a34a'};">${activeAlerts.length}<span style="font-size:12px;font-weight:500;color:#9ca3af;"> 件</span></div>
    </div>
    <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:14px 18px;min-width:150px;">
      <div style="font-size:11px;color:#6b7280;">対応済み（表示中）</div>
      <div style="font-size:24px;font-weight:800;color:#334155;">${ackedAlerts.length}<span style="font-size:12px;font-weight:500;color:#9ca3af;"> 件</span></div>
    </div>
    <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:14px 18px;min-width:150px;">
      <div style="font-size:11px;color:#6b7280;">労共対象（65〜75歳）</div>
      <div style="font-size:24px;font-weight:800;color:#5b21b6;">${targets.filter(t => t.contractType === '労共').length}<span style="font-size:12px;font-weight:500;color:#9ca3af;"> 名</span></div>
    </div>
  </div>

  <h3 style="font-size:14px;font-weight:700;color:#1e3a5f;margin:0 0 8px;">要対応アラート</h3>
  ${alertTable(activeAlerts, '現在アラートはありません。')}

  ${ackedAlerts.length ? `
  <h3 style="font-size:14px;font-weight:700;color:#1e3a5f;margin:22px 0 8px;">対応済み（アラート窓内）</h3>
  ${alertTable(ackedAlerts, '')}
  ` : ''}

  <h3 style="font-size:14px;font-weight:700;color:#1e3a5f;margin:26px 0 10px;">今後12ヶ月の契約更新予定</h3>
  <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:16px 18px;">${upcomingHtml}</div>

  <h3 style="font-size:14px;font-weight:700;color:#1e3a5f;margin:26px 0 10px;">労共対象者一覧（64〜75歳の在籍乗務社員）</h3>
  <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:16px 18px;margin-bottom:60px;">${targetsHtml}</div>

  <script>
  async function ackContract(empId, contractDate, renewalType, birthdayDate, undo) {
    try {
      const res = await fetch('/api/employees/contract-ack', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emp_id: empId, contract_date: contractDate, renewal_type: renewalType, birthday_date: birthdayDate, undo: !!undo }),
      });
      if (!res.ok) { const j = await res.json().catch(function(){return{};}); alert(j.error || '更新に失敗しました'); return; }
      location.reload();
    } catch (e) { alert('通信エラーが発生しました'); }
  }
  </script>`;
}
