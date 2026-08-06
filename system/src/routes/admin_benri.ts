// 便利機能（左サイドバー「便利」）
// 今後いろいろな便利機能を追加していくためのハブページ。
// 最初の機能として「距離控除表」「高速料金 会社負担表」を実装する
//   紙の「⑤B高速道路会社負担・距離控除【両面印刷】」「距離控除一覧.xlsx」をWeb化したもの。
// 閲覧: 管理画面アカウントなら誰でも可（index.tsでページ権限チェックを免除・CC名簿と同じ扱い）
// 編集: フル権限アカウント（admins.permissions IS NULL）のみ。制限アカウントは常に閲覧のみ
import { Hono } from 'hono';
import { layout, escHtml, safeJson, saveToastHtml, saveToastScript } from '../html/layout';
import { ADMIN_PATH } from '../config';
import { getAdminPermissions } from '../permissions';
import type { Env } from '../auth';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

type DistanceGroup = { id: number; label: string; note: string; sort_order: number; is_active: number };
type DistancePoint = { id: number; group_id: number; name: string; km: number; sort_order: number };
type DistanceGroupData = DistanceGroup & { points: DistancePoint[] };
type TollRow = { id: number; route_name: string; section: string; fee: string; note: string; sort_order: number; is_active: number };

async function canEdit(c: { env: Env; get: (k: 'adminId') => number }): Promise<boolean> {
  const perms = await getAdminPermissions(c.env.DB, c.get('adminId'));
  return perms === null;
}

function requireEdit(c: { json: (body: unknown, status: 403) => Response }, editable: boolean): Response | null {
  if (!editable) return c.json({ error: 'この操作はフル権限アカウントのみ行えます' }, 403);
  return null;
}

function benriSubHeader(title: string): string {
  return `<div class="no-print" style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
    <a href="${ADMIN_PATH}/benri" style="color:#6b7280;font-size:13px;text-decoration:none;padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:white;">← 便利トップに戻る</a>
    <h2 style="font-size:17px;font-weight:700;color:#1e3a5f;">${title}</h2>
  </div>`;
}

async function loadDistanceGroups(db: D1Database): Promise<DistanceGroupData[]> {
  const [groups, points] = await Promise.all([
    db.prepare('SELECT * FROM benri_distance_groups WHERE is_active = 1 ORDER BY sort_order, id').all<DistanceGroup>(),
    db.prepare('SELECT * FROM benri_distance_points ORDER BY group_id, sort_order, id').all<DistancePoint>(),
  ]);
  return (groups.results ?? []).map(g => ({
    ...g,
    points: (points.results ?? []).filter(p => p.group_id === g.id),
  }));
}

// ===== ハブページ =====
app.get('/benri', (c) => {
  type Card = { href: string; title: string; desc: string };
  const cards: Card[] = [
    { href: `${ADMIN_PATH}/benri/highway`, title: '高速料金・距離控除表', desc: '距離控除一覧（IC間距離）と高速道路帰路会社負担路線一覧' },
  ];
  const html = `
    <div style="max-width:560px;">
      <h2 style="font-size:18px;font-weight:700;color:#1e3a5f;margin-bottom:6px;">便利</h2>
      <p style="font-size:12px;color:#6b7280;margin-bottom:20px;">よく使う資料・ツールをここにまとめていきます。閲覧はどのアカウントでも可能です。</p>
      <div style="display:flex;flex-direction:column;gap:12px;">
        ${cards.map(card => `
          <a href="${card.href}" style="display:flex;align-items:center;gap:16px;background:white;border-radius:12px;padding:18px 20px;box-shadow:0 1px 4px rgba(0,0,0,0.08);text-decoration:none;color:inherit;border:1px solid #e5e7eb;transition:box-shadow 0.15s;"
            onmouseover="this.style.boxShadow='0 4px 16px rgba(0,0,0,0.12)'" onmouseout="this.style.boxShadow='0 1px 4px rgba(0,0,0,0.08)'">
            <div>
              <div style="font-size:15px;font-weight:700;color:#1e3a5f;margin-bottom:3px;">${escHtml(card.title)}</div>
              <div style="font-size:12px;color:#6b7280;">${escHtml(card.desc)}</div>
            </div>
            <div style="margin-left:auto;color:#9ca3af;font-size:18px;">›</div>
          </a>`).join('')}
      </div>
    </div>`;
  return c.html(layout('便利', html, 'benri'));
});

// ===== 距離控除表・高速料金表（タブ） =====
app.get('/benri/highway', async (c) => {
  const editable = await canEdit(c);
  const [groups, tollRes, footerRow] = await Promise.all([
    loadDistanceGroups(c.env.DB),
    c.env.DB.prepare('SELECT * FROM benri_toll_rows WHERE is_active = 1 ORDER BY sort_order, id').all<TollRow>(),
    c.env.DB.prepare(`SELECT content FROM benri_notes WHERE key = 'toll_footer'`).first<{ content: string }>(),
  ]);
  const tollRows = tollRes.results ?? [];
  const footer = footerRow?.content ?? '';

  const distanceCards = groups.map(g => {
    const nameCells = g.points.map(p => `<th style="padding:5px 9px;font-size:12px;font-weight:600;color:#374151;background:#f9fafb;border:1px solid #e5e7eb;white-space:nowrap;">${escHtml(p.name)}</th>`).join('');
    const kmCells = g.points.map(p => `<td style="padding:5px 9px;font-size:12px;text-align:right;font-variant-numeric:tabular-nums;border:1px solid #e5e7eb;white-space:nowrap;">${p.km}</td>`).join('');
    return `
    <div style="background:white;border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,0.08);padding:12px 14px;margin-bottom:10px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <span style="font-size:13px;font-weight:700;color:#1e3a5f;">${escHtml(g.label)}</span>
        ${g.note ? `<span style="font-size:11px;color:#9ca3af;">（${escHtml(g.note)}）</span>` : ''}
        ${editable ? `
        <div style="margin-left:auto;display:flex;gap:4px;">
          <button onclick="moveDistGroup(${g.id},'up')" style="padding:2px 7px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:4px;font-size:11px;cursor:pointer;">▲</button>
          <button onclick="moveDistGroup(${g.id},'down')" style="padding:2px 7px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:4px;font-size:11px;cursor:pointer;">▼</button>
          <button onclick="openDistGroup(${g.id})" style="padding:2px 10px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:4px;font-size:11px;cursor:pointer;">編集</button>
          <button onclick="delDistGroup(${g.id},'${escHtml(g.label).replace(/'/g, "\\'")}')" style="padding:2px 8px;background:#fee2e2;color:#991b1b;border:none;border-radius:4px;font-size:11px;cursor:pointer;">削除</button>
        </div>` : ''}
      </div>
      <div style="overflow-x:auto;">
        <table style="border-collapse:collapse;">
          <tr>${nameCells}</tr>
          <tr>${kmCells}</tr>
        </table>
      </div>
    </div>`;
  }).join('');

  let lastRoute = '';
  const tollBodyRows = tollRows.map(r => {
    const showRoute = r.route_name !== lastRoute;
    lastRoute = r.route_name;
    return `
    <tr style="border-bottom:1px solid #f3f4f6;">
      <td style="padding:7px 10px;font-size:12px;font-weight:${showRoute ? '700' : '400'};color:${showRoute ? '#1e3a5f' : '#d1d5db'};white-space:nowrap;">${showRoute ? escHtml(r.route_name) : '〃'}</td>
      <td style="padding:7px 10px;font-size:12px;">${escHtml(r.section)}</td>
      <td style="padding:7px 10px;font-size:12px;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;">${escHtml(r.fee)}</td>
      <td style="padding:7px 10px;font-size:11px;color:#6b7280;">${escHtml(r.note)}</td>
      ${editable ? `<td style="padding:7px 10px;white-space:nowrap;">
        <button onclick="moveToll(${r.id},'up')" style="padding:2px 6px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:4px;font-size:11px;cursor:pointer;">▲</button>
        <button onclick="moveToll(${r.id},'down')" style="padding:2px 6px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:4px;font-size:11px;cursor:pointer;">▼</button>
        <button onclick="openToll(${r.id})" style="padding:2px 8px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:4px;font-size:11px;cursor:pointer;">編集</button>
        <button onclick="delToll(${r.id})" style="padding:2px 7px;background:#fee2e2;color:#991b1b;border:none;border-radius:4px;font-size:11px;cursor:pointer;">削除</button>
      </td>` : ''}
    </tr>`;
  }).join('');

  const html = benriSubHeader('高速料金・距離控除表') + `
    <div style="display:flex;gap:8px;margin-bottom:16px;">
      <button id="tab-distance" onclick="showHwTab('distance')" style="padding:8px 20px;border-radius:8px 8px 0 0;border:1px solid #d1d5db;border-bottom:none;background:white;font-size:13px;font-weight:700;cursor:pointer;color:#1d4ed8;">距離控除表</button>
      <button id="tab-toll" onclick="showHwTab('toll')" style="padding:8px 20px;border-radius:8px 8px 0 0;border:1px solid #d1d5db;border-bottom:none;background:#f3f4f6;font-size:13px;font-weight:600;cursor:pointer;color:#6b7280;">高速料金 会社負担表</button>
    </div>

    <div id="pane-distance">
      <p style="font-size:12px;color:#6b7280;margin-bottom:10px;">路線ごとの地点名と起点からの累積距離(km)の一覧です。同じ地点が2つの路線に離れて記載されている場合、その差が区間距離になります。</p>
      ${editable ? `<button onclick="openDistGroup(0)" style="margin-bottom:12px;padding:7px 18px;background:#059669;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">新しい路線を追加</button>` : ''}
      ${distanceCards || '<div style="padding:20px;text-align:center;color:#9ca3af;background:white;border-radius:10px;">登録がありません</div>'}
    </div>

    <div id="pane-toll" style="display:none;">
      <p style="font-size:12px;color:#6b7280;margin-bottom:10px;">高速道路帰路会社負担路線一覧（2019年4月1日現在の紙帳票を転記）。</p>
      ${editable ? `<button onclick="openToll(0)" style="margin-bottom:12px;padding:7px 18px;background:#059669;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">新しい行を追加</button>` : ''}
      <div style="background:white;border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,0.08);overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;min-width:640px;">
          <thead>
            <tr style="background:#f9fafb;color:#6b7280;font-size:11px;">
              <th style="padding:7px 10px;text-align:left;">路線名</th>
              <th style="padding:7px 10px;text-align:left;">区間</th>
              <th style="padding:7px 10px;text-align:right;">料金</th>
              <th style="padding:7px 10px;text-align:left;">備考</th>
              ${editable ? '<th style="padding:7px 10px;text-align:left;">操作</th>' : ''}
            </tr>
          </thead>
          <tbody>${tollBodyRows || `<tr><td colspan="5" style="padding:20px;text-align:center;color:#9ca3af;">登録がありません</td></tr>`}</tbody>
        </table>
      </div>

      <div style="margin-top:16px;background:white;border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,0.08);padding:16px;">
        <div style="font-size:12px;font-weight:700;color:#6b7280;margin-bottom:8px;">帰路利用方法（注記）</div>
        <textarea id="toll-footer" ${editable ? '' : 'readonly'} style="width:100%;min-height:120px;border:1px solid #d1d5db;border-radius:6px;padding:10px;font-size:12px;line-height:1.7;font-family:inherit;box-sizing:border-box;background:${editable ? '#fff' : '#f9fafb'};">${escHtml(footer)}</textarea>
        ${editable ? `<button onclick="saveTollFooter()" id="footer-save-btn" style="margin-top:8px;padding:7px 18px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">注記を保存</button>` : ''}
      </div>
    </div>

    <!-- 路線（距離控除）編集モーダル -->
    <div id="dist-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:50;overflow-y:auto;padding:24px;">
      <div style="background:white;border-radius:12px;max-width:640px;margin:0 auto;padding:24px;">
        <h3 id="dist-modal-title" style="font-size:16px;font-weight:700;color:#1e3a5f;margin-bottom:16px;"></h3>
        <div style="display:flex;gap:14px;margin-bottom:14px;">
          <label style="font-size:12px;color:#374151;">路線名<br><input type="text" id="dg-label" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:13px;width:140px;"></label>
          <label style="font-size:12px;color:#374151;flex:1;">補足（方向・支線など）<br><input type="text" id="dg-note" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:13px;width:100%;box-sizing:border-box;"></label>
        </div>
        <div style="font-size:12px;font-weight:700;color:#6b7280;margin-bottom:6px;">地点（起点からの累積距離 km・順番に並べる）</div>
        <div id="dg-points" style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px;"></div>
        <button type="button" onclick="addDistPoint()" style="padding:5px 14px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;font-size:12px;cursor:pointer;">＋ 地点を追加</button>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px;">
          <button onclick="closeDistGroup()" style="padding:8px 20px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;font-size:13px;cursor:pointer;">キャンセル</button>
          <button onclick="saveDistGroup()" id="dist-save-btn" style="padding:8px 24px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">保存</button>
        </div>
      </div>
    </div>

    <!-- 高速料金 行編集モーダル -->
    <div id="toll-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:50;overflow-y:auto;padding:24px;">
      <div style="background:white;border-radius:12px;max-width:520px;margin:0 auto;padding:24px;">
        <h3 id="toll-modal-title" style="font-size:16px;font-weight:700;color:#1e3a5f;margin-bottom:16px;"></h3>
        <div style="display:flex;flex-direction:column;gap:12px;">
          <label style="font-size:12px;color:#374151;">路線名<br><input type="text" id="tl-route" style="border:1px solid #d1d5db;border-radius:6px;padding:7px 9px;font-size:13px;width:100%;box-sizing:border-box;"></label>
          <label style="font-size:12px;color:#374151;">区間<br><input type="text" id="tl-section" style="border:1px solid #d1d5db;border-radius:6px;padding:7px 9px;font-size:13px;width:100%;box-sizing:border-box;"></label>
          <label style="font-size:12px;color:#374151;">料金（例: 1,710 や ～1,300）<br><input type="text" id="tl-fee" style="border:1px solid #d1d5db;border-radius:6px;padding:7px 9px;font-size:13px;width:100%;box-sizing:border-box;"></label>
          <label style="font-size:12px;color:#374151;">備考<br><input type="text" id="tl-note" style="border:1px solid #d1d5db;border-radius:6px;padding:7px 9px;font-size:13px;width:100%;box-sizing:border-box;"></label>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px;">
          <button onclick="closeToll()" style="padding:8px 20px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;font-size:13px;cursor:pointer;">キャンセル</button>
          <button onclick="saveToll()" id="toll-save-btn" style="padding:8px 24px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">保存</button>
        </div>
      </div>
    </div>

    ${saveToastHtml()}
    <script>
    ${saveToastScript()}
    var EDITABLE = ${editable ? 'true' : 'false'};
    var GROUPS = ${safeJson(groups)};
    var TOLLS = ${safeJson(tollRows)};
    var API = '${ADMIN_PATH}/api/benri';

    function showHwTab(name) {
      document.getElementById('pane-distance').style.display = name === 'distance' ? '' : 'none';
      document.getElementById('pane-toll').style.display = name === 'toll' ? '' : 'none';
      var td = document.getElementById('tab-distance'), tt = document.getElementById('tab-toll');
      td.style.background = name === 'distance' ? 'white' : '#f3f4f6';
      td.style.color = name === 'distance' ? '#1d4ed8' : '#6b7280';
      tt.style.background = name === 'toll' ? 'white' : '#f3f4f6';
      tt.style.color = name === 'toll' ? '#1d4ed8' : '#6b7280';
      try { localStorage.setItem('benri-hw-tab', name); } catch (e) {}
    }
    try { if (localStorage.getItem('benri-hw-tab') === 'toll') showHwTab('toll'); } catch (e) {}

    // ===== 距離控除表 =====
    var editingDistId = 0;
    var editingPoints = [];
    function renderDistPoints() {
      var wrap = document.getElementById('dg-points');
      wrap.innerHTML = editingPoints.map(function (p, i) {
        return '<div style="display:flex;align-items:center;gap:6px;">'
          + '<input type="text" data-i="' + i + '" data-f="name" value="' + String(p.name).replace(/"/g, '&quot;') + '" placeholder="地点名" style="border:1px solid #d1d5db;border-radius:6px;padding:5px 8px;font-size:12px;flex:1;">'
          + '<input type="number" step="0.1" data-i="' + i + '" data-f="km" value="' + p.km + '" placeholder="km" style="border:1px solid #d1d5db;border-radius:6px;padding:5px 8px;font-size:12px;width:80px;">'
          + '<button type="button" onclick="moveEditPoint(' + i + ',-1)" ' + (i === 0 ? 'disabled' : '') + ' style="padding:4px 7px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:4px;font-size:11px;cursor:pointer;">▲</button>'
          + '<button type="button" onclick="moveEditPoint(' + i + ',1)" ' + (i === editingPoints.length - 1 ? 'disabled' : '') + ' style="padding:4px 7px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:4px;font-size:11px;cursor:pointer;">▼</button>'
          + '<button type="button" onclick="removeDistPoint(' + i + ')" style="padding:4px 8px;background:#fee2e2;color:#991b1b;border:none;border-radius:4px;font-size:11px;cursor:pointer;">✕</button>'
          + '</div>';
      }).join('');
      wrap.querySelectorAll('input').forEach(function (inp) {
        inp.addEventListener('change', function () {
          var i = parseInt(inp.getAttribute('data-i'));
          var f = inp.getAttribute('data-f');
          editingPoints[i][f] = f === 'km' ? (parseFloat(inp.value) || 0) : inp.value;
        });
      });
    }
    function addDistPoint() { editingPoints.push({ name: '', km: 0 }); renderDistPoints(); }
    function removeDistPoint(i) { editingPoints.splice(i, 1); renderDistPoints(); }
    function moveEditPoint(i, dir) {
      var j = i + dir;
      if (j < 0 || j >= editingPoints.length) return;
      var tmp = editingPoints[i]; editingPoints[i] = editingPoints[j]; editingPoints[j] = tmp;
      renderDistPoints();
    }
    function openDistGroup(id) {
      editingDistId = id;
      var g = GROUPS.find(function (x) { return x.id === id; });
      document.getElementById('dist-modal-title').textContent = id ? '路線の編集: ' + g.label : '新しい路線を追加';
      document.getElementById('dg-label').value = g ? g.label : '';
      document.getElementById('dg-note').value = g ? g.note : '';
      editingPoints = g ? g.points.map(function (p) { return { name: p.name, km: p.km }; }) : [{ name: '', km: 0 }];
      renderDistPoints();
      document.getElementById('dist-modal').style.display = 'block';
    }
    function closeDistGroup() { document.getElementById('dist-modal').style.display = 'none'; }
    async function saveDistGroup() {
      var body = {
        label: document.getElementById('dg-label').value.trim(),
        note: document.getElementById('dg-note').value.trim(),
        points: editingPoints.filter(function (p) { return p.name && p.name.trim(); }),
      };
      if (!body.label) { alert('路線名を入力してください'); return; }
      if (!body.points.length) { alert('地点を1つ以上追加してください'); return; }
      var btn = document.getElementById('dist-save-btn');
      btn.disabled = true; btn.textContent = '保存中...';
      var res = await fetch(editingDistId ? API + '/distance/groups/' + editingDistId : API + '/distance/groups', {
        method: editingDistId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      btn.disabled = false; btn.textContent = '保存';
      if (res.ok) location.reload();
      else { var j = await res.json().catch(function () { return {}; }); alert(j.error || '保存に失敗しました'); }
    }
    async function delDistGroup(id, label) {
      if (!confirm('路線「' + label + '」を削除しますか？')) return;
      await fetch(API + '/distance/groups/' + id, { method: 'DELETE' });
      location.reload();
    }
    async function moveDistGroup(id, dir) {
      await fetch(API + '/distance/groups/' + id + '/move', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dir: dir }) });
      location.reload();
    }

    // ===== 高速料金表 =====
    var editingTollId = 0;
    function openToll(id) {
      editingTollId = id;
      var r = TOLLS.find(function (x) { return x.id === id; });
      document.getElementById('toll-modal-title').textContent = id ? '行の編集' : '新しい行を追加';
      document.getElementById('tl-route').value = r ? r.route_name : '';
      document.getElementById('tl-section').value = r ? r.section : '';
      document.getElementById('tl-fee').value = r ? r.fee : '';
      document.getElementById('tl-note').value = r ? r.note : '';
      document.getElementById('toll-modal').style.display = 'block';
    }
    function closeToll() { document.getElementById('toll-modal').style.display = 'none'; }
    async function saveToll() {
      var body = {
        route_name: document.getElementById('tl-route').value.trim(),
        section: document.getElementById('tl-section').value.trim(),
        fee: document.getElementById('tl-fee').value.trim(),
        note: document.getElementById('tl-note').value.trim(),
      };
      if (!body.route_name) { alert('路線名を入力してください'); return; }
      var btn = document.getElementById('toll-save-btn');
      btn.disabled = true; btn.textContent = '保存中...';
      var res = await fetch(editingTollId ? API + '/toll/' + editingTollId : API + '/toll', {
        method: editingTollId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      btn.disabled = false; btn.textContent = '保存';
      if (res.ok) { try { localStorage.setItem('benri-hw-tab', 'toll'); } catch (e) {} location.reload(); }
      else { var j = await res.json().catch(function () { return {}; }); alert(j.error || '保存に失敗しました'); }
    }
    async function delToll(id) {
      if (!confirm('この行を削除しますか？')) return;
      await fetch(API + '/toll/' + id, { method: 'DELETE' });
      try { localStorage.setItem('benri-hw-tab', 'toll'); } catch (e) {}
      location.reload();
    }
    async function moveToll(id, dir) {
      await fetch(API + '/toll/' + id + '/move', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dir: dir }) });
      try { localStorage.setItem('benri-hw-tab', 'toll'); } catch (e) {}
      location.reload();
    }
    async function saveTollFooter() {
      var btn = document.getElementById('footer-save-btn');
      btn.disabled = true; btn.textContent = '保存中...';
      var res = await fetch(API + '/toll-footer', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: document.getElementById('toll-footer').value }),
      });
      btn.disabled = false; btn.textContent = '注記を保存';
      if (res.ok) { showToast('保存しました'); try { localStorage.setItem('benri-hw-tab', 'toll'); } catch (e) {} }
      else alert('保存に失敗しました');
    }
    </script>`;
  return c.html(layout('高速料金・距離控除表', html, 'benri'));
});

// ===== API: 距離控除表 =====
app.post('/api/benri/distance/groups', async (c) => {
  const editable = await canEdit(c);
  const denied = requireEdit(c, editable); if (denied) return denied;
  const b = await c.req.json<{ label?: string; note?: string; points?: Array<{ name: string; km: number }> }>();
  const label = (b.label ?? '').trim().slice(0, 20);
  if (!label) return c.json({ error: '路線名を入力してください' }, 400);
  const points = Array.isArray(b.points) ? b.points.slice(0, 100) : [];
  const max = await c.env.DB.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM benri_distance_groups').first<{ m: number }>();
  const result = await c.env.DB.prepare('INSERT INTO benri_distance_groups (label, note, sort_order) VALUES (?, ?, ?)')
    .bind(label, (b.note ?? '').trim().slice(0, 60), (max?.m ?? 0) + 10).run();
  const groupId = result.meta.last_row_id;
  const stmts = points.map((p, i) => c.env.DB.prepare(
    'INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (?, ?, ?, ?)'
  ).bind(groupId, String(p.name ?? '').trim().slice(0, 40), Number(p.km) || 0, (i + 1) * 10));
  if (stmts.length) await c.env.DB.batch(stmts);
  return c.json({ ok: true, id: groupId });
});

app.put('/api/benri/distance/groups/:id', async (c) => {
  const editable = await canEdit(c);
  const denied = requireEdit(c, editable); if (denied) return denied;
  const id = parseInt(c.req.param('id'));
  const group = await c.env.DB.prepare('SELECT id FROM benri_distance_groups WHERE id = ?').bind(id).first<{ id: number }>();
  if (!group) return c.json({ error: '路線が見つかりません' }, 404);
  const b = await c.req.json<{ label?: string; note?: string; points?: Array<{ name: string; km: number }> }>();
  const label = (b.label ?? '').trim().slice(0, 20);
  if (!label) return c.json({ error: '路線名を入力してください' }, 400);
  const points = Array.isArray(b.points) ? b.points.slice(0, 100) : [];
  const stmts = [
    c.env.DB.prepare(`UPDATE benri_distance_groups SET label = ?, note = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
      .bind(label, (b.note ?? '').trim().slice(0, 60), id),
    c.env.DB.prepare('DELETE FROM benri_distance_points WHERE group_id = ?').bind(id),
  ];
  points.forEach((p, i) => {
    stmts.push(c.env.DB.prepare(
      'INSERT INTO benri_distance_points (group_id, name, km, sort_order) VALUES (?, ?, ?, ?)'
    ).bind(id, String(p.name ?? '').trim().slice(0, 40), Number(p.km) || 0, (i + 1) * 10));
  });
  await c.env.DB.batch(stmts);
  return c.json({ ok: true });
});

app.delete('/api/benri/distance/groups/:id', async (c) => {
  const editable = await canEdit(c);
  const denied = requireEdit(c, editable); if (denied) return denied;
  const id = parseInt(c.req.param('id'));
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM benri_distance_points WHERE group_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM benri_distance_groups WHERE id = ?').bind(id),
  ]);
  return c.json({ ok: true });
});

app.put('/api/benri/distance/groups/:id/move', async (c) => {
  const editable = await canEdit(c);
  const denied = requireEdit(c, editable); if (denied) return denied;
  const id = parseInt(c.req.param('id'));
  const { dir } = await c.req.json<{ dir?: string }>();
  const groups = (await c.env.DB.prepare('SELECT id, sort_order FROM benri_distance_groups WHERE is_active = 1 ORDER BY sort_order, id').all<{ id: number; sort_order: number }>()).results ?? [];
  const i = groups.findIndex(g => g.id === id);
  const j = dir === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= groups.length) return c.json({ ok: true });
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE benri_distance_groups SET sort_order = ? WHERE id = ?').bind(groups[j].sort_order, groups[i].id),
    c.env.DB.prepare('UPDATE benri_distance_groups SET sort_order = ? WHERE id = ?').bind(groups[i].sort_order, groups[j].id),
  ]);
  return c.json({ ok: true });
});

// ===== API: 高速料金表 =====
app.post('/api/benri/toll', async (c) => {
  const editable = await canEdit(c);
  const denied = requireEdit(c, editable); if (denied) return denied;
  const b = await c.req.json<{ route_name?: string; section?: string; fee?: string; note?: string }>();
  const routeName = (b.route_name ?? '').trim().slice(0, 40);
  if (!routeName) return c.json({ error: '路線名を入力してください' }, 400);
  const max = await c.env.DB.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM benri_toll_rows').first<{ m: number }>();
  await c.env.DB.prepare('INSERT INTO benri_toll_rows (route_name, section, fee, note, sort_order) VALUES (?, ?, ?, ?, ?)')
    .bind(routeName, (b.section ?? '').trim().slice(0, 60), (b.fee ?? '').trim().slice(0, 20), (b.note ?? '').trim().slice(0, 100), (max?.m ?? 0) + 10).run();
  return c.json({ ok: true });
});

app.put('/api/benri/toll/:id', async (c) => {
  const editable = await canEdit(c);
  const denied = requireEdit(c, editable); if (denied) return denied;
  const id = parseInt(c.req.param('id'));
  const b = await c.req.json<{ route_name?: string; section?: string; fee?: string; note?: string }>();
  const routeName = (b.route_name ?? '').trim().slice(0, 40);
  if (!routeName) return c.json({ error: '路線名を入力してください' }, 400);
  await c.env.DB.prepare(`UPDATE benri_toll_rows SET route_name = ?, section = ?, fee = ?, note = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
    .bind(routeName, (b.section ?? '').trim().slice(0, 60), (b.fee ?? '').trim().slice(0, 20), (b.note ?? '').trim().slice(0, 100), id).run();
  return c.json({ ok: true });
});

app.delete('/api/benri/toll/:id', async (c) => {
  const editable = await canEdit(c);
  const denied = requireEdit(c, editable); if (denied) return denied;
  const id = parseInt(c.req.param('id'));
  await c.env.DB.prepare('DELETE FROM benri_toll_rows WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

app.put('/api/benri/toll/:id/move', async (c) => {
  const editable = await canEdit(c);
  const denied = requireEdit(c, editable); if (denied) return denied;
  const id = parseInt(c.req.param('id'));
  const { dir } = await c.req.json<{ dir?: string }>();
  const rows = (await c.env.DB.prepare('SELECT id, sort_order FROM benri_toll_rows WHERE is_active = 1 ORDER BY sort_order, id').all<{ id: number; sort_order: number }>()).results ?? [];
  const i = rows.findIndex(r => r.id === id);
  const j = dir === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= rows.length) return c.json({ ok: true });
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE benri_toll_rows SET sort_order = ? WHERE id = ?').bind(rows[j].sort_order, rows[i].id),
    c.env.DB.prepare('UPDATE benri_toll_rows SET sort_order = ? WHERE id = ?').bind(rows[i].sort_order, rows[j].id),
  ]);
  return c.json({ ok: true });
});

app.put('/api/benri/toll-footer', async (c) => {
  const editable = await canEdit(c);
  const denied = requireEdit(c, editable); if (denied) return denied;
  const b = await c.req.json<{ content?: string }>();
  await c.env.DB.prepare(
    `INSERT INTO benri_notes (key, content, updated_at) VALUES ('toll_footer', ?, datetime('now','localtime'))
     ON CONFLICT(key) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`
  ).bind((b.content ?? '').slice(0, 4000)).run();
  return c.json({ ok: true });
});

export default app;
