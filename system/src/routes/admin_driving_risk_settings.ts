// 運転リスク検証設定（AI売上分析の「安全運転リスク」判定に使うしきい値）
import { Hono } from 'hono';
import { layout } from '../html/layout';
import { settingsSubHeader } from './admin';
import type { Env } from '../auth';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

type Row = { harsh_event_daily_threshold: number; max_speed_highway_threshold: number; max_speed_local_threshold: number };

app.get('/settings/driving-risk', async (c) => {
  const row = await c.env.DB.prepare('SELECT * FROM driving_risk_settings WHERE id = 1').first<Row>();
  const r: Row = row ?? { harsh_event_daily_threshold: 5, max_speed_highway_threshold: 100, max_speed_local_threshold: 60 };

  const html = settingsSubHeader('運転リスク検証設定') + `
    <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:20px 24px;max-width:560px;">
      <p style="font-size:12px;color:#6b7280;margin:0 0 16px;line-height:1.7;">
        AI売上分析の「安全運転リスク」判定に使うしきい値です。ホシコン収集データCSVに含まれる急発進・急加速・急減速・最高速度から算出します。<br>
        実際の事故記録ではなく運転挙動データからの参考指標です。
      </p>
      <div style="display:flex;flex-direction:column;gap:14px;">
        <label style="font-size:12px;color:#6b7280;">1日の急発進+急加速+急減速 合計しきい値（これ以上で「要注意」）<br>
          <input type="number" id="harsh_event_daily_threshold" value="${r.harsh_event_daily_threshold}" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;width:100px;margin-top:2px;">件
        </label>
        <label style="font-size:12px;color:#6b7280;">実車最高速度（高速道）しきい値<br>
          <input type="number" id="max_speed_highway_threshold" value="${r.max_speed_highway_threshold}" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;width:100px;margin-top:2px;">km/h
        </label>
        <label style="font-size:12px;color:#6b7280;">実車最高速度（一般道）しきい値<br>
          <input type="number" id="max_speed_local_threshold" value="${r.max_speed_local_threshold}" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;width:100px;margin-top:2px;">km/h
        </label>
      </div>
      <div style="margin-top:22px;">
        <button onclick="saveDrivingRiskSettings()" id="save-risk-btn" style="padding:10px 28px;background:#1a3a5c;color:white;border:none;border-radius:7px;font-size:14px;font-weight:600;cursor:pointer;">保存</button>
      </div>
    </div>
    <script>
    async function saveDrivingRiskSettings() {
      var btn = document.getElementById('save-risk-btn');
      var ids = ['harsh_event_daily_threshold','max_speed_highway_threshold','max_speed_local_threshold'];
      var body = {};
      for (var i = 0; i < ids.length; i++) {
        var v = parseFloat(document.getElementById(ids[i]).value);
        if (isNaN(v)) { alert('数値を入力してください'); return; }
        body[ids[i]] = v;
      }
      btn.disabled = true; btn.textContent = '保存中…';
      try {
        var res = await fetch('/api/driving-risk-settings', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
        var j = await res.json();
        if (!res.ok) { alert('保存に失敗しました: ' + (j.error || '')); }
        else { btn.textContent = '✓ 保存完了'; setTimeout(function(){ btn.textContent = '保存'; btn.disabled = false; }, 2000); return; }
      } catch (e) { alert('通信エラーが発生しました'); }
      btn.disabled = false; btn.textContent = '保存';
    }
    </script>`;

  return c.html(layout('運転リスク検証設定', html, 'settings'));
});

export default app;
