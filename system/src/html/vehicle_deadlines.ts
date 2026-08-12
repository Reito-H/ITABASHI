// メーター検査（仮検査/本検査）・車検管理のページ本体
import { ADMIN_PATH } from '../config';
import { escHtml, saveToastHtml, saveToastScript } from './layout';

export interface MeterInspectionRow {
  id: number;
  ka: number;
  car_no: string;
  tentative_limit: string | null;
  tentative_assignee_id: number | null;
  tentative_assignee_name: string | null;
  honkensa_limit: string | null;
  honkensa_assignee_id: number | null;
  honkensa_assignee_name: string | null;
}

export interface ShakenRow {
  id: number;
  ka: number;
  car_no: string;
  shaken_date: string | null;
  shaken_limit: string | null;
  cert_exchange_limit: string | null;
}

type Tab = 'meter' | 'shaken';

function tabNav(activeTab: Tab, ka: number): string {
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'meter', label: 'メーター検査' },
    { id: 'shaken', label: '車検管理' },
  ];
  return `<div style="display:flex;gap:6px;margin-bottom:12px;">
    ${tabs.map(t => `<a href="${ADMIN_PATH}/vehicle-deadlines?tab=${t.id}&ka=${ka}"
      style="padding:9px 20px;border-radius:8px 8px 0 0;font-size:14px;font-weight:700;text-decoration:none;
        ${activeTab === t.id ? 'background:#fff;color:#1a3a5c;box-shadow:0 -2px 6px rgba(0,0,0,0.06);' : 'background:#e5e7eb;color:#6b7280;'}">
      ${t.label}</a>`).join('')}
  </div>`;
}

function kaNav(activeTab: Tab, ka: number): string {
  const items = [1, 2, 3, 4].map(k => `<a href="${ADMIN_PATH}/vehicle-deadlines?tab=${activeTab}&ka=${k}"
    style="padding:7px 16px;border-radius:6px;font-size:13px;font-weight:600;text-decoration:none;
      ${ka === k ? 'background:#1a3a5c;color:#fff;' : 'background:#f3f4f6;color:#4b5563;'}">${k}課</a>`).join('');
  return `<div style="display:flex;gap:6px;margin-bottom:14px;">${items}</div>`;
}

function assigneeCell(table: Tab, id: number, field: 'tentative_assignee' | 'honkensa_assignee', assigneeId: number | null, assigneeName: string | null): string {
  const name = assigneeName ?? '';
  return `<td style="position:relative;padding:6px 8px;border-bottom:1px solid #f1f5f9;min-width:140px;">
    <input type="text" class="assignee-input" data-table="${table}" data-id="${id}" data-field="${field}"
      data-selected-id="${assigneeId ?? ''}" data-selected-name="${escHtml(name)}"
      value="${escHtml(name)}" placeholder="検索して選択" autocomplete="off"
      style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:13px;box-sizing:border-box;">
    <div class="assignee-results" style="display:none;position:absolute;top:100%;left:0;right:0;background:#fff;border:1px solid #e5e7eb;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.12);max-height:220px;overflow-y:auto;z-index:30;"></div>
  </td>`;
}

function meterTable(ka: number, rows: MeterInspectionRow[]): string {
  const body = rows.map(r => `
    <tr id="row-meter-${r.id}">
      <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;">
        <input type="text" value="${escHtml(r.car_no)}" onchange="saveField('meter', ${r.id}, 'car_no', this.value)"
          style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:13px;box-sizing:border-box;">
      </td>
      <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;">
        <input type="date" value="${r.tentative_limit ?? ''}" onchange="saveField('meter', ${r.id}, 'tentative_limit', this.value)"
          style="border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:13px;">
      </td>
      ${assigneeCell('meter', r.id, 'tentative_assignee', r.tentative_assignee_id, r.tentative_assignee_name)}
      <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;">
        <input type="date" value="${r.honkensa_limit ?? ''}" onchange="saveField('meter', ${r.id}, 'honkensa_limit', this.value)"
          style="border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:13px;">
      </td>
      ${assigneeCell('meter', r.id, 'honkensa_assignee', r.honkensa_assignee_id, r.honkensa_assignee_name)}
      <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;text-align:center;">
        <button onclick="deleteRow('meter', ${r.id})" style="padding:5px 10px;background:#fee2e2;color:#991b1b;border:none;border-radius:6px;font-size:12px;cursor:pointer;">削除</button>
      </td>
    </tr>`).join('');

  return `
    <div style="background:white;border-radius:0 12px 12px 12px;box-shadow:0 1px 4px rgba(0,0,0,0.1);overflow:auto;">
      <table style="width:100%;border-collapse:collapse;">
        <thead style="background:#f9fafb;">
          <tr>
            <th style="padding:9px 8px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">車番</th>
            <th style="padding:9px 8px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">仮検査までの期限</th>
            <th style="padding:9px 8px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">仮検査担当者</th>
            <th style="padding:9px 8px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">本検査までの期限</th>
            <th style="padding:9px 8px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">本検査担当者</th>
            <th style="padding:9px 8px;border-bottom:1px solid #e5e7eb;width:60px;"></th>
          </tr>
        </thead>
        <tbody>${body || '<tr><td colspan="6" style="padding:24px;text-align:center;color:#9ca3af;">データがありません</td></tr>'}</tbody>
      </table>
    </div>
    <button onclick="addRow('meter', ${ka})" style="margin-top:12px;padding:9px 20px;background:#1a3a5c;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">＋ 車両を追加</button>
  `;
}

function shakenTable(ka: number, rows: ShakenRow[]): string {
  const body = rows.map(r => `
    <tr id="row-shaken-${r.id}">
      <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;">
        <input type="text" value="${escHtml(r.car_no)}" onchange="saveField('shaken', ${r.id}, 'car_no', this.value)"
          style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:13px;box-sizing:border-box;">
      </td>
      <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;">
        <input type="date" value="${r.shaken_date ?? ''}" onchange="saveField('shaken', ${r.id}, 'shaken_date', this.value)"
          style="border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:13px;">
      </td>
      <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;">
        <input type="date" value="${r.shaken_limit ?? ''}" onchange="saveField('shaken', ${r.id}, 'shaken_limit', this.value)"
          style="border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:13px;">
      </td>
      <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;">
        <input type="date" value="${r.cert_exchange_limit ?? ''}" onchange="saveField('shaken', ${r.id}, 'cert_exchange_limit', this.value)"
          style="border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:13px;">
      </td>
      <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;text-align:center;">
        <button onclick="deleteRow('shaken', ${r.id})" style="padding:5px 10px;background:#fee2e2;color:#991b1b;border:none;border-radius:6px;font-size:12px;cursor:pointer;">削除</button>
      </td>
    </tr>`).join('');

  return `
    <div style="background:white;border-radius:0 12px 12px 12px;box-shadow:0 1px 4px rgba(0,0,0,0.1);overflow:auto;">
      <table style="width:100%;border-collapse:collapse;">
        <thead style="background:#f9fafb;">
          <tr>
            <th style="padding:9px 8px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">車番</th>
            <th style="padding:9px 8px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">車検日</th>
            <th style="padding:9px 8px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">車検リミット</th>
            <th style="padding:9px 8px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">車検証交換リミット</th>
            <th style="padding:9px 8px;border-bottom:1px solid #e5e7eb;width:60px;"></th>
          </tr>
        </thead>
        <tbody>${body || '<tr><td colspan="5" style="padding:24px;text-align:center;color:#9ca3af;">データがありません</td></tr>'}</tbody>
      </table>
    </div>
    <button onclick="addRow('shaken', ${ka})" style="margin-top:12px;padding:9px 20px;background:#1a3a5c;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">＋ 車両を追加</button>
  `;
}

export function vehicleDeadlinesPage(tab: Tab, ka: number, meterRows: MeterInspectionRow[], shakenRows: ShakenRow[]): string {
  return `
    <div style="max-width:1100px;">
      <div style="font-size:12.5px;color:#6b7280;margin-bottom:14px;line-height:1.7;">
        課ごとに車両のメーター検査・車検の期限と担当者を管理します。期限の10日前/5日前/前日になると、どの画面を開いていても大画面で警告が表示されます。
      </div>
      ${tabNav(tab, ka)}
      ${kaNav(tab, ka)}
      ${tab === 'meter' ? meterTable(ka, meterRows) : shakenTable(ka, shakenRows)}
    </div>
    ${saveToastHtml()}
    <script>
    ${saveToastScript()}

    function escAttr(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    function escText(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    async function saveFields(table, id, fields) {
      try {
        const res = await fetch('${ADMIN_PATH}/api/vehicle-deadlines/' + table + '/' + id, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields)
        });
        if (!res.ok) { alert('保存に失敗しました'); return; }
        showToast('保存しました');
      } catch (e) { alert('通信エラーが発生しました'); }
    }
    function saveField(table, id, field, value) {
      const o = {};
      o[field] = value === '' ? null : value;
      saveFields(table, id, o);
    }

    async function addRow(table, ka) {
      try {
        const res = await fetch('${ADMIN_PATH}/api/vehicle-deadlines/' + table, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ka: ka })
        });
        if (res.ok) { location.reload(); } else { alert('追加に失敗しました'); }
      } catch (e) { alert('通信エラーが発生しました'); }
    }
    async function deleteRow(table, id) {
      if (!confirm('この行を削除しますか？\\nこの操作は取り消せません。')) return;
      try {
        const res = await fetch('${ADMIN_PATH}/api/vehicle-deadlines/' + table + '/' + id, { method: 'DELETE' });
        if (res.ok) {
          const el = document.getElementById('row-' + table + '-' + id);
          if (el) el.remove();
        } else { alert('削除に失敗しました'); }
      } catch (e) { alert('通信エラーが発生しました'); }
    }

    function saveAssignee(input, id, name) {
      const table = input.getAttribute('data-table');
      const rowId = input.getAttribute('data-id');
      const field = input.getAttribute('data-field');
      const body = {};
      body[field + '_id'] = id === '' ? null : Number(id);
      body[field + '_name'] = name === '' ? null : name;
      saveFields(table, rowId, body);
    }

    document.addEventListener('input', function (ev) {
      const el = ev.target;
      if (!el.classList || !el.classList.contains('assignee-input')) return;
      clearTimeout(el._searchTimer);
      const q = el.value.trim();
      const results = el.nextElementSibling;
      if (!q) { results.style.display = 'none'; results.innerHTML = ''; return; }
      el._searchTimer = setTimeout(async function () {
        try {
          const res = await fetch('${ADMIN_PATH}/api/vehicle-deadlines/search-employees?q=' + encodeURIComponent(q));
          if (!res.ok) return;
          const list = await res.json();
          results.innerHTML = list.length
            ? list.map(function (e) {
                return '<div class="assignee-result" data-id="' + e.id + '" data-name="' + escAttr(e.name) + '" style="padding:8px 10px;font-size:13px;cursor:pointer;border-bottom:1px solid #f3f4f6;">'
                  + escText(e.name) + '<span style="color:#9ca3af;margin-left:6px;font-size:11px;">' + escText(e.emp_no) + '</span></div>';
              }).join('')
            : '<div style="padding:8px 10px;font-size:12px;color:#9ca3af;">該当する社員がいません</div>';
          results.style.display = 'block';
        } catch (e) { /* 通信エラー時は次回入力で再試行 */ }
      }, 200);
    });

    document.addEventListener('click', function (ev) {
      const resultRow = ev.target.closest('.assignee-result');
      if (resultRow) {
        const results = resultRow.parentElement;
        const input = results.previousElementSibling;
        const id = resultRow.getAttribute('data-id');
        const name = resultRow.getAttribute('data-name');
        input.value = name;
        input.setAttribute('data-selected-id', id);
        input.setAttribute('data-selected-name', name);
        results.style.display = 'none';
        saveAssignee(input, id, name);
        return;
      }
      if (!ev.target.classList || !ev.target.classList.contains('assignee-input')) {
        document.querySelectorAll('.assignee-results').forEach(function (r) { r.style.display = 'none'; });
      }
    });

    document.addEventListener('blur', function (ev) {
      const el = ev.target;
      if (!el.classList || !el.classList.contains('assignee-input')) return;
      setTimeout(function () {
        const selectedName = el.getAttribute('data-selected-name') || '';
        if (el.value.trim() === '') {
          if (selectedName !== '') {
            el.setAttribute('data-selected-id', '');
            el.setAttribute('data-selected-name', '');
            saveAssignee(el, '', '');
          }
        } else if (el.value !== selectedName) {
          el.value = selectedName;
        }
      }, 150);
    }, true);
    </script>
  `;
}
