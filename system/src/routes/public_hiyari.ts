// ヒヤリハット収集フォーム（ログイン不要・完全公開・複雑なURLでのみアクセス可能）
// フロー: 社員番号入力 → フォーム記入 → 送信完了
// ページ: {HIYARI_PATH}   API: /api/public/hiyari
// 認証は行わない。書き込みは hiyari_reports への INSERT に限定する。
// 社員番号は employees と照合し、課・班をサーバー側で控える（氏名は保存しない）。
import { Hono } from 'hono';
import type { Env } from '../auth';
import { HIYARI_PATH } from '../config';
import {
  HIYARI_WEATHER_OPTS, HIYARI_AREA_OPTS, HIYARI_COUNTERPART_OPTS,
  HIYARI_SITUATION_OPTS, HIYARI_CAUSE_OPTS, isValidChoice,
} from '../data/hiyari_hatto';

const app = new Hono<{ Bindings: Env }>();

function toHalfWidth(s: string): string {
  return s.replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
}
function clip(s: unknown, max: number): string {
  return String(s ?? '').trim().slice(0, max);
}
async function getHomeOfficeId(db: D1Database): Promise<number> {
  const row = await db.prepare("SELECT value FROM system_settings WHERE key = 'home_office_id'").first<{ value: string }>();
  const n = parseInt(row?.value ?? '1', 10);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

// ===== 投稿API =====
app.post('/api/public/hiyari', async (c) => {
  let b: Record<string, unknown>;
  try { b = await c.req.json(); } catch { return c.json({ error: '不正なリクエストです' }, 400); }

  const empNo = toHalfWidth(clip(b.emp_no, 12));
  if (!empNo) return c.json({ error: '社員番号を入力してください' }, 400);

  const emp = await c.env.DB.prepare(
    'SELECT emp_no, division, team FROM employees WHERE emp_no = ? AND is_active = 1'
  ).bind(empNo).first<{ emp_no: string; division: number | null; team: number | null }>();
  if (!emp) return c.json({ error: '社員番号が確認できません。番号をご確認ください' }, 400);

  const situationText = clip(b.situation_text, 1000);
  if (!situationText) return c.json({ error: '「どんな状況だったか」は必ずご記入ください' }, 400);

  const weather = isValidChoice(clip(b.weather, 20), HIYARI_WEATHER_OPTS) ? clip(b.weather, 20) : '';
  const area = isValidChoice(clip(b.place_area, 30), HIYARI_AREA_OPTS) ? clip(b.place_area, 30) : '';
  const counterpart = isValidChoice(clip(b.counterpart, 20), HIYARI_COUNTERPART_OPTS) ? clip(b.counterpart, 20) : '';
  const situation = isValidChoice(clip(b.situation, 30), HIYARI_SITUATION_OPTS) ? clip(b.situation, 30) : '';
  const cause = isValidChoice(clip(b.cause, 30), HIYARI_CAUSE_OPTS) ? clip(b.cause, 30) : '';

  const occurredAt = clip(b.occurred_at, 60);
  const placeDetail = clip(b.place_detail, 200);
  const causeText = clip(b.cause_text, 1000);
  const measureText = clip(b.measure_text, 1000);
  const severe = (b.severe === true || b.severe === 1 || b.severe === '1') ? 1 : 0;

  // 二重送信よけ: 同一社員番号から直近60秒に5件以上は弾く
  const recent = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM hiyari_reports WHERE emp_no = ? AND created_at >= datetime('now','localtime','-60 seconds')"
  ).bind(empNo).first<{ n: number }>();
  if ((recent?.n ?? 0) >= 5) return c.json({ error: '短時間に送信されすぎています。少し時間をおいてください' }, 429);

  const officeId = await getHomeOfficeId(c.env.DB);

  await c.env.DB.prepare(
    `INSERT INTO hiyari_reports
       (office_id, source, emp_no, division, team, occurred_at, weather, place_area, place_detail,
        counterpart, situation, situation_text, cause, cause_text, measure_text, severe)
     VALUES (?, 'web', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    officeId, empNo, emp.division ?? null, emp.team ?? null, occurredAt, weather, area, placeDetail,
    counterpart, situation, situationText, cause, causeText, measureText, severe,
  ).run();

  return c.json({ ok: true });
});

// ===== フォームページ =====
const opt = (arr: readonly string[], placeholder: string) =>
  `<option value="">${placeholder}</option>` + arr.map(v => `<option value="${v}">${v}</option>`).join('');

app.get(HIYARI_PATH, (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>ヒヤリハット報告</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Hiragino Sans','Meiryo',sans-serif; background:#f5f6f8; margin:0; padding:18px; color:#1f2937; font-size:16px; }
    h1 { font-size:20px; color:#1e3a5f; margin:0 0 6px; }
    .sub { font-size:13px; color:#6b7280; margin-bottom:18px; line-height:1.7; }
    .card { background:white; border:1px solid #e5e7eb; border-radius:14px; padding:20px; margin-bottom:16px; }
    label.fld { display:block; font-size:13px; font-weight:700; color:#374151; margin:14px 0 6px; }
    label.fld .req { color:#dc2626; margin-left:4px; font-size:12px; }
    label.fld .opt { color:#9ca3af; margin-left:6px; font-size:11px; font-weight:400; }
    input.txt, select.sel, textarea.ta {
      width:100%; border:1px solid #d1d5db; border-radius:8px; padding:11px; font-size:15px; font-family:inherit; background:white;
    }
    textarea.ta { resize:vertical; }
    .big-input { width:100%; font-size:22px; padding:16px; border:2px solid #93c5fd; border-radius:10px; text-align:center; letter-spacing:2px; }
    .big-btn { width:100%; padding:16px; font-size:17px; font-weight:700; border:none; border-radius:10px; background:#2563eb; color:white; cursor:pointer; margin-top:16px; }
    .big-btn.secondary { background:#f3f4f6; color:#374151; }
    .big-btn:disabled { opacity:0.5; }
    .err { color:#dc2626; font-size:14px; margin-top:10px; text-align:center; }
    .chk { display:flex; align-items:flex-start; gap:10px; font-size:14px; color:#374151; margin-top:14px; line-height:1.5; }
    .chk input { width:20px; height:20px; flex-shrink:0; margin-top:1px; }
    .step { display:none; }
    .done-box { text-align:center; padding:24px 8px; }
    .done-box .ok { font-size:18px; color:#16a34a; font-weight:800; margin-bottom:10px; }
    .done-box .txt { font-size:14px; color:#374151; line-height:1.8; }
    .note { font-size:12px; color:#6b7280; background:#f8fafc; border-radius:8px; padding:12px; margin-top:8px; line-height:1.7; }
  </style>
</head>
<body>
  <h1>ヒヤリハット報告</h1>
  <div class="sub">運転中に「ヒヤリ」「ハッ」とした出来事を記入してください。<br>事故防止・安全意識向上のための報告です（責任追及ではありません）。</div>

  <div id="step1" class="step">
    <div class="card">
      <div style="font-size:14px;font-weight:700;color:#374151;margin-bottom:8px;">社員番号を入力してください</div>
      <input id="emp-no" class="big-input" type="tel" inputmode="numeric" placeholder="12345678" maxlength="12" oninput="this.value=toHalfWidth(this.value)">
      <button class="big-btn" onclick="toForm()">次へ</button>
      <div id="e1" class="err" style="display:none;"></div>
      <div class="note">社員番号から課・班を自動で記録します。氏名は保存しません。</div>
    </div>
  </div>

  <div id="step2" class="step">
    <div class="card">
      <label class="fld">発生日時<span class="opt">任意・自由記入</span></label>
      <input id="f-occurred" class="txt" type="text" maxlength="60" placeholder="例）8月31日 7:20頃 朝">

      <label class="fld">天候<span class="opt">任意</span></label>
      <select id="f-weather" class="sel">${opt(HIYARI_WEATHER_OPTS, '選択してください')}</select>

      <label class="fld">発生エリア<span class="opt">任意</span></label>
      <select id="f-area" class="sel">${opt(HIYARI_AREA_OPTS, '選択してください')}</select>

      <label class="fld">発生場所（詳しく）<span class="opt">任意・自由記入</span></label>
      <input id="f-place" class="txt" type="text" maxlength="200" placeholder="例）○○交差点、△△通り、□□駅前 など">

      <label class="fld">相手（ヒヤリの対象）<span class="opt">任意</span></label>
      <select id="f-counterpart" class="sel">${opt(HIYARI_COUNTERPART_OPTS, '選択してください')}</select>

      <label class="fld">どんな場面でしたか<span class="opt">任意</span></label>
      <select id="f-situation" class="sel">${opt(HIYARI_SITUATION_OPTS, '選択してください')}</select>

      <label class="fld">どんな状況だったか<span class="req">必須</span></label>
      <textarea id="f-situation-text" class="ta" rows="4" maxlength="1000" placeholder="例）わき道から自転車が飛び出してきた"></textarea>

      <label class="fld">ヒヤリ・ハッとした理由（分類）<span class="opt">任意</span></label>
      <select id="f-cause" class="sel">${opt(HIYARI_CAUSE_OPTS, '選択してください')}</select>

      <label class="fld">ヒヤリ・ハッとした理由（詳しく）<span class="opt">任意・自由記入</span></label>
      <textarea id="f-cause-text" class="ta" rows="3" maxlength="1000" placeholder="例）確認不足、見落とし、相手の予測外行動 など"></textarea>

      <label class="fld">回避できた行動・今後気をつけること<span class="opt">任意・自由記入</span></label>
      <textarea id="f-measure" class="ta" rows="3" maxlength="1000" placeholder="例）速度を出していなかったため止まれた／車間を広く取る"></textarea>

      <label class="chk"><input id="f-severe" type="checkbox">ぶつかる寸前だった。または急ブレーキ・クラクションを使った</label>

      <button class="big-btn" id="submit-btn" onclick="submitForm()">送信する</button>
      <div id="e2" class="err" style="display:none;"></div>
    </div>
    <button class="big-btn secondary" onclick="show('step1')">社員番号を入力し直す</button>
  </div>

  <div id="step3" class="step">
    <div class="card done-box">
      <div class="ok">送信しました</div>
      <div class="txt">ご報告ありがとうございました。<br>安全運転にご協力をお願いします。</div>
      <button class="big-btn secondary" style="margin-top:20px;" onclick="resetForm()">続けてもう1件報告する</button>
    </div>
  </div>

<script>
var _empNo = '';
function toHalfWidth(s){ return s.replace(/[０-９]/g, function(ch){ return String.fromCharCode(ch.charCodeAt(0)-0xFEE0); }); }
function show(id){ ['step1','step2','step3'].forEach(function(s){ document.getElementById(s).style.display = (s===id)?'block':'none'; }); window.scrollTo(0,0); }
function val(id){ return document.getElementById(id).value.trim(); }

async function toForm(){
  var e = document.getElementById('e1'); e.style.display='none';
  var n = toHalfWidth(val('emp-no'));
  if (!/^[0-9]{1,12}$/.test(n)) { e.textContent='社員番号を入力してください'; e.style.display='block'; return; }
  _empNo = n;
  show('step2');
}

async function submitForm(){
  var e = document.getElementById('e2'); e.style.display='none';
  var st = val('f-situation-text');
  if (!st) { e.textContent='「どんな状況だったか」は必ずご記入ください'; e.style.display='block'; return; }
  var btn = document.getElementById('submit-btn'); btn.disabled = true;
  try {
    var res = await fetch('/api/public/hiyari', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        emp_no: _empNo,
        occurred_at: val('f-occurred'),
        weather: val('f-weather'),
        place_area: val('f-area'),
        place_detail: val('f-place'),
        counterpart: val('f-counterpart'),
        situation: val('f-situation'),
        situation_text: st,
        cause: val('f-cause'),
        cause_text: val('f-cause-text'),
        measure_text: val('f-measure'),
        severe: document.getElementById('f-severe').checked
      })
    });
    var d = await res.json().catch(function(){ return {}; });
    if (!res.ok || !d.ok) { e.textContent = d.error || '送信に失敗しました。通信環境をご確認ください'; e.style.display='block'; btn.disabled=false; return; }
    show('step3');
  } catch (err) {
    e.textContent = '送信に失敗しました。通信環境をご確認ください'; e.style.display='block'; btn.disabled=false;
  }
}

function resetForm(){
  ['f-occurred','f-place','f-situation-text','f-cause-text','f-measure'].forEach(function(id){ document.getElementById(id).value=''; });
  ['f-weather','f-area','f-counterpart','f-situation','f-cause'].forEach(function(id){ document.getElementById(id).value=''; });
  document.getElementById('f-severe').checked = false;
  document.getElementById('submit-btn').disabled = false;
  document.getElementById('e2').style.display='none';
  show('step2');
}

show('step1');
</script>
</body>
</html>`);
});

export default app;
