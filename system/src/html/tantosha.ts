// 担当車表（班ごとの車両担当者一覧表）画面
// 紙の「3班/4班担当者一覧表」を再現した編集可能なグリッド。
//   ・本表: 1行 = 1台（ドア）+ 担当者2名。シフト（H / B/D / 日勤）で区切る
//   ・3台廻り: シフト区切り内の3行ごとのブロック単位。ブロック先頭行の r_* に保持
//   ・付帯リスト: 短労供 / スペア / 長欠 / 退職予定 / 待機 / 班長 などの右側リスト
//   ・色: 文字色 = ''(黒)/blue/red/gold、背景 = ''/yellow/green/red、行背景 = ''/blue/yellow
import { escHtml, safeJson } from './layout';
import { ADMIN_PATH } from '../config';

export type TantoshaGroup = {
  id: number;
  name: string;
  month_label: string;
  note: string;
  sort_order: number;
  is_active: number;
};

export type TantoshaRow = {
  id?: number;
  sort_order?: number;
  shift: string;
  door: string;
  row_color: string;
  p1_letter: string; p1_name: string; p1_badge: string; p1_color: string; p1_hl: string;
  p2_letter: string; p2_name: string; p2_badge: string; p2_color: string; p2_hl: string;
  r_letter: string; r_name: string; r_badge: string; r_color: string; r_hl: string;
};

export type TantoshaSide = {
  id?: number;
  section: string;
  sort_order?: number;
  col1: string;
  col2: string;
  name: string;
  badge: string;
  color: string;
  hl: string;
};

export type TantoshaGroupData = TantoshaGroup & { rows: TantoshaRow[]; side: TantoshaSide[] };

// 色トークン → 実色（画面・印刷共通）
export const TEXT_COLORS: Record<string, string> = {
  '': '#1f2937', blue: '#1d4ed8', red: '#b91c1c', gold: '#b8860b',
};
export const HL_COLORS: Record<string, string> = {
  '': '', yellow: '#fde047', green: '#a8b23c', red: '#b91c1c',
};
export const ROW_COLORS: Record<string, string> = {
  '': '', blue: '#2563eb', yellow: '#fde047',
};
const DOOR_BG = '#f6c445';

// 丸数字（①〜⑳、㉑〜㉟）。範囲外・数字以外はそのまま
export function circled(badge: string): string {
  if (!badge) return '';
  return badge.split(/[\s,、・]+/).filter(Boolean).map(t => {
    const n = parseInt(t, 10);
    if (String(n) !== t || n < 1) return t;
    if (n <= 20) return String.fromCharCode(0x2460 + n - 1);
    if (n <= 35) return String.fromCharCode(0x3251 + n - 21);
    if (n <= 50) return String.fromCharCode(0x32B1 + n - 36);
    return t;
  }).join('');
}

// シフト区切り内で3行ごとのブロックに分割し、各行に
// { chunkStart: ブロック先頭か, chunkLen: ブロック行数, sectionStart: シフト区切りの先頭か } を付ける
export function chunkRows(rows: TantoshaRow[]): Array<{ chunkStart: boolean; chunkLen: number; sectionStart: boolean }> {
  const meta = rows.map(() => ({ chunkStart: false, chunkLen: 0, sectionStart: false }));
  let i = 0;
  while (i < rows.length) {
    // シフト区切り（同じshift値の連続行）
    let j = i;
    while (j < rows.length && rows[j].shift === rows[i].shift) j++;
    meta[i].sectionStart = true;
    // 3行ごとのブロック
    for (let s = i; s < j; s += 3) {
      const len = Math.min(3, j - s);
      meta[s].chunkStart = true;
      meta[s].chunkLen = len;
    }
    i = j;
  }
  return meta;
}

// ===== 編集画面 =====
export function tantoshaPage(groups: TantoshaGroupData[], editable: boolean): string {
  return `
<style>
  .tt-tabs { display:flex; gap:6px; flex-wrap:wrap; align-items:center; margin-bottom:10px; }
  .tt-tab { padding:6px 18px; border-radius:6px 6px 0 0; border:1px solid #d1d5db; border-bottom:none;
            background:#e5e7eb; cursor:pointer; font-size:13px; font-weight:600; color:#374151; }
  .tt-tab.active { background:#1a3a5c; color:#fff; border-color:#1a3a5c; }
  .tt-btn { padding:5px 12px; border-radius:5px; border:1px solid #d1d5db; background:#fff; cursor:pointer; font-size:12px; }
  .tt-btn:hover { background:#f3f4f6; }
  .tt-btn.primary { background:#2563eb; border-color:#2563eb; color:#fff; font-weight:600; }
  .tt-btn.primary:hover { background:#1d4ed8; }
  .tt-btn.danger { color:#b91c1c; border-color:#fca5a5; }
  .tt-toolbar { display:flex; gap:4px; align-items:center; flex-wrap:wrap; background:#fff; border:1px solid #e5e7eb;
                border-radius:8px; padding:8px 10px; margin-bottom:10px; font-size:12px; color:#4b5563; }
  .tt-sw { width:22px; height:22px; border-radius:4px; border:1px solid #9ca3af; cursor:pointer; padding:0; }
  .tt-wrap { display:flex; gap:16px; align-items:flex-start; flex-wrap:wrap; }
  .tt-main { overflow-x:auto; }
  table.tt { border-collapse:collapse; background:#fff; font-size:12.5px; }
  table.tt th, table.tt td { border:1px solid #4b5563; padding:0; height:26px; }
  table.tt th { background:#1a3a5c; color:#fff; font-size:11.5px; font-weight:600; padding:4px 6px; }
  table.tt td.sec-start { border-top:3px solid #111827; }
  table.tt td.chunk-start { border-top:2px solid #111827; }
  .tt input { border:none; background:transparent; font:inherit; height:24px; padding:0 3px; outline:none; }
  .tt input:focus { background:#dbeafe; }
  .tt input[readonly] { cursor:default; }
  .tt input[readonly]:focus { background:transparent; }
  td.tt-shift input { width:44px; text-align:center; color:#6b7280; font-size:11px; }
  td.tt-door { background:${DOOR_BG}; }
  td.tt-door input { width:56px; text-align:center; font-weight:600; }
  td.tt-letter { background:#fafafa; }
  td.tt-letter input { width:26px; text-align:center; }
  td.tt-name input.nm { width:118px; text-align:center; }
  td.tt-name input.bd { width:30px; text-align:center; color:#374151; font-size:11px; border-left:1px dotted #d1d5db; }
  td.tt-rot { vertical-align:middle; }
  td.tt-rot .rot-in { display:flex; align-items:center; }
  td.tt-rot input.rl { width:26px; text-align:center; border-right:1px solid #9ca3af; }
  td.tt-rot input.nm { width:110px; text-align:center; }
  td.tt-rot input.bd { width:30px; text-align:center; font-size:11px; }
  td.tt-ops { border:none !important; background:transparent; white-space:nowrap; padding-left:4px; }
  .tt-op { border:none; background:transparent; cursor:pointer; font-size:12px; color:#9ca3af; padding:1px 3px; }
  .tt-op:hover { color:#2563eb; }
  .tt-op.del:hover { color:#dc2626; }
  /* 付帯リスト */
  .tt-side { width:330px; flex-shrink:0; }
  .tt-side-sec { background:#fff; border:1px solid #4b5563; margin-bottom:12px; }
  .tt-side-head { display:flex; align-items:center; background:#374151; color:#fff; }
  .tt-side-head input { flex:1; border:none; background:transparent; color:#fff; font-weight:600;
                        font-size:12.5px; text-align:center; height:26px; outline:none; }
  .tt-side-head input:focus { background:#4b5563; }
  table.tts { border-collapse:collapse; width:100%; font-size:12.5px; }
  table.tts td { border:1px solid #6b7280; padding:0; height:25px; }
  table.tts input { border:none; background:transparent; font:inherit; height:23px; padding:0 3px; outline:none; width:100%; box-sizing:border-box; }
  table.tts input:focus { background:#dbeafe; }
  table.tts td.c1 { width:30px; } table.tts td.c1 input { text-align:center; }
  table.tts td.c2 { width:40px; } table.tts td.c2 input { text-align:center; }
  table.tts td.nm input { text-align:center; }
  table.tts td.bd { width:32px; } table.tts td.bd input { text-align:center; font-size:11px; }
  table.tts td.ops { border:none; background:transparent; white-space:nowrap; width:70px; padding-left:3px; }
  .tt-meta { display:flex; gap:8px; align-items:center; margin-bottom:8px; flex-wrap:wrap; font-size:12px; color:#6b7280; }
  .tt-meta input { border:1px solid #d1d5db; border-radius:4px; font-size:12px; padding:3px 6px; }
  .tt-dirty { display:none; color:#b45309; font-weight:600; font-size:12px; }
  .tt-modal-bg { display:none; position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:60; }
  .tt-modal { background:#fff; border-radius:10px; max-width:560px; margin:8vh auto 0; max-height:75vh;
              overflow:auto; padding:16px 20px; font-size:12.5px; }
  @media (max-width: 1200px) { .tt-side { width:100%; } }
</style>

<div class="tt-tabs" id="tt-tabs"></div>

<div class="tt-meta">
  <span>月ラベル</span><input id="tt-month" style="width:60px" ${editable ? '' : 'readonly'}>
  <span>脚注（現在人数など）</span><input id="tt-note" style="width:220px" ${editable ? '' : 'readonly'}>
  <span class="tt-dirty" id="tt-dirty">未保存の変更があります</span>
  <span style="flex:1"></span>
  ${editable ? `<button class="tt-btn primary" onclick="ttSave()">保存</button>` : ''}
  <button class="tt-btn" onclick="ttPrint()">印刷</button>
  <button class="tt-btn" onclick="ttLogs()">履歴</button>
  ${editable ? `<button class="tt-btn" onclick="ttRenameGroup()">班名変更</button>
  <button class="tt-btn" onclick="ttAddGroup()">班を追加</button>
  <button class="tt-btn danger" onclick="ttDeleteGroup()">班を削除</button>` : ''}
</div>

${editable ? `
<div class="tt-toolbar" id="tt-toolbar">
  <span id="tt-sel-label" style="min-width:130px;">セル未選択</span>
  <span style="margin-left:8px;">文字色:</span>
  <button class="tt-sw" style="background:#1f2937" title="黒" onclick="ttColor('')"></button>
  <button class="tt-sw" style="background:#1d4ed8" title="青" onclick="ttColor('blue')"></button>
  <button class="tt-sw" style="background:#b91c1c" title="赤" onclick="ttColor('red')"></button>
  <button class="tt-sw" style="background:#b8860b" title="金" onclick="ttColor('gold')"></button>
  <span style="margin-left:10px;">セル背景:</span>
  <button class="tt-sw" style="background:#fff" title="なし" onclick="ttHl('')"></button>
  <button class="tt-sw" style="background:#fde047" title="黄" onclick="ttHl('yellow')"></button>
  <button class="tt-sw" style="background:#a8b23c" title="緑" onclick="ttHl('green')"></button>
  <button class="tt-sw" style="background:#b91c1c" title="赤" onclick="ttHl('red')"></button>
  <span style="margin-left:10px;">行背景:</span>
  <button class="tt-sw" style="background:#fff" title="標準" onclick="ttRowColor('')"></button>
  <button class="tt-sw" style="background:#2563eb" title="青（水素車）" onclick="ttRowColor('blue')"></button>
  <button class="tt-sw" style="background:#fde047" title="黄" onclick="ttRowColor('yellow')"></button>
  <span style="margin-left:auto;color:#9ca3af;">名前セルを選択して色を適用 / 記=優先順・丸数字は数字で入力</span>
</div>` : ''}

<div class="tt-wrap">
  <div class="tt-main">
    <table class="tt">
      <thead>
        <tr><th>シフト</th><th>ドア</th><th colspan="4">担　当　者</th><th colspan="1">3台廻り</th>${editable ? '<th style="background:transparent;border:none;"></th>' : ''}</tr>
      </thead>
      <tbody id="tt-body"></tbody>
    </table>
    ${editable ? `<div style="margin-top:8px;"><button class="tt-btn" onclick="ttAddRow()">行を追加（最下部）</button></div>` : ''}
  </div>
  <div class="tt-side" id="tt-side"></div>
</div>

<div class="tt-modal-bg" id="tt-modal-bg" onclick="if(event.target===this)this.style.display='none'">
  <div class="tt-modal" id="tt-modal"></div>
</div>

<script>
const API = ${safeJson(`${ADMIN_PATH}/api/tantosha`)};
const PRINT_URL = ${safeJson(`${ADMIN_PATH}/tantosha/print`)};
const EDITABLE = ${editable ? 'true' : 'false'};
const TEXT_COLORS = ${safeJson(TEXT_COLORS)};
const HL_COLORS = ${safeJson(HL_COLORS)};
const ROW_COLORS = ${safeJson(ROW_COLORS)};
let groups = ${safeJson(groups)};
let orig = JSON.parse(JSON.stringify(groups));  // タブ切替時の破棄用スナップショット
let cur = 0;
let dirty = false;
let sel = null;  // {kind:'row'|'side', idx, pre:'p1'|'p2'|'r'|null, el}

function esc(s){ return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function g(){ return groups[cur]; }
function markDirty(){ dirty = true; document.getElementById('tt-dirty').style.display = 'inline'; }
window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

// ===== タブ =====
function renderTabs(){
  const el = document.getElementById('tt-tabs');
  el.innerHTML = groups.map((gr,i) =>
    '<div class="tt-tab'+(i===cur?' active':'')+'" onclick="switchGroup('+i+')">'+esc(gr.name)+'担当者一覧表'+(gr.month_label?'（'+esc(gr.month_label)+'）':'')+'</div>'
  ).join('');
}
function switchGroup(i){
  if (i === cur) return;
  if (dirty){
    if (!confirm('未保存の変更があります。破棄して切り替えますか？')) return;
    dirty = false;
    document.getElementById('tt-dirty').style.display = 'none';
    groups = JSON.parse(JSON.stringify(orig));  // 破棄して元に戻す
  }
  cur = i; sel = null; renderAll();
}

// ===== 本表 =====
function chunkMeta(rows){
  const meta = rows.map(()=>({cs:false,len:0,ss:false}));
  let i = 0;
  while (i < rows.length){
    let j = i;
    while (j < rows.length && rows[j].shift === rows[i].shift) j++;
    meta[i].ss = true;
    for (let s = i; s < j; s += 3){ meta[s].cs = true; meta[s].len = Math.min(3, j - s); }
    i = j;
  }
  return meta;
}
function cellStyle(color, hl, rowColor){
  let s = 'color:' + (rowColor === 'blue' ? '#fff' : (TEXT_COLORS[color] || TEXT_COLORS[''])) + ';';
  const bg = HL_COLORS[hl] || '';
  if (bg) s += 'background:' + bg + ';';
  else if (rowColor && ROW_COLORS[rowColor]) s += 'background:' + ROW_COLORS[rowColor] + ';';
  if (hl === 'red') s += 'color:#fff;';
  return s;
}
function personTds(r, i, pre, secCls){
  const letter = r[pre+'_letter'], name = r[pre+'_name'], badge = r[pre+'_badge'];
  const st = cellStyle(r[pre+'_color'], r[pre+'_hl'], r.row_color);
  return '<td class="tt-letter '+secCls+'"><input value="'+esc(letter)+'" style="width:26px;text-align:center;" '+(EDITABLE?'':'readonly ')+
           'oninput="U('+i+',\\''+pre+'_letter\\',this.value)"></td>'+
         '<td class="tt-name '+secCls+'" style="'+st+'">'+
           '<input class="nm" value="'+esc(name)+'" style="'+st.replace(/background:[^;]+;/,'background:transparent;')+'" '+(EDITABLE?'':'readonly ')+
             'oninput="U('+i+',\\''+pre+'_name\\',this.value)" onfocus="SEL(\\'row\\','+i+',\\''+pre+'\\',this)">'+
           '<input class="bd" value="'+esc(badge)+'" title="丸数字（数字で入力）" '+(EDITABLE?'':'readonly ')+
             'oninput="U('+i+',\\''+pre+'_badge\\',this.value)" onfocus="SEL(\\'row\\','+i+',\\''+pre+'\\',this)">'+
         '</td>';
}
function renderMain(){
  const rows = g().rows;
  const meta = chunkMeta(rows);
  let html = '';
  for (let i = 0; i < rows.length; i++){
    const r = rows[i];
    const secCls = meta[i].ss ? 'sec-start' : (meta[i].cs ? 'chunk-start' : '');
    const doorSt = r.row_color === 'blue' ? 'background:#2563eb;color:#fff;' : '';
    html += '<tr>';
    html += '<td class="tt-shift '+secCls+'"><input value="'+esc(r.shift)+'" '+(EDITABLE?'':'readonly ')+
            'oninput="U('+i+',\\'shift\\',this.value);STRUCT()" onfocus="SEL(\\'row\\','+i+',null,this)"></td>';
    html += '<td class="tt-door '+secCls+'" style="'+doorSt+'"><input value="'+esc(r.door)+'" style="width:56px;text-align:center;font-weight:600;'+(r.row_color==='blue'?'color:#fff;':'')+'" '+(EDITABLE?'':'readonly ')+
            'oninput="U('+i+',\\'door\\',this.value)" onfocus="SEL(\\'row\\','+i+',null,this)"></td>';
    html += personTds(r, i, 'p1', secCls);
    html += personTds(r, i, 'p2', secCls);
    if (meta[i].cs){
      const st = cellStyle(r.r_color, r.r_hl, '');
      html += '<td class="tt-rot '+secCls+'" rowspan="'+meta[i].len+'" style="'+(HL_COLORS[r.r_hl]?'background:'+HL_COLORS[r.r_hl]+';':'')+'">'+
        '<div class="rot-in">'+
        '<input class="rl" value="'+esc(r.r_letter)+'" '+(EDITABLE?'':'readonly ')+'oninput="U('+i+',\\'r_letter\\',this.value)">'+
        '<input class="nm" value="'+esc(r.r_name)+'" style="'+st.replace(/background:[^;]+;/,'')+'" '+(EDITABLE?'':'readonly ')+
          'oninput="U('+i+',\\'r_name\\',this.value)" onfocus="SEL(\\'row\\','+i+',\\'r\\',this)">'+
        '<input class="bd" value="'+esc(r.r_badge)+'" '+(EDITABLE?'':'readonly ')+
          'oninput="U('+i+',\\'r_badge\\',this.value)" onfocus="SEL(\\'row\\','+i+',\\'r\\',this)">'+
        '</div></td>';
    }
    if (EDITABLE){
      html += '<td class="tt-ops">'+
        '<button class="tt-op" title="上へ" onclick="ttMove('+i+',-1)">↑</button>'+
        '<button class="tt-op" title="下へ" onclick="ttMove('+i+',1)">↓</button>'+
        '<button class="tt-op" title="下に行を挿入" onclick="ttInsert('+i+')">＋</button>'+
        '<button class="tt-op del" title="行を削除" onclick="ttDelete('+i+')">×</button>'+
        '</td>';
    }
    html += '</tr>';
  }
  document.getElementById('tt-body').innerHTML = html;
}

// ===== 付帯リスト =====
function renderSide(){
  const side = g().side;
  // sort_order順（配列順）を保ちながらセクションでまとめる
  const secs = [];
  const bySec = {};
  side.forEach((s, i) => {
    if (!bySec[s.section]){ bySec[s.section] = []; secs.push(s.section); }
    bySec[s.section].push(i);
  });
  let html = '';
  secs.forEach(sec => {
    html += '<div class="tt-side-sec"><div class="tt-side-head">'+
      '<input value="'+esc(sec)+'" '+(EDITABLE?'':'readonly ')+'onchange="ttRenameSection(\\''+esc(sec).replace(/'/g,"\\\\'")+'\\',this.value)">'+
      (EDITABLE ? '<button class="tt-op" style="color:#d1d5db" title="行を追加" onclick="ttSideAdd(\\''+esc(sec).replace(/'/g,"\\\\'")+'\\')">＋</button>' : '')+
      '</div><table class="tts">';
    bySec[sec].forEach(i => {
      const s = side[i];
      const st = cellStyle(s.color, s.hl, '');
      html += '<tr>'+
        '<td class="c1"><input value="'+esc(s.col1)+'" '+(EDITABLE?'':'readonly ')+'oninput="US('+i+',\\'col1\\',this.value)"></td>'+
        '<td class="c2"><input value="'+esc(s.col2)+'" '+(EDITABLE?'':'readonly ')+'oninput="US('+i+',\\'col2\\',this.value)"></td>'+
        '<td class="nm" style="'+st+'"><input value="'+esc(s.name)+'" style="'+st.replace(/background:[^;]+;/,'background:transparent;')+'" '+(EDITABLE?'':'readonly ')+
          'oninput="US('+i+',\\'name\\',this.value)" onfocus="SEL(\\'side\\','+i+',null,this)"></td>'+
        '<td class="bd"><input value="'+esc(s.badge)+'" '+(EDITABLE?'':'readonly ')+'oninput="US('+i+',\\'badge\\',this.value)" onfocus="SEL(\\'side\\','+i+',null,this)"></td>'+
        (EDITABLE ? '<td class="ops">'+
          '<button class="tt-op" onclick="ttSideMove('+i+',-1)">↑</button>'+
          '<button class="tt-op" onclick="ttSideMove('+i+',1)">↓</button>'+
          '<button class="tt-op del" onclick="ttSideDelete('+i+')">×</button></td>' : '')+
        '</tr>';
    });
    html += '</table></div>';
  });
  if (EDITABLE){
    html += '<button class="tt-btn" onclick="ttAddSection()">セクションを追加</button>';
  }
  html += '<div style="margin-top:10px;font-size:11px;color:#9ca3af;">短労供・スペア・長欠・退職予定・班長などの枠。名前セル選択で色変更可</div>';
  document.getElementById('tt-side').innerHTML = html;
}

function renderMeta(){
  document.getElementById('tt-month').value = g().month_label || '';
  document.getElementById('tt-note').value = g().note || '';
}
function renderAll(){ renderTabs(); renderMain(); renderSide(); renderMeta(); }

// ===== 状態更新 =====
function U(i, f, v){ g().rows[i][f] = v; markDirty(); }
function US(i, f, v){ g().side[i][f] = v; markDirty(); }
function STRUCT(){ /* シフト変更は区切り再計算が必要だが、入力中の再描画はフォーカスが飛ぶため保存時/操作時に反映 */ }
function SEL(kind, idx, pre, el){
  sel = { kind, idx, pre, el };
  const lbl = document.getElementById('tt-sel-label');
  if (!lbl) return;
  if (kind === 'row'){
    const r = g().rows[idx];
    lbl.textContent = '選択中: ' + (pre ? (r[pre+'_name'] || '(空欄)') : ('行 ' + (r.door || idx+1)));
  } else {
    lbl.textContent = '選択中: ' + (g().side[idx].name || '(空欄)');
  }
}
function ttColor(tok){
  if (!sel){ alert('名前セルを選択してください'); return; }
  if (sel.kind === 'row' && sel.pre) g().rows[sel.idx][sel.pre+'_color'] = tok;
  else if (sel.kind === 'side') g().side[sel.idx].color = tok;
  else return;
  markDirty(); renderMain(); renderSide();
}
function ttHl(tok){
  if (!sel){ alert('名前セルを選択してください'); return; }
  if (sel.kind === 'row' && sel.pre) g().rows[sel.idx][sel.pre+'_hl'] = tok;
  else if (sel.kind === 'side') g().side[sel.idx].hl = tok;
  else return;
  markDirty(); renderMain(); renderSide();
}
function ttRowColor(tok){
  if (!sel || sel.kind !== 'row'){ alert('本表の行のセルを選択してください'); return; }
  g().rows[sel.idx].row_color = tok;
  markDirty(); renderMain();
}

// ===== 行操作 =====
function emptyRow(shift){
  return { shift: shift || '', door: '', row_color: '',
    p1_letter:'', p1_name:'', p1_badge:'', p1_color:'', p1_hl:'',
    p2_letter:'', p2_name:'', p2_badge:'', p2_color:'', p2_hl:'',
    r_letter:'', r_name:'', r_badge:'', r_color:'', r_hl:'' };
}
function ttMove(i, d){
  const rows = g().rows;
  const j = i + d;
  if (j < 0 || j >= rows.length) return;
  [rows[i], rows[j]] = [rows[j], rows[i]];
  markDirty(); renderMain();
}
function ttInsert(i){
  const rows = g().rows;
  rows.splice(i + 1, 0, emptyRow(rows[i] ? rows[i].shift : ''));
  markDirty(); renderMain();
}
function ttAddRow(){
  const rows = g().rows;
  rows.push(emptyRow(rows.length ? rows[rows.length-1].shift : 'H'));
  markDirty(); renderMain();
}
function ttDelete(i){
  const r = g().rows[i];
  const label = [r.door, r.p1_name, r.p2_name].filter(Boolean).join(' / ');
  if (!confirm('この行を削除しますか？' + (label ? '\\n' + label : ''))) return;
  g().rows.splice(i, 1);
  markDirty(); renderMain();
}

// ===== 付帯リスト操作 =====
function ttSideAdd(sec){
  const side = g().side;
  // 同セクションの末尾に挿入
  let last = -1;
  side.forEach((s, i) => { if (s.section === sec) last = i; });
  const row = { section: sec, col1:'', col2:'', name:'', badge:'', color:'', hl:'' };
  if (last === -1) side.push(row); else side.splice(last + 1, 0, row);
  markDirty(); renderSide();
}
function ttSideMove(i, d){
  const side = g().side;
  const j = i + d;
  if (j < 0 || j >= side.length) return;
  if (side[i].section !== side[j].section) return;  // 並べ替えは同一セクション内のみ
  [side[i], side[j]] = [side[j], side[i]];
  markDirty(); renderSide();
}
function ttSideDelete(i){
  const s = g().side[i];
  if (!confirm('「' + (s.name || '空欄') + '」を削除しますか？')) return;
  g().side.splice(i, 1);
  markDirty(); renderSide();
}
function ttRenameSection(oldName, newName){
  newName = (newName || '').trim();
  if (!newName){ renderSide(); return; }
  g().side.forEach(s => { if (s.section === oldName) s.section = newName; });
  markDirty(); renderSide();
}
function ttAddSection(){
  const name = prompt('セクション名（例: スペア）');
  if (!name || !name.trim()) return;
  g().side.push({ section: name.trim(), col1:'', col2:'', name:'', badge:'', color:'', hl:'' });
  markDirty(); renderSide();
}

// ===== 保存・班管理 =====
async function ttSave(){
  const gr = g();
  gr.month_label = document.getElementById('tt-month').value.trim();
  gr.note = document.getElementById('tt-note').value.trim();
  const res = await fetch(API + '/groups/' + gr.id + '/save', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: gr.name, month_label: gr.month_label, note: gr.note, rows: gr.rows, side: gr.side }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok){ alert(data.error || '保存に失敗しました'); return; }
  dirty = false;
  document.getElementById('tt-dirty').style.display = 'none';
  orig = JSON.parse(JSON.stringify(groups));
  renderMain(); // シフト区切り・3台廻りブロックを再計算して表示を揃える
  renderTabs();
}
async function ttAddGroup(){
  const name = prompt('班名（例: 1班）');
  if (!name || !name.trim()) return;
  const res = await fetch(API + '/groups', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name.trim() }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok){ alert(data.error || '追加に失敗しました'); return; }
  location.reload();
}
function ttRenameGroup(){
  const name = prompt('班名', g().name);
  if (!name || !name.trim()) return;
  g().name = name.trim();
  markDirty(); renderTabs();
}
async function ttDeleteGroup(){
  const gr = g();
  if (!confirm('「' + gr.name + '」を表ごと削除します。よろしいですか？')) return;
  if (!confirm('本当に削除しますか？（元に戻せません）')) return;
  const res = await fetch(API + '/groups/' + gr.id, { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok){ alert(data.error || '削除に失敗しました'); return; }
  dirty = false;
  location.reload();
}
function ttPrint(){
  window.open(PRINT_URL + '?group=' + g().id, '_blank');
}
async function ttLogs(){
  const res = await fetch(API + '/logs');
  const data = await res.json().catch(() => ({ logs: [] }));
  const rows = (data.logs || []).map(l =>
    '<tr><td style="white-space:nowrap;color:#6b7280;">' + esc(l.created_at) + '</td><td>' + esc(l.admin_name) + '</td><td>' + esc(l.target) + '</td><td>' + esc(l.detail || '') + '</td></tr>'
  ).join('');
  document.getElementById('tt-modal').innerHTML =
    '<div style="font-weight:700;margin-bottom:10px;">編集履歴</div>' +
    '<table style="border-collapse:collapse;width:100%;font-size:12px;">' +
    '<tr style="color:#6b7280;text-align:left;"><th style="padding:3px 6px;">日時</th><th>操作者</th><th>対象</th><th>内容</th></tr>' +
    (rows || '<tr><td colspan="4" style="padding:8px;color:#9ca3af;">履歴はまだありません</td></tr>') +
    '</table>';
  document.getElementById('tt-modal-bg').style.display = 'block';
}

renderAll();
</script>`;
}

// ===== 印刷ページ（紙の再現・静的） =====
export function tantoshaPrintPage(group: TantoshaGroupData): string {
  const meta = chunkRows(group.rows);
  const today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' });

  const cellSt = (color: string, hl: string, rowColor: string): string => {
    let s = `color:${rowColor === 'blue' ? '#fff' : (TEXT_COLORS[color] ?? TEXT_COLORS[''])};`;
    const bg = HL_COLORS[hl] ?? '';
    if (bg) s += `background:${bg};`;
    else if (rowColor && ROW_COLORS[rowColor]) s += `background:${ROW_COLORS[rowColor]};`;
    if (hl === 'red') s += 'color:#fff;';
    return s;
  };

  let body = '';
  for (let i = 0; i < group.rows.length; i++) {
    const r = group.rows[i];
    const secCls = meta[i].sectionStart ? 'ss' : (meta[i].chunkStart ? 'cs' : '');
    body += '<tr>';
    // シフトはセクション先頭のみ表示（縦結合風）
    if (meta[i].sectionStart) {
      let len = 1;
      for (let j = i + 1; j < group.rows.length && group.rows[j].shift === r.shift; j++) len++;
      body += `<td class="shift ss" rowspan="${len}">${escHtml(r.shift)}</td>`;
    }
    const doorSt = r.row_color === 'blue' ? 'background:#2563eb;color:#fff;' : `background:${DOOR_BG};`;
    body += `<td class="door ${secCls}" style="${doorSt}">${escHtml(r.door)}</td>`;
    body += `<td class="lt ${secCls}">${escHtml(r.p1_letter)}</td>`;
    body += `<td class="nm ${secCls}" style="${cellSt(r.p1_color, r.p1_hl, r.row_color)}">${escHtml(r.p1_name)}${circled(r.p1_badge)}</td>`;
    body += `<td class="lt ${secCls}">${escHtml(r.p2_letter)}</td>`;
    body += `<td class="nm ${secCls}" style="${cellSt(r.p2_color, r.p2_hl, r.row_color)}">${escHtml(r.p2_name)}${circled(r.p2_badge)}</td>`;
    if (meta[i].chunkStart) {
      body += `<td class="lt rot ${secCls}" rowspan="${meta[i].chunkLen}">${escHtml(r.r_letter)}</td>`;
      body += `<td class="nm rot ${secCls}" rowspan="${meta[i].chunkLen}" style="${cellSt(r.r_color, r.r_hl, '')}">${escHtml(r.r_name)}${circled(r.r_badge)}</td>`;
    }
    body += '</tr>';
  }

  // 付帯リスト
  const secs: string[] = [];
  const bySec: Record<string, TantoshaSide[]> = {};
  for (const s of group.side) {
    if (!bySec[s.section]) { bySec[s.section] = []; secs.push(s.section); }
    bySec[s.section].push(s);
  }
  const sideHtml = secs.map(sec => `
    <div class="side-sec">
      <div class="side-head">${escHtml(sec)}</div>
      <table class="side-tbl">
        ${bySec[sec].map(s => `<tr>
          <td class="c1">${escHtml(s.col1)}</td>
          <td class="c2">${escHtml(s.col2)}</td>
          <td class="snm" style="${cellSt(s.color, s.hl, '')}">${escHtml(s.name)}${circled(s.badge)}</td>
        </tr>`).join('')}
      </table>
    </div>`).join('');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="robots" content="noindex, nofollow">
<title>${escHtml(group.name)}担当者一覧表${group.month_label ? `（${escHtml(group.month_label)}）` : ''}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Hiragino Sans', 'Meiryo', sans-serif; margin: 20px; color: #111; }
  .head { display: flex; justify-content: space-between; align-items: baseline; max-width: 1000px; }
  .title { font-size: 20px; font-weight: 700; }
  .date { font-size: 12px; }
  .wrap { display: flex; gap: 24px; align-items: flex-start; margin-top: 10px; }
  table.main { border-collapse: collapse; font-size: 12px; }
  table.main th, table.main td { border: 1px solid #444; padding: 2px 4px; height: 22px; }
  table.main th { font-weight: 600; }
  td.ss { border-top: 3px solid #000; }
  td.cs { border-top: 2px solid #000; }
  td.shift { width: 44px; text-align: center; font-weight: 600; border-top: 3px solid #000; }
  td.door { width: 54px; text-align: center; font-weight: 600; }
  td.lt { width: 24px; text-align: center; }
  td.nm { min-width: 120px; text-align: center; }
  td.rot { vertical-align: middle; }
  .side-sec { border: 1.5px solid #444; margin-bottom: 14px; min-width: 240px; }
  .side-head { text-align: center; font-weight: 700; font-size: 12.5px; padding: 2px; border-bottom: 1px solid #444; }
  table.side-tbl { border-collapse: collapse; width: 100%; font-size: 12px; }
  table.side-tbl td { border: 1px solid #666; padding: 2px 4px; height: 21px; }
  td.c1 { width: 28px; text-align: center; }
  td.c2 { width: 40px; text-align: center; }
  td.snm { text-align: center; }
  .note { margin-top: 8px; font-size: 12px; }
  @media print {
    body { margin: 8mm; }
    .noprint { display: none; }
  }
</style>
</head>
<body>
  <div class="head">
    <div class="title">${escHtml(group.name)}担当者一覧表${group.month_label ? `（${escHtml(group.month_label)}）` : ''}</div>
    <div class="date">${escHtml(today)}</div>
  </div>
  <div class="wrap">
    <div>
      <table class="main">
        <tr><th>シフト</th><th>ドア</th><th colspan="4">担　当　者</th><th colspan="2">3台廻り</th></tr>
        ${body}
      </table>
      ${group.note ? `<div class="note">${escHtml(group.note)}</div>` : ''}
    </div>
    <div>${sideHtml}</div>
  </div>
  <div class="noprint" style="margin-top:16px;">
    <button onclick="window.print()" style="padding:8px 24px;font-size:14px;cursor:pointer;">印刷</button>
  </div>
</body>
</html>`;
}
