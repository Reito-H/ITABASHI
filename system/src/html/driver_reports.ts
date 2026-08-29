// ドライバー報告（画面上は一般的な「乗務員についての報告」だが、実運用は当欠・態度トラブル等の
// 問題傾向を日付ごとに記録し、全権限アカウントだけが参照できる注意記録機能）
import { ADMIN_PATH } from '../config';
import { escHtml } from './layout';

export interface DriverReportEmployeeSummary {
  id: number;
  name: string;
  emp_no: string;
  division: number | null;
  team: number | null;
  report_count: number;
  last_report_date: string;
}

export interface DriverReportEntry {
  id: number;
  report_date: string;
  category: string;
  content: string;
  created_by_name: string | null;
  created_at: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  '当欠': '#fecaca',
  '態度・暴言': '#fed7aa',
  '苦情・トラブル': '#fde68a',
  '個性・傾向': '#e9d5ff',
  'その他': '#e5e7eb',
};

export const DRIVER_REPORT_CATEGORIES = ['当欠', '態度・暴言', '苦情・トラブル', '個性・傾向', 'その他'];

function categoryBadge(category: string): string {
  const bg = CATEGORY_COLORS[category] ?? '#e5e7eb';
  return `<span style="background:${bg};padding:2px 8px;border-radius:4px;font-size:12px;">${escHtml(category)}</span>`;
}

export function driverReportsListPage(employees: DriverReportEmployeeSummary[]): string {
  const rows = employees.map(e => `
    <tr class="hover:bg-gray-50" style="cursor:pointer;" onclick="window.location='${ADMIN_PATH}/driver-reports/${e.id}'">
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:600;">${escHtml(e.name)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;">${escHtml(e.emp_no)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;">${e.division ?? ''}課 ${e.team ?? ''}班</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;text-align:center;">${e.report_count}件</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;">${escHtml(e.last_report_date)}</td>
    </tr>`).join('');

  return `
    <div style="max-width:840px;">
      <a href="${ADMIN_PATH}/kacho-mission" style="color:#2563eb;font-size:13px;display:inline-block;margin-bottom:12px;">← 課長ミッション</a>
      <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.1);padding:20px;margin-bottom:16px;">
        <div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:8px;">乗務員を検索して記録を追加</div>
        <div style="position:relative;">
          <input id="emp-search" type="text" placeholder="氏名・社員番号で検索..." autocomplete="off"
            style="width:100%;border:1px solid #d1d5db;border-radius:8px;padding:10px 12px;font-size:14px;outline:none;box-sizing:border-box;">
          <div id="emp-search-results" style="display:none;position:absolute;top:100%;left:0;right:0;background:white;border:1px solid #e5e7eb;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.12);margin-top:4px;max-height:280px;overflow-y:auto;z-index:20;"></div>
        </div>
      </div>

      <div style="font-size:13px;color:#6b7280;margin-bottom:8px;">記録のある乗務員（最終記録日順）</div>
      <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.1);overflow:auto;">
        <table style="width:100%;border-collapse:collapse;">
          <thead style="background:#f9fafb;">
            <tr>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">氏名</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">社員番号</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">所属</th>
              <th style="padding:8px 12px;text-align:center;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">件数</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">最終記録日</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="5" style="padding:24px;text-align:center;color:#9ca3af;">記録はありません</td></tr>'}</tbody>
        </table>
      </div>
    </div>
    <script>
    (function() {
      const input = document.getElementById('emp-search');
      const results = document.getElementById('emp-search-results');
      let timer = null;
      input.addEventListener('input', function() {
        const q = input.value.trim();
        clearTimeout(timer);
        if (!q) { results.style.display = 'none'; results.innerHTML = ''; return; }
        timer = setTimeout(async function() {
          const res = await fetch('${ADMIN_PATH}/api/driver-reports/search-employees?q=' + encodeURIComponent(q));
          if (!res.ok) return;
          const list = await res.json();
          if (!list.length) {
            results.innerHTML = '<div style="padding:10px 12px;font-size:13px;color:#9ca3af;">該当する乗務員がいません</div>';
          } else {
            results.innerHTML = list.map(function(e) {
              return '<div class="emp-result" data-id="' + e.id + '" style="padding:10px 12px;font-size:13px;cursor:pointer;border-bottom:1px solid #f3f4f6;">'
                + '<span style="font-weight:600;">' + e.name + '</span>'
                + '<span style="color:#9ca3af;margin-left:8px;font-size:12px;">' + e.emp_no + ' ／ ' + (e.division ?? '') + '課' + (e.team ?? '') + '班</span></div>';
            }).join('');
          }
          results.style.display = 'block';
        }, 200);
      });
      results.addEventListener('click', function(ev) {
        const row = ev.target.closest('.emp-result');
        if (!row) return;
        window.location = '${ADMIN_PATH}/driver-reports/' + row.getAttribute('data-id');
      });
      document.addEventListener('click', function(ev) {
        if (!results.contains(ev.target) && ev.target !== input) results.style.display = 'none';
      });
    })();
    </script>
  `;
}

export function driverReportDetailPage(
  emp: { id: number; name: string; emp_no: string; division: number | null; team: number | null },
  entries: DriverReportEntry[]
): string {
  const today = new Date().toISOString().slice(0, 10);
  const categoryOptions = DRIVER_REPORT_CATEGORIES.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');

  const timeline = entries.map(e => `
    <div style="padding:14px 16px;border-bottom:1px solid #f3f4f6;" id="entry-${e.id}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:13px;font-weight:600;">${escHtml(e.report_date)}</span>
          ${categoryBadge(e.category)}
        </div>
        <button onclick="deleteEntry(${e.id})" style="padding:2px 8px;background:#fee2e2;color:#991b1b;border:none;border-radius:4px;font-size:11px;cursor:pointer;">削除</button>
      </div>
      <div style="font-size:13px;color:#374151;white-space:pre-wrap;line-height:1.6;">${escHtml(e.content)}</div>
      <div style="font-size:11px;color:#9ca3af;margin-top:6px;">記録者: ${escHtml(e.created_by_name ?? '不明')} ／ ${e.created_at.slice(0, 16)}</div>
    </div>`).join('');

  return `
    <div style="max-width:720px;">
      <a href="${ADMIN_PATH}/driver-reports" style="color:#2563eb;font-size:13px;">← 一覧に戻る</a>
      <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.1);padding:20px;margin-top:12px;margin-bottom:16px;">
        <div style="font-size:17px;font-weight:bold;">${escHtml(emp.name)}</div>
        <div style="font-size:12px;color:#6b7280;">${escHtml(emp.emp_no)} ／ ${emp.division ?? ''}課 ${emp.team ?? ''}班</div>
      </div>

      <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.1);padding:20px;margin-bottom:16px;">
        <div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:10px;">新規記録を追加</div>
        <div style="display:flex;gap:10px;margin-bottom:10px;flex-wrap:wrap;">
          <input id="new-date" type="date" value="${today}" style="border:1px solid #d1d5db;border-radius:8px;padding:9px 10px;font-size:13px;">
          <select id="new-category" style="border:1px solid #d1d5db;border-radius:8px;padding:9px 10px;font-size:13px;">${categoryOptions}</select>
        </div>
        <textarea id="new-content" rows="3" placeholder="出来事・様子など具体的に記録..."
          style="width:100%;border:1px solid #d1d5db;border-radius:8px;padding:10px;font-size:13px;line-height:1.6;box-sizing:border-box;"></textarea>
        <button onclick="addEntry()" style="margin-top:10px;padding:8px 20px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:13px;cursor:pointer;">記録を追加</button>
      </div>

      <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.1);overflow:hidden;">
        ${timeline || '<div style="padding:24px;text-align:center;color:#9ca3af;font-size:13px;">記録はまだありません</div>'}
      </div>
    </div>
    <script>
    async function addEntry() {
      const report_date = document.getElementById('new-date').value;
      const category = document.getElementById('new-category').value;
      const content = document.getElementById('new-content').value.trim();
      if (!report_date || !content) { alert('日付と内容を入力してください'); return; }
      const res = await fetch('${ADMIN_PATH}/api/driver-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emp_id: ${emp.id}, report_date, category, content })
      });
      if (res.ok) { location.reload(); }
      else { alert('保存に失敗しました。'); }
    }
    async function deleteEntry(id) {
      if (!confirm('この記録を削除しますか？\\nこの操作は取り消せません。')) return;
      const res = await fetch('${ADMIN_PATH}/api/driver-reports/' + id, { method: 'DELETE' });
      if (res.ok) { location.reload(); }
      else { alert('削除に失敗しました。'); }
    }
    </script>
  `;
}
