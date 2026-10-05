// 台本タブ「ビラ」— A4縦1枚の告知ビラ（固定デザイン＋文字だけ差し替え）
//   - edit  : 左に入力欄、右にA4プレビュー（layout() でラップ）
//   - print : A4縦1枚を直返し。?preview=1 なら自動印刷しない（編集画面のプレビュー用）
//   データは daihon_flyers.data（JSON）。項目は FlyerData を参照（migration_171）。
import { FAVICON_DATA_URI } from './layout';

export interface DaihonFlyer {
  id: number;
  title: string;
  data: string;
  sort_order: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}
export interface FlyerData {
  accent: string;
  kicker: string;
  headline: string;   // 改行可
  lead: string;       // 改行可
  steps_title: string;
  steps: string;      // 1行＝「見出し｜説明」（最大4）
  rule_title: string;
  rule_start: string;
  rule_goal: string;
  date_big: string;   // 例: 11.7
  date_small: string; // 例: 土
  date_title: string;
  date_note: string;
  points: string;     // 1行1項目
  footer: string;
}

export const FLYER_FIELDS: Array<{ k: keyof FlyerData; l: string; type: 'text' | 'area'; max: number; help?: string }> = [
  { k: 'kicker', l: '上の小見出し', type: 'text', max: 60 },
  { k: 'headline', l: '大見出し（改行できます）', type: 'area', max: 80 },
  { k: 'lead', l: 'リード文（改行できます）', type: 'area', max: 200 },
  { k: 'steps_title', l: '流れの見出し', type: 'text', max: 40 },
  { k: 'steps', l: '流れ（1行＝「見出し｜説明」・最大4行）', type: 'area', max: 600 },
  { k: 'rule_title', l: 'ルールの見出し', type: 'text', max: 40 },
  { k: 'rule_start', l: 'スタート', type: 'text', max: 80 },
  { k: 'rule_goal', l: 'ゴール', type: 'text', max: 80 },
  { k: 'date_big', l: '日付（大きく表示）', type: 'text', max: 12, help: '例：11.7' },
  { k: 'date_small', l: '曜日など', type: 'text', max: 12 },
  { k: 'date_title', l: '日付の横の見出し', type: 'text', max: 80 },
  { k: 'date_note', l: '日付の横の補足', type: 'text', max: 120 },
  { k: 'points', l: 'ポイント（1行1項目）', type: 'area', max: 600 },
  { k: 'footer', l: '一番下の一行', type: 'text', max: 120 },
];

export const FLYER_ACCENTS: Array<{ v: string; l: string; c: string; soft: string; deep: string }> = [
  { v: 'blue', l: '青', c: '#2563eb', soft: '#eff6ff', deep: '#1e3a8a' },
  { v: 'green', l: '緑', c: '#15803d', soft: '#f0fdf4', deep: '#14532d' },
  { v: 'amber', l: 'オレンジ', c: '#c2410c', soft: '#fff7ed', deep: '#7c2d12' },
  { v: 'slate', l: '紺', c: '#334155', soft: '#f1f5f9', deep: '#0f172a' },
];

export const FLYER_DEFAULT: FlyerData = {
  accent: 'blue',
  kicker: '',
  headline: '',
  lead: '',
  steps_title: '参加の流れ',
  steps: '',
  rule_title: 'ルール',
  rule_start: '',
  rule_goal: '',
  date_big: '',
  date_small: '',
  date_title: '',
  date_note: '',
  points: '',
  footer: '',
};

export function parseFlyer(raw: string | null | undefined): FlyerData {
  let o: Record<string, unknown> = {};
  try { const j = JSON.parse(String(raw || '{}')); if (j && typeof j === 'object') o = j as Record<string, unknown>; } catch { /* 空 */ }
  const d: FlyerData = { ...FLYER_DEFAULT };
  for (const f of FLYER_FIELDS) if (typeof o[f.k] === 'string') d[f.k] = String(o[f.k]).slice(0, f.max);
  d.accent = FLYER_ACCENTS.some((a) => a.v === o.accent) ? String(o.accent) : 'blue';
  return d;
}
export function normalizeFlyer(input: unknown): FlyerData {
  return parseFlyer(JSON.stringify(input ?? {}));
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function br(s: unknown): string {
  return esc(s).replace(/\r?\n/g, '<br>');
}
function rows(s: string): string[] {
  return String(s || '').replace(/\r\n?/g, '\n').split('\n').map((x) => x.trim()).filter((x) => x);
}

// ---------- A4 1枚 ----------
function renderFlyerSheet(d: FlyerData): string {
  const steps = rows(d.steps).slice(0, 4).map((l) => {
    const m = l.split(/[｜|]/);
    return { t: (m[0] ?? '').trim(), s: m.slice(1).join('｜').trim() };
  });
  const points = rows(d.points);
  return `<div class="fl-sheet">
  <header class="fl-top">
    ${d.kicker ? `<span class="fl-kicker">${esc(d.kicker)}</span>` : ''}
    <h1 class="fl-head">${br(d.headline)}</h1>
    ${d.lead ? `<p class="fl-lead">${br(d.lead)}</p>` : ''}
  </header>
  <main class="fl-main">
    ${steps.length ? `<section>
      <h2 class="fl-h2">${esc(d.steps_title)}</h2>
      <div class="fl-steps" style="--n:${steps.length}">
        ${steps.map((x, i) => `<div class="fl-step"><span class="fl-no">${i + 1}</span><p class="fl-st">${esc(x.t)}</p>${x.s ? `<p class="fl-ss">${esc(x.s)}</p>` : ''}</div>`).join('')}
      </div>
    </section>` : ''}
    ${d.rule_start || d.rule_goal ? `<section>
      <h2 class="fl-h2">${esc(d.rule_title)}</h2>
      <div class="fl-rule">
        <div class="fl-rp"><span class="fl-tag">START</span><p>${esc(d.rule_start)}</p></div>
        <div class="fl-arrow"></div>
        <div class="fl-rp"><span class="fl-tag fl-tag-goal">GOAL</span><p>${esc(d.rule_goal)}</p></div>
      </div>
    </section>` : ''}
    ${d.date_big || d.date_title ? `<section class="fl-date">
      <div class="fl-db"><span class="fl-dbig">${esc(d.date_big)}</span>${d.date_small ? `<span class="fl-dsm">${esc(d.date_small)}</span>` : ''}</div>
      <div class="fl-dt"><p class="fl-dtt">${esc(d.date_title)}</p>${d.date_note ? `<p class="fl-dtn">${esc(d.date_note)}</p>` : ''}</div>
    </section>` : ''}
    ${points.length ? `<ul class="fl-points">${points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
  </main>
  ${d.footer ? `<footer class="fl-foot">${esc(d.footer)}</footer>` : ''}
</div>`;
}

function flyerCss(d: FlyerData): string {
  const a = FLYER_ACCENTS.find((x) => x.v === d.accent) ?? FLYER_ACCENTS[0];
  return `
  *{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  :root{--ac:${a.c};--soft:${a.soft};--deep:${a.deep};--ink:#1f2937;--sub:#4b5563;--jp:"Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic","Meiryo",sans-serif;}
  html,body{background:#e5e7eb;font-family:var(--jp);color:var(--ink);-webkit-font-smoothing:antialiased;}
  @page{size:A4 portrait;margin:0;}
  .fl-sheet{width:210mm;height:297mm;margin:0 auto;background:#fff;display:flex;flex-direction:column;overflow:hidden;position:relative;}
  .fl-top{background:var(--ac);color:#fff;padding:20mm 18mm 15mm;position:relative;overflow:hidden;}
  .fl-top::after{content:"";position:absolute;right:-30mm;top:-30mm;width:95mm;height:95mm;border-radius:50%;background:rgba(255,255,255,.1);}
  .fl-kicker{position:relative;z-index:1;display:inline-block;font-size:12.5pt;font-weight:800;letter-spacing:.12em;background:rgba(255,255,255,.18);padding:2mm 5mm;border-radius:999px;}
  .fl-head{position:relative;z-index:1;margin-top:6mm;font-size:38pt;font-weight:900;line-height:1.2;letter-spacing:.01em;}
  .fl-lead{position:relative;z-index:1;margin-top:6mm;font-size:13.5pt;font-weight:700;line-height:1.7;opacity:.95;}
  .fl-main{flex:1;padding:10mm 18mm 0;display:flex;flex-direction:column;gap:8mm;}
  .fl-h2{font-size:13pt;font-weight:900;color:var(--ac);letter-spacing:.06em;margin-bottom:3.5mm;display:flex;align-items:center;gap:3mm;}
  .fl-h2::after{content:"";flex:1;height:.4mm;background:#e5e7eb;}
  .fl-steps{display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr));gap:4mm;}
  .fl-step{background:var(--soft);border-radius:3mm;padding:5mm 4.5mm;}
  .fl-no{display:grid;place-items:center;width:8mm;height:8mm;border-radius:50%;background:var(--ac);color:#fff;font-size:11pt;font-weight:900;}
  .fl-st{margin-top:3mm;font-size:14pt;font-weight:900;}
  .fl-ss{margin-top:1.5mm;font-size:9.5pt;font-weight:600;line-height:1.6;color:var(--sub);}
  .fl-rule{display:grid;grid-template-columns:1fr 12mm 1fr;align-items:center;border:.5mm solid var(--soft);border-radius:3mm;padding:5mm;}
  .fl-rp p{margin-top:2mm;font-size:11.5pt;font-weight:800;line-height:1.55;}
  .fl-tag{display:inline-block;font-size:9pt;font-weight:900;letter-spacing:.16em;color:var(--ac);background:var(--soft);padding:1mm 3mm;border-radius:1.5mm;}
  .fl-tag-goal{color:#fff;background:var(--ac);}
  .fl-arrow{height:.6mm;background:var(--ac);position:relative;margin:0 2mm;}
  .fl-arrow::after{content:"";position:absolute;right:-1mm;top:50%;margin-top:-2mm;border-left:3mm solid var(--ac);border-top:2mm solid transparent;border-bottom:2mm solid transparent;}
  .fl-date{display:flex;align-items:center;gap:7mm;background:var(--deep);color:#fff;border-radius:3mm;padding:6mm 8mm;}
  .fl-db{display:flex;align-items:baseline;gap:2mm;flex:none;}
  .fl-dbig{font-size:40pt;font-weight:900;line-height:1;letter-spacing:.02em;}
  .fl-dsm{font-size:13pt;font-weight:800;opacity:.85;}
  .fl-dt{border-left:.4mm solid rgba(255,255,255,.35);padding-left:7mm;}
  .fl-dtt{font-size:15pt;font-weight:900;line-height:1.45;}
  .fl-dtn{margin-top:1.5mm;font-size:10.5pt;font-weight:600;opacity:.85;}
  .fl-points{list-style:none;display:flex;flex-direction:column;gap:2.6mm;}
  .fl-points li{position:relative;padding-left:7mm;font-size:11.5pt;font-weight:700;line-height:1.55;}
  .fl-points li::before{content:"";position:absolute;left:0;top:1.6mm;width:4mm;height:4mm;border-radius:1mm;border:.5mm solid var(--ac);}
  .fl-points li::after{content:"";position:absolute;left:1.2mm;top:2.3mm;width:1.4mm;height:2.3mm;border-right:.5mm solid var(--ac);border-bottom:.5mm solid var(--ac);transform:rotate(45deg);}
  .fl-foot{margin:auto 18mm 0;padding:5mm 0 9mm;border-top:.3mm solid #e5e7eb;font-size:10pt;font-weight:700;color:var(--sub);text-align:center;}
  .fl-bar{position:sticky;top:0;z-index:5;display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;padding:12px 16px;background:#111827;color:#f9fafb;font-size:13px;font-weight:600;}
  .fl-bar button{border:0;border-radius:8px;padding:8px 18px;background:#2563eb;color:#fff;font:700 13px/1 var(--jp);cursor:pointer;}
  .fl-wrap{padding:8mm 0;}
  @media print{ html,body{background:#fff;} .fl-bar{display:none!important;} .fl-wrap{padding:0;} }
  `;
}

export function daihonFlyerPrintPage(f: DaihonFlyer, preview: boolean): string {
  const d = parseFlyer(f.data);
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(f.title)}</title>
<link rel="icon" type="image/svg+xml" href="${FAVICON_DATA_URI}">
<style>${flyerCss(d)}${preview ? 'html,body{background:#fff;overflow:hidden;} .fl-wrap{padding:0;}' : ''}</style>
</head><body>
${preview ? '' : '<div class="fl-bar"><span>印刷画面の送信先で「PDFに保存」を選ぶとPDFになります（A4縦・余白なし）。</span><button type="button" onclick="window.print()">印刷 / PDFに保存</button></div>'}
<div class="fl-wrap">${renderFlyerSheet(d)}</div>
${preview ? '' : '<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},400);});</script>'}
</body></html>`;
}

// ---------- 編集（layout() でラップ） ----------
export function daihonFlyerEditPage(f: DaihonFlyer, adminPath: string, editable: boolean): string {
  const d = parseFlyer(f.data);
  const dis = editable ? '' : ' disabled';
  const fields = FLYER_FIELDS.map((x) => {
    const v = d[x.k];
    const input = x.type === 'area'
      ? `<textarea data-k="${x.k}" maxlength="${x.max}"${dis}>${esc(v)}</textarea>`
      : `<input type="text" data-k="${x.k}" maxlength="${x.max}" value="${esc(v)}"${dis}>`;
    return `<div class="fe-f"><label>${esc(x.l)}${x.help ? `<span>${esc(x.help)}</span>` : ''}</label>${input}</div>`;
  }).join('');
  const accents = FLYER_ACCENTS.map((a) => `<option value="${a.v}"${a.v === d.accent ? ' selected' : ''}>${a.l}</option>`).join('');
  const backUrl = `${adminPath}/settings/study-sessions?tab=script`;
  return `
  <style>
    .fe{max-width:1240px;margin:0 auto;padding:16px;display:grid;grid-template-columns:1fr 470px;gap:22px;align-items:start;}
    @media (max-width:1040px){ .fe{grid-template-columns:1fr;} .fe-pv{position:static!important;} }
    .fe h1{font-size:18px;margin:0 0 10px;color:#1e3a5f;}
    .fe-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:14px;}
    .fe-btn{display:inline-block;padding:8px 14px;border-radius:8px;background:#2563eb;color:#fff;font-size:13px;font-weight:700;text-decoration:none;border:0;cursor:pointer;}
    .fe-btn.ghost{background:#fff;color:#374151;border:1px solid #d1d5db;}
    .fe-msg{font-size:12px;font-weight:700;color:#059669;min-height:16px;}
    .fe-card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:14px;}
    .fe-f{display:flex;flex-direction:column;gap:3px;margin-bottom:10px;}
    .fe-f label{font-size:11px;font-weight:700;color:#6b7280;}
    .fe-f label span{font-weight:500;color:#9ca3af;margin-left:6px;}
    .fe-f input,.fe-f textarea,.fe-f select{border:1px solid #d1d5db;border-radius:7px;padding:7px 9px;font-size:13px;font-family:inherit;}
    .fe-f textarea{min-height:64px;resize:vertical;}
    .fe-pv{position:sticky;top:16px;}
    .fe-pv .box{width:100%;aspect-ratio:210/297;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;background:#fff;position:relative;}
    .fe-pv iframe{position:absolute;left:0;top:0;width:210mm;height:297mm;border:0;transform-origin:top left;}
    .fe-ro{background:#fef3c7;border:1px solid #fde68a;color:#92400e;font-size:12px;border-radius:8px;padding:10px 12px;margin-bottom:12px;}
  </style>
  <div class="fe">
    <div>
      <h1>ビラ ― 編集</h1>
      <div class="fe-bar">
        <a class="fe-btn ghost" href="${esc(backUrl)}">← 台本一覧</a>
        <a class="fe-btn" href="${adminPath}/daihon/flyer/${f.id}/print" target="_blank" rel="noopener">印刷 / PDF出力</a>
        <span class="fe-msg" id="fe-msg"></span>
      </div>
      ${editable ? '' : '<div class="fe-ro">閲覧のみのアカウントです。編集するにはフル権限、または「営業所ページ」の編集権限が必要です。</div>'}
      <div class="fe-card">
        <div class="fe-f"><label>ビラの名前（一覧用。ビラには出ません）</label><input type="text" id="fe-title" maxlength="120" value="${esc(f.title)}"${dis}></div>
        <div class="fe-f"><label>色</label><select data-k="accent"${dis}>${accents}</select></div>
        ${fields}
      </div>
    </div>
    <div class="fe-pv">
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;"><b style="font-size:12px;color:#374151;">プレビュー</b><span style="font-size:11px;color:#9ca3af;">入力欄から離れると保存・更新されます</span></div>
      <div class="box" id="fe-box"><iframe id="fe-pv" src="${adminPath}/daihon/flyer/${f.id}/print?preview=1"></iframe></div>
    </div>
  </div>
  <script>
  (function(){
    var ADMIN = ${JSON.stringify(adminPath)};
    var ID = ${f.id};
    var EDITABLE = ${editable ? 'true' : 'false'};
    var msg = document.getElementById('fe-msg');
    var box = document.getElementById('fe-box');
    var fr = document.getElementById('fe-pv');
    function fit(){ var mm = 96 / 25.4; fr.style.transform = 'scale(' + (box.clientWidth / (210 * mm)) + ')'; }
    window.addEventListener('resize', fit); fit();
    function flash(t){ msg.textContent = t; setTimeout(function(){ if (msg.textContent === t) msg.textContent = ''; }, 2000); }
    function save(){
      if (!EDITABLE) return;
      var data = {};
      Array.prototype.forEach.call(document.querySelectorAll('[data-k]'), function(el){ data[el.getAttribute('data-k')] = el.value; });
      fetch(ADMIN + '/api/daihon/flyers/' + ID, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: document.getElementById('fe-title').value, data: data }) })
        .then(function(r){ return r.json(); }).then(function(j){
          if (j && j.ok) { flash('保存しました'); fr.src = fr.src.split('&t=')[0] + '&t=' + Date.now(); }
          else flash((j && j.error) || '保存に失敗しました');
        });
    }
    Array.prototype.forEach.call(document.querySelectorAll('[data-k], #fe-title'), function(el){ el.addEventListener('change', save); });
  })();
  </script>`;
}
