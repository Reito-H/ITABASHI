// 定額タクシー エリア別運賃（便利ハブ「空港・ディズニー定額」）
// ページ : /benri/airport   目的地は画面上のボタンで切替（haneda / narita / tdr を一度に読み込む）
// API    : /api/benri/airport/*
// 閲覧: 管理画面アカウントなら誰でも可（index.ts の isBenri で /benri・/api/benri のページ権限チェックを免除）
// 編集: フル権限アカウント（admins.permissions IS NULL）のみ。各書き込みAPIで requireEdit により二重に防御する
import { Hono } from 'hono';
import { layout, escHtml, safeJson, saveToastHtml, saveToastScript } from '../html/layout';
import { ADMIN_PATH } from '../config';
import { getAdminPermissions } from '../permissions';
import {
  AIRPORT_MAP_AREAS, AIRPORT_MAP_VIEWBOX, AIRPORT_MAP_W, AIRPORT_MAP_H, AIRPORT_MAP_MARKERS,
} from '../html/airport_map_paths';
import type { Env } from '../auth';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

const DESTS = ['haneda', 'narita', 'tdr'] as const;
type Dest = typeof DESTS[number];
const DEST_LABEL: Record<Dest, string> = { haneda: '羽田空港', narita: '成田空港', tdr: 'ディズニーリゾート' };

type FareRow = {
  destination: string;
  area_key: string;
  area_label: string;
  sort_order: number;
  is_excluded: number;
  fare_day: number | null;
  fare_night: number | null;
  fare_day_disabled: number | null;
  fare_night_disabled: number | null;
};

async function canEdit(c: { env: Env; get: (k: 'adminId') => number }): Promise<boolean> {
  const perms = await getAdminPermissions(c.env.DB, c.get('adminId'));
  return perms === null;
}

function requireEdit(c: { json: (body: unknown, status: 403) => Response }, editable: boolean): Response | null {
  if (!editable) return c.json({ error: 'この操作はフル権限アカウントのみ行えます' }, 403);
  return null;
}

function subHeader(title: string): string {
  return `<div class="no-print" style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
    <a href="${ADMIN_PATH}/benri" style="color:#6b7280;font-size:13px;text-decoration:none;padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:white;">← 便利トップに戻る</a>
    <h2 style="font-size:17px;font-weight:700;color:#1e3a5f;">${escHtml(title)}</h2>
  </div>`;
}

// ===== ページ =====
app.get('/benri/airport', async (c) => {
  const editable = await canEdit(c);
  const [fareRes, noteRes] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM airport_flat_fares ORDER BY destination, is_excluded, sort_order, area_key').all<FareRow>(),
    c.env.DB.prepare('SELECT destination, body FROM airport_flat_notes ORDER BY sort_order, id').all<{ destination: string; body: string }>(),
  ]);
  const allFares = fareRes.results ?? [];
  const allNotes = noteRes.results ?? [];
  const data: Record<string, { fares: FareRow[]; notes: string[] }> = {};
  for (const d of DESTS) {
    data[d] = {
      fares: allFares.filter(f => f.destination === d),
      notes: allNotes.filter(n => n.destination === d).map(n => n.body),
    };
  }

  const destBtns = DESTS.map((d, i) => `<button id="dest-${d}" type="button" onclick="setDest('${d}')" style="padding:8px 18px;border:none;${i > 0 ? 'border-left:1px solid #cbd5e1;' : ''}background:${i === 0 ? '#1e3a5f' : '#fff'};color:${i === 0 ? '#fff' : '#374151'};font-size:13px;font-weight:${i === 0 ? '700' : '600'};cursor:pointer;">${DEST_LABEL[d]}</button>`).join('');

  const html = subHeader('空港・ディズニー定額') + `
    <p style="font-size:12px;color:#6b7280;margin-bottom:12px;max-width:660px;">
      目的地（羽田空港・成田空港・東京ディズニーリゾート）と、時間帯〔昼／深夜〕・障がい者割引を切り替えると、地図の色分けと金額が入れ替わります。灰色は定額対象外エリア（メーター運賃）です。
    </p>

    <div style="display:inline-flex;border:1px solid #cbd5e1;border-radius:9px;overflow:hidden;margin-bottom:14px;">
      ${destBtns}
    </div>

    <div style="display:flex;flex-wrap:wrap;gap:16px;align-items:center;margin-bottom:14px;">
      <div style="display:inline-flex;border:1px solid #d1d5db;border-radius:8px;overflow:hidden;">
        <button id="seg-day" type="button" onclick="setMode('day')" style="padding:8px 16px;border:none;background:#1d4ed8;color:#fff;font-size:13px;font-weight:700;cursor:pointer;">昼 5:00-22:00</button>
        <button id="seg-night" type="button" onclick="setMode('night')" style="padding:8px 16px;border:none;border-left:1px solid #d1d5db;background:#fff;color:#374151;font-size:13px;font-weight:600;cursor:pointer;">深夜 22:00-翌5:00</button>
      </div>
      <label style="display:inline-flex;align-items:center;gap:7px;font-size:13px;color:#374151;cursor:pointer;">
        <input type="checkbox" id="chk-disabled" onchange="setDisabled(this.checked)" style="width:16px;height:16px;"> 障がい者割引運賃で表示
      </label>
    </div>

    <div style="display:flex;gap:8px;margin-bottom:0;">
      <button id="tab-map" onclick="showTab('map')" style="padding:8px 20px;border-radius:8px 8px 0 0;border:1px solid #d1d5db;border-bottom:none;background:white;font-size:13px;font-weight:700;cursor:pointer;color:#1d4ed8;">地図</button>
      <button id="tab-list" onclick="showTab('list')" style="padding:8px 20px;border-radius:8px 8px 0 0;border:1px solid #d1d5db;border-bottom:none;background:#f3f4f6;font-size:13px;font-weight:600;cursor:pointer;color:#6b7280;">一覧表</button>
      ${editable ? `<button id="tab-edit" onclick="showTab('edit')" style="padding:8px 20px;border-radius:8px 8px 0 0;border:1px solid #d1d5db;border-bottom:none;background:#f3f4f6;font-size:13px;font-weight:600;cursor:pointer;color:#6b7280;">編集</button>` : ''}
    </div>

    <div id="pane-map" style="border:1px solid #d1d5db;border-radius:0 8px 8px 8px;background:white;padding:12px;">
      <div id="map-legend" style="display:flex;flex-wrap:wrap;gap:10px 16px;font-size:11px;color:#4b5563;margin-bottom:8px;"></div>
      <div style="overflow-x:auto;">
        <div id="map-wrap" style="min-width:560px;max-width:820px;margin:0 auto;"></div>
      </div>
      <div id="map-detail" style="display:none;margin-top:10px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;"></div>
    </div>

    <div id="pane-list" style="display:none;border:1px solid #d1d5db;border-radius:0 8px 8px 8px;background:white;padding:12px;">
      <input type="text" id="list-search" oninput="renderList()" placeholder="🔍 区・市名で検索" style="width:100%;max-width:320px;border:1px solid #d1d5db;border-radius:8px;padding:8px 11px;font-size:13px;box-sizing:border-box;margin-bottom:10px;">
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;min-width:560px;font-size:13px;">
          <thead>
            <tr style="background:#f9fafb;color:#6b7280;font-size:11px;">
              <th style="padding:7px 10px;text-align:left;">エリア</th>
              <th id="th-day" style="padding:7px 10px;text-align:right;">昼</th>
              <th id="th-night" style="padding:7px 10px;text-align:right;">深夜</th>
              <th id="th-dday" style="padding:7px 10px;text-align:right;">障・昼</th>
              <th id="th-dnight" style="padding:7px 10px;text-align:right;">障・深夜</th>
            </tr>
          </thead>
          <tbody id="list-tbody"></tbody>
        </table>
      </div>
    </div>

    ${editable ? `
    <div id="pane-edit" style="display:none;border:1px solid #d1d5db;border-radius:0 8px 8px 8px;background:white;padding:12px;">
      <p style="font-size:12px;color:#6b7280;margin-bottom:10px;">「<span id="edit-dest-label">羽田空港</span>」の運賃を編集します。金額は円で入力（空欄可）。「対象外」にチェックするとメーター運賃扱いになり地図はグレー表示になります。</p>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;min-width:640px;font-size:13px;">
          <thead>
            <tr style="background:#f9fafb;color:#6b7280;font-size:11px;">
              <th style="padding:7px 8px;text-align:left;">エリア</th>
              <th style="padding:7px 8px;text-align:center;">対象外</th>
              <th style="padding:7px 8px;text-align:right;">昼</th>
              <th style="padding:7px 8px;text-align:right;">深夜</th>
              <th style="padding:7px 8px;text-align:right;">障・昼</th>
              <th style="padding:7px 8px;text-align:right;">障・深夜</th>
            </tr>
          </thead>
          <tbody id="edit-tbody"></tbody>
        </table>
      </div>
      <button onclick="saveFares()" id="fares-save-btn" style="margin-top:12px;padding:8px 22px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">運賃を保存</button>

      <div style="margin-top:20px;">
        <div style="font-size:12px;font-weight:700;color:#6b7280;margin-bottom:6px;">注記（1行に1件）</div>
        <textarea id="notes-edit" style="width:100%;min-height:120px;border:1px solid #d1d5db;border-radius:6px;padding:10px;font-size:12px;line-height:1.7;font-family:inherit;box-sizing:border-box;"></textarea>
        <button onclick="saveNotes()" id="notes-save-btn" style="margin-top:8px;padding:7px 18px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">注記を保存</button>
      </div>
    </div>` : ''}

    <div id="notes-box" style="margin-top:14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:12px 16px;font-size:11px;color:#6b7280;line-height:1.8;"></div>

    ${saveToastHtml()}
    <script>
    ${saveToastScript()}
    var EDITABLE = ${editable ? 'true' : 'false'};
    var API = '${ADMIN_PATH}/api/benri/airport';
    var DATA = ${safeJson(data)};
    var DEST_LABEL = ${safeJson(DEST_LABEL)};
    var MAP_AREAS = ${safeJson(AIRPORT_MAP_AREAS)};
    var MARKERS = ${safeJson(AIRPORT_MAP_MARKERS)};
    var VIEWBOX = ${safeJson(AIRPORT_MAP_VIEWBOX)};
    var MAP_W = ${AIRPORT_MAP_W};
    var MAP_H = ${AIRPORT_MAP_H};

    // 安い→高い の6段階（RdYlGn 反転）
    var SCALE = ['#1a9850', '#66bd63', '#a6d96a', '#fee08b', '#fc8d59', '#d73027'];
    var GREY = '#d1d5db';

    var dest = 'haneda';    // 'haneda' | 'narita' | 'tdr'
    var mode = 'day';       // 'day' | 'night'
    var useDisabled = false;
    var FARES = [];
    var NOTES = [];
    var fareByKey = {};

    function applyDest() {
      var d = DATA[dest] || { fares: [], notes: [] };
      FARES = d.fares;
      NOTES = d.notes;
      fareByKey = {};
      FARES.forEach(function (f) { fareByKey[f.area_key] = f; });
    }

    function colKey() {
      if (mode === 'night') return useDisabled ? 'fare_night_disabled' : 'fare_night';
      return useDisabled ? 'fare_day_disabled' : 'fare_day';
    }
    function valueOf(f) {
      if (!f || f.is_excluded) return null;
      var v = f[colKey()];
      return (v === null || v === undefined || v === '') ? null : Number(v);
    }
    function yen(n) {
      if (n === null || n === undefined || n === '') return '—';
      return '¥' + Number(n).toLocaleString('ja-JP');
    }
    function esc(s) {
      return (s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // 現在列の値からバケットを作る。
    //  - 異なる金額が6種類以下 → その金額ごとに1色（離散表示。定額運賃はほぼこれ）
    //  - 7種類以上 → 分位で6段階に刻む（重複する区切りは除く）
    // 色は「バケット数」に合わせて SCALE 全体（緑→赤）へ均等割り当てする。
    function buildBuckets() {
      var vals = [];
      FARES.forEach(function (f) { var v = valueOf(f); if (v !== null) vals.push(v); });
      vals.sort(function (a, b) { return a - b; });
      if (!vals.length) return { th: [], levels: [], min: 0, max: 0 };
      var uniq = [];
      vals.forEach(function (x) { if (uniq[uniq.length - 1] !== x) uniq.push(x); });
      var min = uniq[0], max = uniq[uniq.length - 1];
      var th;
      if (uniq.length <= 6) {
        th = uniq.slice(1); // 各金額の境目。バケット数 = uniq.length
      } else {
        var raw = [];
        for (var i = 1; i < 6; i++) raw.push(vals[Math.floor(i / 6 * vals.length)]);
        th = [];
        raw.forEach(function (x) { if (x > min && x < max && th.indexOf(x) < 0) th.push(x); });
        th.sort(function (a, b) { return a - b; });
      }
      return { th: th, levels: uniq, discrete: uniq.length <= 6, min: min, max: max };
    }
    function bucketCount(bk) { return bk.th.length + 1; }
    function bucketColorIdx(v, bk) {
      var i = 0;
      while (i < bk.th.length && v >= bk.th[i]) i++;
      return i; // 0..th.length
    }
    function scaleColor(idx, count) {
      if (count <= 1) return SCALE[Math.floor(SCALE.length / 2)];
      return SCALE[Math.round(idx / (count - 1) * (SCALE.length - 1))];
    }
    function bucketColor(v, bk) {
      if (v === null) return GREY;
      return scaleColor(bucketColorIdx(v, bk), bucketCount(bk));
    }

    function renderLegend(bk) {
      var el = document.getElementById('map-legend');
      var n = bucketCount(bk);
      if (!bk.levels.length) { el.innerHTML = ''; return; }
      var parts = [];
      for (var i = 0; i < n; i++) {
        var label;
        if (bk.discrete) {
          label = yen(bk.levels[i]);
        } else if (n === 1) {
          label = yen(bk.min);
        } else if (i === 0) {
          label = '〜' + yen(bk.th[0]);
        } else if (i === n - 1) {
          label = yen(bk.th[i - 1]) + '〜';
        } else {
          label = yen(bk.th[i - 1]) + '〜' + yen(bk.th[i]);
        }
        parts.push('<span style="display:inline-flex;align-items:center;gap:5px;"><span style="width:14px;height:14px;border-radius:3px;background:' + scaleColor(i, n) + ';display:inline-block;"></span>' + label + '</span>');
      }
      parts.push('<span style="display:inline-flex;align-items:center;gap:5px;"><span style="width:14px;height:14px;border-radius:3px;background:' + GREY + ';display:inline-block;border:1px solid #cbd5e1;"></span>対象外（メーター運賃）</span>');
      el.innerHTML = parts.join('');
    }

    var SMALL_KEYS = { '13101': 1, '13102': 1, '13106': 1, '13116': 1, '13118': 1, '13110': 1, '13113': 1 };

    function renderMap() {
      var bk = buildBuckets();
      renderLegend(bk);
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + VIEWBOX + '" style="width:100%;height:auto;display:block;font-family:inherit;">';
      MAP_AREAS.forEach(function (a) {
        var f = fareByKey[a.key];
        var v = valueOf(f);
        var fill = f && f.is_excluded ? GREY : bucketColor(v, bk);
        svg += '<path d="' + a.d + '" fill="' + fill + '" stroke="#1f2937" stroke-width="1.1" stroke-linejoin="round" style="cursor:pointer;" onclick="showDetail(\\'' + a.key + '\\')"><title>' + esc(a.label) + '</title></path>';
      });
      MAP_AREAS.forEach(function (a) {
        var f = fareByKey[a.key];
        var v = valueOf(f);
        var fs = SMALL_KEYS[a.key] ? 12 : 14;
        var amt = f && f.is_excluded ? '対象外' : (v === null ? '—' : yen(v));
        svg += '<text x="' + a.lx + '" y="' + a.ly + '" text-anchor="middle" style="pointer-events:none;">' +
          '<tspan x="' + a.lx + '" dy="-0.2em" font-size="' + fs + '" font-weight="600" fill="#111827">' + esc(a.label) + '</tspan>' +
          '<tspan x="' + a.lx + '" dy="1.15em" font-size="' + (fs - 1) + '" font-weight="700" fill="#0f172a">' + esc(amt) + '</tspan>' +
          '</text>';
      });
      var mk = MARKERS[dest];
      if (mk) {
        var icon = (dest === 'tdr') ? '★' : '✈';
        svg += '<circle cx="' + mk.x + '" cy="' + mk.y + '" r="14" fill="#3730a3"/>' +
          '<text x="' + mk.x + '" y="' + (mk.y + 5) + '" text-anchor="middle" font-size="15" fill="#fff">' + icon + '</text>';
        if (mk.edge) {
          svg += '<text x="' + (mk.x - 20) + '" y="' + (mk.y + 4) + '" text-anchor="end" font-size="13" font-weight="700" fill="#3730a3">' + esc(mk.label) + ' ▶</text>';
        } else {
          svg += '<text x="' + mk.x + '" y="' + (mk.y + 30) + '" text-anchor="middle" font-size="12" font-weight="700" fill="#3730a3">' + esc(mk.label) + '</text>';
        }
      }
      svg += '</svg>';
      document.getElementById('map-wrap').innerHTML = svg;
    }

    function showDetail(key) {
      var f = fareByKey[key];
      var el = document.getElementById('map-detail');
      if (!f) { el.style.display = 'none'; return; }
      var rows;
      if (f.is_excluded) {
        rows = '<div style="font-size:13px;color:#4b5563;">「' + esc(DEST_LABEL[dest]) + '」定額の対象外エリアです。メーター運賃でのご乗車となります。</div>';
      } else {
        rows = '<table style="border-collapse:collapse;font-size:13px;">' +
          '<tr><td style="padding:3px 14px 3px 0;color:#6b7280;">昼 (5:00-22:00)</td><td style="padding:3px 0;text-align:right;font-weight:700;">' + yen(f.fare_day) + '</td>' +
          '<td style="padding:3px 0 3px 18px;color:#6b7280;">障がい者割引</td><td style="padding:3px 0 3px 10px;text-align:right;">' + yen(f.fare_day_disabled) + '</td></tr>' +
          '<tr><td style="padding:3px 14px 3px 0;color:#6b7280;">深夜 (22:00-翌5:00)</td><td style="padding:3px 0;text-align:right;font-weight:700;">' + yen(f.fare_night) + '</td>' +
          '<td style="padding:3px 0 3px 18px;color:#6b7280;">障がい者割引</td><td style="padding:3px 0 3px 10px;text-align:right;">' + yen(f.fare_night_disabled) + '</td></tr>' +
          '</table>';
      }
      el.innerHTML = '<div style="font-size:14px;font-weight:700;color:#1e3a5f;margin-bottom:6px;">' + esc(f.area_label) + '　' + esc(DEST_LABEL[dest]) + 'まで</div>' + rows;
      el.style.display = 'block';
    }

    function renderList() {
      var q = (document.getElementById('list-search').value || '').trim();
      var ck = colKey();
      ['day', 'night', 'dday', 'dnight'].forEach(function (id) {
        var th = document.getElementById('th-' + id);
        th.style.color = '#6b7280'; th.style.background = 'transparent';
      });
      var activeTh = mode === 'night' ? (useDisabled ? 'th-dnight' : 'th-night') : (useDisabled ? 'th-dday' : 'th-day');
      var ath = document.getElementById(activeTh);
      ath.style.color = '#1d4ed8'; ath.style.background = '#eff6ff';

      var tb = document.getElementById('list-tbody');
      var rows = FARES.filter(function (f) { return !q || f.area_label.indexOf(q) >= 0; });
      tb.innerHTML = rows.map(function (f) {
        var cell = function (v, key) {
          var strong = (key === ck);
          return '<td style="padding:6px 10px;text-align:right;font-variant-numeric:tabular-nums;' + (strong ? 'font-weight:700;color:#1d4ed8;background:#eff6ff;' : '') + '">' + (f.is_excluded ? '—' : yen(v)) + '</td>';
        };
        var badge = f.is_excluded ? ' <span style="font-size:10px;color:#6b7280;border:1px solid #d1d5db;border-radius:4px;padding:1px 4px;">対象外</span>' : '';
        return '<tr style="border-top:1px solid #f1f5f9;">' +
          '<td style="padding:6px 10px;">' + esc(f.area_label) + badge + '</td>' +
          cell(f.fare_day, 'fare_day') + cell(f.fare_night, 'fare_night') +
          cell(f.fare_day_disabled, 'fare_day_disabled') + cell(f.fare_night_disabled, 'fare_night_disabled') +
          '</tr>';
      }).join('');
    }

    function renderNotes() {
      var box = document.getElementById('notes-box');
      if (!NOTES.length) { box.style.display = 'none'; return; }
      box.style.display = 'block';
      box.innerHTML = NOTES.map(function (n) { return '・' + esc(n); }).join('<br>');
    }

    function setMode(m) {
      mode = m;
      document.getElementById('seg-day').style.background = m === 'day' ? '#1d4ed8' : '#fff';
      document.getElementById('seg-day').style.color = m === 'day' ? '#fff' : '#374151';
      document.getElementById('seg-night').style.background = m === 'night' ? '#1d4ed8' : '#fff';
      document.getElementById('seg-night').style.color = m === 'night' ? '#fff' : '#374151';
      renderMap(); renderList();
    }
    function setDisabled(v) { useDisabled = v; renderMap(); renderList(); }

    function setDest(d) {
      if (!DATA[d]) return;
      dest = d;
      ['haneda', 'narita', 'tdr'].forEach(function (k) {
        var b = document.getElementById('dest-' + k);
        if (!b) return;
        var on = (k === d);
        b.style.background = on ? '#1e3a5f' : '#fff';
        b.style.color = on ? '#fff' : '#374151';
        b.style.fontWeight = on ? '700' : '600';
      });
      var lbl = document.getElementById('edit-dest-label');
      if (lbl) lbl.textContent = DEST_LABEL[d];
      applyDest();
      document.getElementById('map-detail').style.display = 'none';
      renderMap(); renderList(); renderNotes();
      if (EDITABLE) renderEdit();
    }

    function showTab(name) {
      ['map', 'list', 'edit'].forEach(function (n) {
        var pane = document.getElementById('pane-' + n);
        var tab = document.getElementById('tab-' + n);
        if (!pane || !tab) return;
        var on = (n === name);
        pane.style.display = on ? 'block' : 'none';
        tab.style.background = on ? 'white' : '#f3f4f6';
        tab.style.color = on ? '#1d4ed8' : '#6b7280';
        tab.style.fontWeight = on ? '700' : '600';
      });
    }

    // ---- 編集 ----
    function renderEdit() {
      if (!EDITABLE) return;
      var tb = document.getElementById('edit-tbody');
      tb.innerHTML = FARES.map(function (f, i) {
        var inp = function (col) {
          return '<td style="padding:4px 8px;text-align:right;"><input type="number" min="0" step="100" data-i="' + i + '" data-col="' + col + '" value="' + (f[col] == null ? '' : f[col]) + '" style="width:88px;border:1px solid #d1d5db;border-radius:5px;padding:4px 6px;font-size:13px;text-align:right;"></td>';
        };
        return '<tr style="border-top:1px solid #f1f5f9;">' +
          '<td style="padding:4px 8px;">' + esc(f.area_label) + '</td>' +
          '<td style="padding:4px 8px;text-align:center;"><input type="checkbox" data-i="' + i + '" data-col="is_excluded" ' + (f.is_excluded ? 'checked' : '') + ' style="width:16px;height:16px;"></td>' +
          inp('fare_day') + inp('fare_night') + inp('fare_day_disabled') + inp('fare_night_disabled') +
          '</tr>';
      }).join('');
      document.getElementById('notes-edit').value = NOTES.join('\\n');
    }

    function saveFares() {
      var btn = document.getElementById('fares-save-btn');
      document.querySelectorAll('#edit-tbody input').forEach(function (el) {
        var i = Number(el.getAttribute('data-i'));
        var col = el.getAttribute('data-col');
        if (col === 'is_excluded') { FARES[i].is_excluded = el.checked ? 1 : 0; return; }
        var raw = el.value.trim();
        FARES[i][col] = raw === '' ? null : Number(raw);
      });
      btn.disabled = true;
      fetch(API + '/fares', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination: dest, rows: FARES.map(function (f) {
          return {
            area_key: f.area_key, is_excluded: f.is_excluded ? 1 : 0,
            fare_day: f.fare_day, fare_night: f.fare_night,
            fare_day_disabled: f.fare_day_disabled, fare_night_disabled: f.fare_night_disabled,
          };
        }) }),
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          btn.disabled = false;
          if (!res.ok) { alert(res.j && res.j.error ? res.j.error : '保存に失敗しました'); return; }
          applyDest();
          showToast('運賃を保存しました');
          renderMap(); renderList();
        }).catch(function () { btn.disabled = false; alert('通信エラー'); });
    }

    function saveNotes() {
      var btn = document.getElementById('notes-save-btn');
      var lines = document.getElementById('notes-edit').value.split('\\n').map(function (s) { return s.trim(); }).filter(function (s) { return s; });
      btn.disabled = true;
      fetch(API + '/notes', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination: dest, notes: lines }),
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          btn.disabled = false;
          if (!res.ok) { alert(res.j && res.j.error ? res.j.error : '保存に失敗しました'); return; }
          DATA[dest].notes = lines; applyDest(); renderNotes(); showToast('注記を保存しました');
        }).catch(function () { btn.disabled = false; alert('通信エラー'); });
    }

    // 初期描画
    applyDest();
    renderMap();
    renderList();
    renderNotes();
    if (EDITABLE) renderEdit();
    </script>`;

  return c.html(layout('空港・ディズニー定額', html, 'benri'));
});

// ===== API =====
app.put('/api/benri/airport/fares', async (c) => {
  const denied = requireEdit(c, await canEdit(c)); if (denied) return denied;
  type FareInput = { area_key?: unknown; is_excluded?: unknown; fare_day?: unknown; fare_night?: unknown; fare_day_disabled?: unknown; fare_night_disabled?: unknown };
  const body = await c.req.json<{ destination?: unknown; rows?: FareInput[] }>().catch(() => ({} as { destination?: unknown; rows?: FareInput[] }));
  const destination = String(body.destination ?? '');
  if (!DESTS.includes(destination as Dest)) return c.json({ error: '不正な目的地です' }, 400);
  const rows: FareInput[] = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length) return c.json({ error: '不正なリクエストです' }, 400);

  const opName = (await c.env.DB.prepare('SELECT username FROM admins WHERE id = ?').bind(c.get('adminId')).first<{ username: string }>())?.username ?? '';
  const numOrNull = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  const stmts = rows
    .filter(r => typeof r.area_key === 'string')
    .map(r => c.env.DB.prepare(
      `UPDATE airport_flat_fares
         SET is_excluded = ?, fare_day = ?, fare_night = ?, fare_day_disabled = ?, fare_night_disabled = ?,
             updated_at = datetime('now','localtime'), updated_by = ?
       WHERE destination = ? AND area_key = ?`
    ).bind(
      r.is_excluded ? 1 : 0,
      numOrNull(r.fare_day), numOrNull(r.fare_night), numOrNull(r.fare_day_disabled), numOrNull(r.fare_night_disabled),
      opName, destination, r.area_key as string,
    ));
  if (stmts.length) await c.env.DB.batch(stmts);
  return c.json({ ok: true });
});

app.put('/api/benri/airport/notes', async (c) => {
  const denied = requireEdit(c, await canEdit(c)); if (denied) return denied;
  const body = await c.req.json<{ destination?: unknown; notes?: unknown }>().catch(() => ({} as { destination?: unknown; notes?: unknown }));
  const destination = String(body.destination ?? '');
  if (!DESTS.includes(destination as Dest)) return c.json({ error: '不正な目的地です' }, 400);
  const notes: string[] = Array.isArray(body.notes)
    ? body.notes.map((n: unknown) => String(n ?? '').trim()).filter(Boolean).slice(0, 30)
    : [];
  const stmts = [c.env.DB.prepare('DELETE FROM airport_flat_notes WHERE destination = ?').bind(destination)];
  notes.forEach((n: string, i: number) => stmts.push(
    c.env.DB.prepare('INSERT INTO airport_flat_notes (destination, body, sort_order) VALUES (?, ?, ?)').bind(destination, n.slice(0, 300), i + 1)
  ));
  await c.env.DB.batch(stmts);
  return c.json({ ok: true });
});

export default app;
