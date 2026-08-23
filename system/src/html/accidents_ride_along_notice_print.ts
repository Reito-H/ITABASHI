// 事故添乗研修のお知らせ（新卒対象）印刷ページ（/accidents/training/notice/print）
// 氏名・課・班・社員番号・実施日時・集合場所・担当者はすべて画面上のinputに直接入力できる
// （未入力なら印刷時は下線だけの空欄になり、従来どおり手書き用としても使える）。
// 事故記録がない（＝事故データからは検索できない）新卒者にも対応するため、氏名欄は
// 社員名簿(employeesテーブル)を氏名検索して自動入力することもできる。
// A4縦1枚に自動縮小して収める（report_print.ts系のfitSheetToPage方式を踏襲。
// 印鑑欄等の絶対配置は使わない構成のため、この仕組みだけで2枚に分かれることはない）。
import { escHtml } from './layout';

export interface AccidentsRideAlongNoticePrintOptions {
  backHref: string;
  searchEmployeesHref: string;
}

export function renderAccidentsRideAlongNoticePrintPage(o: AccidentsRideAlongNoticePrintOptions): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="robots" content="noindex, nofollow">
<title>事故添乗研修のお知らせ（印刷用）</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #e5e7eb; font-family: 'Hiragino Sans', 'Meiryo', sans-serif; color: #111827; }
  .toolbar { position: sticky; top: 0; z-index: 10; background: #1a3a5c; padding: 10px 16px; display: flex; gap: 8px; align-items: center; }
  .toolbar a, .toolbar button { font-size: 13px; padding: 7px 16px; border-radius: 6px; border: none; cursor: pointer; text-decoration: none; font-weight: 600; }
  .toolbar a { background: #374151; color: #fff; }
  .toolbar button.print-btn { background: #2563eb; color: #fff; }
  .toolbar .hint { margin-left: auto; font-size: 12px; color: #cbd5e1; }
  .stage { padding: 24px; display: flex; flex-direction: column; align-items: center; gap: 14px; }

  .rn-search-box { position: relative; width: 210mm; }
  .rn-search-input { width: 320px; border: 1px solid #cbd5e1; border-radius: 8px; padding: 9px 12px; font-size: 13px; background: #fff; }
  .rn-search-hint { font-size: 11.5px; color: #6b7280; margin-left: 10px; }
  .rn-search-dropdown { position: absolute; top: 100%; left: 0; width: 320px; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,.12); max-height: 260px; overflow-y: auto; z-index: 20; display: none; margin-top: 4px; }
  .rn-search-dropdown.open { display: block; }
  .rn-search-item { padding: 9px 12px; font-size: 12.5px; cursor: pointer; border-bottom: 1px solid #f1f5f9; }
  .rn-search-item:last-child { border-bottom: none; }
  .rn-search-item:hover { background: #f0fdfa; }
  .rn-search-item .sub { color: #94a3b8; font-size: 11px; margin-top: 2px; }
  .rn-search-empty { padding: 10px 12px; font-size: 12px; color: #94a3b8; }

  .sheet { width: 210mm; height: 297mm; background: #fff; padding: 20mm 22mm; box-shadow: 0 4px 20px rgba(0,0,0,0.25); overflow: hidden; position: relative; }
  .sheet-fit { width: 100%; transform-origin: top left; }

  .rn-title { text-align: center; font-size: 24px; font-weight: 800; color: #0f172a; letter-spacing: .06em; margin-bottom: 14px; padding-bottom: 14px; border-bottom: 3px solid #1a3a5c; }
  .rn-badge-row { text-align: center; margin-bottom: 26px; }
  .rn-badge { display: inline-block; background: #eff6ff; color: #1a3a5c; border: 1px solid #bfdbfe; border-radius: 20px; padding: 4px 18px; font-size: 13px; font-weight: 700; }

  .rn-id-block { border: 1px solid #d1d5db; border-radius: 8px; padding: 16px 20px; margin-bottom: 26px; }
  .rn-id-row { display: flex; align-items: baseline; gap: 10px; font-size: 14px; margin-bottom: 12px; }
  .rn-id-row:last-child { margin-bottom: 0; }
  .rn-id-label { font-weight: 700; color: #374151; flex-shrink: 0; }
  .rn-input { border: none; border-bottom: 1px solid #334155; background: transparent; font: inherit; color: #111827; outline: none; padding: 0 2px; }
  .rn-input:focus { background: #fffbeb; }
  .rn-input.w-name { width: 220px; }
  .rn-input.w-small { width: 70px; }
  .rn-input.w-empno { width: 180px; }

  .rn-body-text { font-size: 14px; line-height: 2.1; color: #1f2937; margin-bottom: 16px; }

  .rn-detail-box { border: 1px solid #d1d5db; border-radius: 8px; overflow: hidden; margin: 22px 0; }
  .rn-detail-row { display: flex; border-bottom: 1px solid #e5e7eb; }
  .rn-detail-row:last-child { border-bottom: none; }
  .rn-detail-label { width: 130px; flex: none; background: #f9fafb; font-size: 13px; font-weight: 700; color: #374151; padding: 13px 14px; }
  .rn-detail-value { flex: 1; font-size: 14px; color: #111827; padding: 13px 14px; display: flex; align-items: baseline; gap: 8px; }
  .rn-detail-value .rn-input { width: 44px; text-align: center; }
  .rn-detail-value .rn-input.w-place { flex: 1; text-align: left; }
  .rn-detail-value .rn-input.w-staff { width: 220px; }

  .rn-foot { text-align: right; font-size: 14px; font-weight: 700; color: #374151; margin-top: 30px; }

  @media print {
    @page { size: A4 portrait; margin: 0; }
    html, body { background: #fff; }
    .toolbar, .rn-search-box { display: none; }
    .stage { padding: 0; gap: 0; }
    .sheet { box-shadow: none; margin: 0; }
    .rn-input { border-bottom-color: #334155 !important; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <a href="${escHtml(o.backHref)}">← 事故研修一覧に戻る</a>
    <button class="print-btn" onclick="window.print()">🖨️ 印刷 / PDF保存</button>
    <span class="hint">新卒対象・氏名等は検索または直接入力、空欄のまま手書きでもご利用いただけます</span>
  </div>
  <div class="stage">
    <div class="rn-search-box">
      <input type="text" id="rn-search-input" class="rn-search-input" placeholder="社員名簿から氏名で検索して自動入力（任意）" autocomplete="off">
      <span class="rn-search-hint">事故記録がない新卒者もここから検索できます</span>
      <div id="rn-search-dropdown" class="rn-search-dropdown"></div>
    </div>
    <div class="sheet" id="print-sheet">
      <div class="sheet-fit" id="sheet-fit">
        <div class="rn-title">事故添乗研修のお知らせ</div>
        <div class="rn-badge-row"><span class="rn-badge">新卒対象</span></div>

        <div class="rn-id-block">
          <div class="rn-id-row"><span class="rn-id-label">氏名</span><input type="text" id="rn-name" class="rn-input w-name"></div>
          <div class="rn-id-row">
            <span class="rn-id-label">課</span><input type="text" id="rn-division" class="rn-input w-small">
            <span class="rn-id-label" style="margin-left:20px;">班</span><input type="text" id="rn-team" class="rn-input w-small">
          </div>
          <div class="rn-id-row"><span class="rn-id-label">社員番号</span><input type="text" id="rn-empno" class="rn-input w-empno"></div>
        </div>

        <div class="rn-body-text">
          このたび、今後の安全運転につなげることを目的として、事故添乗研修を実施いたします。
        </div>
        <div class="rn-body-text">
          研修では、普段の運転状況を確認しながら、より安全に乗務するためのポイントや注意点を一緒に確認していきます。
        </div>
        <div class="rn-body-text">
          不安な点や気になることがあれば、研修中に遠慮なく相談してください。<br>
          今後の乗務を安心して行えるよう、前向きな気持ちで参加してください。
        </div>

        <div class="rn-detail-box">
          <div class="rn-detail-row"><div class="rn-detail-label">実施内容</div><div class="rn-detail-value">事故添乗研修</div></div>
          <div class="rn-detail-row"><div class="rn-detail-label">実施日時</div><div class="rn-detail-value">
            <input type="text" id="rn-month" class="rn-input" inputmode="numeric">月
            <input type="text" id="rn-day" class="rn-input" inputmode="numeric">日
            <input type="text" id="rn-hour" class="rn-input" inputmode="numeric">時
            <input type="text" id="rn-minute" class="rn-input" inputmode="numeric">分より
          </div></div>
          <div class="rn-detail-row"><div class="rn-detail-label">集合場所</div><div class="rn-detail-value"><input type="text" id="rn-place" class="rn-input w-place"></div></div>
          <div class="rn-detail-row"><div class="rn-detail-label">担当者</div><div class="rn-detail-value"><input type="text" id="rn-staff" class="rn-input w-staff"></div></div>
        </div>

        <div class="rn-foot">以上</div>
      </div>
    </div>
  </div>
  <script>
    function fitSheetToPage() {
      var fit = document.getElementById('sheet-fit');
      if (!fit) return;
      var pxPerMm = 96 / 25.4;
      var availablePx = (297 - 40) * pxPerMm;
      fit.style.transform = 'none';
      fit.style.width = '100%';
      var scale = 1;
      for (var i = 0; i < 6; i++) {
        var natural = fit.scrollHeight;
        if (natural <= 0 || natural * scale <= availablePx) break;
        scale = (availablePx / natural) * 0.97;
        fit.style.width = (100 / scale) + '%';
        fit.style.transform = 'scale(' + scale + ')';
      }
    }
    fitSheetToPage();
    window.addEventListener('load', fitSheetToPage);
    window.addEventListener('beforeprint', fitSheetToPage);

    function escapeHtmlClient(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    var rnSearchTimer = null;
    var searchInput = document.getElementById('rn-search-input');
    var dropdown = document.getElementById('rn-search-dropdown');
    searchInput.addEventListener('input', function () {
      var q = searchInput.value.trim();
      if (rnSearchTimer) clearTimeout(rnSearchTimer);
      if (!q) { dropdown.classList.remove('open'); dropdown.innerHTML = ''; return; }
      rnSearchTimer = setTimeout(function () {
        fetch(${JSON.stringify(o.searchEmployeesHref)} + '?q=' + encodeURIComponent(q))
          .then(function (r) { return r.json(); })
          .then(function (list) {
            if (!list.length) {
              dropdown.innerHTML = '<div class="rn-search-empty">該当する社員が見つかりません</div>';
              dropdown.classList.add('open');
              return;
            }
            dropdown.innerHTML = list.map(function (e) {
              var sub = escapeHtmlClient(e.emp_no || '') + ' ／ ' + (e.division != null ? e.division + '課' : '') + (e.team != null ? e.team + '班' : '');
              return '<div class="rn-search-item" data-name="' + escapeHtmlClient(e.name) + '" data-division="' + (e.division != null ? e.division : '') + '" data-team="' + (e.team != null ? e.team : '') + '" data-empno="' + escapeHtmlClient(e.emp_no || '') + '">'
                + escapeHtmlClient(e.name) + '<div class="sub">' + sub + '</div></div>';
            }).join('');
            dropdown.classList.add('open');
            dropdown.querySelectorAll('.rn-search-item').forEach(function (item) {
              item.addEventListener('click', function () {
                document.getElementById('rn-name').value = item.dataset.name || '';
                document.getElementById('rn-division').value = item.dataset.division || '';
                document.getElementById('rn-team').value = item.dataset.team || '';
                document.getElementById('rn-empno').value = item.dataset.empno || '';
                dropdown.classList.remove('open');
                searchInput.value = '';
                fitSheetToPage();
              });
            });
          });
      }, 200);
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.rn-search-box')) dropdown.classList.remove('open');
    });
  </script>
</body>
</html>`;
}
