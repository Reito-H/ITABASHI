// 車庫見取り図（紙の「車庫見取り図」をWeb化）
// 5ブロック(RF／4F+3.5F／3F+2.5F／2F+1.5F／1F+半地下)をタブ切替で表示。
//   ・固定マス(garage_slots): 元Excelのセル結合＋色分けをそのまま再現した色付きマス。クリックで車番4桁を入力
//   ・自由マーカー(garage_markers): スロープ前など固定マス外に自由な位置へドラッグ配置する「車」四角
// レイアウト定義(座標・色・ラベル)は garage_layout.ts の静的データを使う（DBには持たない）
import { escHtml, safeJson } from './layout';
import { ADMIN_PATH } from '../config';
import { GARAGE_SECTIONS, type GarageSection } from './garage_layout';

export type GarageSlotRow = { section: string; slot_key: string; car_no: string };
export type GarageMarkerRow = { id: number; section: string; x: number; y: number; w: number; h: number; car_no: string };

// 元Excelの列幅(文字単位)・行高(pt単位)をそのままpxのスケールとして拡大する係数
const COL_PX = 7.2;
const ROW_PX = 1.35;

// ラベルの文言から役割を判定し、階段・スロープ・洗車機などを実物に近い見た目で描き分ける
function labelKind(text: string): string {
  if (text.includes('階段')) return 'stairs';
  if (text.includes('スロープ')) return 'ramp';
  if (text.includes('洗車機')) return 'wash';
  if (text.includes('部品庫')) return 'parts';
  if (text.includes('検査場')) return 'inspect';
  if (text.includes('半地下')) return 'basement';
  if (/フロア$/.test(text)) return 'floorsign';
  if (/^\d+F$/.test(text)) return 'floorlevel';
  return 'plain';
}

function sectionStageHtml(section: GarageSection, slotMap: Map<string, string>): string {
  const colTemplate = section.colWidths.map(w => `${(w * COL_PX).toFixed(1)}px`).join(' ');
  const rowTemplate = section.rowHeights.map(h => `${(h * ROW_PX).toFixed(1)}px`).join(' ');
  const totalW = section.colWidths.reduce((a, w) => a + w, 0) * COL_PX;
  const totalH = section.rowHeights.reduce((a, h) => a + h, 0) * ROW_PX;

  const cellsHtml = section.cells.map(cell => {
    const gridArea = `grid-row: ${cell.r0} / ${cell.r1 + 1}; grid-column: ${cell.c0} / ${cell.c1 + 1};`;
    if (cell.kind === 'label') {
      const text = cell.text ?? '';
      return `<div class="gr-label gr-label-${labelKind(text)}" style="${gridArea}">${escHtml(text)}</div>`;
    }
    const carNo = slotMap.get(cell.slotKey ?? '') ?? '';
    return `<div class="gr-slot${carNo ? ' has-car' : ''}" data-slot-key="${escHtml(cell.slotKey ?? '')}"
      style="${gridArea} --accent:${cell.color};"><span class="gr-slot-text">${escHtml(carNo)}</span></div>`;
  }).join('');

  return `
  <div class="garage-stage" style="width:${totalW.toFixed(1)}px;height:${totalH.toFixed(1)}px;">
    <div class="garage-grid" style="grid-template-columns:${colTemplate};grid-template-rows:${rowTemplate};">
      ${cellsHtml}
    </div>
    <div class="garage-markers-layer" data-section="${section.key}"></div>
  </div>`;
}

export function garagePage(slots: GarageSlotRow[], markers: GarageMarkerRow[], editable: boolean): string {
  const slotMapsBySection = new Map<string, Map<string, string>>();
  for (const s of GARAGE_SECTIONS) slotMapsBySection.set(s.key, new Map());
  for (const row of slots) {
    const m = slotMapsBySection.get(row.section);
    if (m) m.set(row.slot_key, row.car_no);
  }

  const tabsHtml = GARAGE_SECTIONS.map((s, i) =>
    `<button type="button" class="garage-tab-btn${i === 0 ? ' active' : ''}" data-tab="${s.key}">${escHtml(s.label)}</button>`
  ).join('');

  const panelsHtml = GARAGE_SECTIONS.map((s, i) => `
    <div class="garage-panel${i === 0 ? ' active' : ''}" data-panel="${s.key}">
      <div class="garage-toolbar">
        ${editable ? `<button type="button" class="garage-add-car-btn" data-section="${s.key}">＋車を追加</button>` : ''}
        <span class="garage-hint">色付きマスをクリックすると車番を入力できます。スロープ前などはマスの外に「＋車を追加」で自由に置けます。</span>
      </div>
      <div class="garage-scroll">
        ${sectionStageHtml(s, slotMapsBySection.get(s.key)!)}
      </div>
    </div>`
  ).join('');

  const style = `
  <style>
    .garage-wrap { padding: 4px 0 40px; }
    .garage-tabs { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:14px; }
    .garage-tab-btn { padding:8px 16px; border:1px solid #d1d5db; background:#f9fafb; border-radius:8px; font-size:14px; font-weight:600; color:#374151; cursor:pointer; }
    .garage-tab-btn.active { background:#2e1354; color:#fff; border-color:#2e1354; }
    .garage-panel { display:none; }
    .garage-panel.active { display:block; }
    .garage-toolbar { display:flex; align-items:center; gap:12px; margin-bottom:10px; flex-wrap:wrap; }
    .garage-add-car-btn { padding:6px 14px; border:none; border-radius:6px; background:#166534; color:#fff; font-size:13px; font-weight:600; cursor:pointer; }
    .garage-hint { font-size:12px; color:#6b7280; }

    /* 建物の外枠：床全体をコンクリート調にして「車庫の形」を主役にする */
    .garage-scroll { overflow:auto; border:1px solid #d1d5db; border-radius:8px; background:#eef0f2; max-width:100%; padding:18px; }
    .garage-stage {
      position:relative;
      background-color:#e4e7eb;
      background-image:
        radial-gradient(rgba(15,23,42,0.05) 1px, transparent 1px),
        linear-gradient(180deg, rgba(255,255,255,0.35), rgba(255,255,255,0));
      background-size: 16px 16px, 100% 100%;
      border:4px solid #3f4a5c;
      border-radius:6px;
      box-shadow: inset 0 0 0 2px rgba(255,255,255,0.4), 0 4px 10px rgba(15,23,42,0.15);
    }
    .garage-grid { position:absolute; inset:0; display:grid; }

    /* ラベル系（階段・スロープ・洗車機など）は実物に近い表現に描き分ける */
    .gr-label {
      display:flex; align-items:center; justify-content:center; text-align:center;
      font-size:12px; font-weight:700; color:#475569; white-space:pre-line; padding:2px;
      border:1.5px dashed #94a3b8; background:rgba(255,255,255,0.55); box-sizing:border-box;
    }
    .gr-label-stairs {
      color:#334155; border:2px solid #94a3b8;
      background: repeating-linear-gradient(135deg, #cbd5e1 0 10px, #e2e8f0 10px 20px);
    }
    .gr-label-ramp {
      color:#fff; border:2px solid #1f2937; text-shadow:0 1px 2px rgba(0,0,0,0.55);
      background: repeating-linear-gradient(45deg, #facc15 0 14px, #1f2937 14px 28px);
    }
    .gr-label-wash { color:#1e3a8a; border:2px dashed #2563eb; background:#bfdbfe; }
    .gr-label-parts, .gr-label-inspect { color:#334155; border:2px solid #64748b; background:#f1f5f9; }
    .gr-label-floorsign { color:#fff; border:none; border-radius:6px; letter-spacing:2px; background:#2e1354; }
    .gr-label-basement, .gr-label-floorlevel { color:#fff; border:none; border-radius:4px; background:#1f2937; }

    /* 駐車マス：塗りつぶしではなく白線＋色帯で「区画」を表現 */
    .gr-slot {
      position:relative; box-sizing:border-box;
      border:1px solid rgba(51,65,85,0.3);
      background:#fbfcfd;
      display:flex; align-items:center; justify-content:center; cursor:pointer;
    }
    .gr-slot::before {
      content:''; position:absolute; top:0; left:0; right:0; height:5px;
      background:var(--accent, #cbd5e1);
    }
    .gr-slot.has-car { background:#fff; box-shadow: inset 0 0 0 2px var(--accent, #64748b); }
    .gr-slot:hover { outline:2px solid #2e1354; outline-offset:-2px; }
    .gr-slot-text { font-size:13px; font-weight:800; color:#1f2937; pointer-events:none; margin-top:5px; }
    .gr-slot input { width:90%; margin-top:5px; text-align:center; font-size:13px; font-weight:700; border:1px solid #2e1354; border-radius:4px; padding:2px 0; }

    .garage-markers-layer { position:absolute; inset:0; pointer-events:none; }
    .garage-marker { position:absolute; box-sizing:border-box; background:#fff7ed; border:2px solid #ea580c; border-radius:8px; display:flex; flex-direction:column; pointer-events:auto; min-height:34px; min-width:56px; box-shadow:0 2px 4px rgba(15,23,42,0.2); }
    .garage-marker.dragging { opacity:0.85; z-index:50; }
    .gm-handle { flex:0 0 auto; height:12px; line-height:10px; text-align:center; font-size:10px; letter-spacing:1px; color:#c2410c; background:rgba(234,88,12,0.15); cursor:grab; user-select:none; }
    .garage-marker.dragging .gm-handle { cursor:grabbing; }
    .garage-marker input { flex:1 1 auto; width:100%; min-height:0; text-align:center; font-size:12px; font-weight:700; border:none; background:transparent; color:#9a3412; }
    .garage-marker .gm-del { position:absolute; top:-9px; right:-9px; width:18px; height:18px; line-height:16px; border-radius:50%; background:#dc2626; color:#fff; font-size:12px; text-align:center; cursor:pointer; border:none; padding:0; }
  </style>`;

  const script = `
  <script>
  (function() {
    var EDITABLE = ${editable ? 'true' : 'false'};
    var API = '${ADMIN_PATH}/api/garage';
    var markers = ${safeJson(markers)};

    document.querySelectorAll('.garage-tab-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var key = btn.getAttribute('data-tab');
        document.querySelectorAll('.garage-tab-btn').forEach(function(b) { b.classList.toggle('active', b === btn); });
        document.querySelectorAll('.garage-panel').forEach(function(p) { p.classList.toggle('active', p.getAttribute('data-panel') === key); });
      });
    });

    function saveSlot(sectionKey, slotKey, carNo) {
      return fetch(API + '/slot', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section: sectionKey, slot_key: slotKey, car_no: carNo })
      });
    }

    if (EDITABLE) {
      document.querySelectorAll('.gr-slot').forEach(function(cell) {
        cell.addEventListener('click', function() {
          if (cell.querySelector('input')) return;
          var panel = cell.closest('.garage-panel');
          var sectionKey = panel.getAttribute('data-panel');
          var slotKey = cell.getAttribute('data-slot-key');
          var span = cell.querySelector('.gr-slot-text');
          var current = span.textContent;
          var input = document.createElement('input');
          input.type = 'text'; input.inputMode = 'numeric'; input.maxLength = 4;
          input.value = current;
          cell.innerHTML = '';
          cell.appendChild(input);
          input.focus(); input.select();
          function commit() {
            var val = input.value.trim().slice(0, 4);
            saveSlot(sectionKey, slotKey, val).then(function() {
              cell.innerHTML = '<span class="gr-slot-text">' + (val ? val.replace(/&/g,'&amp;').replace(/</g,'&lt;') : '') + '</span>';
              cell.classList.toggle('has-car', !!val);
            });
          }
          input.addEventListener('blur', commit);
          input.addEventListener('keydown', function(e) { if (e.key === 'Enter') input.blur(); });
        });
      });
    }

    function renderMarker(m) {
      var layer = document.querySelector('.garage-markers-layer[data-section="' + m.section + '"]');
      if (!layer) return;
      var el = document.createElement('div');
      el.className = 'garage-marker';
      el.style.left = m.x + '%'; el.style.top = m.y + '%';
      el.style.width = m.w + '%'; el.style.height = m.h + '%';
      el.dataset.id = m.id;

      var handle = document.createElement('div');
      handle.className = 'gm-handle';
      handle.textContent = '⠿';
      handle.title = 'ドラッグして移動';
      el.appendChild(handle);

      var input = document.createElement('input');
      input.type = 'text'; input.inputMode = 'numeric'; input.maxLength = 4;
      input.value = m.car_no || '';
      input.placeholder = '車番';
      if (!EDITABLE) input.disabled = true;
      el.appendChild(input);

      if (EDITABLE) {
        var del = document.createElement('button');
        del.type = 'button'; del.className = 'gm-del'; del.textContent = '×';
        del.addEventListener('click', function(ev) {
          ev.stopPropagation();
          fetch(API + '/markers/' + m.id, { method: 'DELETE' }).then(function() { el.remove(); });
        });
        el.appendChild(del);

        input.addEventListener('click', function(ev) { ev.stopPropagation(); });
        input.addEventListener('blur', function() {
          var val = input.value.trim().slice(0, 4);
          fetch(API + '/markers/' + m.id, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ car_no: val })
          });
        });
        input.addEventListener('keydown', function(e) { if (e.key === 'Enter') input.blur(); });

        handle.addEventListener('pointerdown', function(ev) {
          ev.preventDefault();
          var stage = el.closest('.garage-stage');
          var rect = stage.getBoundingClientRect();
          el.classList.add('dragging');
          function onMove(mv) {
            var nx = (mv.clientX - rect.left) / rect.width * 100;
            var ny = (mv.clientY - rect.top) / rect.height * 100;
            nx = Math.max(0, Math.min(100 - m.w, nx));
            ny = Math.max(0, Math.min(100 - m.h, ny));
            el.style.left = nx + '%'; el.style.top = ny + '%';
            m.x = nx; m.y = ny;
          }
          function onUp() {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
            el.classList.remove('dragging');
            fetch(API + '/markers/' + m.id, {
              method: 'PUT', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ x: m.x, y: m.y })
            });
          }
          document.addEventListener('pointermove', onMove);
          document.addEventListener('pointerup', onUp);
        });
      }
      layer.appendChild(el);
    }

    markers.forEach(renderMarker);

    if (EDITABLE) {
      document.querySelectorAll('.garage-add-car-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var sectionKey = btn.getAttribute('data-section');
          fetch(API + '/markers', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ section: sectionKey, x: 5, y: 5, w: 7, h: 7, car_no: '' })
          }).then(function(r) { return r.json(); }).then(function(res) {
            renderMarker({ id: res.id, section: sectionKey, x: 5, y: 5, w: 7, h: 7, car_no: '' });
          });
        });
      });
    }
  })();
  </script>`;

  return `
  <div class="garage-wrap">
    <div class="garage-tabs">${tabsHtml}</div>
    ${panelsHtml}
  </div>
  ${style}
  ${script}`;
}
