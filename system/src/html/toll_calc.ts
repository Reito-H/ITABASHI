// 高速道路料金計算（普通車・関東+群馬）画面
// IC/JCTを選ぶだけで /api/toll-calc/quote を呼び、区間内訳と深夜割引後の金額を表示する。
import { safeJson } from './layout';

export type TollNodeOption = { id: number; name: string; kind: string; area_tag: string | null };

export function tollCalcPage(nodes: TollNodeOption[]): string {
  return `
<div style="max-width:760px;margin:0 auto;">
  <div class="bg-white shadow rounded-lg p-6 mb-4">
    <div style="font-size:13px;color:#6b7280;margin-bottom:16px;line-height:1.7;">
      普通車(タクシー)のETC料金を計算します。営業エリア(23区・三鷹市・武蔵野市)発着を想定した
      関東主要路線＋関越道(群馬方面)のIC/JCTデータを使用しています。<br>
      料金はNEXCO・首都高の公式計算式をもとにした概算です。深夜0時〜4時通過の割引にも対応しています。
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;">
      <div style="flex:1;min-width:200px;">
        <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:4px;">出発IC/JCT</label>
        <input id="tc-from" type="text" list="tc-node-list" placeholder="例: 板橋本町" autocomplete="off"
          style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:9px 10px;font-size:13px;box-sizing:border-box;">
      </div>
      <div style="flex:1;min-width:200px;">
        <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:4px;">到着IC/JCT</label>
        <input id="tc-to" type="text" list="tc-node-list" placeholder="例: 那須高原" autocomplete="off"
          style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:9px 10px;font-size:13px;box-sizing:border-box;">
      </div>
      <div style="min-width:140px;">
        <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:4px;">出発予定時刻(任意)</label>
        <input id="tc-time" type="time" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:9px 10px;font-size:13px;box-sizing:border-box;">
      </div>
      <div>
        <button onclick="tcCalc()" class="bg-blue-600 text-white" style="border:none;border-radius:6px;padding:10px 20px;font-size:13px;font-weight:600;cursor:pointer;">計算</button>
      </div>
    </div>
    <datalist id="tc-node-list">
      ${nodes.map(n => `<option value="${escAttr(n.name)}">`).join('')}
    </datalist>
    <div id="tc-error" style="display:none;margin-top:12px;background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;padding:10px 14px;border-radius:6px;font-size:13px;"></div>
  </div>

  <div id="tc-result" style="display:none;" class="bg-white shadow rounded-lg p-6">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px;">
      <div style="font-size:13px;color:#6b7280;">走行距離: <span id="tc-distance" style="font-weight:600;color:#1f2937;"></span> km</div>
      <span id="tc-source-badge" style="font-size:11px;font-weight:600;padding:3px 8px;border-radius:999px;"></span>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:14px;">
      <thead>
        <tr style="background:#f9fafb;">
          <th style="text-align:left;padding:8px 10px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:600;">道路</th>
          <th style="text-align:left;padding:8px 10px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:600;">事業者</th>
          <th style="text-align:right;padding:8px 10px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:600;">距離(km)</th>
          <th style="text-align:right;padding:8px 10px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:600;">料金</th>
        </tr>
      </thead>
      <tbody id="tc-segments"></tbody>
    </table>
    <div style="border-top:2px solid #1f2937;padding-top:12px;display:flex;justify-content:flex-end;gap:24px;align-items:baseline;flex-wrap:wrap;">
      <div id="tc-normal-total-wrap">
        <span style="font-size:12px;color:#6b7280;">通常料金</span>
        <span id="tc-total" style="font-size:20px;font-weight:700;color:#1f2937;margin-left:6px;">-</span>
        <span style="font-size:13px;color:#6b7280;">円</span>
      </div>
      <div id="tc-night-wrap" style="display:none;">
        <span style="font-size:12px;color:#b91c1c;">深夜割引後</span>
        <span id="tc-night-total" style="font-size:20px;font-weight:700;color:#b91c1c;margin-left:6px;">-</span>
        <span style="font-size:13px;color:#6b7280;">円</span>
      </div>
    </div>
    <div id="tc-night-note" style="display:none;margin-top:8px;font-size:12px;color:#9ca3af;text-align:right;"></div>
  </div>
</div>

<script>
  var TC_NODES = ${safeJson(nodes)};
  var TC_OPERATOR_LABEL = { nexco_east: 'NEXCO東日本', nexco_central: 'NEXCO中日本', nexco: 'NEXCO', shutoko: '首都高速', '特例': '特例区間', other: 'その他', official: '公式検索結果' };

  function tcFindNodeId(name) {
    var n = TC_NODES.find(function (x) { return x.name === name.trim(); });
    return n ? n.id : null;
  }

  function tcShowError(msg) {
    var el = document.getElementById('tc-error');
    el.textContent = msg;
    el.style.display = 'block';
    document.getElementById('tc-result').style.display = 'none';
  }

  function tcCalc() {
    var fromName = document.getElementById('tc-from').value;
    var toName = document.getElementById('tc-to').value;
    var time = document.getElementById('tc-time').value;
    var fromId = tcFindNodeId(fromName);
    var toId = tcFindNodeId(toName);
    document.getElementById('tc-error').style.display = 'none';

    if (!fromId) return tcShowError('出発地のIC/JCT名を候補から選択してください');
    if (!toId) return tcShowError('到着地のIC/JCT名を候補から選択してください');

    var url = '/api/toll-calc/quote?from=' + fromId + '&to=' + toId + (time ? '&depTime=' + encodeURIComponent(time) : '');
    fetch(url).then(function (r) { return r.json(); }).then(function (data) {
      if (data.error) return tcShowError(data.error);

      document.getElementById('tc-distance').textContent = data.distanceKm;
      var badge = document.getElementById('tc-source-badge');
      if (data.source === 'driveplaza') {
        badge.textContent = '公式(ドラぷら)';
        badge.style.background = '#f0fdf4'; badge.style.color = '#166534';
      } else {
        badge.textContent = '概算(自前計算)';
        badge.style.background = '#fffbeb'; badge.style.color = '#b45309';
      }
      var tbody = document.getElementById('tc-segments');
      tbody.innerHTML = data.segments.map(function (seg) {
        var fareCell = seg.nightDiscounted
          ? '<span style="text-decoration:line-through;color:#9ca3af;">' + seg.fare.toLocaleString() + '</span> → <b>' + seg.fareAfterDiscount.toLocaleString() + '</b>'
          : seg.fare.toLocaleString();
        return '<tr>' +
          '<td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;">' + seg.roadName + (seg.note ? '<div style="font-size:11px;color:#9ca3af;">' + seg.note + '</div>' : '') + '</td>' +
          '<td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;color:#6b7280;">' + (TC_OPERATOR_LABEL[seg.operator] || seg.operator) + '</td>' +
          '<td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;text-align:right;">' + seg.distanceKm.toFixed(1) + '</td>' +
          '<td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;text-align:right;">' + fareCell + '円</td>' +
          '</tr>';
      }).join('');

      document.getElementById('tc-total').textContent = data.total.toLocaleString();
      var nightWrap = document.getElementById('tc-night-wrap');
      var noteEl = document.getElementById('tc-night-note');
      if (data.nightDiscountApplied) {
        nightWrap.style.display = '';
        document.getElementById('tc-night-total').textContent = data.totalAfterNightDiscount.toLocaleString();
      } else {
        nightWrap.style.display = 'none';
      }
      if (data.nightDiscountNote) {
        noteEl.textContent = data.nightDiscountNote;
        noteEl.style.display = '';
      } else {
        noteEl.style.display = 'none';
      }
      document.getElementById('tc-result').style.display = '';
    }).catch(function () { tcShowError('通信エラーが発生しました'); });
  }
</script>`;
}

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
