// 賃金試算設定（AI売上分析の「賃金インパクト試算」で使う成果手当の概算パラメータ）
import { Hono } from 'hono';
import { layout } from '../html/layout';
import { settingsSubHeader } from './admin';
import type { Env } from '../auth';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

type Row = {
  hiru_weekday_base_amount: number; hiru_sat_mon_base_amount: number; hiru_holiday_base_amount: number; hiru_commission_rate: number; hiru_base_salary: number;
  yoru_weekday_base_amount: number; yoru_sat_mon_base_amount: number; yoru_holiday_base_amount: number; yoru_commission_rate: number; yoru_base_salary: number;
  kakujitsu_weekday_base_amount: number; kakujitsu_sat_mon_base_amount: number; kakujitsu_holiday_base_amount: number; kakujitsu_commission_rate: number; kakujitsu_base_salary: number;
  assumed_fare_per_ride: number; minimum_wage_hourly: number;
  hiru_kokyu_weekday_base_amount: number; hiru_kokyu_sat_mon_base_amount: number; hiru_kokyu_holiday_base_amount: number; hiru_kokyu_commission_rate: number;
  yoru_kokyu_weekday_base_amount: number; yoru_kokyu_sat_mon_base_amount: number; yoru_kokyu_holiday_base_amount: number; yoru_kokyu_commission_rate: number;
  kakujitsu_kokyu_weekday_base_amount: number; kakujitsu_kokyu_sat_mon_base_amount: number; kakujitsu_kokyu_holiday_base_amount: number; kakujitsu_kokyu_commission_rate: number;
};

function rateRow(prefix: string, values: { weekday: number; satMon: number; holiday: number; rate: number }): string {
  return `
    <div style="display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap;">
      <label style="font-size:12px;color:#6b7280;">火〜金 基準額<br>
        <input type="number" id="${prefix}_weekday_base_amount" value="${values.weekday}" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;width:100px;margin-top:2px;">円
      </label>
      <label style="font-size:12px;color:#6b7280;">土・月 基準額<br>
        <input type="number" id="${prefix}_sat_mon_base_amount" value="${values.satMon}" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;width:100px;margin-top:2px;">円
      </label>
      <label style="font-size:12px;color:#6b7280;">日祝 基準額<br>
        <input type="number" id="${prefix}_holiday_base_amount" value="${values.holiday}" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;width:100px;margin-top:2px;">円
      </label>
      <label style="font-size:12px;color:#6b7280;">歩合率<br>
        <input type="number" id="${prefix}_commission_rate" value="${values.rate}" step="0.01" min="0" max="1" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;width:80px;margin-top:2px;">
      </label>
    </div>`;
}

function categoryTable(
  prefix: string, label: string, dutyCode: string,
  values: { weekday: number; satMon: number; holiday: number; rate: number; baseSalary: number },
  kokyuValues: { weekday: number; satMon: number; holiday: number; rate: number },
  kokyuThresholdLabel: string
): string {
  return `
    <h4 style="font-size:12.5px;font-weight:700;color:#374151;margin:18px 0 8px;">${label}（duty_code: ${dutyCode}）</h4>
    <div style="display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap;">
      <label style="font-size:12px;color:#6b7280;">基本給I（1乗務あたり・本採用額）<br>
        <input type="number" id="${prefix}_base_salary" value="${values.baseSalary}" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;width:110px;margin-top:2px;">円
      </label>
    </div>
    <p style="font-size:11px;color:#9ca3af;margin:12px 0 4px;">①通常（月${kokyuThresholdLabel}まで）</p>
    ${rateRow(prefix, values)}
    <p style="font-size:11px;color:#9ca3af;margin:12px 0 4px;">②公出（月${kokyuThresholdLabel}を超えた分）</p>
    ${rateRow(prefix + '_kokyu', kokyuValues)}`;
}

app.get('/settings/wage-estimate', async (c) => {
  const row = await c.env.DB.prepare('SELECT * FROM wage_estimate_settings WHERE id = 1').first<Row>();
  const r: Row = row ?? {
    hiru_weekday_base_amount: 18600, hiru_sat_mon_base_amount: 16600, hiru_holiday_base_amount: 14600, hiru_commission_rate: 0.55, hiru_base_salary: 6900,
    yoru_weekday_base_amount: 26500, yoru_sat_mon_base_amount: 24000, yoru_holiday_base_amount: 22500, yoru_commission_rate: 0.58, yoru_base_salary: 6900,
    kakujitsu_weekday_base_amount: 40200, kakujitsu_sat_mon_base_amount: 36200, kakujitsu_holiday_base_amount: 32900, kakujitsu_commission_rate: 0.53, kakujitsu_base_salary: 13800,
    assumed_fare_per_ride: 3000, minimum_wage_hourly: 1200,
    hiru_kokyu_weekday_base_amount: 16100, hiru_kokyu_sat_mon_base_amount: 14600, hiru_kokyu_holiday_base_amount: 14600, hiru_kokyu_commission_rate: 0.46,
    yoru_kokyu_weekday_base_amount: 22300, yoru_kokyu_sat_mon_base_amount: 20200, yoru_kokyu_holiday_base_amount: 18500, yoru_kokyu_commission_rate: 0.50,
    kakujitsu_kokyu_weekday_base_amount: 38000, kakujitsu_kokyu_sat_mon_base_amount: 34000, kakujitsu_kokyu_holiday_base_amount: 30500, kakujitsu_kokyu_commission_rate: 0.52,
  };

  const html = settingsSubHeader('賃金試算設定') + `
    <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:20px 24px;max-width:640px;">
      <p style="font-size:12px;color:#6b7280;margin:0 0 4px;line-height:1.7;">
        AI売上分析の「賃金インパクト試算（概算）」で使用する成果手当（歩合部分）の計算パラメータです。<br>
        賃金規則の読み取りに基づく暫定値のため、実際の給与規定と照合のうえ必要に応じて修正してください。<br>
        「公出」は月間の所定乗務数（隔日勤務11乗務・日勤22乗務）を超えた分に適用される別基準額・歩合率です。<br>
        深夜手当・残業手当は成果手当を基準とした簡易概算（服務手当・能率手当・残業の段階分け・法定内外区分は省略）です。基本給・服務手当・能率手当そのものは含まれません。
      </p>
      ${categoryTable('hiru', '昼日勤務', 'a',
        { weekday: r.hiru_weekday_base_amount, satMon: r.hiru_sat_mon_base_amount, holiday: r.hiru_holiday_base_amount, rate: r.hiru_commission_rate, baseSalary: r.hiru_base_salary },
        { weekday: r.hiru_kokyu_weekday_base_amount, satMon: r.hiru_kokyu_sat_mon_base_amount, holiday: r.hiru_kokyu_holiday_base_amount, rate: r.hiru_kokyu_commission_rate },
        '22乗務')}
      ${categoryTable('yoru', '夜日勤務', 'b',
        { weekday: r.yoru_weekday_base_amount, satMon: r.yoru_sat_mon_base_amount, holiday: r.yoru_holiday_base_amount, rate: r.yoru_commission_rate, baseSalary: r.yoru_base_salary },
        { weekday: r.yoru_kokyu_weekday_base_amount, satMon: r.yoru_kokyu_sat_mon_base_amount, holiday: r.yoru_kokyu_holiday_base_amount, rate: r.yoru_kokyu_commission_rate },
        '22乗務')}
      ${categoryTable('kakujitsu', '隔日勤務', 'B / D / H',
        { weekday: r.kakujitsu_weekday_base_amount, satMon: r.kakujitsu_sat_mon_base_amount, holiday: r.kakujitsu_holiday_base_amount, rate: r.kakujitsu_commission_rate, baseSalary: r.kakujitsu_base_salary },
        { weekday: r.kakujitsu_kokyu_weekday_base_amount, satMon: r.kakujitsu_kokyu_sat_mon_base_amount, holiday: r.kakujitsu_kokyu_holiday_base_amount, rate: r.kakujitsu_kokyu_commission_rate },
        '11乗務')}

      <h4 style="font-size:12.5px;font-weight:700;color:#374151;margin:18px 0 8px;">あと1組試算</h4>
      <label style="font-size:12px;color:#6b7280;">想定客単価（実績データが無い場合のフォールバック値）<br>
        <input type="number" id="assumed_fare_per_ride" value="${r.assumed_fare_per_ride}" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;width:120px;margin-top:2px;">円
      </label>

      <h4 style="font-size:12.5px;font-weight:700;color:#b91c1c;margin:18px 0 8px;">最低賃金判定</h4>
      <p style="font-size:11px;color:#9ca3af;margin:0 0 8px;">法定の最低賃金額です。初期値は暫定のため、必ず現行の地域別最低賃金に更新してください。</p>
      <label style="font-size:12px;color:#6b7280;">最低賃金時給<br>
        <input type="number" id="minimum_wage_hourly" value="${r.minimum_wage_hourly}" style="border:1px solid #fecaca;background:#fef2f2;border-radius:6px;padding:6px 10px;font-size:13px;width:120px;margin-top:2px;">円
      </label>

      <div style="margin-top:22px;">
        <button onclick="saveWageSettings()" id="save-wage-btn" style="padding:10px 28px;background:#1a3a5c;color:white;border:none;border-radius:7px;font-size:14px;font-weight:600;cursor:pointer;">保存</button>
      </div>
    </div>
    <script>
    async function saveWageSettings() {
      var btn = document.getElementById('save-wage-btn');
      var ids = ['hiru_weekday_base_amount','hiru_sat_mon_base_amount','hiru_holiday_base_amount','hiru_commission_rate','hiru_base_salary',
        'yoru_weekday_base_amount','yoru_sat_mon_base_amount','yoru_holiday_base_amount','yoru_commission_rate','yoru_base_salary',
        'kakujitsu_weekday_base_amount','kakujitsu_sat_mon_base_amount','kakujitsu_holiday_base_amount','kakujitsu_commission_rate','kakujitsu_base_salary',
        'assumed_fare_per_ride','minimum_wage_hourly',
        'hiru_kokyu_weekday_base_amount','hiru_kokyu_sat_mon_base_amount','hiru_kokyu_holiday_base_amount','hiru_kokyu_commission_rate',
        'yoru_kokyu_weekday_base_amount','yoru_kokyu_sat_mon_base_amount','yoru_kokyu_holiday_base_amount','yoru_kokyu_commission_rate',
        'kakujitsu_kokyu_weekday_base_amount','kakujitsu_kokyu_sat_mon_base_amount','kakujitsu_kokyu_holiday_base_amount','kakujitsu_kokyu_commission_rate'];
      var body = {};
      for (var i = 0; i < ids.length; i++) {
        var v = parseFloat(document.getElementById(ids[i]).value);
        if (isNaN(v)) { alert('数値を入力してください'); return; }
        body[ids[i]] = v;
      }
      btn.disabled = true; btn.textContent = '保存中…';
      try {
        var res = await fetch('/api/wage-estimate-settings', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
        var j = await res.json();
        if (!res.ok) { alert('保存に失敗しました: ' + (j.error || '')); }
        else { btn.textContent = '✓ 保存完了'; setTimeout(function(){ btn.textContent = '保存'; btn.disabled = false; }, 2000); return; }
      } catch (e) { alert('通信エラーが発生しました'); }
      btn.disabled = false; btn.textContent = '保存';
    }
    </script>`;

  return c.html(layout('賃金試算設定', html, 'settings'));
});

export default app;
