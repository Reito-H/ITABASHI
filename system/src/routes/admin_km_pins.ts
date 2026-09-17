// 設定: km-operator連携 乗降ピンデータ収集
// 国際自動車グループの配車オペレーター画面（km-operator.smartaxicenter.com）の「営業情報」画面が
// 使っているAPI（trip_infos/search）から、板橋営業所の車両ごとに乗車・降車地点＋料金等を収集して蓄積する。
// 配車依頼（電話・アプリ）だけでなく流し営業も含めて拾える。詳細な調査結果は docs/KM_OPERATOR_API.md 参照。
//
// 収集は管理者が「収集開始」ボタンを押すと、ブラウザ側JSが小さいチャンク（車両25台ずつ）に分けて
// /api/km-pins/collect_chunk を繰り返し呼ぶ方式（Cloudflare Workers無料プランのサブリクエスト上限50/回
// を超えないため。他の一括取込機能と同じパターン。[[feedback_cloudflare_free_plan_cpu_limit]]参照）。
import { Hono } from 'hono';
import type { Env } from '../auth';
import { layout } from '../html/layout';
import { settingsSubHeader } from './admin';
import { kmOperatorLogin, kmOperatorSearchTripInfos, kmNowParam } from '../utils/km_operator';
import { getItabashiRadioNumbers, saveTripsStmts } from '../utils/km_pins';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

const CHUNK_SIZE = 25;

async function adminName(c: { env: Env; get: (k: 'adminId') => number }): Promise<string> {
  const row = await c.env.DB.prepare('SELECT username FROM admins WHERE id = ?')
    .bind(c.get('adminId')).first<{ username: string }>();
  return row?.username ?? `id:${c.get('adminId')}`;
}

// ===== ページ =====
app.get('/settings/km-pins', async (c) => {
  const embed = c.req.query('embed') === '1';
  const html = (embed ? '' : settingsSubHeader('乗降ピンデータ収集（km-operator連携）')) + `
    <div style="max-width:960px;">
      <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:16px 20px;margin-bottom:16px;font-size:13px;color:#374151;line-height:1.7;">
        国際自動車グループの配車システム（km-operator）の「営業情報」データから、板橋営業所の車両が
        実際にお客様を乗せた場所（乗車地点）と降ろした場所（降車地点）を収集します。配車依頼だけでなく、
        流し営業分も含みます。詳細は<code>docs/KM_OPERATOR_API.md</code>参照。<br>
        <strong>データの収集は社内PCの収集スクリプト（scripts/km_pins_collector.ps1）が自動で行います。</strong>
        Cloudflare（このサーバー）からkm-operatorへ直接アクセスすると接続がブロックされることが判明したため、
        下の「収集開始」ボタンは現状動作しません（参考のため残してあります）。
      </div>

      <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:20px;margin-bottom:16px;">
        <div style="display:flex;gap:24px;flex-wrap:wrap;margin-bottom:16px;">
          <div>
            <div style="font-size:11px;color:#6b7280;">対象車両数（板橋営業所）</div>
            <div id="km-vehicle-count" style="font-size:22px;font-weight:700;color:#1e3a5f;">-</div>
          </div>
          <div>
            <div style="font-size:11px;color:#6b7280;">収集済みピン数</div>
            <div id="km-total-pins" style="font-size:22px;font-weight:700;color:#1e3a5f;">-</div>
          </div>
          <div>
            <div style="font-size:11px;color:#6b7280;">社内PCからの最終受信</div>
            <div id="km-last-received" style="font-size:22px;font-weight:700;color:#1e3a5f;">-</div>
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px;">
          <label style="font-size:12px;color:#374151;">問い合わせ日時：</label>
          <input type="datetime-local" id="km-target-date" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:13px;">
          <span style="font-size:11px;color:#9ca3af;">未入力なら現在時刻。各車両の「今動いているシフト」時点のデータが対象になる</span>
        </div>

        <button type="button" id="km-collect-btn" onclick="kmStartCollect()" style="padding:10px 20px;background:#1a3a5c;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">収集開始</button>

        <div id="km-progress-wrap" style="display:none;margin-top:16px;">
          <div style="background:#f3f4f6;border-radius:6px;height:10px;overflow:hidden;">
            <div id="km-progress-bar" style="background:#1a3a5c;height:100%;width:0%;transition:width 0.2s;"></div>
          </div>
          <div id="km-progress-text" style="font-size:12px;color:#374151;margin-top:6px;"></div>
        </div>
      </div>

      <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:20px;margin-bottom:16px;">
        <div style="font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:14px;">需要分析</div>

        <div style="display:flex;gap:24px;flex-wrap:wrap;margin-bottom:16px;">
          <div><div style="font-size:11px;color:#6b7280;">分析対象件数</div><div id="km-stat-count" style="font-size:18px;font-weight:700;color:#1e3a5f;">-</div></div>
          <div><div style="font-size:11px;color:#6b7280;">平均料金</div><div id="km-stat-avgfare" style="font-size:18px;font-weight:700;color:#1e3a5f;">-</div></div>
          <div><div style="font-size:11px;color:#6b7280;">平均距離</div><div id="km-stat-avgdist" style="font-size:18px;font-weight:700;color:#1e3a5f;">-</div></div>
          <div><div style="font-size:11px;color:#6b7280;">配車 / 流し</div><div id="km-stat-ratio" style="font-size:18px;font-weight:700;color:#1e3a5f;">-</div></div>
        </div>

        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
          <span style="font-size:12px;color:#374151;">地図：</span>
          <button type="button" class="km-map-toggle active" data-kind="on" onclick="kmSetMapKind('on')" style="padding:6px 14px;border-radius:14px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid #cbd5e1;background:#1d4ed8;color:white;">乗車地点</button>
          <button type="button" class="km-map-toggle" data-kind="out" onclick="kmSetMapKind('out')" style="padding:6px 14px;border-radius:14px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid #cbd5e1;background:#f8fafc;color:#475569;">降車地点</button>
          <span style="font-size:11px;color:#9ca3af;margin-left:6px;">円が大きい・濃いほど頻出（約150m四方でまとめて集計）</span>
        </div>
        <div id="km-map" style="width:100%;height:420px;border-radius:8px;border:1px solid #e5e7eb;"></div>

        <div style="font-size:12px;font-weight:700;color:#1e3a5f;margin:18px 0 8px;">時間帯×曜日（乗車件数）</div>
        <div style="overflow-x:auto;">
          <table id="km-time-table" style="border-collapse:collapse;font-size:11px;"></table>
        </div>
      </div>

      <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:20px;margin-bottom:16px;">
        <div style="font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:10px;">直近の収集結果（最新50件）</div>
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead style="background:#f9fafb;">
              <tr>
                <th style="padding:6px 10px;text-align:left;color:#6b7280;">乗車日時</th>
                <th style="padding:6px 10px;text-align:left;color:#6b7280;">無線番号</th>
                <th style="padding:6px 10px;text-align:left;color:#6b7280;">乗務員</th>
                <th style="padding:6px 10px;text-align:right;color:#6b7280;">距離(m)</th>
                <th style="padding:6px 10px;text-align:right;color:#6b7280;">料金</th>
                <th style="padding:6px 10px;text-align:left;color:#6b7280;">配車/流し</th>
              </tr>
            </thead>
            <tbody id="km-pins-tbody"></tbody>
          </table>
        </div>
      </div>
    </div>

    <script>
      function kmFmtDatetimeLocal() {
        const el = document.getElementById('km-target-date');
        if (el.value) {
          // datetime-local (YYYY-MM-DDTHH:mm) -> km-operator形式 (YYYY/MM/DD HH:mm)
          return el.value.replace('T', ' ').replace(/-/g, '/');
        }
        return '';
      }

      async function kmLoadStatus() {
        const res = await fetch(location.pathname.replace('/settings/km-pins', '/api/km-pins/status'));
        const data = await res.json();
        document.getElementById('km-vehicle-count').textContent = data.vehicleCount + '台';
        document.getElementById('km-total-pins').textContent = data.totalPins.toLocaleString('ja-JP') + '件';
        document.getElementById('km-last-received').textContent = data.lastReceivedAt || '未受信';
      }

      async function kmLoadPins() {
        const res = await fetch(location.pathname.replace('/settings/km-pins', '/api/km-pins/pins') + '?limit=50');
        const data = await res.json();
        const tbody = document.getElementById('km-pins-tbody');
        tbody.innerHTML = (data.pins || []).map(function(p) {
          return '<tr style="border-top:1px solid #f3f4f6;">' +
            '<td style="padding:6px 10px;">' + (p.on_service_at || '-') + '</td>' +
            '<td style="padding:6px 10px;">' + (p.radio_no || '-') + '</td>' +
            '<td style="padding:6px 10px;">' + (p.driver_name || '-') + '</td>' +
            '<td style="padding:6px 10px;text-align:right;">' + (p.distance_m != null ? p.distance_m.toLocaleString('ja-JP') : '-') + '</td>' +
            '<td style="padding:6px 10px;text-align:right;">' + (p.fare != null ? p.fare.toLocaleString('ja-JP') + '円' : '-') + '</td>' +
            '<td style="padding:6px 10px;">' + (p.ticket_number ? '配車' : '流し') + '</td>' +
          '</tr>';
        }).join('') || '<tr><td colspan="6" style="padding:14px;text-align:center;color:#9ca3af;">まだ収集していません</td></tr>';
      }

      async function kmStartCollect() {
        const btn = document.getElementById('km-collect-btn');
        btn.disabled = true;
        const wrap = document.getElementById('km-progress-wrap');
        const bar = document.getElementById('km-progress-bar');
        const text = document.getElementById('km-progress-text');
        wrap.style.display = 'block';
        const date = kmFmtDatetimeLocal();
        const base = location.pathname.replace('/settings/km-pins', '/api/km-pins/collect_chunk');
        let offset = 0;
        let runId = null;
        let totalSaved = 0;
        let totalErrors = 0;
        try {
          while (true) {
            const res = await fetch(base, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ date: date, offset: offset, limit: ${CHUNK_SIZE}, runId: runId }),
            });
            const data = await res.json();
            if (!res.ok) {
              text.textContent = 'エラー: ' + (data.error || '不明なエラー');
              break;
            }
            runId = data.runId;
            totalSaved += data.savedThisChunk;
            totalErrors += data.errorsThisChunk;
            const pct = data.totalVehicles > 0 ? Math.round((data.processed / data.totalVehicles) * 100) : 100;
            bar.style.width = pct + '%';
            text.textContent = data.processed + ' / ' + data.totalVehicles + '台 処理済み（新規保存 ' + totalSaved + '件、エラー ' + totalErrors + '件）';
            if (data.done) break;
            offset = data.nextOffset;
          }
          text.textContent += '　→ 完了';
        } catch (e) {
          text.textContent = '通信エラーが発生しました';
        } finally {
          btn.disabled = false;
          kmLoadStatus();
          kmLoadPins();
        }
      }

      var kmMapKind = 'on';
      function kmSetMapKind(kind) {
        kmMapKind = kind;
        document.querySelectorAll('.km-map-toggle').forEach(function(b) {
          var active = b.dataset.kind === kind;
          b.classList.toggle('active', active);
          b.style.background = active ? '#1d4ed8' : '#f8fafc';
          b.style.color = active ? 'white' : '#475569';
        });
        kmLoadMap();
      }

      async function kmLoadMap() {
        const res = await fetch(location.pathname.replace('/settings/km-pins', '/api/km-pins/heatmap') + '?kind=' + kmMapKind);
        const data = await res.json();
        const box = document.getElementById('km-map');
        const points = data.points || [];
        if (points.length === 0) {
          box.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9ca3af;font-size:13px;">データがまだありません</div>';
          return;
        }
        const lats = points.map(function(p) { return p.lat; });
        const lngs = points.map(function(p) { return p.lng; });
        const minLat = Math.min.apply(null, lats), maxLat = Math.max.apply(null, lats);
        const minLng = Math.min.apply(null, lngs), maxLng = Math.max.apply(null, lngs);
        const padLat = Math.max((maxLat - minLat) * 0.1, 0.003);
        const padLng = Math.max((maxLng - minLng) * 0.1, 0.003);
        const lat0 = minLat - padLat, lat1 = maxLat + padLat;
        const lng0 = minLng - padLng, lng1 = maxLng + padLng;
        const maxCount = Math.max.apply(null, points.map(function(p) { return p.count; }));
        box.style.position = 'relative';
        box.style.overflow = 'hidden';
        box.style.background = '#eef2f7';
        var html = '';
        points.forEach(function(p) {
          const x = ((p.lng - lng0) / (lng1 - lng0)) * 100;
          const y = (1 - (p.lat - lat0) / (lat1 - lat0)) * 100;
          const ratio = p.count / maxCount;
          const size = 8 + ratio * 32;
          const alpha = 0.35 + ratio * 0.55;
          const color = kmMapKind === 'on' ? '229,57,53' : '30,64,175';
          html += '<div title="' + p.count + '件" style="position:absolute;left:' + x + '%;top:' + y + '%;' +
            'width:' + size + 'px;height:' + size + 'px;margin-left:-' + (size / 2) + 'px;margin-top:-' + (size / 2) + 'px;' +
            'border-radius:50%;background:rgba(' + color + ',' + alpha + ');border:1px solid rgba(' + color + ',0.9);cursor:default;"></div>';
        });
        box.innerHTML = html;
      }

      async function kmLoadTimePattern() {
        const res = await fetch(location.pathname.replace('/settings/km-pins', '/api/km-pins/time-pattern'));
        const data = await res.json();
        const grid = data.grid || [];
        const weekdayLabels = ['日', '月', '火', '水', '木', '金', '土'];
        let maxC = 1;
        grid.forEach(function(row) { row.forEach(function(c) { if (c > maxC) maxC = c; }); });
        let html = '<thead><tr><th style="padding:4px 6px;"></th>';
        for (let h = 0; h < 24; h++) html += '<th style="padding:2px 3px;color:#9ca3af;font-weight:400;">' + h + '</th>';
        html += '</tr></thead><tbody>';
        for (let w = 0; w < 7; w++) {
          html += '<tr><td style="padding:2px 6px;color:#6b7280;font-weight:600;">' + weekdayLabels[w] + '</td>';
          for (let h = 0; h < 24; h++) {
            const c = (grid[w] && grid[w][h]) || 0;
            const alpha = c === 0 ? 0.03 : 0.15 + (c / maxC) * 0.75;
            html += '<td title="' + c + '件" style="width:18px;height:18px;text-align:center;background:rgba(29,78,216,' + alpha + ');color:' + (alpha > 0.5 ? 'white' : '#374151') + ';">' + (c || '') + '</td>';
          }
          html += '</tr>';
        }
        html += '</tbody>';
        document.getElementById('km-time-table').innerHTML = html;
      }

      async function kmLoadSummary() {
        const res = await fetch(location.pathname.replace('/settings/km-pins', '/api/km-pins/summary'));
        const data = await res.json();
        document.getElementById('km-stat-count').textContent = data.count.toLocaleString('ja-JP') + '件';
        document.getElementById('km-stat-avgfare').textContent = data.avgFare != null ? Math.round(data.avgFare).toLocaleString('ja-JP') + '円' : '-';
        document.getElementById('km-stat-avgdist').textContent = data.avgDistance != null ? Math.round(data.avgDistance).toLocaleString('ja-JP') + 'm' : '-';
        document.getElementById('km-stat-ratio').textContent = data.dispatched + ' / ' + data.street;
      }

      kmLoadStatus();
      kmLoadPins();
      kmLoadMap();
      kmLoadTimePattern();
      kmLoadSummary();
    </script>
  `;
  return c.html(layout('km-operator連携', html, 'settings', '', embed));
});

// ===== API =====
app.get('/api/km-pins/status', async (c) => {
  const radioNumbers = await getItabashiRadioNumbers(c.env.DB);
  const totalRow = await c.env.DB.prepare('SELECT COUNT(*) AS c FROM km_trip_pins').first<{ c: number }>();
  const lastRun = await c.env.DB.prepare(
    `SELECT started_at FROM km_pin_collection_runs WHERE triggered_by LIKE '社内PC%' ORDER BY id DESC LIMIT 1`
  ).first<{ started_at: string }>();
  return c.json({ vehicleCount: radioNumbers.length, totalPins: totalRow?.c ?? 0, lastReceivedAt: lastRun?.started_at ?? null });
});

app.get('/api/km-pins/pins', async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10) || 50, 200);
  const rows = await c.env.DB.prepare(
    `SELECT on_service_at, radio_no, driver_name, distance_m, fare, ticket_number
     FROM km_trip_pins ORDER BY on_service_at DESC LIMIT ?`
  ).bind(limit).all();
  return c.json({ pins: rows.results ?? [] });
});

// 約100m四方（緯度経度小数3桁）でまとめて頻出地点を集計
app.get('/api/km-pins/heatmap', async (c) => {
  const kind = c.req.query('kind') === 'out' ? 'out' : 'on';
  const latCol = kind === 'on' ? 'on_latitude' : 'out_latitude';
  const lngCol = kind === 'on' ? 'on_longitude' : 'out_longitude';
  const rows = await c.env.DB.prepare(`
    SELECT ROUND(${latCol}, 3) AS lat, ROUND(${lngCol}, 3) AS lng, COUNT(*) AS count
    FROM km_trip_pins
    WHERE ${latCol} IS NOT NULL AND ${lngCol} IS NOT NULL
    GROUP BY lat, lng
    ORDER BY count DESC
    LIMIT 300
  `).all<{ lat: number; lng: number; count: number }>();
  return c.json({ points: rows.results ?? [] });
});

// 時間帯(0-23)×曜日(0=日〜6=土)の乗車件数グリッド。on_service_atは"YYYY/MM/DD HH:mm"形式のためJS側でパース
app.get('/api/km-pins/time-pattern', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT on_service_at FROM km_trip_pins WHERE on_service_at IS NOT NULL LIMIT 20000`
  ).all<{ on_service_at: string }>();
  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const r of rows.results ?? []) {
    const d = new Date(r.on_service_at.replace(/\//g, '-'));
    if (Number.isNaN(d.getTime())) continue;
    grid[d.getDay()][d.getHours()]++;
  }
  return c.json({ grid });
});

app.get('/api/km-pins/summary', async (c) => {
  const row = await c.env.DB.prepare(`
    SELECT COUNT(*) AS count, AVG(fare) AS avgFare, AVG(distance_m) AS avgDistance,
      SUM(CASE WHEN ticket_number IS NOT NULL THEN 1 ELSE 0 END) AS dispatched,
      SUM(CASE WHEN ticket_number IS NULL THEN 1 ELSE 0 END) AS street
    FROM km_trip_pins
  `).first<{ count: number; avgFare: number | null; avgDistance: number | null; dispatched: number; street: number }>();
  return c.json(row ?? { count: 0, avgFare: null, avgDistance: null, dispatched: 0, street: 0 });
});

app.post('/api/km-pins/collect_chunk', async (c) => {
  const loginId = c.env.KM_OPERATOR_LOGIN_ID;
  const password = c.env.KM_OPERATOR_PASSWORD;
  if (!loginId || !password) {
    return c.json({ error: 'km-operatorの自動ログイン用アカウントが未設定です（KM_OPERATOR_LOGIN_ID / KM_OPERATOR_PASSWORD）' }, 500);
  }

  type ChunkBody = { date?: string; offset?: number; limit?: number; runId?: number | null };
  const body = await c.req.json<ChunkBody>().catch(() => ({}) as ChunkBody);
  const date = body.date && body.date.trim() ? body.date.trim() : kmNowParam();
  const offset = Number.isInteger(body.offset) ? Number(body.offset) : 0;
  const limit = Math.min(Number.isInteger(body.limit) ? Number(body.limit) : CHUNK_SIZE, CHUNK_SIZE);

  const radioNumbers = await getItabashiRadioNumbers(c.env.DB);
  const chunk = radioNumbers.slice(offset, offset + limit);

  let runId = body.runId ?? null;
  if (offset === 0 || !runId) {
    const name = await adminName(c);
    const ins = await c.env.DB.prepare(
      `INSERT INTO km_pin_collection_runs (target_date, vehicles_total, vehicles_done, trips_saved, vehicle_errors, triggered_by)
       VALUES (?, ?, 0, 0, 0, ?)`
    ).bind(date, radioNumbers.length, name).run();
    runId = ins.meta.last_row_id as number;
  }

  if (chunk.length === 0) {
    await c.env.DB.prepare('UPDATE km_pin_collection_runs SET vehicles_done = ? WHERE id = ?')
      .bind(radioNumbers.length, runId).run();
    return c.json({ done: true, runId, processed: radioNumbers.length, totalVehicles: radioNumbers.length, savedThisChunk: 0, errorsThisChunk: 0, nextOffset: offset });
  }

  const login = await kmOperatorLogin(loginId, password);
  if (!login.ok) {
    return c.json({ error: login.message }, 502);
  }

  const stmts: ReturnType<typeof c.env.DB.prepare>[] = [];
  let savedThisChunk = 0;
  let errorsThisChunk = 0;
  for (const radioNo of chunk) {
    const result = await kmOperatorSearchTripInfos(login.jar, radioNo, date);
    if (!result.ok) {
      if (!result.notFound) errorsThisChunk++;
      continue;
    }
    if (result.trips.length > 0) {
      stmts.push(...saveTripsStmts(c.env.DB, radioNo, result.driverName, result.trips));
      savedThisChunk += result.trips.length;
    }
  }
  if (stmts.length > 0) await c.env.DB.batch(stmts);

  const processed = offset + chunk.length;
  const done = processed >= radioNumbers.length;
  await c.env.DB.prepare(
    `UPDATE km_pin_collection_runs
     SET vehicles_done = ?, trips_saved = trips_saved + ?, vehicle_errors = vehicle_errors + ?
     WHERE id = ?`
  ).bind(processed, savedThisChunk, errorsThisChunk, runId).run();

  return c.json({
    done, runId, processed, totalVehicles: radioNumbers.length,
    savedThisChunk, errorsThisChunk, nextOffset: processed,
  });
});

export default app;
