// バジル&ドラゴンズ（設定 → バトル設定・管理側）
// ページ: /settings/puzzle（共有URL/QR・基本設定・味方キャラ（社員写真＋ガチャキャラ）・敵キャラ・ランキング）
// API   : /api/puzzle/*（ページ権限: settings.puzzle、書き込みは settings.puzzle.edit）
// 味方キャラの写真はバースデーモード（birthday_celebrants）の写真を R2 の puzzle/ally/ 配下に「コピー」して使う。
// バースデー側のテーブル・写真は読むだけで一切変更しない。
// 画像は Workers AI（flux-1-schnell）で生成できる（「AIで作る」）。生成画像は R2 の puzzle/gen/ に保存。
// 公開側（ゲーム画面）は routes/public_puzzle.ts / html/puzzle_page.ts を参照。
import { Hono } from 'hono';
import qrcode from 'qrcode-generator';
import type { Env } from '../auth';
import { layout, safeJson } from '../html/layout';
import { settingsSubHeader } from './admin';
import { ADMIN_PATH, PUZZLE_PATH } from '../config';
import { getAdminPermissions } from '../permissions';
import { loadPuzzleSettings, loadAllies, loadEnemies, ELEMENTS, ELEMENT_LABEL, CHEAT_COMMAND, GUIDE_IMG_KEY, GUIDE_PROMPT } from './public_puzzle';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

const SHARE_URL = `https://bentenclub.com${PUZZLE_PATH}`;
const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
const MAX_PHOTO_SIZE = 8 * 1024 * 1024;
const AI_MODEL = '@cf/black-forest-labs/flux-1-schnell';

async function canEdit(c: { env: Env; get: (k: 'adminId') => number }): Promise<boolean> {
  const perms = await getAdminPermissions(c.env.DB, c.get('adminId'));
  return perms === null || perms.includes('settings.puzzle.edit');
}

function qrSvg(data: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(data);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true }).replace(/black/g, '#1e3a5f').replace(/white/g, '#ffffff');
}

const esc = (s: string) => s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
const isElement = (s: string): boolean => (ELEMENTS as readonly string[]).includes(s);
const toInt = (v: unknown, min: number, max: number, fb: number) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fb; };

// ===== ページ =====
app.get('/settings/puzzle', async (c) => {
  const editable = await canEdit(c);
  const s = await loadPuzzleSettings(c.env.DB);
  const allies = await loadAllies(c.env.DB, false);
  const enemies = await loadEnemies(c.env.DB, false);
  const ranking = (await c.env.DB.prepare(`
    SELECT p.nickname, p.real_name, p.emp_no, p.coins, p.is_cheater, MAX(s.score) AS score, MAX(s.cleared) AS cleared, COUNT(s.id) AS plays, MAX(s.created_at) AS last
    FROM puzzle_players p JOIN puzzle_scores s ON s.player_id = p.id AND s.cheated = 0
    GROUP BY p.id ORDER BY score DESC, MIN(s.id) ASC LIMIT 100`).all<{ nickname: string; real_name: string; emp_no: string; coins: number; is_cheater: number; score: number; cleared: number; plays: number; last: string }>()).results ?? [];
  const players = (await c.env.DB.prepare('SELECT COUNT(*) AS n FROM puzzle_players').first<{ n: number }>())?.n ?? 0;
  const celebrants = (await c.env.DB.prepare('SELECT COUNT(*) AS n FROM birthday_celebrants WHERE is_active = 1').first<{ n: number }>())?.n ?? 0;

  const box = 'background:white;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-bottom:16px;max-width:1100px;';
  const btn = (bg: string, bd: string, fg: string) => `padding:7px 14px;background:${bg};border:1px solid ${bd};color:${fg};border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;`;
  const status = s.is_open
    ? `<span style="background:#dcfce7;color:#166534;font-weight:700;font-size:12px;padding:3px 10px;border-radius:999px;">公開中</span>`
    : `<span style="background:#f3f4f6;color:#6b7280;font-weight:700;font-size:12px;padding:3px 10px;border-radius:999px;">準備中（参戦できません）</span>`;
  const elOptions = (cur: string) => ELEMENTS.map(e => `<option value="${e}"${e === cur ? ' selected' : ''}>${ELEMENT_LABEL[e]}</option>`).join('');
  const dis = editable ? '' : ' disabled';
  const noImg = allies.filter(a => a.kind === 'art' && !a.photo_r2_key).length + enemies.filter(e => !e.photo_r2_key).length;
  const guideImg = !!(await c.env.DOCUMENTS_BUCKET.head(GUIDE_IMG_KEY).catch(() => null));

  const imgCell = (kind: 'allies' | 'enemies', id: number, hasImg: boolean, isPhoto: boolean, style: string) => `
      <td style="width:150px;"><div style="display:flex;gap:8px;align-items:center;">
        <div class="pz-ph${kind === 'enemies' ? ' pz-en' : ''}" style="background-image:url(/api/public/puzzle/img/${kind === 'allies' ? 'ally' : 'enemy'}/${id}?v=${Date.now()});${style}"></div>
        ${editable ? `<div style="display:flex;flex-direction:column;gap:3px;">
          ${!isPhoto ? `<button class="pz-gen" style="${btn('#eef2ff', '#c7d2fe', '#3730a3')}padding:3px 8px;font-size:11px;">AIで作る</button>` : ''}
          <label class="pz-up">画像変更<input type="file" accept="image/*" class="pz-img" style="display:none;"></label>
          ${!hasImg && !isPhoto ? '<span style="font-size:10px;color:#b45309;">未生成</span>' : ''}
        </div>` : ''}
      </div></td>`;

  const allyRows = allies.map((a, i) => `
    <tr data-id="${a.id}" data-kind="allies" data-noimg="${a.kind === 'art' && !a.photo_r2_key ? 1 : 0}">
      ${imgCell('allies', a.id, !!a.photo_r2_key, a.kind === 'photo', a.kind === 'photo' ? `background-position:${a.photo_offset_x}% ${a.photo_offset_y}%;background-size:${Math.round(a.photo_scale * 100)}%;` : '')}
      <td>${a.kind === 'photo' ? '<span class="pz-tag pz-tag-photo">社員</span>' : '<span class="pz-tag pz-tag-art">キャラ</span>'}</td>
      <td><input class="pz-in" data-f="name" type="text" maxlength="24" value="${esc(a.name)}"${dis}><input class="pz-in" data-f="description" type="text" maxlength="80" placeholder="説明（キャラ図鑑に出ます）" value="${esc(a.description)}" style="margin-top:3px;font-size:11px;"${dis}></td>
      <td>${a.kind === 'art' ? `<select class="pz-in" data-f="rarity"${dis}>${[5, 4, 3].map(r => `<option value="${r}"${r === a.rarity ? ' selected' : ''}>★${r}</option>`).join('')}</select>` : '-'}</td>
      <td><input class="pz-in pz-num" data-f="hp" type="number" min="1" max="9999" value="${a.hp}"${dis}></td>
      <td><input class="pz-in pz-num" data-f="atk" type="number" min="1" max="999" value="${a.atk}"${dis}></td>
      <td><select class="pz-in" data-f="element"${dis}>${elOptions(a.element)}</select></td>
      <td style="text-align:center;">${a.kind === 'art' ? `<input class="pz-in" data-f="in_gacha" type="checkbox"${a.in_gacha ? ' checked' : ''}${dis}>` : '-'}</td>
      <td style="text-align:center;"><input class="pz-in" data-f="is_active" type="checkbox"${a.is_active ? ' checked' : ''}${dis}></td>
      <td style="white-space:nowrap;">${editable ? `<button class="pz-mv" data-dir="-1" title="上へ"${i === 0 ? ' disabled' : ''}>▲</button><button class="pz-mv" data-dir="1" title="下へ"${i === allies.length - 1 ? ' disabled' : ''}>▼</button> <button class="pz-del" style="color:#dc2626;">削除</button>` : ''}</td>
    </tr>`).join('');

  const enemyRows = enemies.map((e, i) => `
    <tr data-id="${e.id}" data-kind="enemies" data-noimg="${e.photo_r2_key ? 0 : 1}">
      ${imgCell('enemies', e.id, !!e.photo_r2_key, false, '')}
      <td><input class="pz-in" data-f="name" type="text" maxlength="24" value="${esc(e.name)}"${dis}><input class="pz-in" data-f="description" type="text" maxlength="80" placeholder="説明" value="${esc(e.description)}" style="margin-top:3px;font-size:11px;"${dis}></td>
      <td><input class="pz-in pz-num" data-f="hp" type="number" min="1" max="99999" value="${e.hp}"${dis}></td>
      <td><input class="pz-in pz-num" data-f="atk" type="number" min="1" max="9999" value="${e.atk}"${dis}></td>
      <td><select class="pz-in" data-f="element"${dis}>${elOptions(e.element)}</select></td>
      <td style="text-align:center;white-space:nowrap;"><label style="font-size:11px;"><input class="pz-in" data-f="is_boss" type="checkbox"${e.is_boss ? ' checked' : ''}${dis}> ボス</label><br><label style="font-size:11px;"><input class="pz-in" data-f="is_final" type="checkbox"${e.is_final ? ' checked' : ''}${dis}> ラスボス</label></td>
      <td style="text-align:center;"><input class="pz-in" data-f="is_active" type="checkbox"${e.is_active ? ' checked' : ''}${dis}></td>
      <td style="white-space:nowrap;">${editable ? `<button class="pz-mv" data-dir="-1"${i === 0 ? ' disabled' : ''}>▲</button><button class="pz-mv" data-dir="1"${i === enemies.length - 1 ? ' disabled' : ''}>▼</button> <button class="pz-del" style="color:#dc2626;">削除</button>` : ''}</td>
    </tr>`).join('');

  const rankRows = ranking.map((r, i) => `
    <tr><td style="font-weight:700;">${i + 1}</td><td>${esc(r.nickname)}${r.cleared ? ' <span style="font-size:11px;color:#b45309;">★全クリア</span>' : ''}${r.is_cheater ? ' <span style="font-size:11px;color:#6b7280;">（裏パネル使用）</span>' : ''}</td>
      <td style="color:#6b7280;">${r.emp_no ? esc(r.emp_no) + ' ' + esc(r.real_name) : '（ニックネームのみ）'}</td>
      <td style="text-align:right;font-weight:700;">${r.score.toLocaleString()}</td><td style="text-align:right;">${r.plays}</td><td style="text-align:right;">${r.coins.toLocaleString()}</td><td style="color:#6b7280;">${esc(r.last ?? '')}</td></tr>`).join('');

  const html = settingsSubHeader('バトル設定（バジル&ドラゴンズ）') + `
    <style>
      .pz-tbl { border-collapse: collapse; width: 100%; font-size: 13px; }
      .pz-tbl th { background: #f8fafc; color: #6b7280; font-size: 12px; font-weight: 700; text-align: left; padding: 6px 8px; border-bottom: 1px solid #e5e7eb; white-space: nowrap; }
      .pz-tbl td { padding: 4px 8px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
      .pz-in { border: 1px solid #d1d5db; border-radius: 6px; padding: 5px 7px; font-size: 13px; font-family: inherit; width: 100%; box-sizing: border-box; }
      .pz-in.pz-num { width: 72px; }
      .pz-in[type=checkbox] { width: auto; }
      .pz-in.saved { border-color: #86efac; background: #f0fdf4; }
      .pz-ph { width: 56px; height: 56px; border-radius: 8px; background: #e5e7eb center/cover no-repeat; flex-shrink: 0; }
      .pz-ph.pz-en { background-color: #1e293b; }
      .pz-tag { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; white-space: nowrap; }
      .pz-tag-photo { background: #dbeafe; color: #1e40af; } .pz-tag-art { background: #fce7f3; color: #9d174d; }
      .pz-mv { border: 1px solid #d1d5db; background: #fff; border-radius: 4px; font-size: 11px; cursor: pointer; padding: 2px 5px; }
      .pz-mv:disabled { opacity: 0.3; cursor: default; }
      .pz-del { border: 1px solid #fecaca; background: #fff; border-radius: 4px; font-size: 11px; cursor: pointer; padding: 2px 6px; }
      .pz-up { display: inline-block; font-size: 11px; color: #2563eb; cursor: pointer; text-decoration: underline; }
      .pz-gen.busy { opacity: 0.5; pointer-events: none; }
      .pz-sec-title { font-size: 14px; font-weight: 700; color: #1e3a5f; margin-bottom: 10px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .pz-help { font-size: 12px; color: #6b7280; line-height: 1.7; margin-bottom: 10px; }
      .pz-lbl { font-size: 12px; color: #6b7280; display: block; }
      #pz-progress { font-size: 12px; color: #1e3a5f; font-weight: 700; }
    </style>

    <div style="${box}">
      <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start;">
        <div style="width:110px;height:110px;flex-shrink:0;">${qrSvg(SHARE_URL)}</div>
        <div style="flex:1;min-width:240px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
            <span style="font-size:13px;font-weight:700;color:#1e3a5f;">ゲームの共有URL</span>${status}
            <span style="font-size:12px;color:#6b7280;">参加 ${players} 人</span>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <code style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px;padding:8px 10px;font-size:12px;word-break:break-all;flex:1;min-width:200px;">${SHARE_URL}</code>
            <button onclick="pzCopy()" style="${btn('#f0fdf4', '#86efac', '#166534')}">コピー</button>
            <a href="${PUZZLE_PATH}" target="_blank" rel="noopener" style="${btn('#eff6ff', '#bfdbfe', '#1d4ed8')}text-decoration:none;">開く</a>
          </div>
          <div class="pz-help" style="margin-top:8px;">
            乗務員はこのURLを開き、社員番号（ない人はニックネーム）で参戦します。味方は「社員（写真）」は最初から全員使え、「キャラ」はコインでガチャを引いて集めます。
            バトルでコインと経験値がたまり、強化でレベルアップ。ランキングはニックネームで参加者全員に見えます（本名は出ません）。
          </div>
          <div class="pz-help" style="background:#f8fafc;border:1px dashed #e5e7eb;border-radius:6px;padding:8px 10px;">
            <b>裏パネル（adminだけ）</b>: ゲーム画面のロゴを5回タップ → 合言葉 <code>${esc(CHEAT_COMMAND)}</code> を入力。adminアカウントで管理画面にログインしているブラウザだけ通ります（一撃必殺・無敵・コイン・全キャラ入手・LvMAX）。裏パネルで遊んだ記録はランキングに入りません。
          </div>
        </div>
      </div>
    </div>

    <div style="${box}">
      <div class="pz-sec-title">基本設定</div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end;">
        <label class="pz-lbl">タイトル<input id="pz-title" class="pz-in" type="text" maxlength="30" value="${esc(s.title)}" style="width:220px;margin-top:3px;"${dis}></label>
        <label class="pz-lbl">チームの人数<select id="pz-team" class="pz-in" style="width:80px;margin-top:3px;"${dis}>${[1, 2, 3, 4].map(n => `<option value="${n}"${n === s.team_size ? ' selected' : ''}>${n}人</option>`).join('')}</select></label>
        <label class="pz-lbl">敵が攻撃するまでの手数<select id="pz-int" class="pz-in" style="width:90px;margin-top:3px;"${dis}>${[1, 2, 3, 4, 5, 6].map(n => `<option value="${n}"${n === s.enemy_interval ? ' selected' : ''}>${n}手ごと</option>`).join('')}</select></label>
        <label class="pz-lbl">ガチャ1回のコイン<input id="pz-gacha" class="pz-in pz-num" type="number" min="1" max="99999" value="${s.gacha_cost}" style="margin-top:3px;"${dis}></label>
        <label class="pz-lbl">強化1回のコイン<input id="pz-train" class="pz-in pz-num" type="number" min="1" max="99999" value="${s.train_cost}" style="margin-top:3px;"${dis}></label>
        <label class="pz-lbl" style="display:flex;align-items:center;gap:6px;padding-bottom:6px;"><input id="pz-open" type="checkbox"${s.is_open ? ' checked' : ''}${dis}> 公開する（OFFにすると「準備中」）</label>
        ${editable ? `<button onclick="pzSaveSettings(this)" style="${btn('#1e3a5f', '#1e3a5f', '#fff')}">保存</button>` : ''}
      </div>
      <div class="pz-help" style="margin-top:8px;">目安: 参戦時に500コイン。1バトルで50〜300コインくらい。ガチャ10連は1回ぶんおトク（9回分の値段）。</div>
    </div>

    ${editable ? `
    <div style="${box}background:#eef2ff;border-color:#c7d2fe;">
      <div class="pz-sec-title">AI画像生成（Workers AI）
        <button id="pz-gen-all" onclick="pzGenAll(this)" style="${btn('#4338ca', '#4338ca', '#fff')}margin-left:auto;">画像がないキャラ・敵をまとめて作る（${noImg}件）</button>
        <span id="pz-progress"></span>
      </div>
      <div class="pz-help" style="margin:0;">各行の「AIで作る」で1枚ずつ作れます（1枚 10〜20秒）。気に入らなければもう一度押せば作り直し。別のソフトで作った画像は「画像変更」でアップロードして差し替えられます。
        <br><b>案内人 妖精バジル</b>: <span id="pz-guide-st">${guideImg ? '画像あり' : '未生成（図形のバジルが出ます）'}</span>
        <button class="pz-gen" onclick="pzGenGuide(this)" style="${btn('#eef2ff', '#c7d2fe', '#3730a3')}padding:3px 8px;font-size:11px;">${guideImg ? '作り直す' : 'AIで作る'}</button>
        <label class="pz-up">画像変更<input type="file" accept="image/*" id="pz-guide-up" style="display:none;"></label>
        ${guideImg ? `<img src="/api/public/puzzle/img/guide?v=${Date.now()}" style="width:44px;height:44px;border-radius:50%;vertical-align:middle;margin-left:6px;border:2px solid #41d47d;">` : ''}<br>
        指示文（英語）は各キャラにあらかじめ用意してあります。<button class="pz-up" onclick="pzCopyPrompts()" style="border:none;background:none;font-family:inherit;">指示文一覧をコピー（他のAIで作るとき用）</button></div>
    </div>` : ''}

    <div style="${box}">
      <div class="pz-sec-title">味方キャラ<span style="font-size:12px;color:#6b7280;font-weight:400;">社員 ${allies.filter(a => a.kind === 'photo').length}人・キャラ ${allies.filter(a => a.kind === 'art').length}体</span>
        ${editable ? `<button onclick="pzImport(this)" style="${btn('#eff6ff', '#bfdbfe', '#1d4ed8')}margin-left:auto;">バースデーモードから写真を取り込む（対象 ${celebrants}人）</button><button onclick="pzAddChar(this)" style="${btn('#fdf2f8', '#fbcfe8', '#9d174d')}">キャラを追加</button>` : ''}
      </div>
      <div class="pz-help">
        「社員」はバースデーモードの写真を<b>コピー</b>したもの（バースデー側は変わりません）で、全員が最初から使えます。「キャラ」はガチャで手に入ります（「ガチャ」にチェックがある★3〜5のキャラが出ます）。
        変えた所はその場で保存されます。属性: 火は木に強い／木は水に強い／水は火に強い／光と闇はおたがいに強い。
      </div>
      <table class="pz-tbl" id="pz-allies"><thead><tr><th>画像</th><th>種別</th><th>表示名・説明</th><th>レア</th><th>HP</th><th>攻撃</th><th>属性</th><th>ガチャ</th><th>出す</th><th>並び</th></tr></thead>
        <tbody>${allyRows || '<tr><td colspan="10" style="color:#9ca3af;text-align:center;padding:16px;">まだ味方キャラがいません</td></tr>'}</tbody></table>
    </div>

    <div style="${box}">
      <div class="pz-sec-title">敵キャラ<span style="font-size:12px;color:#6b7280;font-weight:400;">${enemies.length}体・上から順にステージ1, 2, 3…</span></div>
      <div class="pz-help">HPが大きいほど倒すのに時間がかかり、攻撃が大きいほど手ごわくなります。「ボス」は大きく表示され、「ラスボス」は名前が「？？？」で出て途中で正体が明かされます（最後に置いてください）。</div>
      <table class="pz-tbl" id="pz-enemies"><thead><tr><th>画像</th><th>名前・説明</th><th>HP</th><th>攻撃</th><th>属性</th><th>ボス</th><th>出す</th><th>並び</th></tr></thead>
        <tbody>${enemyRows || '<tr><td colspan="8" style="color:#9ca3af;text-align:center;padding:16px;">まだ敵がいません</td></tr>'}</tbody></table>
      ${editable ? `
      <div style="margin-top:14px;padding-top:12px;border-top:1px dashed #e5e7eb;display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
        <label class="pz-lbl">名前<input id="ne-name" class="pz-in" type="text" maxlength="24" placeholder="例: 渋滞マン" style="width:160px;margin-top:3px;"></label>
        <label class="pz-lbl">HP<input id="ne-hp" class="pz-in pz-num" type="number" min="1" max="99999" value="300" style="margin-top:3px;"></label>
        <label class="pz-lbl">攻撃<input id="ne-atk" class="pz-in pz-num" type="number" min="1" max="9999" value="30" style="margin-top:3px;"></label>
        <label class="pz-lbl">属性<select id="ne-el" class="pz-in" style="width:80px;margin-top:3px;">${elOptions('fire')}</select></label>
        <label class="pz-lbl">画像（任意・あとでAIでも作れます）<input id="ne-img" type="file" accept="image/*" style="margin-top:3px;font-size:12px;"></label>
        <button onclick="pzAddEnemy(this)" style="${btn('#1e3a5f', '#1e3a5f', '#fff')}">敵を追加</button>
      </div>` : ''}
    </div>

    <div style="${box}">
      <div class="pz-sec-title">ランキング<span style="font-size:12px;color:#6b7280;font-weight:400;">参加 ${players} 人・上位100人（裏パネルの記録は除外）</span>
        ${editable ? `<button onclick="pzResetRanking(this)" style="${btn('#fef2f2', '#fecaca', '#991b1b')}margin-left:auto;">ランキングをリセット（全プレイ記録を削除）</button>` : ''}
      </div>
      <div class="pz-help">本名の列は管理画面だけに出ます（ゲーム側ではニックネームだけ）。</div>
      <table class="pz-tbl"><thead><tr><th>順位</th><th>ニックネーム</th><th>社員番号・本名</th><th style="text-align:right">スコア</th><th style="text-align:right">回数</th><th style="text-align:right">コイン</th><th>最後に遊んだ日</th></tr></thead>
        <tbody>${rankRows || '<tr><td colspan="7" style="color:#9ca3af;text-align:center;padding:16px;">まだ記録がありません</td></tr>'}</tbody></table>
    </div>

    <script>
      var PZ_API = ${safeJson(`${ADMIN_PATH}/api/puzzle`)};
      var PZ_PROMPTS = ${safeJson([...allies.filter(a => a.kind === 'art').map(a => ({ t: '味方', n: a.name, p: a.art_prompt })), ...enemies.map(e => ({ t: '敵', n: e.name, p: e.art_prompt }))])};
      function pzCopy() { navigator.clipboard.writeText(${safeJson(SHARE_URL)}).then(function(){ alert('コピーしました'); }); }
      function pzCopyPrompts() { navigator.clipboard.writeText(PZ_PROMPTS.map(function(x){ return '【' + x.t + '】' + x.n + '\\n' + (x.p || '(指示文なし)'); }).join('\\n\\n')).then(function(){ alert('指示文一覧をコピーしました'); }); }
      async function pzSend(method, url, body, isForm) {
        var opt = { method: method, credentials: 'include' };
        if (isForm) opt.body = body; else if (body) { opt.headers = { 'Content-Type': 'application/json' }; opt.body = JSON.stringify(body); }
        var res = await fetch(url, opt);
        var j = await res.json().catch(function(){ return {}; });
        if (!res.ok) throw new Error(j.error || ('エラー ' + res.status));
        return j;
      }
      async function pzSaveSettings(b) {
        b.disabled = true;
        try {
          await pzSend('POST', PZ_API + '/settings', { title: document.getElementById('pz-title').value, team_size: document.getElementById('pz-team').value, enemy_interval: document.getElementById('pz-int').value,
            gacha_cost: document.getElementById('pz-gacha').value, train_cost: document.getElementById('pz-train').value, is_open: document.getElementById('pz-open').checked ? 1 : 0 });
          location.reload();
        } catch (e) { alert(e.message); b.disabled = false; }
      }
      async function pzImport(b) {
        if (!confirm('バースデーモードの写真をコピーして味方キャラに追加します。よろしいですか？')) return;
        b.disabled = true; b.textContent = '取り込み中…';
        try { var j = await pzSend('POST', PZ_API + '/allies/import'); alert(j.added + '人を追加しました' + (j.skipped ? '（' + j.skipped + '人は取り込み済み）' : '')); location.reload(); }
        catch (e) { alert(e.message); b.disabled = false; b.textContent = '取り込む'; }
      }
      async function pzAddChar(b) {
        var name = prompt('キャラの名前'); if (!name) return;
        b.disabled = true;
        try { await pzSend('POST', PZ_API + '/allies', { name: name }); location.reload(); } catch (e) { alert(e.message); b.disabled = false; }
      }
      // 行内の入力は変更したらその場で保存
      function pzBindRows(tableId, kind) {
        var tbl = document.getElementById(tableId); if (!tbl) return;
        tbl.querySelectorAll('tbody tr[data-id]').forEach(function(tr) {
          var id = tr.getAttribute('data-id');
          tr.querySelectorAll('.pz-in').forEach(function(inp) {
            inp.addEventListener('change', async function() {
              var body = {}; body[inp.getAttribute('data-f')] = inp.type === 'checkbox' ? (inp.checked ? 1 : 0) : inp.value;
              try { await pzSend('POST', PZ_API + '/' + kind + '/' + id, body); inp.classList.add('saved'); setTimeout(function(){ inp.classList.remove('saved'); }, 1200); }
              catch (e) { alert(e.message); }
            });
          });
          tr.querySelectorAll('.pz-mv').forEach(function(btn) {
            btn.addEventListener('click', async function() {
              try { await pzSend('POST', PZ_API + '/' + kind + '/' + id + '/move', { dir: parseInt(btn.getAttribute('data-dir'), 10) }); location.reload(); } catch (e) { alert(e.message); }
            });
          });
          var del = tr.querySelector('.pz-del');
          if (del) del.addEventListener('click', async function() {
            if (!confirm('削除しますか？')) return;
            try { await pzSend('DELETE', PZ_API + '/' + kind + '/' + id); location.reload(); } catch (e) { alert(e.message); }
          });
          var img = tr.querySelector('.pz-img');
          if (img) img.addEventListener('change', async function() {
            if (!img.files || !img.files[0]) return;
            var fd = new FormData(); fd.append('photo', img.files[0]);
            try { await pzSend('POST', PZ_API + '/' + kind + '/' + id + '/photo', fd, true); location.reload(); } catch (e) { alert(e.message); }
          });
          var gen = tr.querySelector('.pz-gen');
          if (gen) gen.addEventListener('click', function(){ pzGenOne(tr, kind, id, gen); });
        });
      }
      async function pzGenOne(tr, kind, id, btn) {
        btn.classList.add('busy'); var old = btn.textContent; btn.textContent = '生成中…';
        try {
          await pzSend('POST', PZ_API + '/' + kind + '/' + id + '/generate');
          var ph = tr.querySelector('.pz-ph'); ph.style.backgroundImage = 'url(/api/public/puzzle/img/' + (kind === 'allies' ? 'ally' : 'enemy') + '/' + id + '?v=' + Date.now() + ')';
          tr.setAttribute('data-noimg', '0'); var tag = tr.querySelector('span[style*="b45309"]'); if (tag) tag.remove();
          btn.textContent = '作り直す';
        } catch (e) { alert(e.message); btn.textContent = old; }
        btn.classList.remove('busy');
      }
      async function pzGenAll(b) {
        var rows = Array.prototype.slice.call(document.querySelectorAll('tr[data-noimg="1"]'));
        if (!rows.length) { alert('画像のないキャラ・敵はありません'); return; }
        if (!confirm(rows.length + '件の画像をAIで作ります（1枚10〜20秒）。途中でページを閉じないでください。')) return;
        b.disabled = true; var done = 0, fail = 0;
        for (var i = 0; i < rows.length; i++) {
          var tr = rows[i]; document.getElementById('pz-progress').textContent = (i + 1) + ' / ' + rows.length + ' 件目を生成中…';
          try { await pzGenOne(tr, tr.getAttribute('data-kind'), tr.getAttribute('data-id'), tr.querySelector('.pz-gen')); done++; } catch (e) { fail++; }
        }
        document.getElementById('pz-progress').textContent = '完了: ' + done + '件' + (fail ? '（失敗 ' + fail + '件）' : '');
        b.disabled = false;
      }
      async function pzGenGuide(b) {
        b.classList.add('busy'); b.textContent = '生成中…';
        try { await pzSend('POST', PZ_API + '/guide/generate'); location.reload(); } catch (e) { alert(e.message); b.textContent = 'AIで作る'; b.classList.remove('busy'); }
      }
      var gup = document.getElementById('pz-guide-up');
      if (gup) gup.addEventListener('change', async function(){ if (!gup.files[0]) return; var fd = new FormData(); fd.append('photo', gup.files[0]); try { await pzSend('POST', PZ_API + '/guide/photo', fd, true); location.reload(); } catch (e) { alert(e.message); } });
      pzBindRows('pz-allies', 'allies');
      pzBindRows('pz-enemies', 'enemies');
      async function pzAddEnemy(b) {
        var fd = new FormData();
        fd.append('name', document.getElementById('ne-name').value);
        fd.append('hp', document.getElementById('ne-hp').value);
        fd.append('atk', document.getElementById('ne-atk').value);
        fd.append('element', document.getElementById('ne-el').value);
        var f = document.getElementById('ne-img').files[0]; if (f) fd.append('photo', f);
        b.disabled = true;
        try { await pzSend('POST', PZ_API + '/enemies', fd, true); location.reload(); } catch (e) { alert(e.message); b.disabled = false; }
      }
      async function pzResetRanking(b) {
        if (!confirm('全員のプレイ記録を削除してランキングを空にします。参戦登録・所持キャラ・コインは残ります。よろしいですか？')) return;
        b.disabled = true;
        try { await pzSend('POST', PZ_API + '/ranking/reset'); location.reload(); } catch (e) { alert(e.message); b.disabled = false; }
      }
    </script>`;
  return c.html(layout('バトル設定', html, 'settings'));
});

// ===== API =====
app.post('/api/puzzle/settings', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const title = String(b.title ?? '').trim().slice(0, 30) || 'バジル&ドラゴンズ';
  await c.env.DB.prepare(`UPDATE puzzle_settings SET title = ?, team_size = ?, enemy_interval = ?, gacha_cost = ?, train_cost = ?, is_open = ?, updated_at = datetime('now','localtime') WHERE id = 1`)
    .bind(title, toInt(b.team_size, 1, 4, 3), toInt(b.enemy_interval, 1, 6, 3), toInt(b.gacha_cost, 1, 99999, 300), toInt(b.train_cost, 1, 99999, 100), toInt(b.is_open, 0, 1, 1)).run();
  return c.json({ ok: true });
});

// バースデーモードの写真をコピーして味方キャラに追加（取り込み済みの人は飛ばす）
app.post('/api/puzzle/allies/import', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const rows = (await c.env.DB.prepare(`SELECT id, name, photo_r2_key, photo_mime_type, photo_offset_x, photo_offset_y, photo_scale
    FROM birthday_celebrants WHERE is_active = 1 ORDER BY birth_month, birth_day, id`).all<{ id: number; name: string; photo_r2_key: string | null; photo_mime_type: string | null; photo_offset_x: number; photo_offset_y: number; photo_scale: number }>()).results ?? [];
  const done = new Set(((await c.env.DB.prepare('SELECT source_celebrant AS s FROM puzzle_allies WHERE source_celebrant IS NOT NULL').all<{ s: number }>()).results ?? []).map(r => r.s));
  let added = 0, skipped = 0, sort = 0;
  for (const r of rows) {
    if (done.has(r.id)) { skipped++; continue; }
    let key: string | null = null;
    let mime: string | null = null;
    if (r.photo_r2_key) {
      const obj = await c.env.DOCUMENTS_BUCKET.get(r.photo_r2_key);
      if (obj) {
        const ext = (r.photo_r2_key.split('.').pop() || 'jpg').toLowerCase();
        key = `puzzle/ally/${crypto.randomUUID()}.${ALLOWED_EXT.includes(ext) ? ext : 'jpg'}`;
        mime = r.photo_mime_type ?? obj.httpMetadata?.contentType ?? 'image/jpeg';
        await c.env.DOCUMENTS_BUCKET.put(key, obj.body, { httpMetadata: { contentType: mime } });
      }
    }
    // 社員写真は sort_order 1〜（キャラは 100〜なので先頭に並ぶ）。属性は順番に割り振る
    const element = ELEMENTS[added % ELEMENTS.length];
    sort += 1;
    await c.env.DB.prepare(`INSERT INTO puzzle_allies (name, kind, rarity, in_gacha, source_celebrant, photo_r2_key, photo_mime, photo_offset_x, photo_offset_y, photo_scale, element, sort_order)
      VALUES (?, 'photo', 3, 0, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(r.name, r.id, key, mime, r.photo_offset_x ?? 50, r.photo_offset_y ?? 50, r.photo_scale ?? 1, element, sort).run();
    added++;
  }
  return c.json({ ok: true, added, skipped });
});

// オリジナルキャラの追加（名前だけ。あとで行内で編集・AI生成）
app.post('/api/puzzle/allies', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const b = await c.req.json<{ name?: string }>().catch(() => ({} as { name?: string }));
  const name = String(b.name ?? '').trim().slice(0, 24);
  if (!name) return c.json({ error: '名前を入力してください' }, 400);
  const maxSort = (await c.env.DB.prepare('SELECT COALESCE(MAX(sort_order), 100) AS m FROM puzzle_allies').first<{ m: number }>())?.m ?? 100;
  await c.env.DB.prepare(`INSERT INTO puzzle_allies (name, kind, rarity, in_gacha, element, hp, atk, sort_order, art_prompt) VALUES (?, 'art', 3, 1, 'fire', 150, 15, ?, ?)`)
    .bind(name, maxSort + 1, `photorealistic character portrait, "${name}", Japanese taxi company theme, cinematic lighting, detailed, 8k`).run();
  return c.json({ ok: true });
});

// 味方・敵の項目更新（1項目ずつ）
async function updateRow(c: { env: Env; req: { json: <T>() => Promise<T> } }, table: 'puzzle_allies' | 'puzzle_enemies', id: number) {
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const sets: string[] = []; const vals: unknown[] = [];
  if ('name' in b) { const n = String(b.name ?? '').trim().slice(0, 24); if (!n) return { error: '名前を入力してください' }; sets.push('name = ?'); vals.push(n); }
  if ('description' in b) { sets.push('description = ?'); vals.push(String(b.description ?? '').trim().slice(0, 80)); }
  if ('hp' in b) { sets.push('hp = ?'); vals.push(toInt(b.hp, 1, 99999, 100)); }
  if ('atk' in b) { sets.push('atk = ?'); vals.push(toInt(b.atk, 1, 9999, 10)); }
  if ('element' in b) { const e = String(b.element); if (!isElement(e)) return { error: '属性が不正です' }; sets.push('element = ?'); vals.push(e); }
  if ('is_active' in b) { sets.push('is_active = ?'); vals.push(toInt(b.is_active, 0, 1, 1)); }
  if (table === 'puzzle_allies') {
    if ('rarity' in b) { sets.push('rarity = ?'); vals.push(toInt(b.rarity, 1, 5, 3)); }
    if ('in_gacha' in b) { sets.push('in_gacha = ?'); vals.push(toInt(b.in_gacha, 0, 1, 0)); }
  } else {
    if ('is_boss' in b) { sets.push('is_boss = ?'); vals.push(toInt(b.is_boss, 0, 1, 0)); }
    if ('is_final' in b) { sets.push('is_final = ?'); vals.push(toInt(b.is_final, 0, 1, 0)); }
  }
  if (!sets.length) return { error: '変更がありません' };
  sets.push("updated_at = datetime('now','localtime')");
  await c.env.DB.prepare(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, id).run();
  return { ok: true };
}
async function moveRow(db: D1Database, table: 'puzzle_allies' | 'puzzle_enemies', id: number, dir: number) {
  const rows = (await db.prepare(`SELECT id FROM ${table} ORDER BY sort_order ASC, id ASC`).all<{ id: number }>()).results ?? [];
  const i = rows.findIndex(r => r.id === id);
  const j = i + (dir < 0 ? -1 : 1);
  if (i < 0 || j < 0 || j >= rows.length) return;
  const tmp = rows[i]; rows[i] = rows[j]; rows[j] = tmp;
  await db.batch(rows.map((r, k) => db.prepare(`UPDATE ${table} SET sort_order = ? WHERE id = ?`).bind(k + 1, r.id)));
}

async function readPhoto(form: FormData, prefix: string): Promise<{ key: string; mime: string } | { error: string } | null> {
  const photo = form.get('photo');
  if (!(photo instanceof File) || photo.size === 0) return null;
  if (photo.size > MAX_PHOTO_SIZE) return { error: '画像は8MB以下にしてください' };
  const ext = (photo.name.split('.').pop() || '').toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) return { error: '対応していない画像形式です（jpg/png/webp/gif）' };
  const mime = /^image\/(jpeg|png|gif|webp)$/.test(photo.type) ? photo.type : (ext === 'jpg' ? 'image/jpeg' : `image/${ext}`);
  return { key: `puzzle/${prefix}/${crypto.randomUUID()}.${ext}`, mime };
}

// Workers AI で画像生成 → R2 保存 → photo_r2_key 更新
async function generateImage(env: Env, table: 'puzzle_allies' | 'puzzle_enemies', id: number): Promise<{ ok: true } | { error: string }> {
  const row = await env.DB.prepare(`SELECT name, art_prompt, photo_r2_key, ${table === 'puzzle_allies' ? 'kind' : "'enemy' AS kind"} FROM ${table} WHERE id = ?`).bind(id)
    .first<{ name: string; art_prompt: string; photo_r2_key: string | null; kind: string }>();
  if (!row) return { error: '見つかりません' };
  if (row.kind === 'photo') return { error: '社員の写真はAI生成の対象外です' };
  const prompt = (row.art_prompt || `photorealistic character, "${row.name}", Japanese taxi theme, cinematic lighting, detailed, 8k`) + ', square composition, centered, no text';
  let b64 = '';
  try {
    const out = await env.AI.run(AI_MODEL, { prompt, steps: 4 }) as { image?: string };
    b64 = out?.image ?? '';
  } catch (e) {
    return { error: 'AI生成に失敗しました: ' + (e instanceof Error ? e.message : String(e)) };
  }
  if (!b64) return { error: 'AIから画像が返りませんでした' };
  const bin = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
  // 先頭バイトで形式判定（flux は JPEG/PNG どちらかで返る）
  const isPng = bin[0] === 0x89 && bin[1] === 0x50;
  const key = `puzzle/gen/${crypto.randomUUID()}.${isPng ? 'png' : 'jpg'}`;
  const mime = isPng ? 'image/png' : 'image/jpeg';
  await env.DOCUMENTS_BUCKET.put(key, bin, { httpMetadata: { contentType: mime } });
  if (row.photo_r2_key && row.photo_r2_key.startsWith('puzzle/gen/')) await env.DOCUMENTS_BUCKET.delete(row.photo_r2_key).catch(() => {});
  await env.DB.prepare(`UPDATE ${table} SET photo_r2_key = ?, photo_mime = ?, updated_at = datetime('now','localtime') WHERE id = ?`).bind(key, mime, id).run();
  return { ok: true };
}

for (const kind of ['allies', 'enemies'] as const) {
  const table = kind === 'allies' ? 'puzzle_allies' : 'puzzle_enemies';
  app.post(`/api/puzzle/${kind}/:id`, async (c) => {
    if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
    const id = parseInt(c.req.param('id'), 10);
    if (!Number.isInteger(id)) return c.json({ error: '不正なID' }, 400);
    const r = await updateRow(c, table, id);
    return 'error' in r ? c.json(r, 400) : c.json(r);
  });
  app.post(`/api/puzzle/${kind}/:id/move`, async (c) => {
    if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
    const id = parseInt(c.req.param('id'), 10);
    const b = await c.req.json<{ dir?: number }>().catch(() => ({} as { dir?: number }));
    await moveRow(c.env.DB, table, id, Number(b.dir) || 1);
    return c.json({ ok: true });
  });
  app.post(`/api/puzzle/${kind}/:id/photo`, async (c) => {
    if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
    const id = parseInt(c.req.param('id'), 10);
    let form: FormData;
    try { form = await c.req.formData(); } catch { return c.json({ error: '不正なリクエスト' }, 400); }
    const p = await readPhoto(form, kind === 'allies' ? 'ally' : 'enemy');
    if (!p) return c.json({ error: '画像を選んでください' }, 400);
    if ('error' in p) return c.json({ error: p.error }, 400);
    const row = await c.env.DB.prepare(`SELECT photo_r2_key FROM ${table} WHERE id = ?`).bind(id).first<{ photo_r2_key: string | null }>();
    if (!row) return c.json({ error: '見つかりません' }, 404);
    await c.env.DOCUMENTS_BUCKET.put(p.key, (form.get('photo') as File).stream(), { httpMetadata: { contentType: p.mime } });
    if (row.photo_r2_key) await c.env.DOCUMENTS_BUCKET.delete(row.photo_r2_key).catch(() => {});
    await c.env.DB.prepare(`UPDATE ${table} SET photo_r2_key = ?, photo_mime = ?, updated_at = datetime('now','localtime') WHERE id = ?`).bind(p.key, p.mime, id).run();
    return c.json({ ok: true });
  });
  app.post(`/api/puzzle/${kind}/:id/generate`, async (c) => {
    if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
    const id = parseInt(c.req.param('id'), 10);
    const r = await generateImage(c.env, table, id);
    return 'error' in r ? c.json(r, 400) : c.json(r);
  });
  app.delete(`/api/puzzle/${kind}/:id`, async (c) => {
    if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
    const id = parseInt(c.req.param('id'), 10);
    const row = await c.env.DB.prepare(`SELECT photo_r2_key FROM ${table} WHERE id = ?`).bind(id).first<{ photo_r2_key: string | null }>();
    if (!row) return c.json({ error: '見つかりません' }, 404);
    if (row.photo_r2_key) await c.env.DOCUMENTS_BUCKET.delete(row.photo_r2_key).catch(() => {});
    await c.env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
    if (table === 'puzzle_allies') await c.env.DB.prepare('DELETE FROM puzzle_player_chars WHERE ally_id = ?').bind(id).run();
    return c.json({ ok: true });
  });
}

// 敵の追加（画像つき）
app.post('/api/puzzle/enemies', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  let form: FormData;
  try { form = await c.req.formData(); } catch { return c.json({ error: '不正なリクエスト' }, 400); }
  const name = String(form.get('name') ?? '').trim().slice(0, 24);
  if (!name) return c.json({ error: '名前を入力してください' }, 400);
  const element = String(form.get('element') ?? 'fire');
  if (!isElement(element)) return c.json({ error: '属性が不正です' }, 400);
  const p = await readPhoto(form, 'enemy');
  if (p && 'error' in p) return c.json({ error: p.error }, 400);
  if (p) await c.env.DOCUMENTS_BUCKET.put(p.key, (form.get('photo') as File).stream(), { httpMetadata: { contentType: p.mime } });
  // ラスボスより手前（sort_order 999 未満の最大+1）に入れる
  const maxSort = (await c.env.DB.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM puzzle_enemies WHERE is_final = 0').first<{ m: number }>())?.m ?? 0;
  await c.env.DB.prepare(`INSERT INTO puzzle_enemies (name, photo_r2_key, photo_mime, hp, atk, element, sort_order, art_prompt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(name, p?.key ?? null, p?.mime ?? null, toInt(form.get('hp'), 1, 99999, 300), toInt(form.get('atk'), 1, 9999, 30), element, maxSort + 1,
      `photorealistic villain character, "${name}", Japanese taxi theme, dramatic lighting, cinematic, 8k`).run();
  return c.json({ ok: true });
});

// 案内人 妖精バジルの画像（AI生成／アップロード）
async function aiImageBytes(env: Env, prompt: string): Promise<{ bin: Uint8Array; mime: string } | { error: string }> {
  let b64 = '';
  try {
    const out = await env.AI.run(AI_MODEL, { prompt, steps: 4 }) as { image?: string };
    b64 = out?.image ?? '';
  } catch (e) { return { error: 'AI生成に失敗しました: ' + (e instanceof Error ? e.message : String(e)) }; }
  if (!b64) return { error: 'AIから画像が返りませんでした' };
  const bin = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
  return { bin, mime: bin[0] === 0x89 && bin[1] === 0x50 ? 'image/png' : 'image/jpeg' };
}
app.post('/api/puzzle/guide/generate', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const r = await aiImageBytes(c.env, GUIDE_PROMPT + ', square composition, centered, no text');
  if ('error' in r) return c.json(r, 400);
  await c.env.DOCUMENTS_BUCKET.put(GUIDE_IMG_KEY, r.bin, { httpMetadata: { contentType: r.mime } });
  return c.json({ ok: true });
});
app.post('/api/puzzle/guide/photo', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  let form: FormData;
  try { form = await c.req.formData(); } catch { return c.json({ error: '不正なリクエスト' }, 400); }
  const p = await readPhoto(form, 'guide');
  if (!p) return c.json({ error: '画像を選んでください' }, 400);
  if ('error' in p) return c.json({ error: p.error }, 400);
  await c.env.DOCUMENTS_BUCKET.put(GUIDE_IMG_KEY, (form.get('photo') as File).stream(), { httpMetadata: { contentType: p.mime } });
  return c.json({ ok: true });
});

app.post('/api/puzzle/ranking/reset', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  await c.env.DB.prepare('DELETE FROM puzzle_scores').run();
  return c.json({ ok: true });
});

export default app;
