// ブラウザ側で xlsx テンプレートのセル値だけを差し替える共通クライアントJS。
// 書式・結合セル・列幅・印刷設定・スタイルは一切触らない（対象セルの <c> 要素だけ置換）。
// fflate(UMD) を CDN から読み込んで zip 展開・再圧縮する。
// 生成ページの大きなテンプレートリテラル内に ${XLSX_FILL_CLIENT_JS} で差し込む前提。
//   ・JS文字列は単一引用符、HTML属性は生の " を使う
//   ・正規表現のバックスラッシュは二重（\\d など）— テンプレートリテラルが1段消費するため
export const XLSX_FILL_CLIENT_JS = `
  var XF_FFLATE_SRC = 'https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js';
  var _xfFflateP = null;
  function xfLoadFflate() {
    if (window.fflate) return Promise.resolve();
    if (_xfFflateP) return _xfFflateP;
    _xfFflateP = new Promise(function(resolve, reject) {
      var s = document.createElement('script');
      s.src = XF_FFLATE_SRC;
      s.onload = function() { resolve(); };
      s.onerror = function() { reject(new Error('圧縮ライブラリの読み込みに失敗しました')); };
      document.head.appendChild(s);
    });
    return _xfFflateP;
  }

  function xfB64ToU8(b64) {
    var bin = atob(b64);
    var u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }
  function xfDec(u8) { return new TextDecoder('utf-8').decode(u8); }
  function xfEnc(str) { return new TextEncoder().encode(str); }

  function xfXmlEsc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  // <c r="REF" ...>...</c> または <c r="REF" .../> を、s= を保ったまま inner で置換する。
  // 見つからなければ何もしない（テンプレートに無いセルはスキップ）。
  function xfSetCell(xml, ref, inner, extraAttr) {
    var open = '<c r="' + ref + '"';
    var i = xml.indexOf(open);
    if (i < 0) return xml;
    var gt = xml.indexOf('>', i);
    if (gt < 0) return xml;
    var head = xml.slice(i, gt);
    var selfClose = xml.charAt(gt - 1) === '/';
    var end = selfClose ? gt + 1 : (xml.indexOf('</c>', gt) + 4);
    var sm = head.match(/ s="(\\d+)"/);
    var s = sm ? ' s="' + sm[1] + '"' : '';
    var rep = '<c r="' + ref + '"' + s + (extraAttr || '') + '>' + inner + '</c>';
    return xml.slice(0, i) + rep + xml.slice(end);
  }
  function xfSetText(xml, ref, text) {
    if (text == null || text === '') return xfSetCell(xml, ref, '', '');
    return xfSetCell(xml, ref, '<is><t xml:space="preserve">' + xfXmlEsc(text) + '</t></is>', ' t="inlineStr"');
  }
  function xfSetNum(xml, ref, num) {
    if (num == null || num === '' || isNaN(Number(num))) return xml;
    return xfSetCell(xml, ref, '<v>' + Number(num) + '</v>', '');
  }
  function xfClearCell(xml, ref) { return xfSetCell(xml, ref, '', ''); }

  function xfDownload(u8, filename) {
    var blob = new Blob([u8], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function() { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  // シート名として使えない文字を除去し 31文字に丸める
  function xfSheetName(name, idx, used) {
    var n = String(name || ('シート' + idx)).replace(/[\\[\\]\\*\\?\\/\\\\:]/g, ' ').trim().slice(0, 28);
    if (!n) n = 'シート' + idx;
    var base = n, k = 2;
    while (used[n]) { n = (base + '_' + k).slice(0, 31); k++; }
    used[n] = 1;
    return n;
  }

  var XF_CT_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>';
  var XF_CT_FIXED = '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>';
  var XF_WBR_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
  var XF_WBR_TAIL = '<Relationship Id="rIdT" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/><Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdSS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>';
  var XF_WB_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>';

  // テンプレzip(展開済みオブジェクト)＋各シートのXML文字列配列＋シート名配列 → 出力zip(Uint8Array)
  // 共通部品(styles/sharedStrings/theme/docProps/_rels)はテンプレのものをそのまま使う。
  function xfBuildWorkbook(tpl, sheetXmls, sheetNames) {
    var used = {};
    var sheetTags = '', relTags = '', ctOver = '';
    var sheetParts = {};
    for (var k = 0; k < sheetXmls.length; k++) {
      var n = k + 1;
      sheetParts['xl/worksheets/sheet' + n + '.xml'] = xfEnc(sheetXmls[k]);
      var nm = xfSheetName(sheetNames[k], n, used);
      sheetTags += '<sheet name="' + xfXmlEsc(nm) + '" sheetId="' + n + '" r:id="rId' + n + '"/>';
      relTags += '<Relationship Id="rId' + n + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + n + '.xml"/>';
      ctOver += '<Override PartName="/xl/worksheets/sheet' + n + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
    }
    // OPC の慣例に合わせ [Content_Types].xml → _rels → 本体 の順で詰める
    var out = {};
    out['[Content_Types].xml'] = xfEnc(XF_CT_HEAD + ctOver + XF_CT_FIXED + '</Types>');
    if (tpl['_rels/.rels']) out['_rels/.rels'] = tpl['_rels/.rels'];
    out['xl/workbook.xml'] = xfEnc(XF_WB_HEAD + sheetTags + '</sheets></workbook>');
    out['xl/_rels/workbook.xml.rels'] = xfEnc(XF_WBR_HEAD + relTags + XF_WBR_TAIL);
    for (var kk in sheetParts) out[kk] = sheetParts[kk];
    ['xl/theme/theme1.xml', 'xl/styles.xml', 'xl/sharedStrings.xml', 'docProps/core.xml', 'docProps/app.xml'].forEach(function(key) {
      if (tpl[key]) out[key] = tpl[key];
    });
    return window.fflate.zipSync(out, { level: 6 });
  }

  // 生シートXMLから、drawing/printerSettings参照を落とす（テンプレ生成時に落としてある場合の保険）
  function xfStripSheetRefs(xml) {
    return xml
      .replace(/<drawing r:id="rId\\d+"\\/>/g, '')
      .replace(/<legacyDrawing r:id="rId\\d+"\\/>/g, '')
      .replace(/(<pageSetup[^>]*?) r:id="rId\\d+"/g, '$1');
  }
`;
