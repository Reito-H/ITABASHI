// シャトルバス（左サイドバー「シャトルバス」）
//   営業所 ⇄ 北赤羽駅 / 東武練馬駅 を1台のバスが連続で往復する時刻表と、
//   「時刻表どおりの推定現在位置」を模式図で表示する。
//   位置はクライアント側の時計(JST固定)で毎秒計算。サーバーポーリングなし。
import { escHtml, safeJson, saveToastHtml, saveToastScript } from './layout';
import { ADMIN_PATH } from '../config';

export type ShuttleTrip = {
  id: number;
  destination: string;
  depart_office: string;
  depart_dest: string;
  arrive_office: string;
};

const DESTINATIONS = ['北赤羽駅', '東武練馬駅'];

export function shuttlePage(trips: ShuttleTrip[], editable: boolean): string {
  const API = `${ADMIN_PATH}/api/shuttle`;

  const editModal = editable ? `
    <div id="sb-modal" class="sb-modal" style="display:none;">
      <div class="sb-modal-box">
        <h3 id="sb-modal-title" style="font-size:16px;font-weight:700;color:var(--color-primary);margin:0 0 16px;"></h3>
        <div style="display:flex;flex-direction:column;gap:12px;">
          <label class="sb-field">行先
            <select id="sb-f-dest">${DESTINATIONS.map(d => `<option value="${escHtml(d)}">${escHtml(d)}</option>`).join('')}</select>
          </label>
          <label class="sb-field">営業所 発<input type="time" id="sb-f-depoff"></label>
          <label class="sb-field">折返（目的地）発<input type="time" id="sb-f-depdest"></label>
          <label class="sb-field">営業所 着<input type="time" id="sb-f-arroff"></label>
          <p style="font-size:11px;color:var(--color-text-muted);margin:2px 0 0;line-height:1.6;">
            ※元の時刻表に「目的地への到着時刻」が無いため、折返発の時刻に目的地へ到着したものとして位置を推定します。
          </p>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px;">
          <button type="button" onclick="sbCloseModal()" class="sb-btn sb-btn-plain">キャンセル</button>
          <button type="button" id="sb-save-btn" onclick="sbSave()" class="sb-btn sb-btn-primary">保存</button>
        </div>
      </div>
    </div>` : '';

  return `
  <style>
    .sb-wrap { max-width: 880px; }
    .sb-card { background:#fff; border:1px solid var(--color-border); border-radius:12px; box-shadow:0 1px 4px rgba(0,0,0,0.06); }
    .sb-map { padding:8px 10px 4px; margin-bottom:14px; overflow-x:auto; }
    .sb-map svg { width:100%; min-width:520px; height:auto; display:block; }
    .sb-status { padding:16px 18px; margin-bottom:16px; display:flex; align-items:center; gap:14px; }
    .sb-status .dot { width:12px; height:12px; border-radius:50%; flex-shrink:0; background:var(--color-text-muted); }
    .sb-status.run .dot { background:#16a34a; box-shadow:0 0 0 4px rgba(22,163,74,0.15); }
    .sb-status.idle .dot { background:#d97706; }
    .sb-status.off .dot { background:#9ca3af; }
    .sb-status-main { font-size:16px; font-weight:700; color:var(--color-text); }
    .sb-status-sub { font-size:12.5px; color:var(--color-text-muted); margin-top:3px; }
    .sb-clock { margin-left:auto; font-size:12px; color:#9ca3af; font-variant-numeric:tabular-nums; white-space:nowrap; align-self:flex-start; }
    .sb-sec-title { font-size:13px; font-weight:700; color:var(--color-primary); margin:0 0 8px; }
    .sb-next { margin-bottom:20px; }
    .sb-next-list { display:flex; flex-direction:column; gap:8px; }
    .sb-next-row { display:flex; align-items:center; gap:12px; background:#fff; border:1px solid var(--color-border); border-radius:10px; padding:11px 14px; }
    .sb-next-row .t { font-size:17px; font-weight:700; color:var(--color-text); font-variant-numeric:tabular-nums; }
    .sb-next-row .d { font-size:13px; color:var(--color-text); }
    .sb-next-row .c { margin-left:auto; font-size:12px; font-weight:700; color:#1d4ed8; background:#eff6ff; border-radius:999px; padding:3px 10px; white-space:nowrap; }
    .sb-next-empty { font-size:12px; color:#9ca3af; padding:10px 2px; }
    .sb-table-card { overflow-x:auto; }
    table.sb-tt { width:100%; border-collapse:collapse; min-width:460px; }
    table.sb-tt th { background:#f9fafb; color:var(--color-text-muted); font-size:11px; font-weight:700; padding:8px 10px; text-align:left; border-bottom:1px solid var(--color-border); }
    table.sb-tt td { font-size:13px; padding:9px 10px; border-bottom:1px solid #f3f4f6; font-variant-numeric:tabular-nums; }
    table.sb-tt tr.toei td { background:#fef9c3; }
    table.sb-tt tr.cur td { background:#dcfce7 !important; }
    table.sb-tt tr.cur td:first-child { box-shadow:inset 3px 0 0 #16a34a; }
    table.sb-tt tr.nxt td { background:#eff6ff; }
    table.sb-tt tr.nxt.toei td { background:#eef4d9; }
    .sb-dest-pill { display:inline-block; font-size:11px; font-weight:700; border-radius:999px; padding:2px 9px; }
    .sb-dest-pill.k { background:#e0e7ff; color:#3730a3; }
    .sb-dest-pill.t { background:#fde68a; color:#92400e; }
    .sb-btn { border:none; border-radius:6px; font-size:13px; font-weight:600; cursor:pointer; padding:8px 18px; }
    .sb-btn-primary { background:#2563eb; color:#fff; }
    .sb-btn-plain { background:#f3f4f6; color:var(--color-text); border:1px solid var(--color-border); }
    .sb-btn-sm { padding:3px 10px; font-size:11px; border-radius:5px; }
    .sb-btn-edit { background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; }
    .sb-btn-del { background:#fee2e2; color:#991b1b; }
    .sb-add { margin-bottom:12px; background:#059669; color:#fff; }
    .sb-modal { position:fixed; inset:0; background:rgba(0,0,0,0.4); z-index:60; display:flex; align-items:flex-start; justify-content:center; padding:32px 16px; overflow-y:auto; }
    .sb-modal-box { background:#fff; border-radius:12px; max-width:420px; width:100%; padding:24px; }
    .sb-field { font-size:12px; color:var(--color-text); display:flex; flex-direction:column; gap:4px; }
    .sb-field input, .sb-field select { border:1px solid #d1d5db; border-radius:6px; padding:8px 9px; font-size:14px; font-family:inherit; }
    #sb-bus { transition: transform 0.9s linear; }
  </style>

  <div class="sb-wrap">
    <div class="sb-card sb-map">
      <svg viewBox="0 0 800 170" role="img" aria-label="シャトルバス路線図">
        <line x1="90" y1="112" x2="710" y2="112" stroke="#cbd5e1" stroke-width="6" stroke-linecap="round"/>
        <!-- 北赤羽駅 -->
        <circle cx="90" cy="112" r="9" fill="#fff" stroke="#6366f1" stroke-width="4"/>
        <text x="90" y="140" text-anchor="middle" font-size="14" font-weight="700" fill="#374151">北赤羽駅</text>
        <!-- 営業所 -->
        <circle cx="400" cy="112" r="12" fill="#1a3a5c"/>
        <text x="400" y="142" text-anchor="middle" font-size="14" font-weight="700" fill="#1a3a5c">営業所</text>
        <!-- 東武練馬駅 -->
        <circle cx="710" cy="112" r="9" fill="#fff" stroke="#d97706" stroke-width="4"/>
        <text x="710" y="140" text-anchor="middle" font-size="14" font-weight="700" fill="#374151">東武練馬駅</text>
        <!-- バス -->
        <g id="sb-bus" transform="translate(400,0)">
          <g transform="translate(-24,58)">
            <rect x="0" y="0" width="48" height="26" rx="6" fill="#2563eb"/>
            <rect x="6" y="5" width="10" height="8" rx="1.5" fill="#bfdbfe"/>
            <rect x="19" y="5" width="10" height="8" rx="1.5" fill="#bfdbfe"/>
            <rect x="32" y="5" width="9" height="8" rx="1.5" fill="#bfdbfe"/>
            <circle cx="12" cy="27" r="4" fill="#1e293b"/>
            <circle cx="36" cy="27" r="4" fill="#1e293b"/>
            <polygon id="sb-bus-arrow" points="24,-9 17,-1 31,-1" fill="#2563eb"/>
          </g>
        </g>
      </svg>
    </div>

    <div id="sb-status" class="sb-card sb-status off">
      <span class="dot"></span>
      <div>
        <div class="sb-status-main" id="sb-status-main">読み込み中…</div>
        <div class="sb-status-sub" id="sb-status-sub"></div>
      </div>
      <div class="sb-clock" id="sb-clock"></div>
    </div>

    <div class="sb-next">
      <h3 class="sb-sec-title">次の便</h3>
      <div class="sb-next-list" id="sb-next-list"></div>
    </div>

    <h3 class="sb-sec-title">時刻表（全便）</h3>
    ${editable ? `<button type="button" class="sb-btn sb-add" onclick="sbOpenModal(0)">＋ 便を追加</button>` : ''}
    <div class="sb-card sb-table-card">
      <table class="sb-tt">
        <thead>
          <tr>
            <th>営業所 発</th><th>行先</th><th>折返 発</th><th>営業所 着</th>${editable ? '<th>操作</th>' : ''}
          </tr>
        </thead>
        <tbody id="sb-tt-body"></tbody>
      </table>
    </div>
    <p style="font-size:11px;color:var(--color-text-muted);margin:10px 2px 0;line-height:1.7;">
      黄色の行は東武練馬駅便です。現在位置は時刻表から計算した推定値で、実際の運行状況（遅延・運休）は反映されません。
    </p>
  </div>

  ${editModal}
  ${saveToastHtml()}

  <script>
  ${saveToastScript()}
  (function () {
    var TRIPS = ${safeJson(trips)};
    var EDITABLE = ${editable ? 'true' : 'false'};
    var API = ${JSON.stringify(API)};
    var GAP_MIN = 30; // 便間がこれ以上空いたら「運休（待機）」扱い

    function esc(s) {
      return (s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    function toMin(hhmm) {
      var m = /^(\\d{1,2}):(\\d{2})$/.exec(String(hhmm || '').trim());
      if (!m) return null;
      return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    }
    function fmtDur(mins) {
      var n = Math.max(0, Math.round(mins));
      if (n < 60) return n + '分';
      return Math.floor(n / 60) + '時間' + (n % 60) + '分';
    }
    function jstNowMin() {
      var f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      var p = {};
      f.formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
      var h = parseInt(p.hour, 10) % 24;
      return h * 60 + parseInt(p.minute, 10) + parseInt(p.second, 10) / 60;
    }
    function jstClock() {
      var f = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      return f.format(new Date());
    }

    // 有効な便だけを営業所発の順に整列
    var LEGS = TRIPS.map(function (t) {
      return {
        id: t.id,
        dest: t.destination,
        outStart: toMin(t.depart_office),
        outEnd: toMin(t.depart_dest),
        retStart: toMin(t.depart_dest),
        retEnd: toMin(t.arrive_office),
        raw: t
      };
    }).filter(function (l) {
      return l.outStart != null && l.outEnd != null && l.retEnd != null && l.outStart <= l.outEnd && l.outEnd <= l.retEnd;
    }).sort(function (a, b) { return a.outStart - b.outStart; });

    var NODE = { k: 90, office: 400, t: 710 }; // 模式図のX座標

    // frac: 0=北赤羽駅, 0.5=営業所, 1=東武練馬駅
    function xFromFrac(frac) { return NODE.k + frac * (NODE.t - NODE.k); }

    function computeState(now) {
      if (!LEGS.length) return { kind: 'off', frac: 0.5, main: '時刻表が登録されていません', sub: '' };
      var first = LEGS[0], last = LEGS[LEGS.length - 1];

      if (now < first.outStart) {
        return {
          kind: 'off', frac: 0.5,
          main: '本日の運行前',
          sub: '始発 ' + first.raw.depart_office + ' 発 ' + first.dest + '行き（あと' + fmtDur(first.outStart - now) + '）'
        };
      }
      if (now >= last.retEnd) {
        return {
          kind: 'off', frac: 0.5,
          main: '本日の運行は終了しました',
          sub: '始発は ' + first.raw.depart_office + '（' + first.dest + '行き）'
        };
      }

      // 運行中の便を探す
      for (var i = 0; i < LEGS.length; i++) {
        var l = LEGS[i];
        if (now >= l.outStart && now < l.retEnd) {
          var toRight = (l.dest === '東武練馬駅');
          if (now < l.outEnd) {
            var p = l.outEnd > l.outStart ? (now - l.outStart) / (l.outEnd - l.outStart) : 1;
            var frac = toRight ? (0.5 + 0.5 * p) : (0.5 - 0.5 * p);
            return {
              kind: 'run', frac: frac, dir: toRight ? 1 : -1,
              main: '営業所 → ' + l.dest + ' へ向かっています',
              sub: l.dest + ' 到着まで あと約 ' + fmtDur(l.outEnd - now)
            };
          } else {
            var p2 = l.retEnd > l.retStart ? (now - l.retStart) / (l.retEnd - l.retStart) : 1;
            var frac2 = toRight ? (1 - 0.5 * p2) : (0.5 * p2);
            return {
              kind: 'run', frac: frac2, dir: toRight ? -1 : 1,
              main: l.dest + ' → 営業所 へ戻っています',
              sub: '営業所 到着まで あと約 ' + fmtDur(l.retEnd - now)
            };
          }
        }
        // この便の後・次の便の前（営業所で待機）
        var nextLeg = LEGS[i + 1];
        if (nextLeg && now >= l.retEnd && now < nextLeg.outStart) {
          var wait = nextLeg.outStart - now;
          var gap = nextLeg.outStart - l.retEnd;
          if (gap >= GAP_MIN) {
            return {
              kind: 'off', frac: 0.5,
              main: '運休中（営業所で待機）',
              sub: '次の運行は ' + nextLeg.raw.depart_office + ' から（' + nextLeg.dest + '行き・あと' + fmtDur(wait) + '）'
            };
          }
          return {
            kind: 'idle', frac: 0.5,
            main: '営業所で待機中',
            sub: '次は ' + nextLeg.raw.depart_office + ' 発 ' + nextLeg.dest + '行き（あと' + fmtDur(wait) + '）'
          };
        }
      }
      return { kind: 'idle', frac: 0.5, main: '営業所で待機中', sub: '' };
    }

    function renderNext(now) {
      var wrap = document.getElementById('sb-next-list');
      var upcoming = LEGS.filter(function (l) { return l.outStart > now; }).slice(0, 3);
      if (!upcoming.length) {
        wrap.innerHTML = '<div class="sb-next-empty">本日の便はすべて発車しました。</div>';
        return;
      }
      wrap.innerHTML = upcoming.map(function (l) {
        return '<div class="sb-next-row">'
          + '<span class="t">' + esc(l.raw.depart_office) + '</span>'
          + '<span class="d">' + esc(l.dest) + '行き</span>'
          + '<span class="c">あと ' + fmtDur(l.outStart - now) + '</span>'
          + '</div>';
      }).join('');
    }

    function renderTable(now) {
      var body = document.getElementById('sb-tt-body');
      var curId = null;
      for (var i = 0; i < LEGS.length; i++) {
        if (now >= LEGS[i].outStart && now < LEGS[i].retEnd) { curId = LEGS[i].id; break; }
      }
      var nextLeg = LEGS.filter(function (l) { return l.outStart > now; })[0];
      var nextId = nextLeg ? nextLeg.id : null;

      body.innerHTML = LEGS.map(function (l) {
        var isToei = (l.dest === '東武練馬駅');
        var cls = [];
        if (isToei) cls.push('toei');
        if (l.id === curId) cls.push('cur');
        else if (l.id === nextId) cls.push('nxt');
        var pill = isToei
          ? '<span class="sb-dest-pill t">東武練馬駅</span>'
          : '<span class="sb-dest-pill k">北赤羽駅</span>';
        var ops = EDITABLE
          ? '<td style="white-space:nowrap;">'
            + '<button type="button" class="sb-btn sb-btn-sm sb-btn-edit" data-edit="' + l.id + '">編集</button> '
            + '<button type="button" class="sb-btn sb-btn-sm sb-btn-del" data-del="' + l.id + '">削除</button>'
            + '</td>'
          : '';
        return '<tr class="' + cls.join(' ') + '">'
          + '<td style="font-weight:700;">' + esc(l.raw.depart_office) + '</td>'
          + '<td>' + pill + '</td>'
          + '<td>' + esc(l.raw.depart_dest) + '</td>'
          + '<td>' + esc(l.raw.arrive_office) + '</td>'
          + ops
          + '</tr>';
      }).join('');

      if (EDITABLE) {
        body.querySelectorAll('[data-edit]').forEach(function (b) {
          b.addEventListener('click', function () { sbOpenModal(parseInt(b.getAttribute('data-edit'), 10)); });
        });
        body.querySelectorAll('[data-del]').forEach(function (b) {
          b.addEventListener('click', function () { sbDelete(parseInt(b.getAttribute('data-del'), 10)); });
        });
      }
    }

    var lastTableMin = -1;
    function tick() {
      var now = jstNowMin();
      var st = computeState(now);

      var bus = document.getElementById('sb-bus');
      bus.setAttribute('transform', 'translate(' + xFromFrac(st.frac).toFixed(1) + ',0)');
      var arrow = document.getElementById('sb-bus-arrow');
      if (st.kind === 'run' && st.dir) {
        arrow.style.display = '';
        arrow.setAttribute('transform', st.dir < 0 ? 'rotate(-90 24 -5)' : 'rotate(90 24 -5)');
      } else {
        arrow.style.display = 'none';
      }

      var box = document.getElementById('sb-status');
      box.className = 'sb-card sb-status ' + (st.kind === 'run' ? 'run' : st.kind === 'idle' ? 'idle' : 'off');
      document.getElementById('sb-status-main').textContent = st.main;
      document.getElementById('sb-status-sub').textContent = st.sub || '';
      document.getElementById('sb-clock').textContent = jstClock() + ' 現在';

      renderNext(now);
      var m = Math.floor(now);
      if (m !== lastTableMin) { renderTable(now); lastTableMin = m; }
    }

    // ===== 編集 =====
    var editingId = 0;
    window.sbOpenModal = function (id) {
      editingId = id || 0;
      var t = TRIPS.filter(function (x) { return x.id === editingId; })[0];
      document.getElementById('sb-modal-title').textContent = editingId ? '便を編集' : '便を追加';
      document.getElementById('sb-f-dest').value = t ? t.destination : '北赤羽駅';
      document.getElementById('sb-f-depoff').value = t ? t.depart_office : '';
      document.getElementById('sb-f-depdest').value = t ? t.depart_dest : '';
      document.getElementById('sb-f-arroff').value = t ? t.arrive_office : '';
      document.getElementById('sb-modal').style.display = 'flex';
    };
    window.sbCloseModal = function () { document.getElementById('sb-modal').style.display = 'none'; };
    window.sbSave = async function () {
      var body = {
        destination: document.getElementById('sb-f-dest').value,
        depart_office: document.getElementById('sb-f-depoff').value,
        depart_dest: document.getElementById('sb-f-depdest').value,
        arrive_office: document.getElementById('sb-f-arroff').value
      };
      if (!body.depart_office || !body.depart_dest || !body.arrive_office) { alert('時刻をすべて入力してください'); return; }
      var btn = document.getElementById('sb-save-btn');
      btn.disabled = true; btn.textContent = '保存中…';
      var res = await fetch(editingId ? API + '/trips/' + editingId : API + '/trips', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      btn.disabled = false; btn.textContent = '保存';
      if (res.ok) { location.reload(); }
      else { var j = await res.json().catch(function () { return {}; }); alert(j.error || '保存に失敗しました'); }
    };
    window.sbDelete = async function (id) {
      if (!confirm('この便を削除しますか？')) return;
      var res = await fetch(API + '/trips/' + id, { method: 'DELETE' });
      if (res.ok) location.reload();
      else alert('削除に失敗しました');
    };

    tick();
    setInterval(tick, 1000);
  })();
  </script>`;
}
