// メーター検査（仮検査/本検査）・車検管理の「点検管理」ページ内タブ用パネル＋クライアントスクリプト
// 車両行はvehicle_teams(car_no, team)から自動反映されるため、車番の手入力・追加削除UIは持たない。
// 課(1-4/全課)＋班(1/2/全班)の絞り込みと、期限が近い順の並び替えはAPI側(admin_vehicle_deadlines.ts)で行う。

export function meterPanelHtml(): string {
  return `
    <div class="ins-controls" data-kind="meter">
      <label>課：</label>
      <div class="dept-tabs">
        <button class="dept-btn active" data-ka="1">1課</button>
        <button class="dept-btn" data-ka="2">2課</button>
        <button class="dept-btn" data-ka="3">3課</button>
        <button class="dept-btn" data-ka="4">4課</button>
        <button class="dept-btn" data-ka="all">全課</button>
      </div>
      <span style="color:#bbb" class="vd-team-sep">｜</span>
      <div class="dept-tabs vd-team-tabs">
        <button class="dept-btn active" data-team="">全班</button>
        <button class="dept-btn" data-team="1">1班</button>
        <button class="dept-btn" data-team="2">2班</button>
      </div>
    </div>
    <div style="font-size:12px;color:#888;margin:-4px 0 10px 2px;">板橋営業所の全車両を表示します。仮検査までの期限が近い車両から順に上に表示されます。</div>
    <div class="ins-table-wrap">
      <table class="ins-table" data-vd-table="meter">
        <thead><tr>
          <th>車番</th><th>課・班</th><th>登録番号</th><th>メーター器NO</th>
          <th>仮検査までの期限</th><th>仮検査担当者</th><th>本検査までの期限</th><th>本検査担当者</th>
          <th>前年受検日</th><th>受検日</th><th>検査済票番号</th><th>更新/交換/代替</th><th>点検者</th>
        </tr></thead>
        <tbody id="vd-meter-tbody"><tr><td colspan="13" style="padding:20px;text-align:center;color:#9ca3af;">読み込み中...</td></tr></tbody>
      </table>
    </div>
  `;
}

export function shakenPanelHtml(): string {
  return `
    <div class="ins-controls" data-kind="shaken">
      <label>課：</label>
      <div class="dept-tabs">
        <button class="dept-btn active" data-ka="1">1課</button>
        <button class="dept-btn" data-ka="2">2課</button>
        <button class="dept-btn" data-ka="3">3課</button>
        <button class="dept-btn" data-ka="4">4課</button>
        <button class="dept-btn" data-ka="all">全課</button>
      </div>
      <span style="color:#bbb" class="vd-team-sep">｜</span>
      <div class="dept-tabs vd-team-tabs">
        <button class="dept-btn active" data-team="">全班</button>
        <button class="dept-btn" data-team="1">1班</button>
        <button class="dept-btn" data-team="2">2班</button>
      </div>
    </div>
    <div style="font-size:12px;color:#888;margin:-4px 0 10px 2px;">板橋営業所の全車両を表示します。3つの期限のうち最も近いものが近い車両から順に上に表示されます。</div>
    <div class="ins-table-wrap">
      <table class="ins-table" data-vd-table="shaken">
        <thead><tr>
          <th>車番</th><th>課・班</th><th>車検日</th><th>車検リミット</th><th>車検証交換リミット</th>
        </tr></thead>
        <tbody id="vd-shaken-tbody"><tr><td colspan="5" style="padding:20px;text-align:center;color:#9ca3af;">読み込み中...</td></tr></tbody>
      </table>
    </div>
  `;
}

export function vehicleDeadlinesClientScript(adminPath: string): string {
  return `
    var VD = { meter: { ka: '1', team: '' }, shaken: { ka: '1', team: '' } };
    var VD_LOADED = { meter: false, shaken: false };

    // 班番号(1-8)は課ごとに1-2へ振り直さず、会社全体の実際の番号をそのまま使う（例: 2課は3班・4班）
    function vdTeamsForKa(ka) {
      var kaNum = parseInt(ka, 10);
      if (!(kaNum >= 1 && kaNum <= 4)) return [];
      var lo = (kaNum - 1) * 2 + 1;
      return [lo, lo + 1];
    }
    function vdRebuildTeamButtons(kind) {
      var root = document.querySelector('[data-kind="' + kind + '"]');
      if (!root) return;
      var wrap = root.querySelector('.vd-team-tabs');
      if (!wrap) return;
      var teams = vdTeamsForKa(VD[kind].ka);
      var html = '<button class="dept-btn active" data-team="">全班</button>';
      teams.forEach(function (t) { html += '<button class="dept-btn" data-team="' + t + '">' + t + '班</button>'; });
      wrap.innerHTML = html;
    }

    function vdEscAttr(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    function vdEscText(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    function vdRefresh(kind) {
      if (VD_LOADED[kind] === 'loading') return;
      VD_LOADED[kind] = 'loading';
      var s = VD[kind];
      var url = '${adminPath}/api/vehicle-deadlines/' + kind + '?ka=' + encodeURIComponent(s.ka) + (s.team ? '&team=' + s.team : '');
      fetch(url).then(function (res) {
        if (!res.ok) throw new Error('failed');
        return res.json();
      }).then(function (data) {
        vdRenderRows(kind, data.rows || []);
        VD_LOADED[kind] = true;
      }).catch(function () {
        VD_LOADED[kind] = false;
        var tbody = document.getElementById('vd-' + kind + '-tbody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="padding:20px;text-align:center;color:#dc2626;">読み込みに失敗しました</td></tr>';
      });
    }

    function vdAssigneeTd(field, id, name) {
      var n = name || '';
      return '<td style="position:relative;min-width:150px;">'
        + '<input type="text" class="vd-assignee-input" data-field="' + field + '" data-selected-id="' + (id || '') + '" data-selected-name="' + vdEscAttr(n) + '"'
        + ' value="' + vdEscAttr(n) + '" placeholder="検索して選択" autocomplete="off"'
        + ' style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:13px;box-sizing:border-box;">'
        + '<div class="vd-assignee-results" style="display:none;position:absolute;top:100%;left:0;right:0;background:#fff;border:1px solid #e5e7eb;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.12);max-height:220px;overflow-y:auto;z-index:30;"></div>'
        + '</td>';
    }

    function vdTextTd(field, value, width) {
      return '<td style="padding:6px 8px;"><input type="text" class="vd-field" data-field="' + field + '" value="' + vdEscAttr(value || '') + '" style="width:' + (width || '90px') + ';border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:13px;box-sizing:border-box;"></td>';
    }
    function vdDateTd(field, value) {
      return '<td style="padding:6px 8px;"><input type="date" class="vd-field" data-field="' + field + '" value="' + (value || '') + '" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:13px;"></td>';
    }
    var VD_UPDATE_KIND_LABELS = { renewal: '更新', exchange: '交換', substitute: '代替' };
    function vdUpdateKindTd(value) {
      var opts = ['', 'renewal', 'exchange', 'substitute'].map(function (k) {
        var label = k === '' ? '－' : VD_UPDATE_KIND_LABELS[k];
        return '<option value="' + k + '"' + (value === k || (!value && k === '') ? ' selected' : '') + '>' + label + '</option>';
      }).join('');
      return '<td style="padding:6px 8px;"><select class="vd-field" data-field="update_kind" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 4px;font-size:13px;">' + opts + '</select></td>';
    }

    function vdMeterRowHtml(r) {
      return '<tr data-car-no="' + vdEscAttr(r.car_no) + '">'
        + '<td style="padding:6px 8px;text-align:center;font-weight:700;">' + vdEscText(r.car_no) + '</td>'
        + '<td style="padding:6px 8px;text-align:center;color:#666;">' + r.ka + '課' + r.team + '班</td>'
        + vdTextTd('registration_no', r.registration_no, '110px')
        + vdTextTd('meter_device_no', r.meter_device_no, '90px')
        + vdDateTd('tentative_limit', r.tentative_limit)
        + vdAssigneeTd('tentative_assignee', r.tentative_assignee_id, r.tentative_assignee_name)
        + vdDateTd('honkensa_limit', r.honkensa_limit)
        + vdAssigneeTd('honkensa_assignee', r.honkensa_assignee_id, r.honkensa_assignee_name)
        + vdDateTd('prev_inspection_date', r.prev_inspection_date)
        + vdDateTd('inspection_date', r.inspection_date)
        + vdTextTd('cert_no', r.cert_no, '80px')
        + vdUpdateKindTd(r.update_kind)
        + vdTextTd('checker_name', r.checker_name, '70px')
        + '</tr>';
    }

    function vdShakenRowHtml(r) {
      return '<tr data-car-no="' + vdEscAttr(r.car_no) + '">'
        + '<td style="padding:6px 8px;text-align:center;font-weight:700;">' + vdEscText(r.car_no) + '</td>'
        + '<td style="padding:6px 8px;text-align:center;color:#666;">' + r.ka + '課' + r.team + '班</td>'
        + '<td style="padding:6px 8px;"><input type="date" class="vd-field" data-field="shaken_date" value="' + (r.shaken_date || '') + '" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:13px;"></td>'
        + '<td style="padding:6px 8px;"><input type="date" class="vd-field" data-field="shaken_limit" value="' + (r.shaken_limit || '') + '" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:13px;"></td>'
        + '<td style="padding:6px 8px;"><input type="date" class="vd-field" data-field="cert_exchange_limit" value="' + (r.cert_exchange_limit || '') + '" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:13px;"></td>'
        + '</tr>';
    }

    function vdRenderRows(kind, rows) {
      var tbody = document.getElementById('vd-' + kind + '-tbody');
      if (!tbody) return;
      if (!rows.length) {
        var cols = kind === 'meter' ? 13 : 5;
        tbody.innerHTML = '<tr><td colspan="' + cols + '" style="padding:20px;text-align:center;color:#9ca3af;">該当する車両がありません</td></tr>';
        return;
      }
      tbody.innerHTML = rows.map(kind === 'meter' ? vdMeterRowHtml : vdShakenRowHtml).join('');
    }

    function vdUpdateActiveButtons(kind) {
      var s = VD[kind];
      var root = document.querySelector('[data-kind="' + kind + '"]');
      if (!root) return;
      root.querySelectorAll('[data-ka]').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-ka') === s.ka); });
      root.querySelectorAll('[data-team]').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-team') === s.team); });
      var show = s.ka !== 'all';
      var teamTabs = root.querySelector('.vd-team-tabs');
      var teamSep = root.querySelector('.vd-team-sep');
      if (teamTabs) teamTabs.style.display = show ? '' : 'none';
      if (teamSep) teamSep.style.display = show ? '' : 'none';
    }

    async function vdSaveFields(kind, carNo, fields) {
      try {
        var res = await fetch('${adminPath}/api/vehicle-deadlines/' + kind + '/' + encodeURIComponent(carNo), {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields)
        });
        if (!res.ok) { alert('保存に失敗しました'); return; }
        showToast('保存しました');
      } catch (e) { alert('通信エラーが発生しました'); }
    }
    function vdSaveField(kind, carNo, field, value) {
      var o = {};
      o[field] = value === '' ? null : value;
      vdSaveFields(kind, carNo, o);
    }
    function vdCommitAssignee(input, id, name) {
      var tr = input.closest('tr[data-car-no]');
      var table = input.closest('table[data-vd-table]');
      if (!tr || !table) return;
      var carNo = tr.getAttribute('data-car-no');
      var kind = table.getAttribute('data-vd-table');
      var field = input.getAttribute('data-field');
      var body = {};
      body[field + '_id'] = id === '' ? null : Number(id);
      body[field + '_name'] = name === '' ? null : name;
      vdSaveFields(kind, carNo, body);
    }

    document.addEventListener('click', function (ev) {
      var kaBtn = ev.target.closest('.dept-tabs [data-ka]');
      if (kaBtn) {
        var kindEl = kaBtn.closest('[data-kind]');
        if (!kindEl) return;
        var kind = kindEl.getAttribute('data-kind');
        VD[kind].ka = kaBtn.getAttribute('data-ka');
        VD[kind].team = '';
        vdRebuildTeamButtons(kind);
        vdUpdateActiveButtons(kind);
        vdRefresh(kind);
        return;
      }
      var teamBtn = ev.target.closest('.dept-tabs [data-team]');
      if (teamBtn) {
        var kindEl2 = teamBtn.closest('[data-kind]');
        if (!kindEl2) return;
        var kind2 = kindEl2.getAttribute('data-kind');
        VD[kind2].team = teamBtn.getAttribute('data-team');
        vdUpdateActiveButtons(kind2);
        vdRefresh(kind2);
        return;
      }
      var resultRow = ev.target.closest('.vd-assignee-result');
      if (resultRow) {
        var results = resultRow.parentElement;
        var input = results.previousElementSibling;
        var id = resultRow.getAttribute('data-id');
        var name = resultRow.getAttribute('data-name');
        input.value = name;
        input.setAttribute('data-selected-id', id);
        input.setAttribute('data-selected-name', name);
        results.style.display = 'none';
        vdCommitAssignee(input, id, name);
        return;
      }
      if (!ev.target.classList || !ev.target.classList.contains('vd-assignee-input')) {
        document.querySelectorAll('.vd-assignee-results').forEach(function (r) { r.style.display = 'none'; });
      }
    });

    document.addEventListener('change', function (ev) {
      var el = ev.target;
      if (!el.classList || !el.classList.contains('vd-field')) return;
      var tr = el.closest('tr[data-car-no]');
      var table = el.closest('table[data-vd-table]');
      if (!tr || !table) return;
      vdSaveField(table.getAttribute('data-vd-table'), tr.getAttribute('data-car-no'), el.getAttribute('data-field'), el.value);
    });

    document.addEventListener('input', function (ev) {
      var el = ev.target;
      if (!el.classList || !el.classList.contains('vd-assignee-input')) return;
      clearTimeout(el._searchTimer);
      var q = el.value.trim();
      var results = el.nextElementSibling;
      if (!q) { results.style.display = 'none'; results.innerHTML = ''; return; }
      el._searchTimer = setTimeout(function () {
        fetch('${adminPath}/api/vehicle-deadlines/search-employees?q=' + encodeURIComponent(q))
          .then(function (res) { return res.ok ? res.json() : []; })
          .then(function (list) {
            results.innerHTML = list.length
              ? list.map(function (e) {
                  return '<div class="vd-assignee-result" data-id="' + e.id + '" data-name="' + vdEscAttr(e.name) + '" style="padding:8px 10px;font-size:13px;cursor:pointer;border-bottom:1px solid #f3f4f6;">'
                    + vdEscText(e.name) + '<span style="color:#9ca3af;margin-left:6px;font-size:11px;">' + vdEscText(e.emp_no) + '</span></div>';
                }).join('')
              : '<div style="padding:8px 10px;font-size:12px;color:#9ca3af;">該当する社員がいません</div>';
            results.style.display = 'block';
          }).catch(function () {});
      }, 200);
    });

    document.addEventListener('blur', function (ev) {
      var el = ev.target;
      if (!el.classList || !el.classList.contains('vd-assignee-input')) return;
      setTimeout(function () {
        var selectedName = el.getAttribute('data-selected-name') || '';
        if (el.value.trim() === '') {
          if (selectedName !== '') {
            el.setAttribute('data-selected-id', '');
            el.setAttribute('data-selected-name', '');
            vdCommitAssignee(el, '', '');
          }
        } else if (el.value !== selectedName) {
          el.value = selectedName;
        }
      }, 150);
    }, true);
  `;
}
