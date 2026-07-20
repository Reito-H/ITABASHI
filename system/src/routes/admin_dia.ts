// 設定: 勤務ダイヤマスター・サイクル一覧の管理画面
// 紙の「ダイヤマスター一覧表」「サイクル一覧表」をWeb上で編集できるようにするページ

import { Hono } from 'hono';
import { layout, escHtml, safeJson } from '../html/layout';
import { ADMIN_PATH } from '../config';
import type { Env } from '../auth';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

type DiaRow = {
  id: number; code: number; category: string; days: number; name: string; symbol: string;
  kosoku_start: string; kosoku_end: string; kosoku_time: string;
  shotei_start: string; shotei_end: string; shotei_time: string;
  zangyo_start: string; zangyo_end: string; zangyo_time: string;
  shinya_start: string; shinya_end: string; shinya_time: string;
  kyukei1_start: string; kyukei1_end: string; kyukei1_time: string;
  kyukei2_start: string; kyukei2_end: string; kyukei2_time: string;
  kyukei3_start: string; kyukei3_end: string; kyukei3_time: string;
  kyukei4_start: string; kyukei4_end: string; kyukei4_time: string;
  std_eishu: number; std_run_max: number; std_run_min: number;
  std_kosoku_max: string; std_kosoku_min: string;
  std_handle_max: string; std_handle_min: string;
  std_kutei_max: string; std_kutei_min: string;
  is_active: number;
};

type CycleRow = { id: number; cycle_no: number; name: string; days: number; pattern: string; is_active: number };

function settingsSubHeader(title: string): string {
  return `<div class="no-print" style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
    <a href="${ADMIN_PATH}/settings" style="color:#6b7280;font-size:13px;text-decoration:none;padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:white;">← 設定に戻る</a>
    <h2 style="font-size:17px;font-weight:700;color:#1e3a5f;">${title}</h2>
  </div>`;
}

app.get('/settings/dia', async (c) => {
  const [diaRes, cycleRes] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM dia_master ORDER BY code').all<DiaRow>(),
    c.env.DB.prepare('SELECT * FROM dia_cycles ORDER BY cycle_no').all<CycleRow>(),
  ]);
  const dias = diaRes.results ?? [];
  const cycles = cycleRes.results ?? [];

  // 「00:00」はグレー表示にして見やすくする
  const t = (v: string) => v === '00:00'
    ? `<span style="color:#d1d5db;">-</span>`
    : escHtml(v);
  const pair = (a: string, b: string) => (a === '00:00' && b === '00:00')
    ? `<span style="color:#d1d5db;">-</span>`
    : `${escHtml(a)}<span style="color:#9ca3af;"> / </span>${escHtml(b)}`;

  const diaRows = dias.map(d => `
    <tr style="opacity:${d.is_active ? '1' : '0.4'};border-bottom:1px solid #f3f4f6;">
      <td style="padding:6px 8px;text-align:right;font-variant-numeric:tabular-nums;">${d.code}</td>
      <td style="padding:6px 8px;">${escHtml(d.category)}</td>
      <td style="padding:6px 8px;text-align:right;">${d.days.toFixed(1)}</td>
      <td style="padding:6px 8px;font-weight:600;">${escHtml(d.name)}</td>
      <td style="padding:6px 8px;text-align:center;"><span style="background:#f3f4f6;border:1px solid #e5e7eb;border-radius:4px;padding:1px 7px;">${escHtml(d.symbol)}</span></td>
      <td style="padding:6px 8px;white-space:nowrap;">${d.kosoku_time === '00:00' ? `<span style="color:#d1d5db;">-</span>` : `${escHtml(d.kosoku_start)}〜${escHtml(d.kosoku_end)}<span style="color:#9ca3af;">（${escHtml(d.kosoku_time)}）</span>`}</td>
      <td style="padding:6px 8px;text-align:center;">${t(d.shinya_time)}</td>
      <td style="padding:6px 8px;text-align:right;font-variant-numeric:tabular-nums;">${d.std_eishu ? d.std_eishu.toLocaleString() : `<span style="color:#d1d5db;">-</span>`}</td>
      <td style="padding:6px 8px;text-align:center;white-space:nowrap;">${(d.std_run_max || d.std_run_min) ? `${d.std_run_max}<span style="color:#9ca3af;"> / </span>${d.std_run_min}` : `<span style="color:#d1d5db;">-</span>`}</td>
      <td style="padding:6px 8px;text-align:center;white-space:nowrap;">${pair(d.std_kosoku_max, d.std_kosoku_min)}</td>
      <td style="padding:6px 8px;text-align:center;white-space:nowrap;">${pair(d.std_handle_max, d.std_handle_min)}</td>
      <td style="padding:6px 8px;text-align:center;white-space:nowrap;">${pair(d.std_kutei_max, d.std_kutei_min)}</td>
      <td style="padding:6px 8px;white-space:nowrap;">
        <button onclick="openDia(${d.id})" style="padding:3px 10px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:4px;font-size:12px;cursor:pointer;">編集</button>
        <button onclick="toggleDia(${d.id},${d.is_active})" style="padding:3px 8px;background:${d.is_active ? '#f3f4f6' : '#bbf7d0'};border:1px solid #d1d5db;border-radius:4px;font-size:12px;cursor:pointer;">${d.is_active ? '非表示' : '表示'}</button>
        <button onclick="delDia(${d.id},'${escHtml(d.name)}')" style="padding:3px 8px;background:#fee2e2;color:#991b1b;border:none;border-radius:4px;font-size:12px;cursor:pointer;">削除</button>
      </td>
    </tr>`).join('');

  const cycleRows = cycles.map(cy => {
    let pattern: string[] = [];
    try { pattern = JSON.parse(cy.pattern); } catch { /* 空のまま */ }
    const cells = pattern.map((p, i) => `
      <span title="${i + 1}日目" style="display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;border:1px solid #e5e7eb;border-left:${(i % 7 === 0 && i > 0) ? '2px solid #9ca3af' : '1px solid #e5e7eb'};font-size:11px;background:${p === '公' ? '#fef3c7' : p === '' ? '#fafafa' : '#eff6ff'};">${escHtml(p)}</span>`).join('');
    return `
    <tr style="opacity:${cy.is_active ? '1' : '0.4'};border-bottom:1px solid #f3f4f6;">
      <td style="padding:6px 8px;text-align:right;">${cy.cycle_no}</td>
      <td style="padding:6px 8px;font-weight:600;white-space:nowrap;">${escHtml(cy.name)}</td>
      <td style="padding:6px 8px;text-align:right;">${cy.days}</td>
      <td style="padding:6px 8px;"><div style="display:flex;flex-wrap:wrap;">${cells}</div></td>
      <td style="padding:6px 8px;white-space:nowrap;">
        <button onclick="openCycle(${cy.id})" style="padding:3px 10px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:4px;font-size:12px;cursor:pointer;">編集</button>
        <button onclick="toggleCycle(${cy.id},${cy.is_active})" style="padding:3px 8px;background:${cy.is_active ? '#f3f4f6' : '#bbf7d0'};border:1px solid #d1d5db;border-radius:4px;font-size:12px;cursor:pointer;">${cy.is_active ? '非表示' : '表示'}</button>
        <button onclick="delCycle(${cy.id},'${escHtml(cy.name)}')" style="padding:3px 8px;background:#fee2e2;color:#991b1b;border:none;border-radius:4px;font-size:12px;cursor:pointer;">削除</button>
      </td>
    </tr>`;
  }).join('');

  const html = settingsSubHeader('勤務ダイヤ・サイクル') + `
    <div style="display:flex;gap:8px;margin-bottom:16px;">
      <button id="tab-dia" onclick="showTab('dia')" style="padding:8px 20px;border-radius:8px 8px 0 0;border:1px solid #d1d5db;border-bottom:none;background:white;font-size:13px;font-weight:700;cursor:pointer;color:#1d4ed8;">ダイヤマスター</button>
      <button id="tab-cycle" onclick="showTab('cycle')" style="padding:8px 20px;border-radius:8px 8px 0 0;border:1px solid #d1d5db;border-bottom:none;background:#f3f4f6;font-size:13px;font-weight:600;cursor:pointer;color:#6b7280;">サイクル一覧</button>
    </div>

    <div id="pane-dia" class="bg-white rounded-xl shadow p-6">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap;">
        <p style="font-size:13px;color:#6b7280;">勤務ダイヤ（勤務シフトの型）の定義一覧です。時刻は「時:分」で入力します（29:00 = 翌朝5時 のような24時越え表記も使えます）。</p>
        <button onclick="openDia(0)" style="margin-left:auto;padding:7px 18px;background:#059669;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;">新しいダイヤを追加</button>
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%;font-size:13px;border-collapse:collapse;">
          <thead>
            <tr style="background:#f9fafb;color:#6b7280;font-size:11px;">
              <th style="padding:6px 8px;text-align:right;">コード</th>
              <th style="padding:6px 8px;text-align:left;">区分</th>
              <th style="padding:6px 8px;text-align:right;">日数</th>
              <th style="padding:6px 8px;text-align:left;">ダイヤ名</th>
              <th style="padding:6px 8px;">記号</th>
              <th style="padding:6px 8px;text-align:left;">拘束（時間）</th>
              <th style="padding:6px 8px;">深夜時間</th>
              <th style="padding:6px 8px;text-align:right;">営収基準</th>
              <th style="padding:6px 8px;">走行 上限/下限</th>
              <th style="padding:6px 8px;">拘束 上限/下限</th>
              <th style="padding:6px 8px;">ハンドル 上限/下限</th>
              <th style="padding:6px 8px;">空停 上限/下限</th>
              <th style="padding:6px 8px;text-align:left;">操作</th>
            </tr>
          </thead>
          <tbody>${diaRows || '<tr><td colspan="13" style="padding:20px;text-align:center;color:#9ca3af;">ダイヤが登録されていません</td></tr>'}</tbody>
        </table>
      </div>
    </div>

    <div id="pane-cycle" class="bg-white rounded-xl shadow p-6" style="display:none;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap;">
        <p style="font-size:13px;color:#6b7280;">勤務サイクル（何日周期でどのダイヤを繰り返すか）の一覧です。空欄のマスは隔日勤務の「明け番」を表します。太線は7日ごとの区切りです。</p>
        <button onclick="openCycle(0)" style="margin-left:auto;padding:7px 18px;background:#059669;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;">新しいサイクルを追加</button>
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%;font-size:13px;border-collapse:collapse;">
          <thead>
            <tr style="background:#f9fafb;color:#6b7280;font-size:11px;">
              <th style="padding:6px 8px;text-align:right;">番号</th>
              <th style="padding:6px 8px;text-align:left;">サイクル名</th>
              <th style="padding:6px 8px;text-align:right;">日数</th>
              <th style="padding:6px 8px;text-align:left;">パターン（1日目〜）</th>
              <th style="padding:6px 8px;text-align:left;">操作</th>
            </tr>
          </thead>
          <tbody>${cycleRows || '<tr><td colspan="5" style="padding:20px;text-align:center;color:#9ca3af;">サイクルが登録されていません</td></tr>'}</tbody>
        </table>
      </div>
    </div>

    <!-- ダイヤ編集モーダル -->
    <div id="dia-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:50;overflow-y:auto;padding:24px;">
      <div style="background:white;border-radius:12px;max-width:760px;margin:0 auto;padding:24px;">
        <h3 id="dia-modal-title" style="font-size:16px;font-weight:700;color:#1e3a5f;margin-bottom:16px;"></h3>
        <div id="dia-form"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px;">
          <button onclick="closeDia()" style="padding:8px 20px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;font-size:13px;cursor:pointer;">キャンセル</button>
          <button onclick="saveDia()" id="dia-save-btn" style="padding:8px 24px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">保存</button>
        </div>
      </div>
    </div>

    <!-- サイクル編集モーダル -->
    <div id="cycle-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:50;overflow-y:auto;padding:24px;">
      <div style="background:white;border-radius:12px;max-width:860px;margin:0 auto;padding:24px;">
        <h3 id="cycle-modal-title" style="font-size:16px;font-weight:700;color:#1e3a5f;margin-bottom:16px;"></h3>
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:14px;">
          <label style="font-size:12px;color:#374151;">番号<br><input type="number" id="cy-no" min="0" max="999" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:13px;width:80px;"></label>
          <label style="font-size:12px;color:#374151;">サイクル名<br><input type="text" id="cy-name" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:13px;width:200px;"></label>
          <label style="font-size:12px;color:#374151;">日数（1〜40）<br><input type="number" id="cy-days" min="1" max="40" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:13px;width:80px;" onchange="renderCycleGrid()"></label>
        </div>
        <p style="font-size:12px;color:#6b7280;margin-bottom:8px;">各マスに表示記号（ダイヤマスターの記号や 公・指・内 など）を入力します。隔日勤務の明け番は空欄のままにします。</p>
        <div id="cy-grid" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;"></div>
        <div style="font-size:12px;color:#6b7280;">使える記号の例: <span id="cy-symbols" style="color:#374151;"></span></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px;">
          <button onclick="closeCycle()" style="padding:8px 20px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;font-size:13px;cursor:pointer;">キャンセル</button>
          <button onclick="saveCycle()" id="cy-save-btn" style="padding:8px 24px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">保存</button>
        </div>
      </div>
    </div>

    <script>
    var DIAS = ${safeJson(dias)};
    var CYCLES = ${safeJson(cycles)};
    var API = '/api/dia';

    function showTab(name) {
      document.getElementById('pane-dia').style.display = name === 'dia' ? '' : 'none';
      document.getElementById('pane-cycle').style.display = name === 'cycle' ? '' : 'none';
      var td = document.getElementById('tab-dia'), tc = document.getElementById('tab-cycle');
      td.style.background = name === 'dia' ? 'white' : '#f3f4f6';
      td.style.color = name === 'dia' ? '#1d4ed8' : '#6b7280';
      tc.style.background = name === 'cycle' ? 'white' : '#f3f4f6';
      tc.style.color = name === 'cycle' ? '#1d4ed8' : '#6b7280';
      try { localStorage.setItem('dia-tab', name); } catch (e) {}
    }
    try { if (localStorage.getItem('dia-tab') === 'cycle') showTab('cycle'); } catch (e) {}

    // ===== ダイヤ編集 =====
    var editingDiaId = 0;
    var TIME_GROUPS = [
      ['拘束', 'kosoku'], ['所定', 'shotei'], ['残業', 'zangyo'], ['深夜', 'shinya'],
      ['休憩1', 'kyukei1'], ['休憩2', 'kyukei2'], ['休憩3', 'kyukei3'], ['休憩4', 'kyukei4'],
    ];
    var STD_PAIRS = [
      ['拘束', 'std_kosoku'], ['ハンドル', 'std_handle'], ['空停', 'std_kutei'],
    ];
    function inputHtml(id, val, w) {
      return '<input type="text" id="' + id + '" value="' + String(val).replace(/"/g, '&quot;') + '" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:13px;width:' + (w || 74) + 'px;">';
    }
    function openDia(id) {
      editingDiaId = id;
      var d = DIAS.find(function(x) { return x.id === id; }) || {
        code: '', category: '出勤', days: 1.0, name: '', symbol: '',
        std_eishu: 0, std_run_max: 0, std_run_min: 0,
      };
      TIME_GROUPS.forEach(function(g) {
        ['_start', '_end', '_time'].forEach(function(sfx) {
          if (d[g[1] + sfx] === undefined) d[g[1] + sfx] = '00:00';
        });
      });
      STD_PAIRS.forEach(function(g) {
        if (d[g[1] + '_max'] === undefined) d[g[1] + '_max'] = '00:00';
        if (d[g[1] + '_min'] === undefined) d[g[1] + '_min'] = '00:00';
      });
      document.getElementById('dia-modal-title').textContent = id ? 'ダイヤの編集: ' + d.name : '新しいダイヤを追加';
      var h = '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:14px;">'
        + '<label style="font-size:12px;color:#374151;">コード<br>' + inputHtml('f-code', d.code, 70) + '</label>'
        + '<label style="font-size:12px;color:#374151;">ダイヤ区分<br>' + inputHtml('f-category', d.category, 90) + '</label>'
        + '<label style="font-size:12px;color:#374151;">日数<br>' + inputHtml('f-days', d.days, 60) + '</label>'
        + '<label style="font-size:12px;color:#374151;">ダイヤ名<br>' + inputHtml('f-name', d.name, 110) + '</label>'
        + '<label style="font-size:12px;color:#374151;">表示記号<br>' + inputHtml('f-symbol', d.symbol, 70) + '</label>'
        + '</div>'
        + '<div style="font-size:12px;font-weight:700;color:#6b7280;margin-bottom:6px;">時間帯（開始 / 終了 / 時間）</div>'
        + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:8px 20px;margin-bottom:14px;">';
      TIME_GROUPS.forEach(function(g) {
        h += '<div style="display:flex;align-items:center;gap:6px;font-size:12px;color:#374151;">'
          + '<span style="width:44px;">' + g[0] + '</span>'
          + inputHtml('f-' + g[1] + '_start', d[g[1] + '_start']) + '〜'
          + inputHtml('f-' + g[1] + '_end', d[g[1] + '_end'])
          + '<span style="color:#9ca3af;">計</span>' + inputHtml('f-' + g[1] + '_time', d[g[1] + '_time'])
          + '</div>';
      });
      h += '</div>'
        + '<div style="font-size:12px;font-weight:700;color:#6b7280;margin-bottom:6px;">指導基準</div>'
        + '<div style="display:flex;gap:14px;flex-wrap:wrap;">'
        + '<label style="font-size:12px;color:#374151;">営収（円）<br>' + inputHtml('f-std_eishu', d.std_eishu, 90) + '</label>'
        + '<label style="font-size:12px;color:#374151;">走行上限（km）<br>' + inputHtml('f-std_run_max', d.std_run_max, 80) + '</label>'
        + '<label style="font-size:12px;color:#374151;">走行下限（km）<br>' + inputHtml('f-std_run_min', d.std_run_min, 80) + '</label>';
      STD_PAIRS.forEach(function(g) {
        h += '<label style="font-size:12px;color:#374151;">' + g[0] + ' 上限/下限<br>'
          + inputHtml('f-' + g[1] + '_max', d[g[1] + '_max']) + ' / '
          + inputHtml('f-' + g[1] + '_min', d[g[1] + '_min']) + '</label>';
      });
      h += '</div>';
      document.getElementById('dia-form').innerHTML = h;
      document.getElementById('dia-modal').style.display = 'block';
    }
    function closeDia() { document.getElementById('dia-modal').style.display = 'none'; }
    async function saveDia() {
      var body = {
        code: parseInt(document.getElementById('f-code').value),
        category: document.getElementById('f-category').value,
        days: parseFloat(document.getElementById('f-days').value),
        name: document.getElementById('f-name').value,
        symbol: document.getElementById('f-symbol').value,
        std_eishu: parseInt(document.getElementById('f-std_eishu').value) || 0,
        std_run_max: parseInt(document.getElementById('f-std_run_max').value) || 0,
        std_run_min: parseInt(document.getElementById('f-std_run_min').value) || 0,
      };
      TIME_GROUPS.forEach(function(g) {
        ['_start', '_end', '_time'].forEach(function(sfx) {
          body[g[1] + sfx] = document.getElementById('f-' + g[1] + sfx).value.trim() || '00:00';
        });
      });
      STD_PAIRS.forEach(function(g) {
        body[g[1] + '_max'] = document.getElementById('f-' + g[1] + '_max').value.trim() || '00:00';
        body[g[1] + '_min'] = document.getElementById('f-' + g[1] + '_min').value.trim() || '00:00';
      });
      var btn = document.getElementById('dia-save-btn');
      btn.disabled = true; btn.textContent = '保存中...';
      var res = await fetch(editingDiaId ? API + '/master/' + editingDiaId : API + '/master', {
        method: editingDiaId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      btn.disabled = false; btn.textContent = '保存';
      if (res.ok) location.reload();
      else { var j = await res.json().catch(function() { return {}; }); alert(j.error || '保存に失敗しました'); }
    }
    async function toggleDia(id, current) {
      await fetch(API + '/master/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: current ? 0 : 1 }) });
      location.reload();
    }
    async function delDia(id, name) {
      if (!confirm('ダイヤ「' + name + '」を削除しますか？')) return;
      await fetch(API + '/master/' + id, { method: 'DELETE' });
      location.reload();
    }

    // ===== サイクル編集 =====
    var editingCycleId = 0;
    var editingPattern = [];
    function openCycle(id) {
      editingCycleId = id;
      var cy = CYCLES.find(function(x) { return x.id === id; });
      var pattern = [];
      if (cy) { try { pattern = JSON.parse(cy.pattern); } catch (e) {} }
      editingPattern = pattern.slice();
      document.getElementById('cycle-modal-title').textContent = id ? 'サイクルの編集: ' + cy.name : '新しいサイクルを追加';
      document.getElementById('cy-no').value = cy ? cy.cycle_no : '';
      document.getElementById('cy-name').value = cy ? cy.name : '';
      document.getElementById('cy-days').value = cy ? cy.days : 26;
      var syms = {};
      DIAS.forEach(function(d) { if (d.symbol) syms[d.symbol] = 1; });
      document.getElementById('cy-symbols').textContent = Object.keys(syms).join(' ');
      renderCycleGrid();
      document.getElementById('cycle-modal').style.display = 'block';
    }
    function renderCycleGrid() {
      // 入力済みの値を保持してからマス数を変更する
      var inputs = document.querySelectorAll('#cy-grid input');
      inputs.forEach(function(inp, i) { editingPattern[i] = inp.value; });
      var days = Math.max(1, Math.min(40, parseInt(document.getElementById('cy-days').value) || 1));
      var h = '';
      for (var i = 0; i < days; i++) {
        h += '<div style="text-align:center;">'
          + '<div style="font-size:10px;color:#9ca3af;">' + (i + 1) + '</div>'
          + '<input type="text" value="' + String(editingPattern[i] || '').replace(/"/g, '&quot;') + '" maxlength="4" '
          + 'style="width:34px;height:30px;text-align:center;border:1px solid #d1d5db;border-radius:4px;font-size:13px;' + (i % 7 === 6 ? 'margin-right:8px;' : '') + '">'
          + '</div>';
      }
      document.getElementById('cy-grid').innerHTML = h;
    }
    function closeCycle() { document.getElementById('cycle-modal').style.display = 'none'; }
    async function saveCycle() {
      var days = parseInt(document.getElementById('cy-days').value) || 0;
      var pattern = Array.from(document.querySelectorAll('#cy-grid input')).map(function(inp) { return inp.value.trim(); });
      var body = {
        cycle_no: parseInt(document.getElementById('cy-no').value),
        name: document.getElementById('cy-name').value,
        days: days,
        pattern: pattern,
      };
      var btn = document.getElementById('cy-save-btn');
      btn.disabled = true; btn.textContent = '保存中...';
      var res = await fetch(editingCycleId ? API + '/cycles/' + editingCycleId : API + '/cycles', {
        method: editingCycleId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      btn.disabled = false; btn.textContent = '保存';
      if (res.ok) { try { localStorage.setItem('dia-tab', 'cycle'); } catch (e) {} location.reload(); }
      else { var j = await res.json().catch(function() { return {}; }); alert(j.error || '保存に失敗しました'); }
    }
    async function toggleCycle(id, current) {
      await fetch(API + '/cycles/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: current ? 0 : 1 }) });
      try { localStorage.setItem('dia-tab', 'cycle'); } catch (e) {}
      location.reload();
    }
    async function delCycle(id, name) {
      if (!confirm('サイクル「' + name + '」を削除しますか？')) return;
      await fetch(API + '/cycles/' + id, { method: 'DELETE' });
      try { localStorage.setItem('dia-tab', 'cycle'); } catch (e) {}
      location.reload();
    }
    </script>`;
  return c.html(layout('勤務ダイヤ・サイクル設定', html, 'settings'));
});

export default app;
