// 板橋イベント「当日のご案内」チラシ — パワポ風の自由配置エディタ（1ページ完結のスタンドアロンHTML）
//   ・部品（見出し/文章/画像/QR/宛先/区切り線/囲み枠）をドラッグで移動、角つかみで拡大縮小。
//   ・右パネルで文字サイズ・色・背景・枠線などを編集。前面/背面・複製・削除・元に戻す/やり直し。
//   ・配置はイベントごとに自動保存（PUT /api/study-sessions/:id/guide-layout）。
//   ・「テンプレートとして保存」で名前付き雛形を作り、他イベントで読み込める。
//   ・印刷は「宛先なし（告知用）」か「参加者を選ぶ」。選ぶと選んだ人数分、宛先ブロックを
//     「◯課◯班 氏名 様」に差し替えて1人1ページで連続印刷する。
// データは読み込み時に GET /api/study-sessions/:id/guide-data から取得する（このHTMLには埋め込まない）。
import { escHtml } from './layout';

export function renderGuideEditor(opts: {
  adminPath: string;
  sessionId: number;
  title: string;
  editable: boolean;
}): string {
  const cfg = JSON.stringify({ adminPath: opts.adminPath, sessionId: opts.sessionId, editable: opts.editable });
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>当日のご案内 - ${escHtml(opts.title)}</title>
<style id="page-size-rule">@page { size: A4 portrait; margin: 0; }</style>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; height: 100%; background: #eef1f5; font-family: 'Hiragino Sans', 'Meiryo', sans-serif; color: #1f2937; }
  button { font-family: inherit; }

  .app { display: flex; flex-direction: column; height: 100vh; }

  /* ===== 上部ツールバー ===== */
  .topbar { flex: 0 0 auto; background: #fff; border-bottom: 1px solid #e2e6ec; padding: 8px 12px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .topbar .group { display: flex; gap: 6px; align-items: center; padding-right: 10px; border-right: 1px solid #eceff3; }
  .topbar .group:last-child { border-right: none; }
  .topbar label { font-size: 12px; color: #6b7280; display: flex; align-items: center; gap: 5px; }
  .topbar select, .topbar input[type=text] { font-size: 13px; padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 6px; }
  .btn { padding: 7px 12px; background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 6px; font-size: 12.5px; cursor: pointer; color: #374151; }
  .btn:hover { background: #e9ecf1; }
  .btn.primary { background: #2563eb; border-color: #2563eb; color: #fff; font-weight: 700; }
  .btn.primary:hover { background: #1d4ed8; }
  .btn.add { background: #eef4ff; border-color: #bfd4ff; color: #1e40af; }
  .btn.add:hover { background: #dfe9ff; }
  .save-state { font-size: 11.5px; color: #9ca3af; min-width: 84px; }
  .save-state.dirty { color: #b45309; }
  .save-state.saved { color: #059669; }

  /* ===== 本体 3カラム ===== */
  .body { flex: 1 1 auto; display: flex; min-height: 0; }
  .canvas-wrap { flex: 1 1 auto; overflow: auto; padding: 28px; display: flex; justify-content: center; align-items: flex-start; }
  .page-scaler { transform-origin: top center; }
  #page { position: relative; background: #fff; box-shadow: 0 6px 30px rgba(15,23,42,0.18); overflow: hidden;
          background-image: linear-gradient(rgba(37,99,235,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(37,99,235,0.06) 1px, transparent 1px);
          background-size: 10mm 10mm; }
  #page.no-grid { background-image: none; }

  .el { position: absolute; overflow: hidden; }
  .el .el-content { width: 100%; height: 100%; padding: 1.5mm 2mm; white-space: pre-wrap; word-break: break-word; overflow: hidden; }
  .el.type-image .el-content, .el.type-qr .el-content { padding: 0; }
  .el.type-image img { width: 100%; height: 100%; object-fit: contain; display: block; }
  .el.type-qr svg { width: 100%; height: 100%; display: block; }
  .el.type-divider .el-content { padding: 0; display: flex; align-items: center; }
  .el.type-divider .rule { width: 100%; }

  .el.selected { outline: 2px solid #2563eb; outline-offset: 0; }
  .el .handle { position: absolute; width: 12px; height: 12px; background: #fff; border: 2px solid #2563eb; border-radius: 50%; z-index: 9999; }
  .el .handle.nw { left: -7px; top: -7px; cursor: nwse-resize; }
  .el .handle.ne { right: -7px; top: -7px; cursor: nesw-resize; }
  .el .handle.sw { left: -7px; bottom: -7px; cursor: nesw-resize; }
  .el .handle.se { right: -7px; bottom: -7px; cursor: nwse-resize; }
  .el.dragging, .el.resizing { opacity: 0.92; }
  .el.role-addressee::before { content: '宛先'; position: absolute; left: 0; top: 0; font-size: 8px; background: #2563eb; color: #fff; padding: 0 4px; border-radius: 0 0 4px 0; z-index: 5; }

  /* ===== 右パネル ===== */
  .side { flex: 0 0 288px; background: #fff; border-left: 1px solid #e2e6ec; overflow-y: auto; padding: 14px; }
  .side h3 { font-size: 12px; color: #6b7280; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 1px; }
  .side .empty { color: #9ca3af; font-size: 13px; padding: 20px 0; text-align: center; }
  .field { margin-bottom: 11px; }
  .field label { display: block; font-size: 11.5px; color: #6b7280; margin-bottom: 4px; }
  .field input[type=text], .field textarea, .field select, .field input[type=number] {
    width: 100%; font-size: 13px; padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 6px; font-family: inherit; }
  .field textarea { min-height: 90px; resize: vertical; }
  .row2 { display: flex; gap: 8px; }
  .row2 .field { flex: 1; }
  .inline { display: flex; gap: 6px; align-items: center; }
  .inline input[type=color] { width: 38px; height: 30px; padding: 0; border: 1px solid #d1d5db; border-radius: 6px; background: #fff; }
  .inline label { margin: 0; font-size: 12px; color: #374151; display: flex; align-items: center; gap: 4px; }
  .chk { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: #374151; }
  .grp { display: none; border-top: 1px dashed #e5e7eb; padding-top: 10px; margin-top: 10px; }
  .side.has-sel .grp.always, .side.has-sel .grp.show { display: block; }
  .op-btns { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
  .op-btns .btn { flex: 1 1 auto; text-align: center; }

  /* ===== 印刷 ===== */
  #print-root { display: none; }
  .print-page { position: relative; overflow: hidden; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .print-page.paper-a4p { width: 210mm; height: 297mm; }
  .print-page.paper-a4l { width: 297mm; height: 210mm; }
  .print-page.paper-a3p { width: 297mm; height: 420mm; }
  .print-page .el { position: absolute; overflow: hidden; }
  .print-page .el .el-content { width: 100%; height: 100%; padding: 1.5mm 2mm; white-space: pre-wrap; word-break: break-word; }
  .print-page .el.type-image .el-content, .print-page .el.type-qr .el-content { padding: 0; }
  .print-page .el.type-image img { width: 100%; height: 100%; object-fit: contain; display: block; }
  .print-page .el.type-qr svg { width: 100%; height: 100%; display: block; }
  .print-page .el.type-divider .el-content { padding: 0; display: flex; align-items: center; }

  body.printing .app { display: none; }
  body.printing #print-root { display: block; }
  @media print {
    html, body { background: #fff; }
    .app { display: none !important; }
    #print-root { display: block !important; }
    .print-page { page-break-after: always; box-shadow: none; }
    .print-page:last-child { page-break-after: auto; }
  }

  /* ===== 印刷ダイアログ ===== */
  .modal-back { position: fixed; inset: 0; background: rgba(15,23,42,0.4); display: none; align-items: center; justify-content: center; z-index: 1000; }
  .modal-back.open { display: flex; }
  .modal { background: #fff; border-radius: 12px; padding: 20px; width: 440px; max-width: 92vw; max-height: 86vh; overflow-y: auto; }
  .modal h2 { font-size: 15px; margin: 0 0 12px; color: #1e3a5f; }
  .modal .plist { border: 1px solid #e5e7eb; border-radius: 8px; max-height: 300px; overflow-y: auto; padding: 4px; margin: 8px 0; }
  .modal .prow { display: flex; align-items: center; gap: 8px; padding: 6px 8px; font-size: 13px; border-bottom: 1px solid #f3f4f6; }
  .modal .prow:last-child { border-bottom: none; }
  .modal .slot-h { font-size: 11px; color: #9ca3af; padding: 8px 8px 2px; }
  .modal .actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
  .disabled-note { font-size: 12px; color: #b45309; margin: 6px 0; }
</style>
</head>
<body>
<div class="app">
  <div class="topbar">
    <div class="group">
      <strong style="font-size:13px;color:#1e3a5f;">当日のご案内</strong>
      <span class="save-state" id="save-state">読み込み中…</span>
    </div>
    <div class="group" id="add-group">
      <span style="font-size:11.5px;color:#9ca3af;">部品を追加：</span>
      <button class="btn add" data-add="heading">見出し</button>
      <button class="btn add" data-add="text">文章</button>
      <button class="btn add" data-add="image">画像</button>
      <button class="btn add" data-add="qr">QR</button>
      <button class="btn add" data-add="addressee">宛先</button>
      <button class="btn add" data-add="divider">区切り線</button>
      <button class="btn add" data-add="box">囲み枠</button>
    </div>
    <div class="group">
      <button class="btn" id="undo-btn" title="元に戻す">元に戻す</button>
      <button class="btn" id="redo-btn" title="やり直し">やり直し</button>
    </div>
    <div class="group">
      <label>用紙
        <select id="paper-sel">
          <option value="a4p">A4 縦</option>
          <option value="a4l">A4 横</option>
          <option value="a3p">A3 縦</option>
        </select>
      </label>
      <label class="chk"><input type="checkbox" id="grid-chk" checked> 方眼</label>
    </div>
    <div class="group">
      <button class="btn" id="tpl-load-btn">テンプレートから読み込み</button>
      <button class="btn" id="tpl-save-btn">テンプレートとして保存</button>
    </div>
    <div class="group">
      <button class="btn" id="save-btn">保存</button>
      <button class="btn primary" id="print-btn">印刷</button>
    </div>
  </div>

  <div class="body">
    <div class="canvas-wrap" id="canvas-wrap">
      <div class="page-scaler" id="page-scaler">
        <div id="page"></div>
      </div>
    </div>
    <div class="side" id="side">
      <div class="empty" id="side-empty">部品をクリックすると<br>ここで編集できます</div>
      <div id="side-fields" style="display:none;">
        <h3 id="sel-type-label">部品</h3>
        <div class="grp always" style="display:block;">
          <div class="row2">
            <div class="field"><label>X (mm)</label><input type="number" step="1" id="p-x"></div>
            <div class="field"><label>Y (mm)</label><input type="number" step="1" id="p-y"></div>
          </div>
          <div class="row2">
            <div class="field"><label>幅 (mm)</label><input type="number" step="1" id="p-w"></div>
            <div class="field"><label>高さ (mm)</label><input type="number" step="1" id="p-h"></div>
          </div>
        </div>

        <div class="grp show" data-for="text heading addressee">
          <div class="field"><label>テキスト</label><textarea id="p-text"></textarea></div>
          <div class="row2">
            <div class="field"><label>文字サイズ (pt)</label><input type="number" step="0.5" id="p-fontsize"></div>
            <div class="field"><label>行間</label><input type="number" step="0.1" id="p-lineheight"></div>
          </div>
          <div class="field"><label>配置</label>
            <select id="p-align"><option value="left">左</option><option value="center">中央</option><option value="right">右</option></select>
          </div>
          <div class="field inline">
            <label><input type="checkbox" id="p-bold"> 太字</label>
            <label><input type="checkbox" id="p-italic"> 斜体</label>
          </div>
          <div class="field inline">
            <input type="color" id="p-color"><label>文字色</label>
          </div>
          <div class="field inline">
            <input type="color" id="p-bg"><label><input type="checkbox" id="p-bg-on"> 背景色</label>
          </div>
        </div>

        <div class="grp show" data-for="image">
          <div class="field"><label>画像</label><input type="file" id="p-image-file" accept="image/*"></div>
          <div class="field"><label>角丸 (mm)</label><input type="number" step="0.5" id="p-radius-img"></div>
        </div>

        <div class="grp show" data-for="qr">
          <div class="disabled-note">申し込みページのQRです（内容は固定）</div>
          <div class="field inline"><input type="color" id="p-bg-qr"><label>背景色</label></div>
        </div>

        <div class="grp show" data-for="divider">
          <div class="field inline"><input type="color" id="p-rule-color"><label>線の色</label></div>
          <div class="field"><label>線の太さ (px)</label><input type="number" step="1" id="p-rule-width"></div>
        </div>

        <div class="grp show" data-for="box">
          <div class="field inline"><input type="color" id="p-box-bg"><label><input type="checkbox" id="p-box-bg-on"> 背景色</label></div>
          <div class="field"><label>角丸 (mm)</label><input type="number" step="0.5" id="p-radius-box"></div>
        </div>

        <div class="grp show" data-for="text heading addressee box image">
          <div class="field inline"><input type="color" id="p-border-color"><label><input type="checkbox" id="p-border-on"> 枠線</label></div>
          <div class="field"><label>枠線の太さ (px)</label><input type="number" step="1" id="p-border-width"></div>
        </div>

        <div class="grp always" style="display:block;">
          <div class="op-btns">
            <button class="btn" id="op-front">前面へ</button>
            <button class="btn" id="op-back">背面へ</button>
            <button class="btn" id="op-dup">複製</button>
            <button class="btn" id="op-del" style="color:#dc2626;border-color:#fca5a5;background:#fef2f2;">削除</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<div id="print-root"></div>

<div class="modal-back" id="print-modal">
  <div class="modal">
    <h2>印刷</h2>
    <div class="field">
      <label class="chk"><input type="radio" name="addr-mode" value="none" checked> 宛先なし（告知・一斉配布用）</label>
    </div>
    <div class="field">
      <label class="chk"><input type="radio" name="addr-mode" value="each"> 参加者を選ぶ（選んだ人数分、宛先入りで1人1ページ）</label>
    </div>
    <div id="p-select-wrap" style="display:none;">
      <div class="inline" style="margin-bottom:6px;">
        <button class="btn" id="pk-all">全員選択</button>
        <button class="btn" id="pk-none">全解除</button>
      </div>
      <div class="plist" id="pk-list"></div>
    </div>
    <div class="actions">
      <button class="btn" id="print-cancel">キャンセル</button>
      <button class="btn primary" id="print-go">印刷する</button>
    </div>
    <div style="font-size:11px;color:#9ca3af;margin-top:8px;">※印刷ダイアログで用紙サイズを合わせ、「背景のグラフィック」を有効にしてください</div>
  </div>
</div>

<div class="modal-back" id="tpl-modal">
  <div class="modal">
    <h2>テンプレートから読み込み</h2>
    <div style="font-size:12px;color:#6b7280;margin-bottom:8px;">選ぶと、いまの配置がテンプレートの内容に置き換わります。</div>
    <div class="plist" id="tpl-list"></div>
    <div class="actions"><button class="btn" id="tpl-cancel">閉じる</button></div>
  </div>
</div>

<script>
var GUIDE = ${cfg};
(function () {
  "use strict";
  var API = GUIDE.adminPath + "/api/study-sessions/" + GUIDE.sessionId;
  var TPL_API = GUIDE.adminPath + "/api/study-sessions/guide-templates";
  var PAPER = { a4p: { w: 210, h: 297 }, a4l: { w: 297, h: 210 }, a3p: { w: 297, h: 420 } };
  var PAGE_RULE = { a4p: "A4 portrait", a4l: "A4 landscape", a3p: "A3 portrait" };
  var MAX_JSON = 1600000; // 保存できる layout_json の目安（画像込み・約1.6MB）

  var DATA = null;
  var model = { paper: "a4p", elements: [] };
  var selectedId = null;
  var undoStack = [], redoStack = [];
  var saveTimer = null;
  var uid = 1;

  var pageEl = document.getElementById("page");
  var scalerEl = document.getElementById("page-scaler");
  var sideEl = document.getElementById("side");
  var saveState = document.getElementById("save-state");

  function escH(s) { return (s == null ? "" : String(s)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function clampNum(v, lo, hi) { v = Number(v); if (!isFinite(v)) v = lo; return Math.max(lo, Math.min(hi, v)); }
  function round1(v) { return Math.round(v * 2) / 2; }
  function newId() { return "e" + (uid++) + "_" + Math.random().toString(36).slice(2, 6); }
  function serialize() { return JSON.stringify({ paper: model.paper, elements: model.elements }); }

  // ---------- 起動 ----------
  fetch(API + "/guide-data").then(function (r) { return r.json(); }).then(function (d) {
    DATA = d;
    var saved = d.saved;
    var parsed = null;
    if (saved && saved.layout_json) { try { parsed = JSON.parse(saved.layout_json); } catch (e) { parsed = null; } }
    if (parsed && parsed.elements && parsed.elements.length) {
      model.paper = PAPER[parsed.paper] ? parsed.paper : (saved.paper || "a4p");
      model.elements = parsed.elements;
      normalizeIds();
      markSaved();
    } else {
      model.elements = buildStarter(d);
      model.paper = "a4p";
      markDirty();
      scheduleSave();
    }
    document.getElementById("paper-sel").value = model.paper;
    renderAll();
    fitScale();
    buildParticipantPicker(d.participants || []);
    if (!GUIDE.editable) lockUi();
  }).catch(function () { saveState.textContent = "読み込みに失敗しました"; });

  function normalizeIds() {
    model.elements.forEach(function (el) {
      if (!el.id) el.id = newId();
      if (typeof el.z !== "number") el.z = 1;
    });
  }
  function lockUi() {
    document.querySelectorAll(".btn.add, #save-btn, #tpl-save-btn, #undo-btn, #redo-btn, #paper-sel").forEach(function (b) { b.disabled = true; });
    saveState.textContent = "閲覧のみ（編集権限なし）";
  }

  // ---------- 初期下書き ----------
  function el(type, x, y, w, h, extra) {
    var base = { id: newId(), type: type, x: x, y: y, w: w, h: h, z: 1,
      text: "", fontSize: 11, lineHeight: 1.7, align: "left", bold: false, italic: false,
      color: "#1f2937", bg: "", borderColor: "#1e3a5f", borderWidth: 0, radius: 0,
      ruleColor: "#1e3a5f", ruleWidth: 2, src: "" };
    if (extra) for (var k in extra) base[k] = extra[k];
    return base;
  }
  function buildStarter(d) {
    var s = d.session || {};
    var out = [];
    var LEFT = 15, WIDE = 180;
    var y = 13;
    out.push(el("addressee", LEFT, y, WIDE, 9, { text: "参加者 各位", fontSize: 12, role: "addressee" }));
    y += 13;
    out.push(el("heading", LEFT, y, WIDE, 16, { text: "「" + (s.title || "イベント") + "」のご案内", fontSize: 22, bold: true, align: "center", color: "#1e3a5f" }));
    y += 21;
    out.push(el("text", LEFT, y, WIDE, 11, { text: "下記のとおり開催いたします。ぜひご参加ください。", fontSize: 10.5 }));
    y += 14;

    var infoLines = [];
    infoLines.push("日　時：　" + (s.dateLabel || "") + (d.slotLine ? ("　" + d.slotLine) : ""));
    infoLines.push("集合場所：　" + (s.location || "別途ご案内"));
    if (s.contact_name) infoLines.push("担　当：　" + s.contact_name);
    if (s.target_audience) infoLines.push("対　象：　" + s.target_audience);
    var infoH = infoLines.length * 8 + 6;
    out.push(el("text", LEFT, y, WIDE, infoH, { text: infoLines.join("\\n"), fontSize: 11.5, lineHeight: 1.9, bg: "#f4f7fb", borderColor: "#1e3a5f", borderWidth: 1 }));
    y += infoH + 7;

    if (s.note) {
      out.push(el("heading", LEFT, y, WIDE, 8, { text: "募集内容", fontSize: 13, bold: true, color: "#1e3a5f" }));
      y += 10;
      var noteH = Math.min(46, Math.max(14, String(s.note).split("\\n").length * 7 + 6));
      out.push(el("text", LEFT, y, WIDE, noteH, { text: s.note, fontSize: 10.5, lineHeight: 1.8 }));
      y += noteH + 7;
    }

    out.push(el("heading", LEFT, y, WIDE, 8, { text: "当日について", fontSize: 13, bold: true, color: "#1e3a5f" }));
    y += 10;
    out.push(el("text", LEFT, y, WIDE, 42, { text: "集合時間：\\n集合場所：\\n持ち物：\\n当日の流れ：\\n問い合わせ先：", fontSize: 11, lineHeight: 2.1, borderColor: "#cbd5e1", borderWidth: 1 }));
    y += 48;

    var others = d.otherEvents || [];
    if (others.length) {
      out.push(el("heading", LEFT, y, 120, 8, { text: "ほかにも開催予定のイベントがあります", fontSize: 12, bold: true, color: "#1e3a5f" }));
      y += 10;
      var lines = others.map(function (o) { return "・" + o.title + "（" + o.dateLabel + "）"; });
      out.push(el("text", LEFT, y, 120, lines.length * 7 + 6, { text: lines.join("\\n"), fontSize: 10, lineHeight: 1.7 }));
    }

    var ph = PAPER.a4p.h;
    out.push(el("qr", 150, ph - 15 - 42, 42, 42, {}));
    out.push(el("text", 143, ph - 15 - 42 - 8, 56, 7, { text: "申し込みはこちら", fontSize: 9, align: "center", color: "#6b7280" }));

    var z = 1;
    out.forEach(function (e) { e.z = z++; });
    return out;
  }

  // ---------- 描画 ----------
  function renderAll() {
    var p = PAPER[model.paper];
    pageEl.style.width = p.w + "mm";
    pageEl.style.height = p.h + "mm";
    pageEl.innerHTML = "";
    model.elements.slice().sort(function (a, b) { return (a.z || 0) - (b.z || 0); }).forEach(function (e) {
      pageEl.appendChild(buildEditNode(e));
    });
    updateSide();
    document.getElementById("page-size-rule").textContent = "@page { size: " + PAGE_RULE[model.paper] + "; margin: 0; }";
    document.getElementById("undo-btn").disabled = !GUIDE.editable || undoStack.length === 0;
    document.getElementById("redo-btn").disabled = !GUIDE.editable || redoStack.length === 0;
  }

  function contentHtml(e) {
    if (e.type === "image") {
      return e.src ? ("<img src=\\"" + e.src + "\\" alt=\\"\\">") : "<div style=\\"width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:11px;background:#f3f4f6;\\">画像を選択</div>";
    }
    if (e.type === "qr") {
      return (DATA && DATA.qrSvg) ? DATA.qrSvg : "<div style=\\"color:#9ca3af;font-size:10px;\\">QR</div>";
    }
    if (e.type === "divider") {
      return "<div class=\\"rule\\" style=\\"width:100%;border-top:" + (e.ruleWidth || 2) + "px solid " + (e.ruleColor || "#1e3a5f") + ";\\"></div>";
    }
    return escH(e.text).replace(/\\n/g, "<br>");
  }

  function applyElStyle(node, e) {
    node.style.left = e.x + "mm";
    node.style.top = e.y + "mm";
    node.style.width = e.w + "mm";
    node.style.height = e.h + "mm";
    node.style.zIndex = String(e.z || 1);
    var c = node.querySelector(".el-content");
    if (!c) return;
    c.style.fontSize = (e.fontSize || 11) + "pt";
    c.style.lineHeight = String(e.lineHeight || 1.7);
    c.style.textAlign = e.align || "left";
    c.style.fontWeight = e.bold ? "700" : "400";
    c.style.fontStyle = e.italic ? "italic" : "normal";
    c.style.color = e.color || "#1f2937";
    if (e.type === "box") {
      c.style.background = e.bg || "transparent";
    } else if (e.type === "image" || e.type === "qr" || e.type === "divider") {
      c.style.background = e.bg || "transparent";
    } else {
      c.style.background = e.bg || "transparent";
    }
    var bw = e.borderWidth || 0;
    c.style.border = bw > 0 ? (bw + "px solid " + (e.borderColor || "#1e3a5f")) : "none";
    var rad = (e.radius || 0);
    c.style.borderRadius = rad > 0 ? (rad + "mm") : "0";
    if (e.type === "image") { var img = c.querySelector("img"); if (img) img.style.borderRadius = rad > 0 ? (rad + "mm") : "0"; }
  }

  function buildEditNode(e) {
    var node = document.createElement("div");
    node.className = "el type-" + e.type + (e.role === "addressee" ? " role-addressee" : "") + (e.id === selectedId ? " selected" : "");
    node.setAttribute("data-id", e.id);
    var c = document.createElement("div");
    c.className = "el-content";
    c.innerHTML = contentHtml(e);
    node.appendChild(c);
    applyElStyle(node, e);
    if (e.id === selectedId && GUIDE.editable) {
      ["nw", "ne", "sw", "se"].forEach(function (pos) {
        var h = document.createElement("div");
        h.className = "handle " + pos;
        h.setAttribute("data-handle", pos);
        node.appendChild(h);
      });
    }
    if (GUIDE.editable) {
      node.addEventListener("pointerdown", onElPointerDown);
      c.addEventListener("dblclick", function (ev) {
        ev.stopPropagation();
        if (e.type === "text" || e.type === "heading" || e.type === "addressee") startInlineEdit(e, c);
      });
    }
    return node;
  }

  function refreshNode(id) {
    var e = getEl(id); if (!e) return;
    var node = pageEl.querySelector('.el[data-id="' + id + '"]');
    if (!node) { renderAll(); return; }
    var c = node.querySelector(".el-content");
    if (c && document.activeElement !== c) c.innerHTML = contentHtml(e);
    applyElStyle(node, e);
  }

  // ---------- 選択・右パネル ----------
  function getEl(id) { for (var i = 0; i < model.elements.length; i++) if (model.elements[i].id === id) return model.elements[i]; return null; }
  function getSel() { return selectedId ? getEl(selectedId) : null; }

  function selectEl(id) {
    selectedId = id;
    pageEl.querySelectorAll(".el").forEach(function (n) { n.classList.toggle("selected", n.getAttribute("data-id") === id); });
    renderAll();
  }
  pageEl.addEventListener("pointerdown", function (ev) {
    if (ev.target === pageEl) { selectedId = null; renderAll(); }
  });

  var TYPE_LABEL = { text: "文章", heading: "見出し", addressee: "宛先ブロック", image: "画像", qr: "申し込みQR", divider: "区切り線", box: "囲み枠" };

  function updateSide() {
    var e = getSel();
    sideEl.classList.toggle("has-sel", !!e);
    document.getElementById("side-empty").style.display = e ? "none" : "block";
    document.getElementById("side-fields").style.display = e ? "block" : "none";
    if (!e) return;
    document.getElementById("sel-type-label").textContent = TYPE_LABEL[e.type] || "部品";
    sideEl.querySelectorAll(".grp.show").forEach(function (g) {
      var forr = (g.getAttribute("data-for") || "").split(" ");
      g.style.display = forr.indexOf(e.type) >= 0 ? "block" : "none";
    });
    setVal("p-x", Math.round(e.x)); setVal("p-y", Math.round(e.y));
    setVal("p-w", Math.round(e.w)); setVal("p-h", Math.round(e.h));
    setVal("p-text", e.text || "");
    setVal("p-fontsize", e.fontSize || 11); setVal("p-lineheight", e.lineHeight || 1.7);
    setVal("p-align", e.align || "left");
    setChk("p-bold", !!e.bold); setChk("p-italic", !!e.italic);
    setVal("p-color", toHex(e.color, "#1f2937"));
    setVal("p-bg", toHex(e.bg, "#f4f7fb")); setChk("p-bg-on", !!e.bg);
    setVal("p-radius-img", e.radius || 0);
    setVal("p-bg-qr", toHex(e.bg, "#ffffff"));
    setVal("p-rule-color", toHex(e.ruleColor, "#1e3a5f")); setVal("p-rule-width", e.ruleWidth || 2);
    setVal("p-box-bg", toHex(e.bg, "#eef4ff")); setChk("p-box-bg-on", !!e.bg);
    setVal("p-radius-box", e.radius || 0);
    setVal("p-border-color", toHex(e.borderColor, "#1e3a5f")); setChk("p-border-on", (e.borderWidth || 0) > 0);
    setVal("p-border-width", e.borderWidth || 1);
  }
  function setVal(id, v) { var n = document.getElementById(id); if (n && n.value !== String(v)) n.value = v; }
  function setChk(id, v) { var n = document.getElementById(id); if (n) n.checked = !!v; }
  function toHex(v, dflt) { if (!v || typeof v !== "string" || v[0] !== "#") return dflt; return v; }

  // 右パネルの入力 → モデルへ反映。
  // 連続入力（文字入力・カラースライダー等）は 700ms 以内なら1回分の「元に戻す」にまとめる。
  var _lastUndoKey = "", _lastUndoAt = 0;
  function bindProp(id, ev, fn) {
    var n = document.getElementById(id); if (!n) return;
    n.addEventListener(ev, function () {
      var e = getSel(); if (!e) return;
      var now = Date.now();
      var key = id + ":" + e.id;
      if (!(ev === "input" && key === _lastUndoKey && (now - _lastUndoAt) < 700)) pushUndo();
      _lastUndoKey = key; _lastUndoAt = now;
      fn(e, n);
      refreshNode(e.id);
      updateSide();
      markDirty(); scheduleSave();
    });
  }
  bindProp("p-x", "change", function (e, n) { e.x = clampNum(n.value, -50, 500); });
  bindProp("p-y", "change", function (e, n) { e.y = clampNum(n.value, -50, 800); });
  bindProp("p-w", "change", function (e, n) { e.w = clampNum(n.value, 5, 500); });
  bindProp("p-h", "change", function (e, n) { e.h = clampNum(n.value, 3, 800); });
  bindProp("p-text", "input", function (e, n) { e.text = n.value; });
  bindProp("p-fontsize", "change", function (e, n) { e.fontSize = clampNum(n.value, 5, 96); });
  bindProp("p-lineheight", "change", function (e, n) { e.lineHeight = clampNum(n.value, 1, 4); });
  bindProp("p-align", "change", function (e, n) { e.align = n.value; });
  bindProp("p-bold", "change", function (e, n) { e.bold = n.checked; });
  bindProp("p-italic", "change", function (e, n) { e.italic = n.checked; });
  bindProp("p-color", "input", function (e, n) { e.color = n.value; });
  bindProp("p-bg", "input", function (e, n) { e.bg = n.value; setChk("p-bg-on", true); });
  bindProp("p-bg-on", "change", function (e, n) { e.bg = n.checked ? (document.getElementById("p-bg").value || "#f4f7fb") : ""; });
  bindProp("p-radius-img", "change", function (e, n) { e.radius = clampNum(n.value, 0, 40); });
  bindProp("p-bg-qr", "input", function (e, n) { e.bg = n.value; });
  bindProp("p-rule-color", "input", function (e, n) { e.ruleColor = n.value; });
  bindProp("p-rule-width", "change", function (e, n) { e.ruleWidth = clampNum(n.value, 1, 20); });
  bindProp("p-box-bg", "input", function (e, n) { e.bg = n.value; setChk("p-box-bg-on", true); });
  bindProp("p-box-bg-on", "change", function (e, n) { e.bg = n.checked ? (document.getElementById("p-box-bg").value || "#eef4ff") : ""; });
  bindProp("p-radius-box", "change", function (e, n) { e.radius = clampNum(n.value, 0, 40); });
  bindProp("p-border-color", "input", function (e, n) { e.borderColor = n.value; setChk("p-border-on", true); if (!(e.borderWidth > 0)) e.borderWidth = 1; });
  bindProp("p-border-on", "change", function (e, n) { e.borderWidth = n.checked ? (clampNum(document.getElementById("p-border-width").value, 1, 20) || 1) : 0; });
  bindProp("p-border-width", "change", function (e, n) { e.borderWidth = clampNum(n.value, 0, 20); });

  document.getElementById("p-image-file").addEventListener("change", function () {
    var f = this.files && this.files[0]; if (!f) return;
    var e = getSel(); if (!e) return;
    loadImageScaled(f, function (dataUrl) {
      pushUndo();
      e.src = dataUrl;
      if (checkSize()) { refreshNode(e.id); markDirty(); scheduleSave(); }
      else { undo(); alert("画像が大きすぎます。もっと小さい画像を使ってください。"); }
    });
    this.value = "";
  });

  // ---------- 操作ボタン ----------
  document.getElementById("op-front").addEventListener("click", function () { var e = getSel(); if (!e) return; pushUndo(); var mx = 0; model.elements.forEach(function (x) { mx = Math.max(mx, x.z || 0); }); e.z = mx + 1; renderAll(); markDirty(); scheduleSave(); });
  document.getElementById("op-back").addEventListener("click", function () { var e = getSel(); if (!e) return; pushUndo(); var mn = 999999; model.elements.forEach(function (x) { mn = Math.min(mn, x.z || 0); }); e.z = mn - 1; renderAll(); markDirty(); scheduleSave(); });
  document.getElementById("op-dup").addEventListener("click", function () { var e = getSel(); if (!e) return; pushUndo(); var copy = JSON.parse(JSON.stringify(e)); copy.id = newId(); copy.x += 5; copy.y += 5; var mx = 0; model.elements.forEach(function (x) { mx = Math.max(mx, x.z || 0); }); copy.z = mx + 1; model.elements.push(copy); selectedId = copy.id; renderAll(); markDirty(); scheduleSave(); });
  document.getElementById("op-del").addEventListener("click", function () { var e = getSel(); if (!e) return; pushUndo(); model.elements = model.elements.filter(function (x) { return x.id !== e.id; }); selectedId = null; renderAll(); markDirty(); scheduleSave(); });

  // ---------- 部品追加 ----------
  document.getElementById("add-group").addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-add]"); if (!b || !GUIDE.editable) return;
    addElement(b.getAttribute("data-add"));
  });
  function addElement(type) {
    pushUndo();
    var p = PAPER[model.paper];
    var mx = 0; model.elements.forEach(function (x) { mx = Math.max(mx, x.z || 0); });
    var e;
    var cx = Math.round(p.w / 2 - 40), cy = Math.round(p.h / 2 - 15);
    if (type === "heading") e = el("heading", cx, cy, 90, 14, { text: "見出し", fontSize: 18, bold: true });
    else if (type === "text") e = el("text", cx, cy, 90, 20, { text: "ここに文章を入力", fontSize: 11 });
    else if (type === "addressee") e = el("addressee", cx, cy, 100, 10, { text: "参加者 各位", fontSize: 12, role: "addressee" });
    else if (type === "image") e = el("image", cx, cy, 50, 40, {});
    else if (type === "qr") e = el("qr", cx, cy, 40, 40, {});
    else if (type === "divider") e = el("divider", cx, cy, 90, 6, { ruleColor: "#1e3a5f", ruleWidth: 2 });
    else if (type === "box") e = el("box", cx, cy, 80, 40, { bg: "#eef4ff", borderColor: "#bfd4ff", borderWidth: 1, radius: 2 });
    else return;
    e.z = mx + 1;
    model.elements.push(e);
    selectedId = e.id;
    renderAll();
    markDirty(); scheduleSave();
    if (type === "image") document.getElementById("p-image-file").click();
  }

  // ---------- ドラッグ / リサイズ ----------
  var drag = null;
  function pxPerMm() { var r = pageEl.getBoundingClientRect(); return r.width / PAPER[model.paper].w; }
  function onElPointerDown(ev) {
    if (ev.button !== 0) return;
    var node = ev.currentTarget;
    var id = node.getAttribute("data-id");
    var e = getEl(id); if (!e) return;
    var handle = ev.target.getAttribute && ev.target.getAttribute("data-handle");
    if (id !== selectedId) selectEl(id);
    ev.preventDefault();
    ev.stopPropagation();
    pushUndo();
    var ppm = pxPerMm();
    drag = { id: id, mode: handle ? "resize" : "move", handle: handle, sx: ev.clientX, sy: ev.clientY,
      ox: e.x, oy: e.y, ow: e.w, oh: e.h, ppm: ppm, moved: false };
    node.classList.add(handle ? "resizing" : "dragging");
    window.addEventListener("pointermove", onDragMove);
    window.addEventListener("pointerup", onDragEnd);
  }
  function onDragMove(ev) {
    if (!drag) return;
    var e = getEl(drag.id); if (!e) return;
    var dxmm = (ev.clientX - drag.sx) / drag.ppm;
    var dymm = (ev.clientY - drag.sy) / drag.ppm;
    if (Math.abs(dxmm) > 0.4 || Math.abs(dymm) > 0.4) drag.moved = true;
    if (drag.mode === "move") {
      e.x = round1(drag.ox + dxmm);
      e.y = round1(drag.oy + dymm);
    } else {
      var h = drag.handle;
      var nx = drag.ox, ny = drag.oy, nw = drag.ow, nh = drag.oh;
      if (h.indexOf("e") >= 0) nw = drag.ow + dxmm;
      if (h.indexOf("s") >= 0) nh = drag.oh + dymm;
      if (h.indexOf("w") >= 0) { nw = drag.ow - dxmm; nx = drag.ox + dxmm; }
      if (h.indexOf("n") >= 0) { nh = drag.oh - dymm; ny = drag.oy + dymm; }
      if (nw < 8) { nw = 8; if (h.indexOf("w") >= 0) nx = drag.ox + drag.ow - 8; }
      if (nh < 5) { nh = 5; if (h.indexOf("n") >= 0) ny = drag.oy + drag.oh - 5; }
      e.x = round1(nx); e.y = round1(ny); e.w = round1(nw); e.h = round1(nh);
    }
    refreshNode(e.id);
    updateSide();
  }
  function onDragEnd() {
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", onDragEnd);
    var node = pageEl.querySelector('.el[data-id="' + (drag ? drag.id : "") + '"]');
    if (node) node.classList.remove("dragging", "resizing");
    if (drag && drag.moved) { markDirty(); scheduleSave(); }
    else { undoStack.pop(); } // 動かなかった：直前の空スナップショットを捨てる
    drag = null;
    renderAll();
  }

  // ---------- インライン文字編集 ----------
  function startInlineEdit(e, c) {
    pushUndo();
    c.setAttribute("contenteditable", "true");
    c.style.cursor = "text";
    c.focus();
    document.execCommand && document.execCommand("selectAll", false, null);
    function finish() {
      c.removeAttribute("contenteditable");
      c.style.cursor = "";
      var txt = c.innerText.replace(/\\u00a0/g, " ");
      if (txt === e.text) { undoStack.pop(); }
      else { e.text = txt; markDirty(); scheduleSave(); }
      refreshNode(e.id); updateSide();
      c.removeEventListener("blur", finish);
    }
    c.addEventListener("blur", finish);
  }

  // ---------- Undo / Redo ----------
  function pushUndo() { undoStack.push(serialize()); if (undoStack.length > 80) undoStack.shift(); redoStack = []; syncUndoBtns(); }
  function undo() {
    if (!undoStack.length) return;
    redoStack.push(serialize());
    var st = JSON.parse(undoStack.pop());
    model.paper = st.paper; model.elements = st.elements;
    document.getElementById("paper-sel").value = model.paper;
    if (!getEl(selectedId)) selectedId = null;
    renderAll(); fitScale(); markDirty(); scheduleSave(); syncUndoBtns();
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push(serialize());
    var st = JSON.parse(redoStack.pop());
    model.paper = st.paper; model.elements = st.elements;
    document.getElementById("paper-sel").value = model.paper;
    if (!getEl(selectedId)) selectedId = null;
    renderAll(); fitScale(); markDirty(); scheduleSave(); syncUndoBtns();
  }
  function syncUndoBtns() {
    document.getElementById("undo-btn").disabled = !GUIDE.editable || undoStack.length === 0;
    document.getElementById("redo-btn").disabled = !GUIDE.editable || redoStack.length === 0;
  }
  document.getElementById("undo-btn").addEventListener("click", undo);
  document.getElementById("redo-btn").addEventListener("click", redo);
  window.addEventListener("keydown", function (ev) {
    if (!GUIDE.editable) return;
    var t = ev.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "z" && !ev.shiftKey) { ev.preventDefault(); undo(); }
    else if ((ev.ctrlKey || ev.metaKey) && (ev.key.toLowerCase() === "y" || (ev.key.toLowerCase() === "z" && ev.shiftKey))) { ev.preventDefault(); redo(); }
    else if ((ev.key === "Delete" || ev.key === "Backspace") && selectedId) { ev.preventDefault(); document.getElementById("op-del").click(); }
    else if (selectedId && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].indexOf(ev.key) >= 0) {
      ev.preventDefault();
      var e = getSel(); if (!e) return;
      pushUndo();
      var step = ev.shiftKey ? 5 : 1;
      if (ev.key === "ArrowUp") e.y = round1(e.y - step);
      if (ev.key === "ArrowDown") e.y = round1(e.y + step);
      if (ev.key === "ArrowLeft") e.x = round1(e.x - step);
      if (ev.key === "ArrowRight") e.x = round1(e.x + step);
      refreshNode(e.id); updateSide(); markDirty(); scheduleSave();
    }
  });

  // ---------- 用紙・方眼・スケール ----------
  document.getElementById("paper-sel").addEventListener("change", function () {
    pushUndo();
    model.paper = this.value;
    renderAll(); fitScale(); markDirty(); scheduleSave();
  });
  document.getElementById("grid-chk").addEventListener("change", function () {
    pageEl.classList.toggle("no-grid", !this.checked);
  });
  function fitScale() {
    var wrap = document.getElementById("canvas-wrap");
    var avail = wrap.clientWidth - 56;
    var pageWpx = PAPER[model.paper].w * (96 / 25.4);
    var scale = Math.min(1.4, Math.max(0.25, avail / pageWpx));
    scalerEl.style.transform = "scale(" + scale + ")";
    scalerEl.style.height = (PAPER[model.paper].h * (96 / 25.4) * scale) + "px";
  }
  window.addEventListener("resize", fitScale);

  // ---------- 保存 ----------
  function markDirty() { saveState.textContent = "未保存"; saveState.className = "save-state dirty"; }
  function markSaved() { saveState.textContent = "保存済み"; saveState.className = "save-state saved"; }
  function checkSize() { return serialize().length <= MAX_JSON; }
  function scheduleSave() {
    if (!GUIDE.editable) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(doSave, 1400);
  }
  function doSave() {
    if (!GUIDE.editable) return;
    if (!checkSize()) { saveState.textContent = "画像が大きすぎて保存できません"; saveState.className = "save-state dirty"; return; }
    saveState.textContent = "保存中…"; saveState.className = "save-state";
    fetch(API + "/guide-layout", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paper: model.paper, layout_json: serialize() })
    }).then(function (r) {
      if (r.ok) markSaved();
      else { saveState.textContent = "保存に失敗しました"; saveState.className = "save-state dirty"; }
    }).catch(function () { saveState.textContent = "保存に失敗しました"; saveState.className = "save-state dirty"; });
  }
  document.getElementById("save-btn").addEventListener("click", function () { clearTimeout(saveTimer); doSave(); });
  window.addEventListener("beforeunload", function (ev) {
    if (saveState.classList.contains("dirty")) { ev.preventDefault(); ev.returnValue = ""; }
  });

  // ---------- 画像の縮小 ----------
  function loadImageScaled(file, cb) {
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var maxDim = 1200;
        var w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w >= h) { h = Math.round(h * maxDim / w); w = maxDim; }
          else { w = Math.round(w * maxDim / h); h = maxDim; }
        }
        var cv = document.createElement("canvas");
        cv.width = w; cv.height = h;
        cv.getContext("2d").drawImage(img, 0, 0, w, h);
        var out;
        try { out = cv.toDataURL("image/jpeg", 0.82); } catch (e) { out = reader.result; }
        cb(out);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  // ---------- テンプレート ----------
  var tplModal = document.getElementById("tpl-modal");
  document.getElementById("tpl-save-btn").addEventListener("click", function () {
    if (!GUIDE.editable) return;
    var name = prompt("テンプレート名を入力してください（例：勉強会 標準）");
    if (!name) return;
    if (!checkSize()) { alert("画像が大きすぎてテンプレートに保存できません。"); return; }
    fetch(TPL_API, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name, paper: model.paper, layout_json: serialize() })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.ok) alert("テンプレート「" + name + "」を保存しました。");
      else alert((d && d.error) || "保存に失敗しました");
    });
  });
  document.getElementById("tpl-load-btn").addEventListener("click", function () {
    fetch(TPL_API).then(function (r) { return r.json(); }).then(function (d) {
      var list = (d && d.templates) || [];
      var box = document.getElementById("tpl-list");
      if (!list.length) { box.innerHTML = "<div style=\\"padding:14px;color:#9ca3af;font-size:13px;\\">保存済みのテンプレートはありません</div>"; }
      else {
        box.innerHTML = list.map(function (t) {
          return "<div class=\\"prow\\"><div style=\\"flex:1;\\"><b>" + escH(t.name) + "</b> <span style=\\"color:#9ca3af;font-size:11px;\\">" + escH(t.paper) + " ・ " + escH(t.created_at || "") + "</span></div>"
            + "<button class=\\"btn\\" data-tpl-apply=\\"" + t.id + "\\">この配置にする</button>"
            + (GUIDE.editable ? "<button class=\\"btn\\" data-tpl-del=\\"" + t.id + "\\" style=\\"color:#dc2626;border-color:#fca5a5;background:#fef2f2;\\">削除</button>" : "")
            + "</div>";
        }).join("");
      }
      tplModal.classList.add("open");
    });
  });
  document.getElementById("tpl-cancel").addEventListener("click", function () { tplModal.classList.remove("open"); });
  tplModal.addEventListener("click", function (ev) {
    if (ev.target === tplModal) { tplModal.classList.remove("open"); return; }
    var ap = ev.target.getAttribute("data-tpl-apply");
    var dl = ev.target.getAttribute("data-tpl-del");
    if (ap) {
      if (!confirm("いまの配置を、このテンプレートの内容に置き換えます。よろしいですか？")) return;
      fetch(TPL_API + "/" + ap).then(function (r) { return r.json(); }).then(function (d) {
        if (!d || !d.template) { alert("読み込みに失敗しました"); return; }
        var st = null; try { st = JSON.parse(d.template.layout_json); } catch (e) {}
        if (!st || !st.elements) { alert("テンプレートの内容が壊れています"); return; }
        pushUndo();
        model.paper = PAPER[st.paper] ? st.paper : (d.template.paper || model.paper);
        model.elements = st.elements;
        normalizeIds();
        selectedId = null;
        document.getElementById("paper-sel").value = model.paper;
        renderAll(); fitScale(); markDirty(); scheduleSave();
        tplModal.classList.remove("open");
      });
    } else if (dl && GUIDE.editable) {
      if (!confirm("このテンプレートを削除しますか？")) return;
      fetch(TPL_API + "/" + dl, { method: "DELETE" }).then(function () { document.getElementById("tpl-load-btn").click(); });
    }
  });

  // ---------- 印刷 ----------
  var printModal = document.getElementById("print-modal");
  function buildParticipantPicker(list) {
    var box = document.getElementById("pk-list");
    if (!list.length) { box.innerHTML = "<div style=\\"padding:12px;color:#9ca3af;font-size:13px;\\">参加者がまだいません</div>"; return; }
    box.innerHTML = list.map(function (p, i) {
      var div = p.division ? (p.division + "課" + (p.team ? (" " + p.team + "班") : "")) : "";
      return "<label class=\\"prow\\"><input type=\\"checkbox\\" class=\\"pk\\" data-i=\\"" + i + "\\" checked> "
        + "<span style=\\"flex:1;\\"><b>" + escH(p.name || p.emp_no) + "</b> <span style=\\"color:#9ca3af;\\">" + escH(p.emp_no) + (div ? (" ・ " + escH(div)) : "") + (p.slot_labels ? (" ・ " + escH(p.slot_labels)) : "") + "</span></span></label>";
    }).join("");
    box._list = list;
  }
  document.getElementById("print-btn").addEventListener("click", function () { printModal.classList.add("open"); });
  document.getElementById("print-cancel").addEventListener("click", function () { printModal.classList.remove("open"); });
  printModal.addEventListener("click", function (ev) { if (ev.target === printModal) printModal.classList.remove("open"); });
  document.querySelectorAll('input[name="addr-mode"]').forEach(function (r) {
    r.addEventListener("change", function () {
      document.getElementById("p-select-wrap").style.display = (document.querySelector('input[name="addr-mode"]:checked').value === "each") ? "block" : "none";
    });
  });
  document.getElementById("pk-all").addEventListener("click", function () { document.querySelectorAll(".pk").forEach(function (c) { c.checked = true; }); });
  document.getElementById("pk-none").addEventListener("click", function () { document.querySelectorAll(".pk").forEach(function (c) { c.checked = false; }); });

  function addresseeText(p) {
    if (!p) return null;
    var div = p.division ? (p.division + "課" + (p.team ? ("　" + p.team + "班") : "")) : "";
    return (div ? (div + "　") : "") + (p.name || p.emp_no) + "　様";
  }
  function buildPrintPage(addrOverride) {
    var pg = document.createElement("div");
    pg.className = "print-page paper-" + model.paper;
    model.elements.slice().sort(function (a, b) { return (a.z || 0) - (b.z || 0); }).forEach(function (e) {
      var node = document.createElement("div");
      node.className = "el type-" + e.type + (e.role === "addressee" ? " role-addressee" : "");
      var c = document.createElement("div");
      c.className = "el-content";
      if (e.role === "addressee" && addrOverride != null) c.innerHTML = escH(addrOverride).replace(/\\n/g, "<br>");
      else c.innerHTML = contentHtml(e);
      node.appendChild(c);
      applyElStyle(node, e);
      pg.appendChild(node);
    });
    return pg;
  }
  document.getElementById("print-go").addEventListener("click", function () {
    var mode = document.querySelector('input[name="addr-mode"]:checked').value;
    var root = document.getElementById("print-root");
    root.innerHTML = "";
    if (mode === "each") {
      var box = document.getElementById("pk-list");
      var list = box._list || [];
      var chosen = [];
      document.querySelectorAll(".pk").forEach(function (c) { if (c.checked) chosen.push(list[parseInt(c.getAttribute("data-i"))]); });
      if (!chosen.length) { alert("参加者を1人以上選んでください"); return; }
      chosen.forEach(function (p) { root.appendChild(buildPrintPage(addresseeText(p))); });
    } else {
      root.appendChild(buildPrintPage(null));
    }
    printModal.classList.remove("open");
    document.body.classList.add("printing");
    setTimeout(function () { window.print(); }, 60);
  });
  window.addEventListener("afterprint", function () {
    document.body.classList.remove("printing");
    document.getElementById("print-root").innerHTML = "";
  });
})();
</script>
</body>
</html>`;
}
