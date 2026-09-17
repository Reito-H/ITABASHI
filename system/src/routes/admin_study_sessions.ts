// イベント募集（設定ページ・管理側）
// ページ: /settings/study-sessions（一覧・作成・編集・締切・参加者確認）
//         /settings/study-sessions/:id/poster（参加募集ポスター印刷・A3縦/A4横・シンプル/派手カラー切替）
// API   : /api/study-sessions/*（権限: settings.study-sessions / .edit）
// 公開側（社員向け参加登録の掲示板ページ）は routes/public_study_sessions.ts を参照。
// QR/URLはイベントごとに個別発行せず、全ポスターで共通のSTUDY_SESSION_PATHを使う（開いた先の掲示板で選ぶ形式のため）。
import { Hono } from 'hono';
import qrcode from 'qrcode-generator';
import type { Env } from '../auth';
import { layout, escHtml, FAVICON_DATA_URI } from '../html/layout';
import { getAdminPermissions } from '../permissions';
import { ADMIN_PATH, STUDY_SESSION_PATH, HIYARI_PATH } from '../config';
import {
  SURVEY_QTYPES, isQType, normalizeSettings, aggregateQuestion, answerToCsvCell,
  type SurveyQType,
} from '../data/surveys';
import {
  ENTRY_TYPES, parseEligibility, serializeEligibility, describeEligibility,
} from '../data/study_session_eligibility';
import { renderGuideEditor } from '../html/study_session_guide';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

async function canEdit(c: { env: Env; get: (k: 'adminId') => number }): Promise<boolean> {
  const perms = await getAdminPermissions(c.env.DB, c.get('adminId'));
  if (perms === null) return true;
  // 板橋ページ全体、または各タブ個別の編集権限のいずれかがあれば編集UIを出す
  // （タブをまたいだ書き込みは permissions.ts 側の per-API チェックで個別に弾かれる）
  return ['settings.study-sessions.edit', 'settings.hiyari.edit', 'settings.surveys.edit',
          'settings.daihon.edit', 'settings.office-opinions.edit'].some(k => perms.includes(k));
}

// 担当営業所の表示名（設定「営業所」で切替。末尾の「営業所」は落として「板橋」等にする）
async function getOfficeLabel(env: Env): Promise<string> {
  const row = await env.DB.prepare(
    `SELECT o.short_name FROM offices o
      WHERE o.id = (SELECT CAST(value AS INTEGER) FROM system_settings WHERE key = 'home_office_id')`
  ).first<{ short_name: string }>();
  return ((row?.short_name ?? '板橋営業所').replace(/営業所$/, '') || '板橋');
}

type StudySession = {
  id: number; title: string; date: string; start_time: string | null; end_time: string | null;
  location: string | null; contact_name: string | null; capacity: number; note: string | null; is_closed: number;
  target_audience: string | null; category_id: number | null; eligibility_json: string | null;
};

// 回（公演回）。1イベントに複数。時刻・定員は回が持つ
type SlotInput = { id?: number; label?: string; start_time?: string; end_time?: string; capacity?: number };

// 送られてきた回の配列を検証して正規化する。最低1回は必須。
function normalizeSlots(raw: unknown): { slots: { id: number | null; label: string | null; start_time: string | null; end_time: string | null; capacity: number }[]; error?: string } {
  const arr = Array.isArray(raw) ? raw as SlotInput[] : [];
  const out: { id: number | null; label: string | null; start_time: string | null; end_time: string | null; capacity: number }[] = [];
  for (const item of arr) {
    const s = (item && typeof item === 'object') ? item : {};
    const startTime = S(s.start_time, 5);
    const endTime = S(s.end_time, 5);
    if (!isValidTime(startTime) || !isValidTime(endTime)) return { slots: [], error: '時刻の形式が正しくありません' };
    const capacity = Number.isFinite(s.capacity) && (s.capacity as number) >= 0 ? Math.floor(s.capacity as number) : 0;
    const id = Number.isFinite(s.id) && (s.id as number) > 0 ? Math.floor(s.id as number) : null;
    out.push({ id, label: S(s.label, 40) || null, start_time: startTime || null, end_time: endTime || null, capacity });
  }
  if (out.length === 0) return { slots: [], error: '回を1つ以上入力してください' };
  return { slots: out };
}

function shareUrl(): string {
  return `https://bentenclub.com${STUDY_SESSION_PATH}`;
}
function hiyariShareUrl(): string {
  return `https://bentenclub.com${HIYARI_PATH}`;
}

// ヒヤリハット報告フォームの掲示ポスターの文面（system_settings の 'hiyari_poster' に JSON 保存）
type HiyariPoster = { eyebrow: string; title: string; lead: string; body: string; contact: string; qr_caption: string };
const HIYARI_POSTER_DEFAULT: HiyariPoster = {
  eyebrow: 'SAFETY REPORT',
  title: 'ヒヤリハット報告のお願い',
  lead: '運転中に「ヒヤリ」「ハッ」とした出来事を、その日のうちに報告してください。事故を未然に防ぐための取り組みで、責任を問うものではありません。',
  body: '・スマホから約1分。社員番号を入れるだけ（氏名は保存されません）\n・「ぶつかりそうになった」「急ブレーキ・クラクションを使った」なども対象です\n・場所や日時も、わかる範囲で記入してください',
  contact: '',
  qr_caption: 'QRを読み取って報告フォームへ',
};
async function loadHiyariPoster(db: D1Database): Promise<HiyariPoster> {
  const row = await db.prepare("SELECT value FROM system_settings WHERE key = 'hiyari_poster'")
    .first<{ value: string }>().catch(() => null);
  if (!row?.value) return { ...HIYARI_POSTER_DEFAULT };
  try {
    const j = JSON.parse(row.value) as Partial<HiyariPoster>;
    return {
      eyebrow: S(j.eyebrow, 40) || HIYARI_POSTER_DEFAULT.eyebrow,
      title: S(j.title, 60) || HIYARI_POSTER_DEFAULT.title,
      lead: S(j.lead, 400),
      body: S(j.body, 800),
      contact: S(j.contact, 80),
      qr_caption: S(j.qr_caption, 60) || HIYARI_POSTER_DEFAULT.qr_caption,
    };
  } catch { return { ...HIYARI_POSTER_DEFAULT }; }
}

function tokenToQrSvg(data: string, cellSize = 6): string {
  const qr = qrcode(0, 'M');
  qr.addData(data);
  qr.make();
  return qr.createSvgTag({ cellSize, margin: 4, scalable: true })
    .replace(/black/g, '#1e3a5f').replace(/white/g, '#ffffff');
}

const S = (v: unknown, max: number): string => String(v ?? '').slice(0, max).trim();

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function isValidTime(s: string): boolean {
  return s === '' || /^\d{2}:\d{2}$/.test(s);
}

// ===== ページ: 一覧・管理 =====
app.get('/settings/study-sessions', async (c) => {
  const editable = await canEdit(c);
  const officeLabel = await getOfficeLabel(c.env);
  const canReveal = (await getAdminPermissions(c.env.DB, c.get('adminId'))) === null;
  const hp = await loadHiyariPoster(c.env.DB);
  const html = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap;">
      <h2 style="font-size:17px;font-weight:700;color:#1e3a5f;">${escHtml(officeLabel)}</h2>
      <span style="font-size:12px;color:#9ca3af;">乗務員向けページ（イベントの参加募集・ご意見版・ヒヤリハット）</span>
    </div>
    <div class="ob-tabnav">
      <button type="button" class="ob-tab-btn" data-tab="sessions" data-perm-key="settings.study-sessions" onclick="switchTab('sessions')">イベント 参加申し込み</button>
      <button type="button" class="ob-tab-btn" data-tab="opinions" data-perm-key="settings.office-opinions settings.study-sessions" onclick="switchTab('opinions')">ご意見版</button>
      <button type="button" class="ob-tab-btn" data-tab="hiyari" data-perm-key="settings.hiyari settings.study-sessions" onclick="switchTab('hiyari')">ヒヤリハット</button>
      <button type="button" class="ob-tab-btn" data-tab="surveys" data-perm-key="settings.surveys settings.study-sessions" onclick="switchTab('surveys')">アンケート</button>
      <button type="button" class="ob-tab-btn" data-tab="script" data-perm-key="settings.daihon settings.study-sessions" onclick="switchTab('script')">台本</button>
    </div>
    <style>
      .ob-tabnav { display:flex; gap:6px; border-bottom:2px solid #e5e7eb; margin-bottom:18px; }
      .ob-tab-btn { padding:9px 16px; border:none; background:none; font-size:13px; font-weight:700; color:#9ca3af; cursor:pointer; border-bottom:3px solid transparent; margin-bottom:-2px; }
      .ob-tab-btn.active { color:#1e3a5f; border-bottom-color:#2563eb; }
    </style>

    <div id="tab-sessions" data-perm-key="settings.study-sessions">
    <div style="font-size:12px;color:#6b7280;margin-bottom:16px;line-height:1.7;">
      新人向けのイベントをここで作成すると、共通のQR/URLからアクセスできる掲示板に自動で表示されます。社員番号を入力した参加者は、開催中のイベント一覧から選んで参加登録できます。定員に達すると自動で「満席」表示になり、それ以上は登録できません。
    </div>

    <div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:18px;max-width:820px;margin-bottom:16px;">
      <div style="font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:8px;">参加申し込み用 共有URL・QR（全ポスター共通）</div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start;">
        <div style="width:110px;height:110px;flex-shrink:0;">${tokenToQrSvg(shareUrl(), 4)}</div>
        <div style="flex:1;min-width:220px;">
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <code id="share-url" style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px;padding:8px 10px;font-size:12px;word-break:break-all;flex:1;min-width:200px;">${escHtml(shareUrl())}</code>
            <button onclick="copyShareUrl()" style="padding:8px 14px;background:#f0fdf4;border:1px solid #86efac;color:#166534;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">コピー</button>
          </div>
          <div style="font-size:11px;color:#9ca3af;margin-top:8px;">イベントごとにQRを分ける必要はありません。作成した各イベントのポスターは、この共通URLのQRを使って印刷してください（各ポスターの印刷ボタンから出力できます）。</div>
        </div>
      </div>
    </div>

    ${editable ? `
    <div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:18px;max-width:820px;margin-bottom:16px;">
      <div style="font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:12px;" id="form-heading">新しいイベントを作成</div>
      <input type="hidden" id="edit-id" value="">
      <div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:12px;">
        <label style="font-size:12px;color:#6b7280;flex:1;min-width:220px;">タイトル
          <div><input id="f-title" type="text" maxlength="60" placeholder="例: 秋の交通安全公演" style="width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;"></div>
        </label>
        <label style="font-size:12px;color:#6b7280;">開催日
          <div><input id="f-date" type="date" style="border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;"></div>
        </label>
        <label style="font-size:12px;color:#6b7280;">カテゴリー
          <div style="display:flex;gap:6px;align-items:center;">
            <select id="f-category" style="border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;min-width:120px;"><option value="">（未分類）</option></select>
            <button type="button" onclick="toggleCatPanel()" title="カテゴリーを編集" style="padding:7px 10px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;font-size:12px;cursor:pointer;white-space:nowrap;">編集</button>
          </div>
        </label>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:12px;">
        <label style="font-size:12px;color:#6b7280;flex:1;min-width:200px;">集合場所
          <div><input id="f-location" type="text" maxlength="60" placeholder="例: 本社2階 会議室" style="width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;"></div>
        </label>
        <label style="font-size:12px;color:#6b7280;flex:1;min-width:160px;">担当
          <div><input id="f-contact" type="text" maxlength="30" placeholder="例: 総務部 山田" style="width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;"></div>
        </label>
      </div>

      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin-bottom:12px;background:#f8fafc;">
        <div style="font-size:12px;font-weight:700;color:#1e3a5f;margin-bottom:2px;">開催回（公演回）</div>
        <div style="font-size:11px;color:#9ca3af;margin-bottom:8px;">1日に複数回ある場合は「＋ 回を追加」で回を分けます。時刻と定員は回ごとに設定します（定員 0 = 無制限）。乗務員は参加する回を選んで登録します。</div>
        <div id="slots-box"></div>
        <button type="button" onclick="addSlotRow()" style="margin-top:8px;padding:7px 14px;background:#eff6ff;border:1px solid #bfdbfe;color:#1e3a5f;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;">＋ 回を追加</button>
      </div>

      <label style="font-size:12px;color:#6b7280;display:block;margin-bottom:12px;">対象者の表記（任意・ポスターに表示されます）
        <div><input id="f-target" type="text" maxlength="60" placeholder="例: 新入社員（2026年入社）" style="width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;"></div>
      </label>

      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin-bottom:12px;background:#f8fafc;">
        <div style="font-size:12px;font-weight:700;color:#1e3a5f;margin-bottom:2px;">対象者の絞り込み（申し込みできる人を限定）</div>
        <div style="font-size:11px;color:#9ca3af;margin-bottom:8px;">条件でしぼると、条件に合わない乗務員には掲示板にこのイベントが表示されず、申し込みもできません。複数の条件を指定した場合は、すべてを満たす人が対象です。</div>
        <label style="font-size:12px;color:#374151;display:flex;align-items:center;gap:8px;margin-bottom:4px;"><input type="radio" name="f-elig-mode" value="all" checked onchange="eligToggleMode()">全員が申し込める</label>
        <label style="font-size:12px;color:#374151;display:flex;align-items:center;gap:8px;"><input type="radio" name="f-elig-mode" value="conditions" onchange="eligToggleMode()">条件でしぼる</label>
        <div id="elig-cond" style="display:none;margin-top:10px;padding-top:10px;border-top:1px dashed #d1d5db;">
          <div style="font-size:11px;font-weight:700;color:#6b7280;margin-bottom:4px;">入社からの経過期間</div>
          <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:10px;">
            <label style="font-size:12px;color:#6b7280;display:flex;align-items:center;gap:4px;">以内：
              <input id="f-elig-max-y" type="number" min="0" max="50" style="width:56px;border:1px solid #d1d5db;border-radius:6px;padding:5px;font-size:12px;">年
              <input id="f-elig-max-m" type="number" min="0" max="11" style="width:56px;border:1px solid #d1d5db;border-radius:6px;padding:5px;font-size:12px;">ヶ月
            </label>
            <label style="font-size:12px;color:#6b7280;display:flex;align-items:center;gap:4px;">以上：
              <input id="f-elig-min-y" type="number" min="0" max="50" style="width:56px;border:1px solid #d1d5db;border-radius:6px;padding:5px;font-size:12px;">年
              <input id="f-elig-min-m" type="number" min="0" max="11" style="width:56px;border:1px solid #d1d5db;border-radius:6px;padding:5px;font-size:12px;">ヶ月
            </label>
          </div>
          <div style="font-size:11px;color:#9ca3af;margin:-4px 0 10px;">空欄なら在籍年数はしぼりません。社員名簿に入社日が登録されていない人は、年数の条件がある場合は対象外になります。</div>
          <div style="font-size:11px;font-weight:700;color:#6b7280;margin-bottom:4px;">入社区分（チェックしたものが対象）</div>
          <div id="f-elig-entry" style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:10px;font-size:12px;color:#374151;">
            ${ENTRY_TYPES.map((t) => `<label style="display:flex;align-items:center;gap:5px;"><input type="checkbox" class="elig-entry" value="${escHtml(t)}">${escHtml(t)}</label>`).join('')}
          </div>
          <label style="font-size:12px;color:#374151;display:flex;align-items:center;gap:6px;margin-bottom:10px;"><input type="checkbox" id="f-elig-newcomer">新人登録中の人のみ</label>
          <div style="font-size:11px;font-weight:700;color:#6b7280;margin-bottom:4px;">社員番号を指定（この番号の人のみ・任意）</div>
          <textarea id="f-elig-empnos" rows="2" placeholder="社員番号を改行・カンマ・スペース区切りで入力" style="width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:12px;font-family:inherit;"></textarea>
          <div style="position:relative;margin-top:6px;">
            <input id="f-elig-empsearch" type="text" placeholder="氏名で検索して社員番号を追加" autocomplete="off" oninput="eligSearchEmp(this.value)" style="width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:6px;padding:7px 8px;font-size:12px;">
            <div id="f-elig-empresults" style="display:none;position:absolute;left:0;right:0;top:36px;background:white;border:1px solid #d1d5db;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.12);max-height:200px;overflow-y:auto;z-index:10;"></div>
          </div>
        </div>
      </div>

      <label style="font-size:12px;color:#6b7280;display:block;margin-bottom:12px;">補足（任意・ポスターに表示されます）
        <div><textarea id="f-note" rows="2" maxlength="300" style="width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;font-family:inherit;"></textarea></div>
      </label>
      <button onclick="saveSession()" id="save-btn" style="padding:9px 22px;background:#2563eb;color:white;border:none;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer;">作成する</button>
      <button onclick="resetForm()" id="cancel-edit-btn" style="display:none;padding:9px 18px;background:#f3f4f6;color:#374151;border:none;border-radius:7px;font-size:13px;cursor:pointer;margin-left:8px;">編集をキャンセル</button>
      <div id="form-err" style="color:#dc2626;font-size:12px;margin-top:10px;display:none;"></div>
    </div>

    <div id="cat-panel" style="display:none;background:white;border:1px solid #e5e7eb;border-radius:10px;padding:18px;max-width:560px;margin-bottom:16px;">
      <div style="font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:4px;">カテゴリーの編集</div>
      <div style="font-size:11px;color:#9ca3af;margin-bottom:10px;">「公演」「勉強会」など、イベントの種類を自由に追加・改名・並べ替えできます。使用中のカテゴリーは削除できません。</div>
      <div id="cat-list" style="font-size:13px;color:#6b7280;margin-bottom:10px;">読み込み中...</div>
      <div style="display:flex;gap:6px;">
        <input id="cat-new" type="text" maxlength="40" placeholder="新しいカテゴリー名" style="flex:1;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;">
        <button type="button" onclick="addCategory()" style="padding:8px 16px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;">追加</button>
      </div>
    </div>` : ''}

    <div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:18px;max-width:1000px;">
      <div style="font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:10px;">イベント一覧</div>
      <div id="list-body" style="font-size:13px;color:#6b7280;">読み込み中...</div>
    </div>

    <div id="participants-panel" style="display:none;background:white;border:1px solid #e5e7eb;border-radius:10px;padding:18px;max-width:1000px;margin-top:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <div style="font-size:13px;font-weight:700;color:#1e3a5f;" id="participants-heading">参加者</div>
        <button onclick="closeParticipants()" style="padding:5px 12px;background:#f3f4f6;border:none;border-radius:6px;font-size:12px;cursor:pointer;">閉じる</button>
      </div>
      ${editable ? `
      <div style="position:relative;margin-bottom:14px;padding:12px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;">
        <div style="font-size:12px;font-weight:700;color:#1e3a5f;margin-bottom:6px;">突発的な参加者を追加（社員名簿から検索）</div>
        <div style="display:flex;gap:6px;margin-bottom:6px;">
          <select id="add-participant-slot" style="border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;min-width:140px;"></select>
        </div>
        <input id="add-participant-q" type="text" placeholder="氏名または社員番号で検索" autocomplete="off" style="width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;" oninput="searchEmployeesForAdd(this.value)">
        <div id="add-participant-results" style="display:none;position:absolute;left:12px;right:12px;top:96px;background:white;border:1px solid #d1d5db;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.12);max-height:240px;overflow-y:auto;z-index:10;"></div>
      </div>` : ''}
      <div id="participants-body" style="font-size:13px;color:#6b7280;">読み込み中...</div>
    </div>

    <div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:18px;max-width:1000px;margin-top:16px;">
      <div style="font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:4px;">キャンセルペナルティ</div>
      <div style="font-size:11px;color:#9ca3af;margin-bottom:10px;">開催前々日までのキャンセルが10回に達すると、カウントが0に戻り自動的に3ヶ月間、新規のお申し込みができなくなります（既存登録の確認・キャンセルは制限されません）。「解除する」でカウント・制限の両方をリセットできます。</div>
      <div id="penalties-body" style="font-size:13px;color:#6b7280;">読み込み中...</div>
    </div>

    <div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:18px;max-width:1000px;margin-top:16px;">
      <div style="font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:4px;">参加者からの要望</div>
      <div style="font-size:11px;color:#9ca3af;margin-bottom:10px;">公開ページの「イベントへの要望を送る」から届いた、受けたいイベントのテーマなどの自由記入です。</div>
      <div id="requests-body" style="font-size:13px;color:#6b7280;">読み込み中...</div>
    </div>
    </div><!-- /tab-sessions -->

    <div id="tab-opinions" data-perm-key="settings.office-opinions settings.study-sessions" style="display:none;">
      <div style="font-size:12px;color:#6b7280;margin-bottom:16px;line-height:1.7;">
        乗務員が共通QR/URLの「営業所へのご意見」から送った意見の一覧です。「匿名で送信」にチェックが付いた意見は、既定で社員番号・氏名を伏せて表示します${canReveal ? '（フル権限アカウントのため「送信者を表示」で開示できます）' : '（開示できるのはフル権限アカウントのみです）'}。
      </div>
      <div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:18px;max-width:1000px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
          <div style="font-size:13px;font-weight:700;color:#1e3a5f;">ご意見一覧</div>
          <select id="op-filter" onchange="loadOpinions()" style="margin-left:auto;padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:12px;">
            <option value="open">未対応のみ</option>
            <option value="done">対応済のみ</option>
            <option value="all">すべて</option>
          </select>
        </div>
        <div id="opinions-body" style="font-size:13px;color:#6b7280;">読み込み中...</div>
      </div>
    </div>

    <div id="tab-hiyari" data-perm-key="settings.hiyari settings.study-sessions" style="display:none;">
      <div style="font-size:12px;color:#6b7280;margin-bottom:16px;line-height:1.7;">
        乗務員が専用URLの「ヒヤリハット報告」フォームから送った報告の一覧です。社員番号から課・班を控えていますが、氏名は保存していません${canReveal ? '（フル権限アカウントは「氏名を照会」で社員名簿と突き合わせできます）' : ''}。集計・分析は課長ミッションの「ヒヤリハット」で確認できます。
      </div>

      <div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:18px;max-width:820px;margin-bottom:16px;">
        <div style="font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:8px;">報告フォーム用 共有URL・QR</div>
        <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start;">
          <div style="width:110px;height:110px;flex-shrink:0;">${tokenToQrSvg(hiyariShareUrl(), 4)}</div>
          <div style="flex:1;min-width:220px;">
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
              <code id="hh-share-url" style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px;padding:8px 10px;font-size:12px;word-break:break-all;flex:1;min-width:200px;">${escHtml(hiyariShareUrl())}</code>
              <button onclick="copyHiyariUrl()" style="padding:8px 14px;background:#f0fdf4;border:1px solid #86efac;color:#166534;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">コピー</button>
            </div>
            <div style="font-size:11px;color:#9ca3af;margin-top:8px;">このURL/QRを掲示・配布してください。乗務員はログイン不要で、社員番号を入れて1件ずつ報告します。</div>
          </div>
        </div>
      </div>

      ${editable ? `
      <div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:18px;max-width:820px;margin-bottom:16px;">
        <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:12px;flex-wrap:wrap;">
          <div style="font-size:13px;font-weight:700;color:#1e3a5f;">報告フォームのポスター</div>
          <span style="font-size:11px;color:#9ca3af;">掲示用。文章を編集して保存し、「ポスターを開く」で印刷（A3縦／A4横・シンプル／派手カラー）。</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          <label style="font-size:12px;color:#6b7280;">小見出し（英字など・任意）
            <input id="hp-eyebrow" type="text" maxlength="40" value="${escHtml(hp.eyebrow)}" style="width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;">
          </label>
          <label style="font-size:12px;color:#6b7280;">タイトル
            <input id="hp-title" type="text" maxlength="60" value="${escHtml(hp.title)}" style="width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;">
          </label>
          <label style="font-size:12px;color:#6b7280;">リード文（タイトル下の説明・1〜2文）
            <textarea id="hp-lead" rows="2" maxlength="400" style="width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;font-family:inherit;">${escHtml(hp.lead)}</textarea>
          </label>
          <label style="font-size:12px;color:#6b7280;">本文（箇条書きなど・改行で複数行）
            <textarea id="hp-body" rows="5" maxlength="800" style="width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;font-family:inherit;">${escHtml(hp.body)}</textarea>
          </label>
          <div style="display:flex;gap:12px;flex-wrap:wrap;">
            <label style="font-size:12px;color:#6b7280;flex:1;min-width:200px;">担当・問い合わせ（任意）
              <input id="hp-contact" type="text" maxlength="80" value="${escHtml(hp.contact)}" style="width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;">
            </label>
            <label style="font-size:12px;color:#6b7280;flex:1;min-width:200px;">QRキャプション
              <input id="hp-qrcap" type="text" maxlength="60" value="${escHtml(hp.qr_caption)}" style="width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;">
            </label>
          </div>
        </div>
        <div style="display:flex;gap:10px;align-items:center;margin-top:12px;">
          <button onclick="saveHiyariPoster(this)" style="padding:9px 20px;background:#2563eb;color:white;border:none;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer;">保存</button>
          <a href="${ADMIN_PATH}/settings/study-sessions/hiyari-poster" target="_blank" style="padding:9px 18px;background:#f0fdf4;border:1px solid #86efac;color:#166534;border-radius:7px;font-size:13px;font-weight:600;text-decoration:none;">ポスターを開く</a>
          <span id="hp-msg" style="font-size:12px;color:#166534;"></span>
        </div>
      </div>` : `
      <div style="margin-bottom:16px;"><a href="${ADMIN_PATH}/settings/study-sessions/hiyari-poster" target="_blank" style="font-size:13px;color:#2563eb;">報告フォームのポスターを開く →</a></div>`}

      <div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:18px;max-width:1000px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;">
          <div style="font-size:13px;font-weight:700;color:#1e3a5f;">ヒヤリハット報告一覧</div>
          <a href="${ADMIN_PATH}/kacho-mission/hiyari" style="font-size:12px;color:#2563eb;text-decoration:none;">集計・分析を見る →</a>
          <select id="hh-filter" onchange="loadHiyari()" style="margin-left:auto;padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:12px;">
            <option value="open">未確認のみ</option>
            <option value="reviewed">確認済のみ</option>
            <option value="all">すべて</option>
            <option value="web">Web投稿のみ</option>
          </select>
        </div>
        <div id="hiyari-body" style="font-size:13px;color:#6b7280;">読み込み中...</div>
      </div>
    </div>

    <div id="tab-surveys" data-perm-key="settings.surveys settings.study-sessions" style="display:none;">
      <div style="font-size:12px;color:#6b7280;margin-bottom:16px;line-height:1.9;">
        タイトルと設問を自由に組み立ててアンケートを作成できます。回答は社員番号で本人確認（課・班のみ記録／氏名は保存しません／何回でも回答可）。
        <br>・通常：<code style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:5px;padding:2px 6px;">${escHtml(shareUrl())}</code>（イベント一覧の下＋メニューの「アンケートに回答する」から）
        <br>・アンケートを最初に見せる：<code style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:5px;padding:2px 6px;">${escHtml(shareUrl())}?view=surveys</code>（社員番号の次にアンケート一覧を表示）
        <br>・特定のアンケートを直接開く：各アンケートの「回答リンク」ボタンからコピーできます。
      </div>

      <div id="sv-list-view">
        <div style="margin-bottom:12px;">
          ${editable ? `<button onclick="svNew()" style="padding:9px 20px;background:#2563eb;color:white;border:none;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer;">＋ 新しいアンケートを作成</button>` : ''}
        </div>
        <div id="sv-list" style="font-size:13px;color:#6b7280;">読み込み中...</div>
      </div>

      <div id="sv-editor-view" style="display:none;"></div>
      <div id="sv-results-view" style="display:none;"></div>
    </div>

    <div id="tab-script" data-perm-key="settings.daihon settings.study-sessions" style="display:none;">
      <div style="font-size:12px;color:#6b7280;margin-bottom:16px;line-height:1.9;">
        講座やイベントのスライド（見出し＋箇条書き）と台本（読み上げ用のナレーション）を、パワーポイントのように1枚ずつ編集できます。
        <br>・<b>プレゼンを開く</b>：全画面のスライド投影（←→／スペースで送り・<b>F</b>で全画面・<b>N</b>で画面下に台本バー）。
        <br>・<b>印刷（台本つき）</b>：スライドと台本を並べてA4に印刷。台本だけ配りたいときにも使えます。
      </div>
      ${editable ? `
      <div style="margin-bottom:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <input id="dh-new-title" type="text" maxlength="120" placeholder="新しい台本のタイトル（例：秋の安全運転講座）" style="flex:1;min-width:240px;border:1px solid #d1d5db;border-radius:7px;padding:9px 10px;font-size:13px;">
        <button onclick="dhNew()" style="padding:9px 20px;background:#2563eb;color:white;border:none;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;">＋ 新しい台本を作成</button>
      </div>` : ''}
      <div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:18px;max-width:1000px;">
        <div style="font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:10px;">台本一覧</div>
        <div id="dh-list" style="font-size:13px;color:#6b7280;">読み込み中...</div>
      </div>
    </div>

    <script>
    var API = '${ADMIN_PATH}/api/study-sessions';
    var SV_API = '${ADMIN_PATH}/api/surveys';
    var SV_SHARE_URL = ${JSON.stringify(shareUrl())};
    var SV_QR_BASE = '${ADMIN_PATH}/settings/study-sessions/survey/';
    var SV_QTYPES = ${JSON.stringify(SURVEY_QTYPES)};
    var OP_API = '${ADMIN_PATH}/api/office-opinions';
    var HH_API = '${ADMIN_PATH}/api/hiyari-reports';
    var EDITABLE = ${editable ? 'true' : 'false'};
    var CAN_REVEAL = ${canReveal ? 'true' : 'false'};
    function switchTab(name) {
      ['sessions','opinions','hiyari','surveys','script'].forEach(function(t) {
        var el = document.getElementById('tab-' + t);
        if (el) el.style.display = (t === name) ? 'block' : 'none';
      });
      document.querySelectorAll('.ob-tab-btn').forEach(function(b) {
        b.classList.toggle('active', b.getAttribute('data-tab') === name);
      });
      var q = (name === 'opinions' || name === 'hiyari' || name === 'surveys' || name === 'script') ? ('?tab=' + name) : '';
      try { history.replaceState(null, '', location.pathname + q); } catch (e) {}
      if (name === 'opinions') loadOpinions();
      if (name === 'hiyari') loadHiyari();
      if (name === 'surveys') loadSurveys();
      if (name === 'script') loadScripts();
    }
    function escH(s) { return (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    function copyShareUrl() {
      navigator.clipboard.writeText(document.getElementById('share-url').textContent).then(function() { alert('コピーしました'); });
    }
    var WD = ['日','月','火','水','木','金','土'];
    function fmtDate(d) {
      var t = new Date(d + 'T00:00:00');
      return (t.getMonth()+1) + '/' + t.getDate() + '(' + WD[t.getDay()] + ')';
    }
    // 回(slot)の集計。全回が満席なら満席、1回でも空きがあれば募集中
    function slotFull(sl) { return sl.capacity > 0 && (sl.participant_count || 0) >= sl.capacity; }
    function eventFull(s) {
      var slots = s.slots || [];
      if (!slots.length) return false;
      return slots.every(slotFull);
    }
    function eventTotalCount(s) {
      return (s.slots || []).reduce(function(a, sl) { return a + (sl.participant_count || 0); }, 0);
    }
    function slotTimeLabel(sl) {
      var t = (sl.start_time || '') + (sl.end_time ? '〜' + sl.end_time : '');
      return t || '時刻未定';
    }
    function slotName(sl, idx) { return sl.label || ((idx + 1) + '回目'); }
    function statusOf(s) {
      var today = new Date(Date.now() + 9*3600*1000).toISOString().slice(0,10);
      if (s.is_closed) return { label: '受付終了(手動)', color: '#6b7280', bg: '#f3f4f6' };
      if (eventFull(s)) return { label: '満席（自動締切）', color: '#b45309', bg: '#fef3c7' };
      if (s.date < today) return { label: '開催済み', color: '#6b7280', bg: '#f3f4f6' };
      return { label: '募集中', color: '#166534', bg: '#f0fdf4' };
    }

    // ===== カテゴリー編集 =====
    var CATS = [];
    function toggleCatPanel() {
      var p = document.getElementById('cat-panel');
      p.style.display = (p.style.display === 'none' || !p.style.display) ? 'block' : 'none';
      if (p.style.display === 'block') { loadCategories(); p.scrollIntoView({ behavior:'smooth', block:'center' }); }
    }
    async function loadCategories() {
      var d = await (await fetch(API + '/categories')).json();
      CATS = d.categories || [];
      fillCategorySelect();
      renderCatList();
    }
    function fillCategorySelect() {
      var sel = document.getElementById('f-category');
      if (!sel) return;
      var cur = sel.value;
      sel.innerHTML = '<option value="">（未分類）</option>' + CATS.map(function(c) {
        return '<option value="' + c.id + '">' + escH(c.name) + '</option>';
      }).join('');
      sel.value = cur;
    }
    function renderCatList() {
      var box = document.getElementById('cat-list');
      if (!box) return;
      if (!CATS.length) { box.innerHTML = '<div style="color:#9ca3af;">カテゴリーはまだありません</div>'; return; }
      box.innerHTML = CATS.map(function(c, i) {
        return '<div style="display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid #f3f4f6;">'
          + '<span style="display:flex;flex-direction:column;">'
          +   '<button type="button" onclick="moveCat(' + c.id + ',-1)" ' + (i === 0 ? 'disabled' : '') + ' style="border:1px solid #d1d5db;background:#f9fafb;border-radius:4px 4px 0 0;font-size:10px;line-height:1;padding:2px 5px;cursor:pointer;">▲</button>'
          +   '<button type="button" onclick="moveCat(' + c.id + ',1)" ' + (i === CATS.length - 1 ? 'disabled' : '') + ' style="border:1px solid #d1d5db;border-top:none;background:#f9fafb;border-radius:0 0 4px 4px;font-size:10px;line-height:1;padding:2px 5px;cursor:pointer;">▼</button>'
          + '</span>'
          + '<input value="' + escH(c.name) + '" onchange="renameCategory(' + c.id + ', this.value)" style="flex:1;border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:13px;">'
          + '<span style="font-size:11px;color:#9ca3af;white-space:nowrap;">' + (c.use_count || 0) + '件</span>'
          + '<button type="button" onclick="deleteCategory(' + c.id + ')" ' + ((c.use_count || 0) > 0 ? 'disabled title="使用中"' : '') + ' style="padding:5px 10px;background:#fef2f2;border:1px solid #fca5a5;color:#dc2626;border-radius:6px;font-size:11px;cursor:pointer;">削除</button>'
          + '</div>';
      }).join('');
    }
    async function addCategory() {
      var el = document.getElementById('cat-new');
      var name = el.value.trim();
      if (!name) return;
      var res = await fetch(API + '/categories', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name: name }) });
      if (res.ok) { el.value = ''; loadCategories(); } else { var d = await res.json().catch(function(){return {};}); alert(d.error || '追加に失敗しました'); }
    }
    async function renameCategory(id, name) {
      name = (name || '').trim();
      if (!name) { loadCategories(); return; }
      var res = await fetch(API + '/categories/' + id, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name: name }) });
      if (res.ok) loadCategories(); else alert('変更に失敗しました');
    }
    async function moveCat(id, dir) {
      var i = CATS.findIndex(function(c) { return c.id === id; });
      var j = i + dir;
      if (i < 0 || j < 0 || j >= CATS.length) return;
      var order = CATS.map(function(c) { return c.id; });
      order.splice(i, 1);
      order.splice(j, 0, id);
      var res = await fetch(API + '/categories/reorder', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ order: order }) });
      if (res.ok) loadCategories(); else alert('並べ替えに失敗しました');
    }
    async function deleteCategory(id) {
      if (!confirm('このカテゴリーを削除しますか？')) return;
      var res = await fetch(API + '/categories/' + id, { method:'DELETE' });
      if (res.ok) loadCategories(); else { var d = await res.json().catch(function(){return {};}); alert(d.error || '削除に失敗しました'); }
    }

    // ===== 回(slot)の入力行 =====
    function slotRowHtml(sl) {
      sl = sl || {};
      return '<div class="slot-row" data-slot-id="' + (sl.id || '') + '" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:6px;background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:8px;">'
        + '<input class="slot-label" type="text" maxlength="40" placeholder="呼称（任意）例:昼公演" value="' + escH(sl.label || '') + '" style="flex:1;min-width:120px;border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:12px;">'
        + '<input class="slot-start" type="time" value="' + escH(sl.start_time || '') + '" style="border:1px solid #d1d5db;border-radius:6px;padding:6px;font-size:12px;">'
        + '<span style="font-size:12px;color:#9ca3af;">〜</span>'
        + '<input class="slot-end" type="time" value="' + escH(sl.end_time || '') + '" style="border:1px solid #d1d5db;border-radius:6px;padding:6px;font-size:12px;">'
        + '<input class="slot-cap" type="number" min="0" placeholder="定員" value="' + (sl.capacity != null ? sl.capacity : '') + '" style="width:80px;border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:12px;">'
        + '<button type="button" onclick="removeSlotRow(this)" style="padding:5px 10px;background:#fef2f2;border:1px solid #fca5a5;color:#dc2626;border-radius:6px;font-size:11px;cursor:pointer;">削除</button>'
        + '</div>';
    }
    function addSlotRow(sl) {
      document.getElementById('slots-box').insertAdjacentHTML('beforeend', slotRowHtml(sl));
    }
    function removeSlotRow(btn) {
      var box = document.getElementById('slots-box');
      if (box.querySelectorAll('.slot-row').length <= 1) { alert('回は1つ以上必要です'); return; }
      btn.closest('.slot-row').remove();
    }
    function renderSlots(slots) {
      var box = document.getElementById('slots-box');
      box.innerHTML = '';
      var list = (slots && slots.length) ? slots : [{}];
      list.forEach(function(sl) { addSlotRow(sl); });
    }
    function collectSlots() {
      return Array.prototype.map.call(document.querySelectorAll('#slots-box .slot-row'), function(row) {
        var idAttr = row.getAttribute('data-slot-id');
        return {
          id: idAttr ? parseInt(idAttr) : undefined,
          label: row.querySelector('.slot-label').value.trim(),
          start_time: row.querySelector('.slot-start').value,
          end_time: row.querySelector('.slot-end').value,
          capacity: parseInt(row.querySelector('.slot-cap').value) || 0
        };
      });
    }

    // ===== 対象者の絞り込み =====
    function eligToggleMode() {
      var sel = document.querySelector('input[name="f-elig-mode"]:checked');
      document.getElementById('elig-cond').style.display = (sel && sel.value === 'conditions') ? 'block' : 'none';
    }
    function eligMonths(yEl, mEl) {
      var y = parseInt(document.getElementById(yEl).value) || 0;
      var m = parseInt(document.getElementById(mEl).value) || 0;
      var t = y * 12 + m;
      return t > 0 ? t : null;
    }
    function eligSetYm(yEl, mEl, total) {
      var t = total && total > 0 ? total : 0;
      document.getElementById(yEl).value = t ? Math.floor(t / 12) || '' : '';
      document.getElementById(mEl).value = t ? (t % 12) || '' : '';
      if (Math.floor(t / 12) === 0 && t > 0) document.getElementById(yEl).value = '';
      if ((t % 12) === 0 && t > 0) document.getElementById(mEl).value = '';
    }
    function eligParseEmpNos(str) {
      return (str || '').split(/[\\s,、，\\n]+/).map(function(x){ return x.trim(); }).filter(Boolean);
    }
    function eligCollect() {
      var sel = document.querySelector('input[name="f-elig-mode"]:checked');
      if (!sel || sel.value !== 'conditions') return { mode: 'all' };
      var entry = Array.prototype.map.call(document.querySelectorAll('.elig-entry:checked'), function(c){ return c.value; });
      return {
        mode: 'conditions',
        tenure_max_months: eligMonths('f-elig-max-y', 'f-elig-max-m'),
        tenure_min_months: eligMonths('f-elig-min-y', 'f-elig-min-m'),
        entry_types: entry,
        newcomers_only: document.getElementById('f-elig-newcomer').checked,
        emp_nos: eligParseEmpNos(document.getElementById('f-elig-empnos').value)
      };
    }
    function eligPopulate(e) {
      e = e || { mode: 'all' };
      var isCond = e.mode === 'conditions';
      document.querySelector('input[name="f-elig-mode"][value="' + (isCond ? 'conditions' : 'all') + '"]').checked = true;
      eligSetYm('f-elig-max-y', 'f-elig-max-m', e.tenure_max_months);
      eligSetYm('f-elig-min-y', 'f-elig-min-m', e.tenure_min_months);
      var ets = e.entry_types || [];
      Array.prototype.forEach.call(document.querySelectorAll('.elig-entry'), function(c){ c.checked = ets.indexOf(c.value) >= 0; });
      document.getElementById('f-elig-newcomer').checked = !!e.newcomers_only;
      document.getElementById('f-elig-empnos').value = (e.emp_nos || []).join('\\n');
      document.getElementById('f-elig-empsearch').value = '';
      document.getElementById('f-elig-empresults').style.display = 'none';
      eligToggleMode();
    }
    var _eligSearchTimer = null;
    function eligSearchEmp(q) {
      clearTimeout(_eligSearchTimer);
      var box = document.getElementById('f-elig-empresults');
      q = q.trim();
      if (!q) { box.style.display = 'none'; box.innerHTML = ''; return; }
      _eligSearchTimer = setTimeout(function() {
        fetch(API + '/search-employees?q=' + encodeURIComponent(q)).then(function(r){ return r.json(); }).then(function(list) {
          if (!list.length) { box.innerHTML = '<div style="padding:9px;color:#9ca3af;font-size:12px;">該当なし</div>'; box.style.display = 'block'; return; }
          box.innerHTML = list.map(function(e) {
            var div = e.division ? (e.division + '課' + (e.team ? '/' + e.team + '班' : '')) : '';
            return '<div onclick="eligAddEmpNo(\\'' + escH(e.emp_no) + '\\')" style="padding:8px 10px;cursor:pointer;border-bottom:1px solid #f3f4f6;font-size:12px;" onmouseover="this.style.background=\\'#eff6ff\\'" onmouseout="this.style.background=\\'white\\'"><b>' + escH(e.name) + '</b> <span style="color:#9ca3af;">' + escH(e.emp_no) + (div ? ' ・ ' + div : '') + '</span></div>';
          }).join('');
          box.style.display = 'block';
        });
      }, 250);
    }
    function eligAddEmpNo(empNo) {
      var ta = document.getElementById('f-elig-empnos');
      var list = eligParseEmpNos(ta.value);
      if (list.indexOf(empNo) < 0) list.push(empNo);
      ta.value = list.join('\\n');
      document.getElementById('f-elig-empsearch').value = '';
      document.getElementById('f-elig-empresults').style.display = 'none';
    }

    function resetForm() {
      document.getElementById('edit-id').value = '';
      ['f-title','f-date','f-location','f-contact','f-target','f-note'].forEach(function(id) { document.getElementById(id).value = ''; });
      document.getElementById('f-category').value = '';
      renderSlots([{}]);
      eligPopulate({ mode: 'all' });
      document.getElementById('form-heading').textContent = '新しいイベントを作成';
      document.getElementById('save-btn').textContent = '作成する';
      document.getElementById('cancel-edit-btn').style.display = 'none';
      document.getElementById('form-err').style.display = 'none';
    }
    function editSession(s) {
      document.getElementById('edit-id').value = s.id;
      document.getElementById('f-title').value = s.title;
      document.getElementById('f-date').value = s.date;
      document.getElementById('f-category').value = s.category_id || '';
      document.getElementById('f-location').value = s.location || '';
      document.getElementById('f-contact').value = s.contact_name || '';
      document.getElementById('f-target').value = s.target_audience || '';
      document.getElementById('f-note').value = s.note || '';
      renderSlots(s.slots || []);
      eligPopulate(s.eligibility || { mode: 'all' });
      document.getElementById('form-heading').textContent = 'イベントを編集';
      document.getElementById('save-btn').textContent = '更新する';
      document.getElementById('cancel-edit-btn').style.display = 'inline-block';
      document.getElementById('form-heading').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    async function saveSession() {
      var errEl = document.getElementById('form-err');
      errEl.style.display = 'none';
      var id = document.getElementById('edit-id').value;
      var slots = collectSlots();
      var body = {
        title: document.getElementById('f-title').value.trim(),
        date: document.getElementById('f-date').value,
        category_id: parseInt(document.getElementById('f-category').value) || null,
        location: document.getElementById('f-location').value.trim(),
        contact_name: document.getElementById('f-contact').value.trim(),
        target_audience: document.getElementById('f-target').value.trim(),
        note: document.getElementById('f-note').value.trim(),
        slots: slots,
        eligibility: eligCollect()
      };
      if (!body.title || !body.date) { errEl.textContent = 'タイトルと開催日は必須です'; errEl.style.display = 'block'; return; }
      if (!slots.length) { errEl.textContent = '回を1つ以上入力してください'; errEl.style.display = 'block'; return; }
      var btn = document.getElementById('save-btn');
      btn.disabled = true;
      try {
        var res = await fetch(id ? API + '/' + id : API, {
          method: id ? 'PUT' : 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)
        });
        var d = await res.json().catch(function() { return {}; });
        if (!res.ok) { errEl.textContent = d.error || '保存に失敗しました'; errEl.style.display = 'block'; return; }
        resetForm();
        loadList();
      } catch (e) {
        errEl.textContent = '保存に失敗しました。もう一度お試しください'; errEl.style.display = 'block';
      } finally {
        btn.disabled = false;
      }
    }
    async function toggleClose(s) {
      var msg = s.is_closed ? 'このイベントの受付を再開しますか？' : 'このイベントを受付終了にしますか？';
      if (!confirm(msg)) return;
      var res = await fetch(API + '/' + s.id + '/close', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ is_closed: s.is_closed ? 0 : 1 }) });
      if (res.ok) loadList(); else alert('変更に失敗しました');
    }
    async function deleteSession(s) {
      if (!confirm('「' + s.title + '」を削除します。参加者の登録データも削除されます。よろしいですか？')) return;
      var res = await fetch(API + '/' + s.id, { method: 'DELETE' });
      if (res.ok) loadList(); else alert('削除に失敗しました');
    }
    var _participantsSessionId = null;
    var _participantsSlots = [];
    function openParticipants(s) {
      _participantsSessionId = s.id;
      _participantsSlots = s.slots || [];
      document.getElementById('participants-panel').style.display = 'block';
      document.getElementById('participants-heading').textContent = '参加者 — ' + s.title;
      document.getElementById('participants-body').innerHTML = '読み込み中...';
      var slotSel = document.getElementById('add-participant-slot');
      if (slotSel) {
        slotSel.innerHTML = _participantsSlots.map(function(sl, i) {
          return '<option value="' + sl.id + '">' + escH(slotName(sl, i)) + '（' + escH(slotTimeLabel(sl)) + '）</option>';
        }).join('');
      }
      document.getElementById('participants-panel').scrollIntoView({ behavior: 'smooth', block: 'center' });
      loadParticipants();
    }
    function loadParticipants() {
      fetch(API + '/' + _participantsSessionId + '/participants').then(function(r) { return r.json(); }).then(function(d) {
        var rows = (d.participants || []);
        var multi = _participantsSlots.length > 1;
        if (rows.length === 0) { document.getElementById('participants-body').innerHTML = '<div style="color:#9ca3af;">まだ参加登録がありません</div>'; return; }
        var attendedCount = rows.filter(function(p) { return p.attended; }).length;
        var summary = '<div style="font-size:12px;color:#6b7280;margin-bottom:8px;">合計 ' + rows.length + ' 名 ・ 出席消し込み ' + attendedCount + ' 名</div>';

        function tblFor(list) {
          return '<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:12px;">'
            + '<thead><tr style="background:#f8fafc;"><th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">出席</th><th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">社員番号</th><th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">氏名</th><th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">課/班</th><th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">登録日時</th><th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb;"></th></tr></thead><tbody>'
            + list.map(function(p) {
                var sid = p.slot_id || 0;
                var cancelBtn = EDITABLE ? ('<button onclick="adminCancelParticipant(\\'' + escH(p.emp_no) + '\\', ' + sid + ')" style="padding:4px 10px;background:#fef2f2;border:1px solid #fca5a5;color:#dc2626;border-radius:6px;font-size:11px;cursor:pointer;">キャンセル</button>') : '';
                var attendBtn = EDITABLE
                  ? ('<button onclick="toggleAttend(\\'' + escH(p.emp_no) + '\\', ' + (p.attended ? 0 : 1) + ', ' + sid + ')" style="padding:5px 14px;border-radius:99px;font-size:12px;font-weight:700;cursor:pointer;border:1px solid ' + (p.attended ? '#86efac' : '#d1d5db') + ';background:' + (p.attended ? '#f0fdf4' : '#f9fafb') + ';color:' + (p.attended ? '#166534' : '#9ca3af') + ';">' + (p.attended ? '出席済' : '未消込') + '</button>')
                  : ('<span style="color:' + (p.attended ? '#166534' : '#9ca3af') + ';font-weight:700;">' + (p.attended ? '出席済' : '未消込') + '</span>');
                return '<tr><td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;white-space:nowrap;">' + attendBtn + '</td>'
                  + '<td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;">' + escH(p.emp_no) + '</td>'
                  + '<td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;font-weight:600;">' + escH(p.name || '(該当社員なし)') + '</td>'
                  + '<td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;">' + (p.division ? (p.division + '課' + (p.team ? '/' + p.team + '班' : '')) : '') + '</td>'
                  + '<td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;color:#9ca3af;">' + escH(p.updated_at || '') + '</td>'
                  + '<td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;">' + cancelBtn + '</td></tr>';
              }).join('')
            + '</tbody></table>';
        }

        var html = summary;
        if (!multi) {
          html += tblFor(rows);
        } else {
          _participantsSlots.forEach(function(sl, i) {
            var list = rows.filter(function(p) { return p.slot_id === sl.id; });
            html += '<div style="font-size:12px;font-weight:700;color:#1e3a5f;margin:6px 0 4px;">' + escH(slotName(sl, i)) + '（' + escH(slotTimeLabel(sl)) + '）— ' + list.length + ' 名</div>';
            html += list.length ? tblFor(list) : '<div style="color:#9ca3af;font-size:12px;margin-bottom:10px;">登録なし</div>';
          });
        }
        document.getElementById('participants-body').innerHTML = html;
      });
    }
    async function toggleAttend(empNo, attended, slotId) {
      var res = await fetch(API + '/' + _participantsSessionId + '/participants/' + encodeURIComponent(empNo) + '/attend', {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ attended: attended, slot_id: slotId })
      });
      if (res.ok) loadParticipants(); else alert('更新に失敗しました');
    }
    var _addSearchTimer = null;
    function searchEmployeesForAdd(q) {
      clearTimeout(_addSearchTimer);
      var box = document.getElementById('add-participant-results');
      q = q.trim();
      if (!q) { box.style.display = 'none'; box.innerHTML = ''; return; }
      _addSearchTimer = setTimeout(function() {
        fetch(API + '/search-employees?q=' + encodeURIComponent(q)).then(function(r) { return r.json(); }).then(function(list) {
          if (!list.length) { box.innerHTML = '<div style="padding:10px;color:#9ca3af;font-size:12px;">該当する社員が見つかりません</div>'; box.style.display = 'block'; return; }
          box.innerHTML = list.map(function(e) {
            var div = e.division ? (e.division + '課' + (e.team ? '/' + e.team + '班' : '')) : '';
            return '<div onclick="addParticipant(\\'' + escH(e.emp_no) + '\\', \\'' + escH(e.name) + '\\')" style="padding:9px 12px;cursor:pointer;border-bottom:1px solid #f3f4f6;font-size:13px;" onmouseover="this.style.background=\\'#eff6ff\\'" onmouseout="this.style.background=\\'white\\'">'
              + '<b>' + escH(e.name) + '</b> <span style="color:#9ca3af;">' + escH(e.emp_no) + (div ? ' ・ ' + div : '') + '</span></div>';
          }).join('');
          box.style.display = 'block';
        });
      }, 250);
    }
    async function addParticipant(empNo, name) {
      var slotSel = document.getElementById('add-participant-slot');
      var slotId = slotSel ? parseInt(slotSel.value) : 0;
      if (!slotId) { alert('回を選択してください'); return; }
      var res = await fetch(API + '/' + _participantsSessionId + '/participants', {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ emp_no: empNo, slot_id: slotId })
      });
      var d = await res.json().catch(function() { return {}; });
      if (!res.ok) { alert(d.error || '追加に失敗しました'); return; }
      document.getElementById('add-participant-q').value = '';
      document.getElementById('add-participant-results').style.display = 'none';
      loadParticipants();
      loadList();
    }
    async function adminCancelParticipant(empNo, slotId) {
      if (!confirm(empNo + ' さんのこの回の参加登録を管理者権限でキャンセルします（前日・当日でも取り消せます）。よろしいですか？')) return;
      var url = API + '/' + _participantsSessionId + '/participants/' + encodeURIComponent(empNo) + (slotId ? ('?slot_id=' + slotId) : '');
      var res = await fetch(url, { method: 'DELETE' });
      if (res.ok) { loadParticipants(); loadList(); } else { var d = await res.json().catch(function(){return {};}); alert(d.error || 'キャンセルに失敗しました'); }
    }
    function closeParticipants() { document.getElementById('participants-panel').style.display = 'none'; }

    async function loadList() {
      var res = await fetch(API);
      var d = await res.json();
      var sessions = d.sessions || [];
      window._sessions = {};
      sessions.forEach(function(s) { window._sessions[s.id] = s; });
      if (sessions.length === 0) { document.getElementById('list-body').innerHTML = '<div style="color:#9ca3af;">まだイベントが登録されていません</div>'; return; }
      var html = '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;min-width:820px;">'
        + '<thead><tr style="background:#f8fafc;"><th style="padding:7px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">状態</th><th style="padding:7px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">カテゴリー</th><th style="padding:7px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">タイトル</th><th style="padding:7px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">開催日・回</th><th style="padding:7px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">集合場所</th><th style="padding:7px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">参加者</th><th style="padding:7px 8px;text-align:left;border-bottom:2px solid #e5e7eb;"></th></tr></thead><tbody>'
        + sessions.map(function(s) {
            var st = statusOf(s);
            var slots = s.slots || [];
            var timeLabel = slots.length <= 1
              ? (slots[0] ? slotTimeLabel(slots[0]) : '')
              : (slots.length + '回：' + slots.map(function(sl, i) { return slotName(sl, i) + ' ' + slotTimeLabel(sl); }).join(' / '));
            var total = eventTotalCount(s);
            var capSum = slots.reduce(function(a, sl) { return a + (sl.capacity > 0 ? sl.capacity : 0); }, 0);
            var anyUnlimited = slots.some(function(sl) { return !(sl.capacity > 0); });
            var capLabel = (capSum > 0 && !anyUnlimited) ? (total + ' / ' + capSum + '名') : (total + '名');
            var catLabel = s.category_name ? ('<span style="display:inline-block;padding:2px 8px;border-radius:6px;background:#eff6ff;color:#1e3a5f;font-size:11px;font-weight:700;">' + escH(s.category_name) + '</span>') : '<span style="color:#cbd5e1;">—</span>';
            var ops = '<button onclick="openParticipants(window._sessions[' + s.id + '])" style="padding:5px 10px;background:#eff6ff;border:1px solid #bfdbfe;color:#1e3a5f;border-radius:6px;font-size:11px;cursor:pointer;margin-right:4px;">参加者</button>'
              + '<a href="${ADMIN_PATH}/settings/study-sessions/' + s.id + '/poster" target="_blank" style="display:inline-block;padding:5px 10px;background:#f0fdf4;border:1px solid #86efac;color:#166534;border-radius:6px;font-size:11px;text-decoration:none;margin-right:4px;">ポスター</a>'
              + '<a href="${ADMIN_PATH}/settings/study-sessions/' + s.id + '/guide" target="_blank" style="display:inline-block;padding:5px 10px;background:#eef4ff;border:1px solid #bfd4ff;color:#1e40af;border-radius:6px;font-size:11px;text-decoration:none;margin-right:4px;">当日のご案内</a>'
              + '<a href="${ADMIN_PATH}/settings/study-sessions/' + s.id + '/roster" target="_blank" style="display:inline-block;padding:5px 10px;background:#fefce8;border:1px solid #fde68a;color:#92400e;border-radius:6px;font-size:11px;text-decoration:none;margin-right:4px;">名簿印刷</a>';
            if (EDITABLE) {
              ops += '<button onclick="editSession(window._sessions[' + s.id + '])" style="padding:5px 10px;background:#f9fafb;border:1px solid #d1d5db;color:#374151;border-radius:6px;font-size:11px;cursor:pointer;margin-right:4px;">編集</button>'
                + '<button onclick="toggleClose(window._sessions[' + s.id + '])" style="padding:5px 10px;background:#fffbeb;border:1px solid #fde68a;color:#92400e;border-radius:6px;font-size:11px;cursor:pointer;margin-right:4px;">' + (s.is_closed ? '受付再開' : '早期締切') + '</button>'
                + '<button onclick="deleteSession(window._sessions[' + s.id + '])" style="padding:5px 10px;background:#fef2f2;border:1px solid #fca5a5;color:#dc2626;border-radius:6px;font-size:11px;cursor:pointer;">削除</button>';
            }
            return '<tr><td style="padding:7px 8px;border-bottom:1px solid #f3f4f6;white-space:nowrap;"><span style="display:inline-block;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:700;color:' + st.color + ';background:' + st.bg + ';">' + st.label + '</span></td>'
              + '<td style="padding:7px 8px;border-bottom:1px solid #f3f4f6;white-space:nowrap;">' + catLabel + '</td>'
              + '<td style="padding:7px 8px;border-bottom:1px solid #f3f4f6;font-weight:600;color:#1e3a5f;">' + escH(s.title)
                + ((s.eligibility_label && s.eligibility_label !== '全員') ? ('<div style="font-size:10px;font-weight:400;color:#b45309;margin-top:2px;">対象: ' + escH(s.eligibility_label) + '</div>') : '')
                + '</td>'
              + '<td style="padding:7px 8px;border-bottom:1px solid #f3f4f6;">' + fmtDate(s.date) + ' <span style="color:#6b7280;">' + escH(timeLabel) + '</span></td>'
              + '<td style="padding:7px 8px;border-bottom:1px solid #f3f4f6;">' + escH(s.location || '') + '</td>'
              + '<td style="padding:7px 8px;border-bottom:1px solid #f3f4f6;white-space:nowrap;">' + capLabel + '</td>'
              + '<td style="padding:7px 8px;border-bottom:1px solid #f3f4f6;white-space:nowrap;">' + ops + '</td></tr>';
          }).join('')
        + '</tbody></table></div>';
      document.getElementById('list-body').innerHTML = html;
    }

    async function loadPenalties() {
      var res = await fetch(API + '/penalties');
      var d = await res.json();
      var rows = d.penalties || [];
      if (rows.length === 0) { document.getElementById('penalties-body').innerHTML = '<div style="color:#9ca3af;">対象者はいません</div>'; return; }
      var today = new Date(Date.now() + 9*3600*1000).toISOString().slice(0,10);
      var html = '<table style="width:100%;border-collapse:collapse;font-size:13px;">'
        + '<thead><tr style="background:#f8fafc;"><th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">社員番号</th><th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">氏名</th><th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">キャンセル回数</th><th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">申し込み制限</th><th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb;"></th></tr></thead><tbody>'
        + rows.map(function(p) {
            var active = p.penalty_until && p.penalty_until >= today;
            var statusHtml = active ? ('<span style="color:#dc2626;font-weight:700;">' + escH(p.penalty_until) + ' まで不可</span>') : '<span style="color:#9ca3af;">なし</span>';
            var btn = EDITABLE ? ('<button onclick="clearPenalty(\\'' + escH(p.emp_no) + '\\')" style="padding:5px 12px;background:#f0fdf4;border:1px solid #86efac;color:#166534;border-radius:6px;font-size:11px;cursor:pointer;">解除する</button>') : '';
            return '<tr><td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;">' + escH(p.emp_no) + '</td>'
              + '<td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;font-weight:600;">' + escH(p.name || '(該当社員なし)') + '</td>'
              + '<td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;">' + p.cancel_count + ' / 10</td>'
              + '<td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;">' + statusHtml + '</td>'
              + '<td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;">' + btn + '</td></tr>';
          }).join('')
        + '</tbody></table>';
      document.getElementById('penalties-body').innerHTML = html;
    }
    async function clearPenalty(empNo) {
      if (!confirm(empNo + ' のキャンセル回数・申し込み制限を解除しますか？')) return;
      var res = await fetch(API + '/penalties/' + encodeURIComponent(empNo) + '/clear', { method: 'POST' });
      if (res.ok) loadPenalties(); else alert('解除に失敗しました');
    }

    async function loadRequests() {
      var res = await fetch(API + '/requests');
      var d = await res.json();
      var rows = d.requests || [];
      if (rows.length === 0) { document.getElementById('requests-body').innerHTML = '<div style="color:#9ca3af;">まだ要望はありません</div>'; return; }
      var html = rows.map(function(r) {
        var who = escH(r.name || '(該当社員なし)') + ' <span style="color:#9ca3af;">' + escH(r.emp_no) + (r.division ? ' ・ ' + r.division + '課' + (r.team ? '/' + r.team + '班' : '') : '') + '</span>';
        var delBtn = EDITABLE ? ('<button onclick="deleteRequest(' + r.id + ')" style="padding:4px 10px;background:#fef2f2;border:1px solid #fca5a5;color:#dc2626;border-radius:6px;font-size:11px;cursor:pointer;flex-shrink:0;">削除</button>') : '';
        return '<div style="display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-bottom:1px solid #f3f4f6;">'
          + '<div style="flex:1;"><div style="font-size:13px;color:#1f2937;white-space:pre-wrap;">' + escH(r.content) + '</div>'
          + '<div style="font-size:11px;color:#9ca3af;margin-top:4px;">' + who + ' ・ ' + escH(r.created_at || '') + '</div></div>'
          + delBtn + '</div>';
      }).join('');
      document.getElementById('requests-body').innerHTML = html;
    }
    async function deleteRequest(id) {
      if (!confirm('この要望を削除しますか？')) return;
      var res = await fetch(API + '/requests/' + id, { method: 'DELETE' });
      if (res.ok) loadRequests(); else alert('削除に失敗しました');
    }

    // ===== ご意見版 =====
    function loadOpinions() {
      var status = document.getElementById('op-filter').value;
      fetch(OP_API + '?status=' + encodeURIComponent(status)).then(function(r) { return r.json(); }).then(function(d) {
        var rows = d.opinions || [];
        if (!rows.length) { document.getElementById('opinions-body').innerHTML = '<div style="color:#9ca3af;">該当するご意見はありません</div>'; return; }
        document.getElementById('opinions-body').innerHTML = rows.map(renderOpinion).join('');
      });
    }
    function renderOpinion(o) {
      var who;
      if (o.is_anonymous) {
        who = '<span style="display:inline-block;padding:2px 8px;border-radius:99px;background:#f3f4f6;color:#6b7280;font-size:11px;font-weight:700;">匿名希望</span>';
        if (CAN_REVEAL) who += ' <button onclick="revealOpinion(' + o.id + ',this)" style="padding:3px 10px;background:#eff6ff;border:1px solid #bfdbfe;color:#1e3a5f;border-radius:6px;font-size:11px;cursor:pointer;">送信者を表示</button>';
      } else {
        who = '<b>' + escH(o.name || '(該当社員なし)') + '</b> <span style="color:#9ca3af;">' + escH(o.emp_no) + (o.division ? ' ・ ' + o.division + '課' + (o.team ? '/' + o.team + '班' : '') : '') + '</span>';
      }
      var done = o.status === 'done';
      var statusBtn = EDITABLE
        ? ('<button onclick="setOpinionStatus(' + o.id + ',\\'' + (done ? 'open' : 'done') + '\\')" style="padding:4px 12px;border-radius:99px;font-size:11px;font-weight:700;cursor:pointer;border:1px solid ' + (done ? '#86efac' : '#d1d5db') + ';background:' + (done ? '#f0fdf4' : '#f9fafb') + ';color:' + (done ? '#166534' : '#6b7280') + ';">' + (done ? '対応済' : '未対応') + '</button>')
        : ('<span style="font-weight:700;color:' + (done ? '#166534' : '#6b7280') + ';">' + (done ? '対応済' : '未対応') + '</span>');
      var delBtn = EDITABLE ? ('<button onclick="deleteOpinion(' + o.id + ')" style="padding:4px 10px;background:#fef2f2;border:1px solid #fca5a5;color:#dc2626;border-radius:6px;font-size:11px;cursor:pointer;">削除</button>') : '';
      var noteBox = EDITABLE
        ? ('<div style="margin-top:8px;display:flex;gap:6px;"><input id="op-note-' + o.id + '" value="' + escH(o.admin_note || '') + '" placeholder="対応メモ（社内用・乗務員には表示されません）" style="flex:1;border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:12px;"><button onclick="saveOpinionNote(' + o.id + ',this)" style="padding:6px 12px;background:#f9fafb;border:1px solid #d1d5db;border-radius:6px;font-size:11px;cursor:pointer;white-space:nowrap;">メモ保存</button></div>')
        : (o.admin_note ? ('<div style="margin-top:6px;font-size:11px;color:#9ca3af;">対応メモ: ' + escH(o.admin_note) + '</div>') : '');
      return '<div style="padding:12px 0;border-bottom:1px solid #f3f4f6;">'
        + '<div style="display:flex;gap:10px;align-items:flex-start;">'
        + '<div style="flex:1;min-width:0;">'
        + (o.category ? ('<span style="display:inline-block;padding:2px 8px;border-radius:6px;background:#eff6ff;color:#1e3a5f;font-size:11px;font-weight:700;margin-right:6px;">' + escH(o.category) + '</span>') : '')
        + '<span style="font-size:13px;color:#1f2937;white-space:pre-wrap;word-break:break-word;">' + escH(o.content) + '</span>'
        + '<div id="op-who-' + o.id + '" style="font-size:11px;color:#9ca3af;margin-top:5px;">' + who + ' ・ ' + escH(o.created_at || '') + '</div>'
        + noteBox
        + '</div>'
        + '<div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;flex-shrink:0;">' + statusBtn + delBtn + '</div>'
        + '</div></div>';
    }
    async function revealOpinion(id, btn) {
      btn.disabled = true;
      try {
        var res = await fetch(OP_API + '/' + id + '/reveal', { method: 'POST' });
        var d = await res.json().catch(function() { return {}; });
        if (!res.ok) { alert(d.error || '開示できませんでした'); btn.disabled = false; return; }
        document.getElementById('op-who-' + id).innerHTML = '<b>' + escH(d.name || '(該当社員なし)') + '</b> <span style="color:#9ca3af;">' + escH(d.emp_no) + (d.division ? ' ・ ' + d.division + '課' + (d.team ? '/' + d.team + '班' : '') : '') + '</span> <span style="color:#dc2626;">（匿名希望・開示済み）</span>';
      } catch (e) { alert('開示に失敗しました'); btn.disabled = false; }
    }
    async function setOpinionStatus(id, status) {
      var res = await fetch(OP_API + '/' + id + '/status', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ status: status }) });
      if (res.ok) loadOpinions(); else alert('更新に失敗しました');
    }
    async function saveOpinionNote(id, btn) {
      var res = await fetch(OP_API + '/' + id + '/note', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ admin_note: document.getElementById('op-note-' + id).value }) });
      if (res.ok) { btn.textContent = '保存しました'; setTimeout(function() { btn.textContent = 'メモ保存'; }, 1500); } else alert('保存に失敗しました');
    }
    async function deleteOpinion(id) {
      if (!confirm('このご意見を削除しますか？')) return;
      var res = await fetch(OP_API + '/' + id, { method: 'DELETE' });
      if (res.ok) loadOpinions(); else alert('削除に失敗しました');
    }

    // ===== ヒヤリハット =====
    function copyHiyariUrl() {
      navigator.clipboard.writeText(document.getElementById('hh-share-url').textContent).then(function() { alert('コピーしました'); });
    }
    function hhDash(s) { return (s == null || String(s).trim() === '') ? '—' : escH(s); }
    function hhKaHan(r) {
      if (r.division && r.team) return r.division + '課' + r.team + '班';
      if (r.division) return r.division + '課';
      return '—';
    }
    function loadHiyari() {
      var f = document.getElementById('hh-filter').value;
      fetch(HH_API + '?filter=' + encodeURIComponent(f)).then(function(r){ return r.json(); }).then(function(d){
        var rows = d.reports || [];
        if (!rows.length) { document.getElementById('hiyari-body').innerHTML = '<div style="color:#9ca3af;">該当する報告はありません</div>'; return; }
        document.getElementById('hiyari-body').innerHTML = rows.map(renderHiyari).join('');
      });
    }
    function renderHiyari(r) {
      var reviewed = r.status === 'reviewed';
      var kind = r.source === 'web'
        ? '<span style="font-size:10px;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:99px;padding:1px 7px;">Web</span>'
        : '<span style="font-size:10px;color:#6b7280;border:1px solid #e5e7eb;border-radius:99px;padding:1px 7px;">紙</span>';
      var sev = r.severe ? ' <span style="font-size:11px;color:#dc2626;font-weight:700;">衝突寸前</span>' : '';
      var place = [r.place_area && r.place_area !== 'その他' ? r.place_area : '', r.place_detail].filter(Boolean).join('／') || '—';
      var idBtn = (CAN_REVEAL && r.emp_no)
        ? ' <button onclick="revealHiyari(' + r.id + ',this)" style="padding:3px 10px;background:#eff6ff;border:1px solid #bfdbfe;color:#1e3a5f;border-radius:6px;font-size:11px;cursor:pointer;">氏名を照会</button>' : '';
      var statusBtn = EDITABLE
        ? ('<button onclick="setHiyariStatus(' + r.id + ',\\'' + (reviewed ? 'open' : 'reviewed') + '\\')" style="padding:4px 12px;border-radius:99px;font-size:11px;font-weight:700;cursor:pointer;border:1px solid ' + (reviewed ? '#86efac' : '#d1d5db') + ';background:' + (reviewed ? '#f0fdf4' : '#f9fafb') + ';color:' + (reviewed ? '#166534' : '#6b7280') + ';">' + (reviewed ? '確認済' : '未確認') + '</button>')
        : ('<span style="font-size:11px;color:#6b7280;">' + (reviewed ? '確認済' : '未確認') + '</span>');
      var delBtn = EDITABLE ? ('<button onclick="deleteHiyari(' + r.id + ')" style="padding:4px 10px;background:#fef2f2;border:1px solid #fca5a5;color:#dc2626;border-radius:6px;font-size:11px;cursor:pointer;">削除</button>') : '';
      var noteBox = EDITABLE
        ? ('<div style="margin-top:8px;display:flex;gap:6px;"><input id="hh-note-' + r.id + '" value="' + escH(r.admin_note || '') + '" placeholder="対応メモ（社内用・乗務員には表示されません）" style="flex:1;border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:12px;"><button onclick="saveHiyariNote(' + r.id + ',this)" style="padding:6px 12px;background:#f9fafb;border:1px solid #d1d5db;border-radius:6px;font-size:11px;cursor:pointer;white-space:nowrap;">メモ保存</button></div>')
        : (r.admin_note ? '<div style="margin-top:6px;font-size:12px;color:#6b7280;">メモ: ' + escH(r.admin_note) + '</div>' : '');
      var rowLine = function(lb, v) { return '<div style="display:flex;gap:8px;margin-bottom:3px;"><span style="color:#9ca3af;flex:0 0 88px;">' + lb + '</span><span style="flex:1;color:#374151;">' + v + '</span></div>'; };
      return '<div style="border:1px solid #e5e7eb;border-radius:10px;padding:14px;margin-bottom:10px;' + (r.severe ? 'background:#fef7f7;' : '') + '">'
        + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">'
        +   kind + '<span style="font-size:12px;font-weight:700;color:#1e3a5f;">' + escH(hhKaHan(r)) + '</span>'
        +   '<span style="font-size:12px;color:#6b7280;">' + hhDash(r.occurred_at) + '</span>' + sev
        +   '<span id="hh-name-' + r.id + '" style="font-size:12px;color:#9ca3af;"></span>' + idBtn
        +   '<span style="margin-left:auto;display:flex;gap:6px;">' + statusBtn + delBtn + '</span>'
        + '</div>'
        + rowLine('場所', hhDash(place))
        + rowLine('相手 / 場面', hhDash(r.counterpart) + ' / ' + hhDash(r.situation))
        + rowLine('状況', hhDash(r.situation_text))
        + rowLine('理由', hhDash(r.cause_text || r.cause))
        + rowLine('今後', hhDash(r.measure_text))
        + '<div style="font-size:11px;color:#c7ccd4;margin-top:4px;">' + escH(r.created_at || '') + '</div>'
        + noteBox
        + '</div>';
    }
    async function setHiyariStatus(id, status) {
      var res = await fetch(HH_API + '/' + id + '/status', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ status: status }) });
      if (res.ok) loadHiyari(); else alert('更新に失敗しました');
    }
    async function saveHiyariNote(id, btn) {
      var v = document.getElementById('hh-note-' + id).value;
      btn.textContent = '保存中...';
      var res = await fetch(HH_API + '/' + id + '/note', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ admin_note: v }) });
      btn.textContent = res.ok ? '保存しました' : '失敗';
      setTimeout(function(){ btn.textContent = 'メモ保存'; }, 1500);
    }
    async function deleteHiyari(id) {
      if (!confirm('この報告を削除します。よろしいですか？')) return;
      var res = await fetch(HH_API + '/' + id, { method:'DELETE' });
      if (res.ok) loadHiyari(); else alert('削除に失敗しました');
    }
    async function revealHiyari(id, btn) {
      btn.disabled = true;
      var res = await fetch(HH_API + '/' + id + '/reveal', { method:'POST' });
      if (!res.ok) { btn.textContent = '照会不可'; return; }
      var d = await res.json();
      var el = document.getElementById('hh-name-' + id);
      el.textContent = '（' + (d.name || '氏名不明') + '・社員番号 ' + (d.emp_no || '—') + '）';
      btn.style.display = 'none';
    }
    async function saveHiyariPoster(btn) {
      btn.disabled = true;
      var msg = document.getElementById('hp-msg');
      var payload = {
        eyebrow: document.getElementById('hp-eyebrow').value,
        title: document.getElementById('hp-title').value,
        lead: document.getElementById('hp-lead').value,
        body: document.getElementById('hp-body').value,
        contact: document.getElementById('hp-contact').value,
        qr_caption: document.getElementById('hp-qrcap').value
      };
      try {
        var res = await fetch('${ADMIN_PATH}/api/hiyari-poster', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
        msg.style.color = res.ok ? '#166534' : '#dc2626';
        msg.textContent = res.ok ? '保存しました' : '保存に失敗しました';
      } catch (e) { msg.style.color = '#dc2626'; msg.textContent = '保存に失敗しました'; }
      btn.disabled = false;
      setTimeout(function(){ msg.textContent = ''; }, 2500);
    }

    // ===== アンケート =====
    var SV_CUR = null;
    function svShow(view) {
      ['list','editor','results'].forEach(function(v){ document.getElementById('sv-' + v + '-view').style.display = (v === view) ? 'block' : 'none'; });
    }
    function svTypeLabel(t) { for (var i=0;i<SV_QTYPES.length;i++){ if (SV_QTYPES[i].value === t) return SV_QTYPES[i].label; } return t; }

    function loadSurveys() {
      svShow('list');
      var box = document.getElementById('sv-list');
      box.innerHTML = '読み込み中...';
      fetch(SV_API).then(function(r){ return r.json(); }).then(function(d){
        var list = d.surveys || [];
        if (!list.length) { box.innerHTML = '<div style="color:#9ca3af;">まだアンケートはありません。' + (EDITABLE ? '「＋ 新しいアンケートを作成」から作成できます。' : '') + '</div>'; return; }
        box.innerHTML = list.map(function(s){
          var closed = s.is_closed ? '<span style="font-size:11px;color:#6b7280;border:1px solid #e5e7eb;border-radius:99px;padding:1px 8px;">受付終了</span>' : '<span style="font-size:11px;color:#166534;border:1px solid #86efac;border-radius:99px;padding:1px 8px;">公開中</span>';
          var btns = '<button onclick="svCopyLink(' + s.id + ')" style="padding:5px 12px;background:#f0fdf4;border:1px solid #86efac;color:#166534;border-radius:6px;font-size:12px;cursor:pointer;">回答リンク</button>'
            + ' <button onclick="window.open(SV_QR_BASE + ' + s.id + ' + \\'/qr\\', \\'_blank\\')" style="padding:5px 12px;background:#f0fdf4;border:1px solid #86efac;color:#166534;border-radius:6px;font-size:12px;cursor:pointer;">QR</button>'
            + ' <button onclick="svResults(' + s.id + ')" style="padding:5px 12px;background:#eff6ff;border:1px solid #bfdbfe;color:#1e3a5f;border-radius:6px;font-size:12px;cursor:pointer;">結果</button>';
          if (EDITABLE) btns += ' <button onclick="svEdit(' + s.id + ')" style="padding:5px 12px;background:#f9fafb;border:1px solid #d1d5db;border-radius:6px;font-size:12px;cursor:pointer;">編集</button>'
            + ' <button onclick="svDelete(' + s.id + ')" style="padding:5px 10px;background:#fef2f2;border:1px solid #fca5a5;color:#dc2626;border-radius:6px;font-size:12px;cursor:pointer;">削除</button>';
          return '<div style="border:1px solid #e5e7eb;border-radius:10px;padding:14px;margin-bottom:10px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">'
            + '<div style="flex:1;min-width:200px;"><div style="font-size:14px;font-weight:700;color:#1e3a5f;">' + escH(s.title) + '</div>'
            + '<div style="font-size:11px;color:#9ca3af;margin-top:3px;">設問 ' + s.question_count + '問 ・ 回答 ' + s.response_count + '件 ・ 対象 ' + (s.target_all ? '全員' : (s.target_count + '名')) + ' ・ ' + escH(s.created_at || '') + '</div></div>'
            + closed + '<div style="display:flex;gap:6px;">' + btns + '</div></div>';
        }).join('');
      }).catch(function(){ box.innerHTML = '<div style="color:#dc2626;">読み込みに失敗しました</div>'; });
    }

    function svCopyLink(id) {
      var url = SV_SHARE_URL + '?survey=' + id;
      navigator.clipboard.writeText(url).then(function(){ alert('このアンケートを直接開く回答リンクをコピーしました:\\n' + url); }, function(){ prompt('回答リンク', url); });
    }

    async function svNew() {
      var res = await fetch(SV_API, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ title:'無題のアンケート', description:'' }) });
      var d = await res.json().catch(function(){ return {}; });
      if (!res.ok || !d.id) { alert(d.error || '作成に失敗しました'); return; }
      svEdit(d.id);
    }

    function svEdit(id) {
      fetch(SV_API + '/' + id).then(function(r){ return r.json().then(function(d){ return { ok:r.ok, d:d }; }); }).then(function(x){
        if (!x.ok) { alert(x.d.error || '開けませんでした'); return; }
        SV_CUR = x.d;
        if (!SV_CUR.questions) SV_CUR.questions = [];
        if (!SV_CUR.targets) SV_CUR.targets = [];
        if (SV_CUR.target_all == null) SV_CUR.target_all = 1;
        svRenderEditor();
        svShow('editor');
      });
    }

    function svDefaultSettings(t) {
      if (t === 'radio' || t === 'checkbox') return { choices:['選択肢1','選択肢2'], allowOther:false, minSel:0, maxSel:0 };
      if (t === 'scale') return { scaleMin:1, scaleMax:5, minLabel:'', maxLabel:'' };
      if (t === 'yesno') return { yesLabel:'はい', noLabel:'いいえ' };
      if (t === 'number') return { numMin:null, numMax:null, unit:'' };
      return {};
    }
    function svAddQuestion(t) {
      svSyncEditor();
      SV_CUR.questions.push({ qtype:t, label:'', help:'', required:false, settings: svDefaultSettings(t) });
      svRenderEditor();
    }
    function svMoveQ(i, dir) {
      svSyncEditor();
      var j = i + dir;
      if (j < 0 || j >= SV_CUR.questions.length) return;
      var tmp = SV_CUR.questions[i]; SV_CUR.questions[i] = SV_CUR.questions[j]; SV_CUR.questions[j] = tmp;
      svRenderEditor();
    }
    function svDelQ(i) {
      svSyncEditor();
      SV_CUR.questions.splice(i, 1);
      svRenderEditor();
    }

    function svField(id, label, val, ph) {
      return '<label style="font-size:11px;color:#6b7280;display:block;">' + label
        + '<input id="' + id + '" value="' + escH(val || '') + '" placeholder="' + escH(ph || '') + '" style="width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:12px;margin-top:2px;"></label>';
    }
    function svNumField(id, label, val) {
      return '<label style="font-size:11px;color:#6b7280;display:block;">' + label
        + '<input id="' + id + '" type="number" value="' + (val == null ? '' : val) + '" style="width:90px;border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:12px;margin-top:2px;"></label>';
    }

    function svQuestionCard(q, i, locked) {
      var st = q.settings || {};
      var dis = locked ? ' disabled' : '';
      var typeSel = '<select id="q' + i + '-type"' + dis + ' onchange="svChangeType(' + i + ',this.value)" style="border:1px solid #d1d5db;border-radius:6px;padding:5px 8px;font-size:12px;">'
        + SV_QTYPES.map(function(t){ return '<option value="' + t.value + '"' + (t.value === q.qtype ? ' selected' : '') + '>' + t.label + '</option>'; }).join('') + '</select>';
      var extra = '';
      if (q.qtype === 'radio' || q.qtype === 'checkbox') {
        extra += '<label style="font-size:11px;color:#6b7280;display:block;margin-top:8px;">選択肢（1行に1つ）'
          + '<textarea id="q' + i + '-choices"' + dis + ' rows="3" style="width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:12px;font-family:inherit;margin-top:2px;">' + escH((st.choices || []).join("\\n")) + '</textarea></label>';
        extra += '<label style="font-size:12px;color:#374151;display:flex;align-items:center;gap:6px;margin-top:6px;"><input type="checkbox" id="q' + i + '-other"' + dis + (st.allowOther ? ' checked' : '') + '>「その他（自由記入）」を許可</label>';
        if (q.qtype === 'checkbox') {
          extra += '<div style="display:flex;gap:10px;margin-top:6px;">' + svNumField('q' + i + '-minSel', '最小選択数(0=なし)', st.minSel || 0) + svNumField('q' + i + '-maxSel', '最大選択数(0=なし)', st.maxSel || 0) + '</div>';
        }
      } else if (q.qtype === 'scale') {
        extra += '<div style="display:flex;gap:10px;margin-top:8px;flex-wrap:wrap;">' + svNumField('q' + i + '-sMin', '最小', st.scaleMin == null ? 1 : st.scaleMin) + svNumField('q' + i + '-sMax', '最大', st.scaleMax == null ? 5 : st.scaleMax) + '</div>';
        extra += '<div style="display:flex;gap:10px;margin-top:6px;">' + svField('q' + i + '-minLabel', '左端ラベル', st.minLabel, '例: 悪い') + svField('q' + i + '-maxLabel', '右端ラベル', st.maxLabel, '例: 良い') + '</div>';
      } else if (q.qtype === 'yesno') {
        extra += '<div style="display:flex;gap:10px;margin-top:8px;">' + svField('q' + i + '-yes', '「はい」の表示', st.yesLabel || 'はい', '') + svField('q' + i + '-no', '「いいえ」の表示', st.noLabel || 'いいえ', '') + '</div>';
      } else if (q.qtype === 'number') {
        extra += '<div style="display:flex;gap:10px;margin-top:8px;flex-wrap:wrap;">' + svNumField('q' + i + '-nMin', '最小(任意)', st.numMin) + svNumField('q' + i + '-nMax', '最大(任意)', st.numMax) + svField('q' + i + '-unit', '単位(任意)', st.unit, '例: 分') + '</div>';
      }
      var mv = locked ? '' : ('<button onclick="svMoveQ(' + i + ',-1)" style="border:1px solid #d1d5db;background:#fff;border-radius:5px;width:24px;height:24px;cursor:pointer;">↑</button>'
        + '<button onclick="svMoveQ(' + i + ',1)" style="border:1px solid #d1d5db;background:#fff;border-radius:5px;width:24px;height:24px;cursor:pointer;">↓</button>'
        + '<button onclick="svDelQ(' + i + ')" style="border:1px solid #fca5a5;background:#fef2f2;color:#dc2626;border-radius:5px;width:24px;height:24px;cursor:pointer;">×</button>');
      return '<div class="sv-qcard" data-idx="' + i + '" data-qtype="' + q.qtype + '" style="border:1px solid #e5e7eb;border-radius:10px;padding:14px;margin-bottom:10px;background:#fff;">'
        + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;"><span style="font-size:12px;font-weight:700;color:#9ca3af;">設問 ' + (i+1) + '</span>' + typeSel + '<span style="margin-left:auto;display:flex;gap:4px;">' + mv + '</span></div>'
        + '<label style="font-size:11px;color:#6b7280;display:block;">質問文<input id="q' + i + '-label"' + dis + ' value="' + escH(q.label || '') + '" style="width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:6px;padding:7px 8px;font-size:13px;margin-top:2px;"></label>'
        + '<label style="font-size:11px;color:#6b7280;display:block;margin-top:6px;">補足説明（任意）<input id="q' + i + '-help"' + dis + ' value="' + escH(q.help || '') + '" style="width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:12px;margin-top:2px;"></label>'
        + '<label style="font-size:12px;color:#374151;display:flex;align-items:center;gap:6px;margin-top:6px;"><input type="checkbox" id="q' + i + '-req"' + dis + (q.required ? ' checked' : '') + '>必須</label>'
        + extra
        + '</div>';
    }

    function svChangeType(i, t) {
      svSyncEditor();
      SV_CUR.questions[i].qtype = t;
      SV_CUR.questions[i].settings = svDefaultSettings(t);
      svRenderEditor();
    }

    function svRenderEditor() {
      var locked = (SV_CUR.response_count || 0) > 0;
      var addBtns = SV_QTYPES.map(function(t){ return '<button onclick="svAddQuestion(\\'' + t.value + '\\')" style="padding:6px 10px;background:#eef2ff;border:1px solid #c7d2fe;color:#3730a3;border-radius:6px;font-size:12px;cursor:pointer;">＋ ' + t.label + '</button>'; }).join(' ');
      var h = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">'
        + '<button onclick="loadSurveys()" style="color:#6b7280;font-size:13px;background:#fff;border:1px solid #d1d5db;border-radius:6px;padding:6px 12px;cursor:pointer;">← 一覧へ</button>'
        + '<h3 style="font-size:15px;font-weight:700;color:#1e3a5f;margin:0;">アンケートの編集</h3></div>';
      h += '<div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:16px;max-width:820px;">';
      h += '<label style="font-size:12px;color:#6b7280;display:block;">タイトル<input id="sv-title" value="' + escH(SV_CUR.title || '') + '" style="width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:14px;margin-top:2px;"></label>';
      h += '<label style="font-size:12px;color:#6b7280;display:block;margin-top:10px;">説明（任意・回答画面の先頭に表示）<textarea id="sv-desc" rows="2" style="width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;font-family:inherit;margin-top:2px;">' + escH(SV_CUR.description || '') + '</textarea></label>';
      h += '<label style="font-size:13px;color:#374151;display:flex;align-items:center;gap:8px;margin-top:10px;"><input type="checkbox" id="sv-closed"' + (SV_CUR.is_closed ? ' checked' : '') + '>受付を終了する（回答ページに表示しない）</label>';
      // 対象者
      var tgAll = (SV_CUR.target_all == null ? 1 : SV_CUR.target_all);
      h += '<div style="margin-top:14px;padding-top:12px;border-top:1px solid #f0f0f2;">'
        + '<div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:6px;">対象者</div>'
        + '<label style="font-size:13px;color:#374151;display:flex;align-items:center;gap:8px;margin-bottom:4px;"><input type="radio" name="sv-target" value="all"' + (tgAll ? ' checked' : '') + ' onchange="svToggleTargetPicker()">全員</label>'
        + '<label style="font-size:13px;color:#374151;display:flex;align-items:center;gap:8px;"><input type="radio" name="sv-target" value="selected"' + (tgAll ? '' : ' checked') + ' onchange="svToggleTargetPicker()">選択した社員のみ</label>'
        + '<div id="sv-target-picker" style="display:' + (tgAll ? 'none' : 'block') + ';margin-top:10px;">'
        +   '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">'
        +     [1,2,3,4].map(function(d){ return '<button type="button" onclick="svAddDivision(' + d + ',this)" style="padding:5px 10px;background:#eef2ff;border:1px solid #c7d2fe;color:#3730a3;border-radius:6px;font-size:12px;cursor:pointer;">＋ ' + d + '課を追加</button>'; }).join('')
        +   '</div>'
        +   '<div style="position:relative;">'
        +     '<input id="sv-tgt-q" type="text" placeholder="氏名または社員番号で検索して追加" autocomplete="off" oninput="svSearchTargets(this.value)" style="width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;">'
        +     '<div id="sv-tgt-results" style="display:none;position:absolute;left:0;right:0;top:38px;background:white;border:1px solid #d1d5db;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.12);max-height:240px;overflow-y:auto;z-index:10;"></div>'
        +   '</div>'
        +   '<div id="sv-tgt-list" style="margin-top:10px;"></div>'
        + '</div>'
        + '</div>';
      h += '</div>';
      if (locked) h += '<div style="font-size:12px;color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 12px;margin-top:12px;">すでに回答があるため、設問の変更はできません（タイトル・説明・受付終了のみ変更可）。設問を変えたい場合は新しいアンケートを作成してください。</div>';
      h += '<div id="sv-qlist" style="margin-top:14px;max-width:820px;">' + (SV_CUR.questions.length ? SV_CUR.questions.map(function(q, i){ return svQuestionCard(q, i, locked); }).join('') : '<div style="font-size:13px;color:#9ca3af;">設問がありません。下のボタンから追加してください。</div>') + '</div>';
      if (!locked) h += '<div style="margin-top:10px;max-width:820px;display:flex;gap:6px;flex-wrap:wrap;">' + addBtns + '</div>';
      h += '<div style="margin-top:16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;">'
        + '<button onclick="svSave()" style="padding:10px 24px;background:#166534;color:white;border:none;border-radius:7px;font-size:14px;font-weight:700;cursor:pointer;">保存</button>'
        + '<button type="button" onclick="svCopyLink(' + SV_CUR.id + ')" style="padding:9px 16px;background:#f0fdf4;border:1px solid #86efac;color:#166534;border-radius:7px;font-size:13px;cursor:pointer;">回答リンクをコピー</button>'
        + '<button type="button" onclick="window.open(SV_QR_BASE + ' + SV_CUR.id + ' + \\'/qr\\', \\'_blank\\')" style="padding:9px 16px;background:#f0fdf4;border:1px solid #86efac;color:#166534;border-radius:7px;font-size:13px;cursor:pointer;">QRを開く</button>'
        + '<span id="sv-msg" style="font-size:12px;color:#166534;"></span></div>';
      document.getElementById('sv-editor-view').innerHTML = h;
      svRenderTargetList();
    }

    function svToggleTargetPicker() {
      var sel = document.querySelector('input[name="sv-target"]:checked');
      document.getElementById('sv-target-picker').style.display = (sel && sel.value === 'selected') ? 'block' : 'none';
    }
    function svRenderTargetList() {
      var box = document.getElementById('sv-tgt-list');
      if (!box) return;
      var list = SV_CUR.targets || [];
      if (!list.length) { box.innerHTML = '<div style="font-size:12px;color:#9ca3af;">まだ誰も選ばれていません。上の検索または「○課を追加」で選択してください。</div>'; return; }
      box.innerHTML = '<div style="font-size:11px;color:#6b7280;margin-bottom:4px;">選択中 ' + list.length + '名</div>'
        + list.map(function(e){
          return '<span style="display:inline-flex;align-items:center;gap:6px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:99px;padding:3px 6px 3px 10px;font-size:12px;margin:0 6px 6px 0;">'
            + escH(e.name || e.emp_no) + '<span style="color:#9ca3af;">' + escH(e.emp_no) + '</span>'
            + '<button onclick="svRemoveTarget(\\'' + escH(e.emp_no) + '\\')" style="border:none;background:#e2e8f0;color:#475569;border-radius:50%;width:18px;height:18px;cursor:pointer;font-size:12px;line-height:1;">×</button></span>';
        }).join('');
    }
    function svAddTarget(emp_no, name, division, team) {
      if (!SV_CUR.targets) SV_CUR.targets = [];
      if (SV_CUR.targets.some(function(x){ return x.emp_no === emp_no; })) return;
      SV_CUR.targets.push({ emp_no: emp_no, name: name || '', division: division, team: team });
      svRenderTargetList();
    }
    function svRemoveTarget(emp_no) {
      SV_CUR.targets = (SV_CUR.targets || []).filter(function(x){ return x.emp_no !== emp_no; });
      svRenderTargetList();
    }
    function svSearchTargets(q) {
      var box = document.getElementById('sv-tgt-results');
      q = (q || '').trim();
      if (!q) { box.style.display = 'none'; return; }
      fetch(API + '/search-employees?q=' + encodeURIComponent(q)).then(function(r){ return r.json(); }).then(function(list){
        if (!list.length) { box.innerHTML = '<div style="padding:9px 12px;font-size:12px;color:#9ca3af;">該当なし</div>'; box.style.display = 'block'; return; }
        box.innerHTML = list.map(function(e){
          var kh = (e.division ? e.division + '課' : '') + (e.team ? e.team + '班' : '');
          return '<div onclick="svPickTarget(\\'' + escH(e.emp_no) + '\\',\\'' + escH((e.name || '').replace(/\\\\/g,"")) + '\\',' + (e.division || 'null') + ',' + (e.team || 'null') + ')" style="padding:9px 12px;cursor:pointer;border-bottom:1px solid #f3f4f6;font-size:13px;" onmouseover="this.style.background=\\'#eff6ff\\'" onmouseout="this.style.background=\\'white\\'">'
            + escH(e.name || '') + ' <span style="color:#9ca3af;font-size:12px;">' + escH(e.emp_no) + ' ' + kh + '</span></div>';
        }).join('');
        box.style.display = 'block';
      });
    }
    function svPickTarget(emp_no, name, division, team) {
      svAddTarget(emp_no, name, division, team);
      var q = document.getElementById('sv-tgt-q'); if (q) q.value = '';
      var box = document.getElementById('sv-tgt-results'); if (box) box.style.display = 'none';
    }
    async function svAddDivision(d, btn) {
      btn.disabled = true; var t0 = btn.textContent; btn.textContent = '追加中...';
      try {
        var list = await (await fetch(API + '/search-employees?division=' + d)).json();
        (list || []).forEach(function(e){ svAddTarget(e.emp_no, e.name, e.division, e.team); });
      } catch (e) {}
      btn.disabled = false; btn.textContent = t0;
    }

    // 画面の入力値を SV_CUR に取り込む（再描画で失わないため）
    function svSyncEditor() {
      if (!SV_CUR) return;
      var tEl = document.getElementById('sv-title'); if (tEl) SV_CUR.title = tEl.value;
      var dEl = document.getElementById('sv-desc'); if (dEl) SV_CUR.description = dEl.value;
      var cEl = document.getElementById('sv-closed'); if (cEl) SV_CUR.is_closed = cEl.checked ? 1 : 0;
      var tSel = document.querySelector('input[name="sv-target"]:checked');
      if (tSel) SV_CUR.target_all = (tSel.value === 'selected') ? 0 : 1;
      var cards = document.querySelectorAll('#sv-qlist .sv-qcard');
      var arr = [];
      for (var i = 0; i < cards.length; i++) {
        var idx = i;
        var g = function(suffix){ var e = document.getElementById('q' + idx + '-' + suffix); return e ? e.value : ''; };
        var gc = function(suffix){ var e = document.getElementById('q' + idx + '-' + suffix); return e ? e.checked : false; };
        var t = g('type') || cards[i].getAttribute('data-qtype');
        var settings = {};
        if (t === 'radio' || t === 'checkbox') {
          settings.choices = g('choices').split("\\n").map(function(x){ return x.trim(); }).filter(Boolean);
          settings.allowOther = gc('other');
          if (t === 'checkbox') { settings.minSel = Number(g('minSel')) || 0; settings.maxSel = Number(g('maxSel')) || 0; }
        } else if (t === 'scale') {
          settings.scaleMin = Number(g('sMin')); settings.scaleMax = Number(g('sMax'));
          settings.minLabel = g('minLabel'); settings.maxLabel = g('maxLabel');
        } else if (t === 'yesno') {
          settings.yesLabel = g('yes'); settings.noLabel = g('no');
        } else if (t === 'number') {
          settings.numMin = g('nMin') === '' ? null : Number(g('nMin'));
          settings.numMax = g('nMax') === '' ? null : Number(g('nMax'));
          settings.unit = g('unit');
        }
        arr.push({ qtype: t, label: g('label'), help: g('help'), required: gc('req'), settings: settings });
      }
      if (cards.length) SV_CUR.questions = arr;
    }

    async function svSave() {
      svSyncEditor();
      var msg = document.getElementById('sv-msg');
      if (!SV_CUR.title || !SV_CUR.title.trim()) { msg.style.color = '#dc2626'; msg.textContent = 'タイトルを入力してください'; return; }
      if (SV_CUR.target_all === 0 && (!SV_CUR.targets || !SV_CUR.targets.length)) {
        msg.style.color = '#dc2626'; msg.textContent = '対象の社員を1名以上選択してください（または「全員」を選択）'; return;
      }
      var res = await fetch(SV_API + '/' + SV_CUR.id, {
        method:'PUT', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          title: SV_CUR.title, description: SV_CUR.description, is_closed: SV_CUR.is_closed,
          target_all: SV_CUR.target_all, targets: (SV_CUR.targets || []).map(function(x){ return x.emp_no; }),
          questions: SV_CUR.questions
        })
      });
      var d = await res.json().catch(function(){ return {}; });
      if (!res.ok) { msg.style.color = '#dc2626'; msg.textContent = d.error || '保存に失敗しました'; return; }
      msg.style.color = '#166534';
      msg.textContent = d.questionsLocked ? '保存しました（設問は変更不可）' : '保存しました';
      setTimeout(function(){ loadSurveys(); }, 700);
    }

    async function svDelete(id) {
      if (!confirm('このアンケートと、その回答をすべて削除します。よろしいですか？')) return;
      var res = await fetch(SV_API + '/' + id, { method:'DELETE' });
      if (res.ok) loadSurveys(); else alert('削除に失敗しました');
    }

    function svBar(label, n, total, color) {
      var pct = total ? Math.round(n / total * 100) : 0;
      return '<div style="display:grid;grid-template-columns:130px 1fr 56px;align-items:center;gap:8px;font-size:12px;margin-bottom:5px;">'
        + '<span style="color:#374151;text-align:right;word-break:break-all;">' + escH(label) + '</span>'
        + '<span style="background:#f1f5f9;border-radius:5px;height:15px;overflow:hidden;"><span style="display:block;height:100%;width:' + pct + '%;background:' + (color || '#2563eb') + ';"></span></span>'
        + '<span style="color:#6b7280;">' + n + '件 ' + pct + '%</span></div>';
    }

    var SV_RES = null, SV_RES_MODE = 'summary';
    function svResults(id, keepMode) {
      fetch(SV_API + '/' + id + '/results').then(function(r){ return r.json().then(function(d){ return { ok:r.ok, d:d }; }); }).then(function(x){
        if (!x.ok) { alert(x.d.error || '取得に失敗しました'); return; }
        SV_RES = x.d; if (!keepMode) SV_RES_MODE = 'summary';
        svRenderResults();
        svShow('results');
      });
    }
    function svResMode(m) { SV_RES_MODE = m; svRenderResults(); }
    function svRenderResults() {
      var d = SV_RES, id = d.survey.id, total = d.total;
      var tab = function(m, label){
        var on = SV_RES_MODE === m;
        return '<button onclick="svResMode(\\'' + m + '\\')" style="padding:6px 14px;border:1px solid ' + (on ? '#2563eb' : '#d1d5db') + ';background:' + (on ? '#eff6ff' : '#fff') + ';color:' + (on ? '#1e3a5f' : '#6b7280') + ';border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;">' + label + '</button>';
      };
      var h = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;">'
        + '<button onclick="loadSurveys()" style="color:#6b7280;font-size:13px;background:#fff;border:1px solid #d1d5db;border-radius:6px;padding:6px 12px;cursor:pointer;">← 一覧へ</button>'
        + '<h3 style="font-size:15px;font-weight:700;color:#1e3a5f;margin:0;">' + escH(d.survey.title) + '</h3>'
        + '<span style="font-size:12px;color:#6b7280;">回答 ' + total + '件</span>'
        + '<button onclick="location.href=\\'' + SV_API + '/' + id + '/results.csv\\'" style="margin-left:auto;padding:7px 16px;background:#166534;color:white;border:none;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;">CSVで書き出し</button></div>'
        + '<div style="display:flex;gap:8px;margin-bottom:14px;">' + tab('summary','全体集計') + tab('individual','個別回答（' + total + '）') + '</div>';
      if (!total) { h += '<div style="color:#9ca3af;font-size:13px;">まだ回答がありません。</div>'; document.getElementById('sv-results-view').innerHTML = h; return; }

      if (SV_RES_MODE === 'summary') {
        h += d.results.map(function(q, i){
          var s = q.summary, inner = '';
          if (q.qtype === 'radio' || q.qtype === 'checkbox' || q.qtype === 'yesno') {
            inner = (s.counts || []).map(function(c){ return svBar(c.label, c.n, total, '#2563eb'); }).join('');
            if (s.other && s.other.length) inner += '<div style="font-size:12px;color:#6b7280;margin-top:6px;">その他の記入：' + s.other.map(function(o){ return escH(o); }).join(' / ') + '</div>';
          } else if (q.qtype === 'scale' || q.qtype === 'number') {
            var stt = s.stat || { n:0, avg:0, min:0, max:0, dist:[] };
            inner = '<div style="font-size:13px;color:#374151;margin-bottom:6px;">平均 <b>' + stt.avg + '</b> ／ 最小 ' + stt.min + ' ／ 最大 ' + stt.max + ' ／ 回答 ' + stt.n + '件</div>'
              + (stt.dist || []).map(function(x){ return svBar(String(x.value), x.n, stt.n, '#0f766e'); }).join('');
          } else {
            var vals = s.values || [];
            inner = vals.length
              ? '<div style="max-height:260px;overflow:auto;border:1px solid #f0f0f2;border-radius:8px;padding:8px;">' + vals.map(function(v){ return '<div style="font-size:12.5px;color:#374151;padding:5px 4px;border-bottom:1px solid #f5f5f7;white-space:pre-wrap;">' + escH(v) + '</div>'; }).join('') + '</div>'
              : '<div style="font-size:12px;color:#9ca3af;">回答なし</div>';
          }
          return '<div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-bottom:12px;max-width:820px;">'
            + '<div style="font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:2px;">' + (i+1) + '. ' + escH(q.label) + '</div>'
            + '<div style="font-size:11px;color:#9ca3af;margin-bottom:10px;">' + svTypeLabel(q.qtype) + ' ・ 回答 ' + (s.answered || 0) + '件</div>'
            + inner + '</div>';
        }).join('');
      } else {
        h += (d.responses || []).map(function(r){
          var kh = (r.division ? r.division + '課' : '') + (r.team ? r.team + '班' : '') || '課・班 記入なし';
          var when = r.updated_at && r.updated_at !== r.created_at ? (r.updated_at + '（更新）') : r.created_at;
          var nameBtn = CAN_REVEAL ? ' <button onclick="svRevealResp(' + id + ',' + r.id + ',this)" style="padding:2px 9px;background:#eff6ff;border:1px solid #bfdbfe;color:#1e3a5f;border-radius:6px;font-size:11px;cursor:pointer;">氏名照会</button>' : '';
          var delBtn = EDITABLE ? '<button onclick="svDeleteResp(' + id + ',' + r.id + ')" style="margin-left:auto;padding:2px 10px;background:#fef2f2;border:1px solid #fca5a5;color:#dc2626;border-radius:6px;font-size:11px;cursor:pointer;">この回答を削除</button>' : '';
          var rows = (r.answers || []).map(function(a){
            return '<div style="display:flex;gap:10px;padding:6px 0;border-bottom:1px solid #f5f5f7;font-size:12.5px;">'
              + '<span style="color:#9ca3af;flex:0 0 40%;max-width:220px;">' + escH(a.label) + '</span>'
              + '<span style="flex:1;color:#1f2937;white-space:pre-wrap;">' + (a.display ? escH(a.display) : '<span style="color:#cbd5e1;">（未回答）</span>') + '</span></div>';
          }).join('');
          return '<div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-bottom:10px;max-width:820px;">'
            + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">'
            + '<span style="font-size:12px;font-weight:700;color:#1e3a5f;">回答 ' + r.idx + '</span>'
            + '<span style="font-size:12px;color:#6b7280;">' + escH(kh) + '</span>'
            + '<span style="font-size:11px;color:#9ca3af;">' + escH(when) + '</span>'
            + '<span id="sv-resp-name-' + r.id + '" style="font-size:12px;color:#1e3a5f;font-weight:700;"></span>' + nameBtn + delBtn + '</div>'
            + rows + '</div>';
        }).join('');
      }
      document.getElementById('sv-results-view').innerHTML = h;
    }
    async function svRevealResp(sid, rid, btn) {
      btn.disabled = true;
      var res = await fetch(SV_API + '/' + sid + '/responses/' + rid + '/reveal', { method:'POST' });
      if (!res.ok) { btn.textContent = '照会不可'; return; }
      var d = await res.json();
      document.getElementById('sv-resp-name-' + rid).textContent = (d.name || '氏名不明') + '（' + (d.emp_no || '—') + '）';
      btn.style.display = 'none';
    }
    async function svDeleteResp(sid, rid) {
      if (!confirm('この回答を削除します。よろしいですか？（この操作は取り消せません）')) return;
      var res = await fetch(SV_API + '/' + sid + '/responses/' + rid, { method:'DELETE' });
      if (!res.ok) { alert('削除に失敗しました'); return; }
      svResults(sid, true);
    }

    // ===== 台本 =====
    var DH_API = '${ADMIN_PATH}/api/daihon';
    var DH_BASE = '${ADMIN_PATH}/daihon';
    var dhLoaded = false;
    var dhDecks = [];
    async function loadScripts(force) {
      if (dhLoaded && !force) return;
      dhLoaded = true;
      var box = document.getElementById('dh-list');
      try {
        var res = await fetch(DH_API + '/decks');
        var d = await res.json();
        var list = d.decks || [];
        dhDecks = list;
        var canEd = !!d.editable;
        if (!list.length) {
          box.innerHTML = '<div style="color:#9ca3af;">まだ台本はありません。' + (canEd ? '上の「＋ 新しい台本を作成」から作成できます。' : '') + '</div>';
          return;
        }
        box.innerHTML = '<div style="display:flex;flex-direction:column;gap:10px;">' + list.map(function(x) {
          return '<div style="border:1px solid #e5e7eb;border-radius:10px;padding:14px;">'
            + '<div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;">'
            + '<span style="font-size:14px;font-weight:700;color:#1e3a5f;">' + escH(x.title) + '</span>'
            + (x.subtitle ? '<span style="font-size:12px;color:#6b7280;">' + escH(x.subtitle) + '</span>' : '')
            + '<span style="font-size:11px;color:#9ca3af;">スライド ' + (x.slide_count || 0) + '枚' + (x.speaker ? '・講師 ' + escH(x.speaker) : '') + '</span>'
            + '</div>'
            + (x.intro ? '<div style="font-size:12px;color:#6b7280;margin-top:6px;line-height:1.7;">' + escH(x.intro) + '</div>' : '')
            + '<div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;">'
            + '<a href="' + DH_BASE + '/' + x.id + '/present" target="_blank" rel="noopener" style="padding:7px 14px;background:#2563eb;color:#fff;border-radius:7px;font-size:12px;font-weight:700;text-decoration:none;">プレゼンを開く</a>'
            + '<a href="' + DH_BASE + '/' + x.id + '" style="padding:7px 14px;background:#fff;color:#374151;border:1px solid #d1d5db;border-radius:7px;font-size:12px;font-weight:700;text-decoration:none;">' + (canEd ? '編集' : '内容を見る') + '</a>'
            + '<a href="' + DH_BASE + '/' + x.id + '/print" target="_blank" rel="noopener" style="padding:7px 14px;background:#fff;color:#374151;border:1px solid #d1d5db;border-radius:7px;font-size:12px;font-weight:700;text-decoration:none;">印刷（台本つき）</a>'
            + '<button type="button" onclick="dhCopyUrl(' + x.id + ')" style="padding:7px 14px;background:#fff;color:#374151;border:1px solid #d1d5db;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;">投影URLをコピー</button>'
            + (canEd ? '<button type="button" onclick="dhDelete(' + x.id + ')" style="padding:7px 12px;background:#fff;color:#b91c1c;border:1px solid #fecaca;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;">削除</button>' : '')
            + '</div></div>';
        }).join('') + '</div>';
      } catch (e) {
        box.innerHTML = '<div style="color:#dc2626;">読み込みに失敗しました</div>';
      }
    }
    async function dhNew() {
      var t = (document.getElementById('dh-new-title').value || '').trim();
      if (!t) { alert('タイトルを入力してください'); return; }
      var res = await fetch(DH_API + '/decks', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ title: t }) });
      var j = await res.json().catch(function(){ return {}; });
      if (j && j.id) { location.href = DH_BASE + '/' + j.id; }
      else { alert((j && j.error) || '作成に失敗しました'); }
    }
    function dhCopyUrl(id) {
      var url = location.origin + DH_BASE + '/' + id + '/present';
      navigator.clipboard.writeText(url).then(function(){ alert('投影URLをコピーしました:\\n' + url); }, function(){ prompt('投影URL', url); });
    }
    async function dhDelete(id) {
      var deck = dhDecks.filter(function(x){ return x.id === id; })[0] || {};
      if (!confirm('台本「' + (deck.title || '') + '」をスライドごと削除します。よろしいですか？（この操作は取り消せません）')) return;
      var res = await fetch(DH_API + '/decks/' + id, { method:'DELETE' });
      if (res.ok) loadScripts(true); else alert('削除に失敗しました');
    }

    loadList();
    loadPenalties();
    loadRequests();
    if (EDITABLE) { loadCategories(); renderSlots([{}]); eligPopulate({ mode: 'all' }); }
    (function() {
      var t = null;
      try { t = new URLSearchParams(location.search).get('tab'); } catch (e) {}
      var avail = Array.prototype.map.call(document.querySelectorAll('.ob-tab-btn'), function(b) { return b.getAttribute('data-tab'); });
      var want = (t === 'opinions' || t === 'hiyari' || t === 'surveys' || t === 'script') ? t : 'sessions';
      if (avail.indexOf(want) === -1) want = avail[0] || 'sessions';
      switchTab(want);
    })();
    </script>`;
  return c.html(layout(officeLabel, html, 'office-page'));
});

// ===== ページ: ヒヤリハット報告フォームの掲示ポスター（A3縦 / A4横・シンプル / 派手カラー） =====
app.get('/settings/study-sessions/hiyari-poster', async (c) => {
  const p = await loadHiyariPoster(c.env.DB);
  const bodyLines = p.body.split('\n').map(l => escHtml(l)).join('<br>');
  return c.html(`<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ポスター - ${escHtml(p.title)}</title>
<link rel="icon" type="image/svg+xml" href="${FAVICON_DATA_URI}">
<style id="page-rule">@page { size: A3 portrait; margin: 0; }</style>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #e5e7eb; }
  body { font-family: 'Hiragino Sans', 'Meiryo', sans-serif; }
  .toolbar { padding: 14px 20px; background: white; border-bottom: 1px solid #e5e7eb; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  .toolbar label { font-size: 12px; color: #6b7280; display: flex; align-items: center; gap: 6px; }
  .toolbar select { font-size: 13px; padding: 7px 10px; border: 1px solid #d1d5db; border-radius: 6px; }
  .toolbar button { padding: 9px 22px; background: #2563eb; color: white; border: none; border-radius: 7px; font-size: 14px; font-weight: 700; cursor: pointer; }
  .toolbar .hint { font-size: 11px; color: #9ca3af; }
  .poster-wrap { display: flex; justify-content: center; padding: 20px; }

  .poster {
    position: relative; overflow: hidden; background: white;
    box-shadow: 0 2px 14px rgba(0,0,0,0.18);
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .poster.size-a3p { width: 297mm; height: 420mm; padding: 24mm 20mm; display: flex; flex-direction: column; align-items: center; }
  .poster.size-a4l { width: 297mm; height: 210mm; padding: 13mm 16mm; display: flex; flex-direction: row; gap: 12mm; align-items: stretch; }

  .poster-main { display: flex; flex-direction: column; align-items: center; width: 100%; }
  .poster.size-a4l .poster-main { flex: 1; min-width: 0; align-items: flex-start; }
  .poster.size-a4l .qr-section { flex: 0 0 80mm; margin-top: 0; padding-top: 0; justify-content: center; }

  .eyebrow { font-size: 18pt; font-weight: 700; color: #dc2626; letter-spacing: 4px; }
  .title { font-size: 46pt; font-weight: 900; color: #1e3a5f; text-align: center; line-height: 1.35; margin: 10mm 0 8mm; word-break: keep-all; }
  .poster.size-a4l .title { font-size: 30pt; text-align: left; margin: 4mm 0 5mm; }

  .lead { font-size: 15pt; color: #1f2937; text-align: center; line-height: 1.9; max-width: 210mm; margin-bottom: 8mm; }
  .poster.size-a4l .lead { font-size: 10.5pt; text-align: left; line-height: 1.7; margin-bottom: 5mm; }

  .note-section { margin-top: 2mm; padding: 8mm 12mm; background: #f8fafc; border-left: 6px solid #dc2626; border-radius: 3mm; font-size: 15pt; color: #374151; line-height: 2.0; max-width: 220mm; }
  .poster.size-a4l .note-section { font-size: 10pt; padding: 4mm 6mm; line-height: 1.8; }
  .contact-row { margin-top: 6mm; font-size: 12pt; color: #4b5563; }
  .poster.size-a4l .contact-row { font-size: 9pt; margin-top: 4mm; }

  .qr-section { margin-top: auto; padding-top: 10mm; display: flex; flex-direction: column; align-items: center; }
  .qr-caption { font-size: 18pt; font-weight: 900; color: #1e3a5f; margin-bottom: 6mm; text-align: center; }
  .poster.size-a4l .qr-caption { font-size: 13pt; margin-bottom: 4mm; }
  .qr-box { width: 85mm; height: 85mm; border: 4px solid #1e3a5f; border-radius: 6mm; padding: 5mm; background: white; }
  .poster.size-a4l .qr-box { width: 66mm; height: 66mm; border-width: 3px; padding: 4mm; }
  .qr-url { margin-top: 5mm; font-size: 10pt; color: #6b7280; word-break: break-all; text-align: center; max-width: 200mm; }
  .poster.size-a4l .qr-url { font-size: 8pt; margin-top: 3mm; }

  .blob { display: none; }

  .poster.theme-vivid { color: #fff; background: linear-gradient(135deg, #7f1d1d 0%, #b91c1c 45%, #f59e0b 100%); }
  .poster.theme-vivid .eyebrow { color: #fde68a; letter-spacing: 6px; font-size: 20pt; text-shadow: 0 2px 8px rgba(0,0,0,0.28); }
  .poster.theme-vivid .title { color: #fff; font-size: 52pt; text-shadow: 0 4px 20px rgba(0,0,0,0.30); }
  .poster.size-a4l.theme-vivid .title { font-size: 34pt; }
  .poster.theme-vivid .lead { color: #fff; text-shadow: 0 2px 10px rgba(0,0,0,0.25); }
  .poster.theme-vivid .note-section { background: rgba(255,255,255,0.94); color: #1f2937; border-left-color: #b91c1c; }
  .poster.theme-vivid .contact-row { color: rgba(255,255,255,0.92); }
  .poster.theme-vivid .qr-caption { color: #7c2d12; background: #fde68a; border-radius: 99px; padding: 3mm 8mm; align-self: center; box-shadow: 0 8px 22px rgba(0,0,0,0.22); }
  .poster.theme-vivid .qr-box { border-color: #fde68a; box-shadow: 0 12px 34px rgba(0,0,0,0.28); }
  .poster.theme-vivid .qr-url { color: rgba(255,255,255,0.92); }
  .poster.theme-vivid .blob { display: block; position: absolute; border-radius: 50%; filter: blur(7mm); opacity: 0.5; pointer-events: none; }
  .poster.theme-vivid .blob1 { width: 95mm; height: 95mm; background: #fb7185; top: -32mm; right: -26mm; }
  .poster.theme-vivid .blob2 { width: 72mm; height: 72mm; background: #fbbf24; bottom: -26mm; left: -20mm; }

  @media print {
    .toolbar { display: none; }
    body { background: white; }
    .poster-wrap { padding: 0; }
    .poster { box-shadow: none; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <label>用紙
      <select id="opt-paper">
        <option value="a3p">A3 縦</option>
        <option value="a4l">A4 横</option>
      </select>
    </label>
    <label>デザイン
      <select id="opt-theme">
        <option value="plain">シンプル</option>
        <option value="vivid">派手カラー</option>
      </select>
    </label>
    <button onclick="window.print()">印刷する</button>
    <span class="hint">※印刷ダイアログで用紙サイズを合わせ、「背景のグラフィック」を有効にしてください</span>
  </div>
  <div class="poster-wrap">
    <div class="poster size-a3p theme-plain" id="poster">
      <div class="blob blob1"></div>
      <div class="blob blob2"></div>
      <div class="poster-main">
        <div class="eyebrow">${escHtml(p.eyebrow)}</div>
        <div class="title">${escHtml(p.title)}</div>
        ${p.lead ? `<div class="lead">${escHtml(p.lead)}</div>` : ''}
        ${p.body ? `<div class="note-section">${bodyLines}</div>` : ''}
        ${p.contact ? `<div class="contact-row">問い合わせ：${escHtml(p.contact)}</div>` : ''}
      </div>
      <div class="qr-section">
        <div class="qr-caption">${escHtml(p.qr_caption)}</div>
        <div class="qr-box">${tokenToQrSvg(hiyariShareUrl(), 8)}</div>
        <div class="qr-url">${escHtml(hiyariShareUrl())}</div>
      </div>
    </div>
  </div>
<script>
  var poster = document.getElementById('poster');
  var pageRule = document.getElementById('page-rule');
  function applyOpts() {
    var paper = document.getElementById('opt-paper').value;
    var theme = document.getElementById('opt-theme').value;
    poster.className = 'poster size-' + paper + ' theme-' + theme;
    pageRule.textContent = '@page { size: ' + (paper === 'a4l' ? 'A4 landscape' : 'A3 portrait') + '; margin: 0; }';
  }
  document.getElementById('opt-paper').addEventListener('change', applyOpts);
  document.getElementById('opt-theme').addEventListener('change', applyOpts);
  applyOpts();
</script>
</body>
</html>`);
});

// ===== ページ: 参加募集ポスター印刷（A3縦 / A4横・シンプル / 派手カラーを切替可） =====
app.get('/settings/study-sessions/:id/poster', async (c) => {
  const id = parseInt(c.req.param('id'));
  const session = await c.env.DB.prepare('SELECT * FROM study_sessions WHERE id = ?').bind(id).first<StudySession>();
  if (!session) return c.text('対象が見つかりません', 404);

  const slots = (await c.env.DB.prepare(
    'SELECT id, slot_order, label, start_time, end_time, capacity FROM study_session_slots WHERE session_id = ? ORDER BY slot_order, id'
  ).bind(id).all<{ slot_order: number; label: string | null; start_time: string | null; end_time: string | null; capacity: number }>()).results ?? [];

  const WD = ['日', '月', '火', '水', '木', '金', '土'];
  const d = new Date(session.date + 'T00:00:00');
  const dateLabel = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${WD[d.getDay()]}）`;
  const slotTime = (sl: { start_time: string | null; end_time: string | null }) =>
    [sl.start_time, sl.end_time].filter(Boolean).join(' 〜 ') || '別途ご案内';
  const timeLabelHtml = slots.length <= 1
    ? escHtml(slots[0] ? slotTime(slots[0]) : '別途ご案内')
    : slots.map((sl, i) => `${escHtml(sl.label || `${i + 1}回目`)}　${escHtml(slotTime(sl))}`).join('<br>');
  const capSum = slots.reduce((a, sl) => a + (sl.capacity > 0 ? sl.capacity : 0), 0);
  const anyUnlimited = slots.some((sl) => !(sl.capacity > 0));
  const capNote = (capSum > 0 && !anyUnlimited)
    ? `【定員 各回あわせて ${capSum}名・先着順】定員に達し次第、受付を終了します`
    : '';

  return c.html(`<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ポスター - ${escHtml(session.title)}</title>
<link rel="icon" type="image/svg+xml" href="${FAVICON_DATA_URI}">
<style id="page-rule">@page { size: A3 portrait; margin: 0; }</style>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #e5e7eb; }
  body { font-family: 'Hiragino Sans', 'Meiryo', sans-serif; }
  .toolbar { padding: 14px 20px; background: white; border-bottom: 1px solid #e5e7eb; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  .toolbar label { font-size: 12px; color: #6b7280; display: flex; align-items: center; gap: 6px; }
  .toolbar select { font-size: 13px; padding: 7px 10px; border: 1px solid #d1d5db; border-radius: 6px; }
  .toolbar button { padding: 9px 22px; background: #2563eb; color: white; border: none; border-radius: 7px; font-size: 14px; font-weight: 700; cursor: pointer; }
  .toolbar .hint { font-size: 11px; color: #9ca3af; }
  .poster-wrap { display: flex; justify-content: center; padding: 20px; }

  .poster {
    position: relative; overflow: hidden; background: white;
    box-shadow: 0 2px 14px rgba(0,0,0,0.18);
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  /* 用紙サイズ */
  .poster.size-a3p { width: 297mm; height: 420mm; padding: 22mm 18mm; display: flex; flex-direction: column; align-items: center; }
  .poster.size-a4l { width: 297mm; height: 210mm; padding: 13mm 16mm; display: flex; flex-direction: row; gap: 12mm; align-items: stretch; }

  .poster-main { display: flex; flex-direction: column; align-items: center; width: 100%; }
  .poster.size-a4l .poster-main { flex: 1; min-width: 0; align-items: flex-start; }
  .poster.size-a4l .qr-section { flex: 0 0 80mm; margin-top: 0; padding-top: 0; justify-content: center; }

  .eyebrow { font-size: 18pt; font-weight: 700; color: #2563eb; letter-spacing: 4px; }
  .title { font-size: 46pt; font-weight: 900; color: #1e3a5f; text-align: center; line-height: 1.35; margin: 10mm 0 14mm; word-break: keep-all; }
  .poster.size-a4l .title { font-size: 33pt; text-align: left; margin: 5mm 0 7mm; }

  .info-table { width: 100%; border-top: 3px solid #1e3a5f; margin-top: 4mm; }
  .info-row { display: flex; align-items: baseline; gap: 10mm; padding: 7mm 0; border-bottom: 1px solid #d1d5db; }
  .poster.size-a4l .info-row { padding: 3.6mm 0; gap: 6mm; }
  .info-label { flex: 0 0 42mm; font-size: 15pt; font-weight: 700; color: #2563eb; }
  .poster.size-a4l .info-label { flex: 0 0 28mm; font-size: 12pt; }
  .info-value { flex: 1; font-size: 22pt; font-weight: 700; color: #1f2937; }
  .poster.size-a4l .info-value { font-size: 14.5pt; }

  .note-section { margin-top: 6mm; padding: 6mm 8mm; background: #f8fafc; border-radius: 4mm; font-size: 13pt; color: #374151; text-align: center; line-height: 1.7; white-space: pre-wrap; max-width: 220mm; }
  .poster.size-a4l .note-section { font-size: 10pt; padding: 4mm 6mm; text-align: left; }
  .cap-note { margin-top: 6mm; font-size: 13pt; font-weight: 700; color: #b45309; text-align: center; }
  .poster.size-a4l .cap-note { font-size: 10pt; margin-top: 4mm; }

  .qr-section { margin-top: auto; padding-top: 10mm; display: flex; flex-direction: column; align-items: center; }
  .qr-caption { font-size: 18pt; font-weight: 900; color: #1e3a5f; margin-bottom: 6mm; text-align: center; }
  .poster.size-a4l .qr-caption { font-size: 13pt; margin-bottom: 4mm; }
  .qr-box { width: 85mm; height: 85mm; border: 4px solid #1e3a5f; border-radius: 6mm; padding: 5mm; background: white; }
  .poster.size-a4l .qr-box { width: 66mm; height: 66mm; border-width: 3px; padding: 4mm; }
  .qr-url { margin-top: 5mm; font-size: 10pt; color: #6b7280; word-break: break-all; text-align: center; max-width: 200mm; }
  .poster.size-a4l .qr-url { font-size: 8pt; margin-top: 3mm; }

  .blob { display: none; }

  /* ===== 派手カラー ===== */
  .poster.theme-vivid { color: #fff; background: linear-gradient(135deg, #5b21b6 0%, #db2777 52%, #f59e0b 100%); }
  .poster.theme-vivid .eyebrow { color: #fde68a; letter-spacing: 6px; font-size: 20pt; text-shadow: 0 2px 8px rgba(0,0,0,0.28); }
  .poster.theme-vivid .title { color: #fff; font-size: 52pt; text-shadow: 0 4px 20px rgba(0,0,0,0.30); }
  .poster.size-a4l.theme-vivid .title { font-size: 37pt; }
  .poster.theme-vivid .info-table { border-top: none; background: #fff; border-radius: 6mm; padding: 3mm 8mm; margin-top: 6mm; box-shadow: 0 12px 34px rgba(0,0,0,0.24); }
  .poster.theme-vivid .info-row { border-bottom: 1px dashed #efc4d9; }
  .poster.theme-vivid .info-row:last-child { border-bottom: none; }
  .poster.theme-vivid .info-label { color: #db2777; }
  .poster.theme-vivid .info-value { color: #1f2937; }
  .poster.theme-vivid .note-section { background: rgba(255,255,255,0.92); color: #1f2937; }
  .poster.theme-vivid .cap-note { color: #fff; background: rgba(0,0,0,0.20); border-radius: 3mm; padding: 3mm 7mm; }
  .poster.theme-vivid .qr-caption { color: #7c2d12; background: #fde68a; border-radius: 99px; padding: 3mm 8mm; align-self: center; box-shadow: 0 8px 22px rgba(0,0,0,0.22); }
  .poster.theme-vivid .qr-box { border-color: #fde68a; box-shadow: 0 12px 34px rgba(0,0,0,0.28); }
  .poster.theme-vivid .qr-url { color: rgba(255,255,255,0.92); }
  .poster.theme-vivid .blob { display: block; position: absolute; border-radius: 50%; filter: blur(7mm); opacity: 0.5; pointer-events: none; }
  .poster.theme-vivid .blob1 { width: 95mm; height: 95mm; background: #22d3ee; top: -32mm; right: -26mm; }
  .poster.theme-vivid .blob2 { width: 72mm; height: 72mm; background: #a3e635; bottom: -26mm; left: -20mm; }

  @media print {
    .toolbar { display: none; }
    body { background: white; }
    .poster-wrap { padding: 0; }
    .poster { box-shadow: none; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <label>用紙
      <select id="opt-paper">
        <option value="a3p">A3 縦</option>
        <option value="a4l">A4 横</option>
      </select>
    </label>
    <label>デザイン
      <select id="opt-theme">
        <option value="plain">シンプル</option>
        <option value="vivid">派手カラー</option>
      </select>
    </label>
    <button onclick="window.print()">印刷する</button>
    <span class="hint">※印刷ダイアログで用紙サイズを合わせ、「背景のグラフィック」を有効にしてください</span>
  </div>
  <div class="poster-wrap">
    <div class="poster size-a3p theme-plain" id="poster">
      <div class="blob blob1"></div>
      <div class="blob blob2"></div>
      <div class="poster-main">
        <div class="eyebrow">EVENT</div>
        <div class="title">${escHtml(session.title)}</div>
        <div class="info-table">
          <div class="info-row"><div class="info-label">日　時</div><div class="info-value">${escHtml(dateLabel)}<br>${timeLabelHtml}</div></div>
          <div class="info-row"><div class="info-label">集合場所</div><div class="info-value">${escHtml(session.location || '別途ご案内')}</div></div>
          <div class="info-row"><div class="info-label">担　当</div><div class="info-value">${escHtml(session.contact_name || '別途ご案内')}</div></div>
          ${session.target_audience ? `<div class="info-row"><div class="info-label">対　象</div><div class="info-value">${escHtml(session.target_audience)}</div></div>` : ''}
        </div>
        ${session.note ? `<div class="note-section">${escHtml(session.note)}</div>` : ''}
        ${capNote ? `<div class="cap-note">${escHtml(capNote)}</div>` : ''}
      </div>
      <div class="qr-section">
        <div class="qr-caption">QRを読み取って参加申し込み</div>
        <div class="qr-box">${tokenToQrSvg(shareUrl(), 8)}</div>
        <div class="qr-url">${escHtml(shareUrl())}</div>
      </div>
    </div>
  </div>
<script>
  var poster = document.getElementById('poster');
  var pageRule = document.getElementById('page-rule');
  function applyOpts() {
    var paper = document.getElementById('opt-paper').value;
    var theme = document.getElementById('opt-theme').value;
    poster.className = 'poster size-' + paper + ' theme-' + theme;
    pageRule.textContent = '@page { size: ' + (paper === 'a4l' ? 'A4 landscape' : 'A3 portrait') + '; margin: 0; }';
  }
  document.getElementById('opt-paper').addEventListener('change', applyOpts);
  document.getElementById('opt-theme').addEventListener('change', applyOpts);
  applyOpts();
</script>
</body>
</html>`);
});

// ===== ページ: 当日のご案内チラシ（パワポ風の自由配置エディタ） =====
app.get('/settings/study-sessions/:id/guide', async (c) => {
  const id = parseInt(c.req.param('id'));
  const session = await c.env.DB.prepare('SELECT id, title FROM study_sessions WHERE id = ?').bind(id).first<{ id: number; title: string }>();
  if (!session) return c.text('イベントが見つかりません', 404);
  return c.html(renderGuideEditor({
    adminPath: ADMIN_PATH,
    sessionId: id,
    title: session.title,
    editable: await canEdit(c),
  }));
});

// ===== API: 当日のご案内チラシ =====
// 編集ページ起動時の初期データ（保存済みレイアウト・イベント情報・参加者・他イベント・QR）
app.get('/api/study-sessions/:id/guide-data', async (c) => {
  const id = parseInt(c.req.param('id'));
  const session = await c.env.DB.prepare(`
    SELECT s.*, cat.name AS category_name
    FROM study_sessions s LEFT JOIN study_session_categories cat ON cat.id = s.category_id
    WHERE s.id = ?`).bind(id).first<StudySession & { category_name: string | null }>();
  if (!session) return c.json({ error: 'イベントが見つかりません' }, 404);

  const slots = (await c.env.DB.prepare(
    'SELECT id, slot_order, label, start_time, end_time, capacity FROM study_session_slots WHERE session_id = ? ORDER BY slot_order, id'
  ).bind(id).all<{ id: number; slot_order: number; label: string | null; start_time: string | null; end_time: string | null; capacity: number }>()).results ?? [];

  const WD = ['日', '月', '火', '水', '木', '金', '土'];
  const fmtDateLabel = (ymd: string): string => {
    const d = new Date(ymd + 'T00:00:00');
    if (isNaN(d.getTime())) return ymd;
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${WD[d.getDay()]}）`;
  };
  const slotTime = (sl: { start_time: string | null; end_time: string | null }) =>
    [sl.start_time, sl.end_time].filter(Boolean).join(' 〜 ') || '別途ご案内';
  const slotLine = slots.length <= 1
    ? (slots[0] ? slotTime(slots[0]) : '別途ご案内')
    : slots.map((sl, i) => `${sl.label || `${i + 1}回目`} ${slotTime(sl)}`).join(' / ');

  const saved = await c.env.DB.prepare(
    'SELECT paper, layout_json FROM study_session_guide_layouts WHERE session_id = ?'
  ).bind(id).first<{ paper: string; layout_json: string }>();

  // 参加者（同じ人が複数の回にいても1人にまとめ、回の名前を並べて添える）
  const prows = (await c.env.DB.prepare(`
    SELECT p.emp_no, e.name, e.division, e.team,
      GROUP_CONCAT(COALESCE(sl.label, sl.slot_order || '回目'), ' / ') AS slot_labels,
      MIN(sl.slot_order) AS ord
    FROM study_session_participants p
    LEFT JOIN study_session_slots sl ON sl.id = p.slot_id
    LEFT JOIN employees e ON e.emp_no = p.emp_no
    WHERE p.session_id = ?
    GROUP BY p.emp_no
    ORDER BY e.division, e.team, e.name
  `).bind(id).all<{ emp_no: string; name: string | null; division: number | null; team: number | null; slot_labels: string | null }>()).results ?? [];

  // 募集中の他イベント（開催日が今日以降・締切していないもの）
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const orows = (await c.env.DB.prepare(`
    SELECT s.title, s.date, cat.name AS category_name
    FROM study_sessions s LEFT JOIN study_session_categories cat ON cat.id = s.category_id
    WHERE s.id != ? AND s.is_closed = 0 AND s.date >= ?
    ORDER BY s.date, s.id LIMIT 6
  `).bind(id, today).all<{ title: string; date: string; category_name: string | null }>()).results ?? [];

  return c.json({
    session: {
      id: session.id, title: session.title, date: session.date, dateLabel: fmtDateLabel(session.date),
      location: session.location, contact_name: session.contact_name,
      target_audience: session.target_audience, note: session.note, category_name: session.category_name,
    },
    slotLine,
    slots: slots.map((sl, i) => ({ label: sl.label || `${i + 1}回目`, time: slotTime(sl), capacity: sl.capacity })),
    saved: saved ?? null,
    participants: prows.map((p) => ({
      emp_no: p.emp_no, name: p.name, division: p.division, team: p.team, slot_labels: p.slot_labels || '',
    })),
    otherEvents: orows.map((o) => ({ title: o.title, dateLabel: fmtDateLabel(o.date), category_name: o.category_name })),
    qrSvg: tokenToQrSvg(shareUrl(), 6),
    shareUrl: shareUrl(),
  });
});

// レイアウトの保存（イベントごとに1レコード・upsert）
app.put('/api/study-sessions/:id/guide-layout', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const id = parseInt(c.req.param('id'));
  const session = await c.env.DB.prepare('SELECT id FROM study_sessions WHERE id = ?').bind(id).first();
  if (!session) return c.json({ error: 'イベントが見つかりません' }, 404);
  const b = await c.req.json<{ paper?: string; layout_json?: string }>();
  const paper = ['a4p', 'a4l', 'a3p'].includes(String(b.paper)) ? String(b.paper) : 'a4p';
  const layoutJson = typeof b.layout_json === 'string' ? b.layout_json : JSON.stringify(b.layout_json ?? {});
  if (layoutJson.length > 1_800_000) return c.json({ error: 'データが大きすぎます（画像を減らしてください）' }, 413);
  await c.env.DB.prepare(`
    INSERT INTO study_session_guide_layouts (session_id, paper, layout_json, updated_at)
    VALUES (?, ?, ?, datetime('now','localtime'))
    ON CONFLICT(session_id) DO UPDATE SET paper = excluded.paper, layout_json = excluded.layout_json, updated_at = datetime('now','localtime')
  `).bind(id, paper, layoutJson).run();
  return c.json({ ok: true });
});


app.get('/settings/study-sessions/:id/roster', async (c) => {
  const id = parseInt(c.req.param('id'));
  const session = await c.env.DB.prepare('SELECT * FROM study_sessions WHERE id = ?').bind(id).first<StudySession>();
  if (!session) return c.text('イベントが見つかりません', 404);

  const slots = (await c.env.DB.prepare(
    'SELECT id, slot_order, label, start_time, end_time FROM study_session_slots WHERE session_id = ? ORDER BY slot_order, id'
  ).bind(id).all<{ id: number; slot_order: number; label: string | null; start_time: string | null; end_time: string | null }>()).results ?? [];

  const WD = ['日', '月', '火', '水', '木', '金', '土'];
  const d = new Date(session.date + 'T00:00:00');
  const dateLabel = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${WD[d.getDay()]}）`;

  return c.html(`<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>参加者名簿 - ${escHtml(session.title)}</title>
<link rel="icon" type="image/svg+xml" href="${FAVICON_DATA_URI}">
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #e5e7eb; font-family: 'Hiragino Sans', 'Meiryo', sans-serif; color: #1f2937; }
  .toolbar { position: sticky; top: 0; z-index: 10; padding: 14px 20px; background: white; border-bottom: 1px solid #e5e7eb; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  .toolbar label { font-size: 12px; color: #6b7280; display: flex; align-items: center; gap: 6px; }
  .toolbar input[type=text] { font-size: 13px; padding: 7px 10px; border: 1px solid #d1d5db; border-radius: 6px; min-width: 260px; }
  .toolbar select { font-size: 13px; padding: 7px 10px; border: 1px solid #d1d5db; border-radius: 6px; }
  .toolbar button { padding: 8px 20px; background: #2563eb; color: white; border: none; border-radius: 7px; font-size: 13px; font-weight: 700; cursor: pointer; }
  .toolbar .hint { color: #9ca3af; font-size: 12px; }
  .stage { padding: 20px; display: flex; flex-direction: column; align-items: center; gap: 16px; }

  /* .sheet は印刷1ページ分の固定サイズ。中身(.sheet-fit)がどれだけ長くても
     overflow:hidden + 自動縮小スクリプトで必ずこのページ内に収まる。
     印鑑欄(.rl-stamp-footer)は.sheet-fitの外＝兄弟要素として絶対配置するため、
     本文がどれだけ伸びても押し出されたり2ページ目にはみ出したりしない */
  .sheet { width: 210mm; height: 297mm; background: #fff; padding: 14mm 16mm; box-shadow: 0 4px 20px rgba(0,0,0,0.2); overflow: hidden; position: relative; }
  .sheet-fit { width: 100%; transform-origin: top left; }
  /* 印鑑欄の高さぶんを本文側にも確保しておくことで、自動縮小の計算に反映され本文と重ならない（余裕を持たせて34mm） */
  .rl-content-pad { padding-bottom: 34mm; }

  h1 { font-size: 20pt; text-align: center; color: #1e3a5f; margin: 0 0 3mm; }
  .meta { text-align: center; font-size: 10.5pt; color: #4b5563; margin-bottom: 6mm; }
  .page-subtitle { font-size: 11pt; font-weight: 700; color: #1e3a5f; margin-bottom: 4mm; }
  table { width: 100%; border-collapse: collapse; font-size: 10.5pt; }
  th, td { border: 1px solid #9ca3af; padding: 4.5px 8px; text-align: left; }
  th { background: #f1f5f9; font-weight: 700; }
  td.center, th.center { text-align: center; }
  .stamp { display: inline-block; width: 4.5mm; height: 4.5mm; border: 1.5px solid #6b7280; border-radius: 50%; }
  .printed-at { margin-top: 4mm; text-align: right; font-size: 8.5pt; color: #9ca3af; }
  .page-no { position: absolute; left: 16mm; bottom: 8mm; font-size: 8.5pt; color: #9ca3af; }

  .rl-stamp-footer { position: absolute; right: 16mm; bottom: 10mm; display: flex; justify-content: flex-end; }
  .rl-stamp-row { display: flex; gap: 10mm; }
  .rl-stamp-box { display: flex; flex-direction: column; align-items: center; gap: 4px; }
  .rl-stamp-frame { width: 16mm; height: 16mm; border: 1.5px solid #64748b; border-radius: 4px; }
  .rl-stamp-label { font-size: 9.5pt; color: #475569; }

  @media print {
    .toolbar { display: none; }
    html, body { background: #fff; }
    .stage { padding: 0; gap: 0; }
    .sheet { box-shadow: none; page-break-after: always; }
    .sheet:last-child { page-break-after: auto; }
    @page { size: A4 portrait; margin: 0; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <label>タイトル<input type="text" id="title-input" value="参加者名簿" oninput="renderPages()"></label>
    <label>対象<select id="division-select" onchange="renderPages()">
      <option value="0">全員まとめて</option>
      <option value="1">1課のみ</option>
      <option value="2">2課のみ</option>
      <option value="3">3課のみ</option>
      <option value="4">4課のみ</option>
    </select></label>
    <label id="slot-filter-wrap" style="display:none;">回<select id="slot-select" onchange="renderPages()"><option value="0">すべての回</option></select></label>
    <button onclick="window.print()">印刷する</button>
    <span class="hint" id="page-count-hint"></span>
  </div>
  <div class="stage" id="stage"></div>
<script>
function escH(s) { return (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
var _rows = [];
var SESSION_TITLE = ${JSON.stringify(session.title)};
var SESSION_META = ${JSON.stringify(`${dateLabel}　${session.location || ''}`)};
var SLOTS = ${JSON.stringify(slots.map((sl, i) => ({ id: sl.id, name: sl.label || `${i + 1}回目`, time: [sl.start_time, sl.end_time].filter(Boolean).join('〜') })))};
var ROWS_PER_PAGE = 28;
function slotNameOf(id) { for (var i = 0; i < SLOTS.length; i++) if (SLOTS[i].id === id) return SLOTS[i].name; return ''; }

async function load() {
  if (SLOTS.length > 1) {
    document.getElementById('slot-filter-wrap').style.display = 'flex';
    document.getElementById('slot-select').innerHTML = '<option value="0">すべての回</option>'
      + SLOTS.map(function(sl) { return '<option value="' + sl.id + '">' + escH(sl.name) + (sl.time ? '（' + escH(sl.time) + '）' : '') + '</option>'; }).join('');
  }
  var res = await fetch('${ADMIN_PATH}/api/study-sessions/${id}/participants');
  var d = await res.json();
  _rows = d.participants || [];
  renderPages();
}

function stampFooterHtml() {
  return '<div class="rl-stamp-footer"><div class="rl-stamp-row">'
    + '<div class="rl-stamp-box"><div class="rl-stamp-frame"></div><div class="rl-stamp-label">所長</div></div>'
    + '<div class="rl-stamp-box"><div class="rl-stamp-frame"></div><div class="rl-stamp-label">課長</div></div>'
    + '<div class="rl-stamp-box"><div class="rl-stamp-frame"></div><div class="rl-stamp-label">班長</div></div>'
    + '<div class="rl-stamp-box"><div class="rl-stamp-frame"></div><div class="rl-stamp-label">教育担当</div></div>'
    + '</div></div>';
}

var _showSlotCol = false;
function tableHtml(rows) {
  var slotTh = _showSlotCol ? '<th style="width:24mm;">回</th>' : '';
  return '<table><thead><tr>' + slotTh + '<th class="center" style="width:14mm;">課</th><th class="center" style="width:14mm;">班</th><th style="width:30mm;">社員番号</th><th>氏名</th><th class="center" style="width:18mm;">出席</th></tr></thead><tbody>'
    + rows.map(function(p) {
        var slotTd = _showSlotCol ? ('<td>' + escH(slotNameOf(p.slot_id)) + '</td>') : '';
        return '<tr>' + slotTd + '<td class="center">' + (p.division || '') + '</td><td class="center">' + (p.team || '') + '</td><td>' + escH(p.emp_no) + '</td><td>' + escH(p.name || '(該当社員なし)') + '</td>'
          + '<td class="center">' + (p.attended ? '✓' : '<span class="stamp"></span>') + '</td></tr>';
      }).join('')
    + '</tbody></table>';
}

function renderPages() {
  var title = document.getElementById('title-input').value || '参加者名簿';
  var div = parseInt(document.getElementById('division-select').value);
  var slotSel = document.getElementById('slot-select');
  var slotId = slotSel ? parseInt(slotSel.value) : 0;
  var rows = _rows;
  if (div) rows = rows.filter(function(p) { return p.division === div; });
  if (slotId) rows = rows.filter(function(p) { return p.slot_id === slotId; });
  _showSlotCol = (SLOTS.length > 1 && !slotId);
  var stage = document.getElementById('stage');

  if (rows.length === 0) {
    stage.innerHTML = '<div class="sheet"><div class="sheet-fit"><h1>' + escH(title) + '</h1><div class="meta">' + escH(SESSION_TITLE) + '　' + escH(SESSION_META) + '</div>'
      + '<div style="text-align:center;color:#9ca3af;padding:20px;">対象者がいません</div></div></div>';
    document.getElementById('page-count-hint').textContent = '';
    return;
  }

  var chunks = [];
  for (var i = 0; i < rows.length; i += ROWS_PER_PAGE) chunks.push(rows.slice(i, i + ROWS_PER_PAGE));
  var now = new Date(Date.now() + 9*3600*1000).toISOString().slice(0,10);

  stage.innerHTML = chunks.map(function(chunk, idx) {
    var head = (idx === 0)
      ? ('<h1>' + escH(title) + '</h1><div class="meta">' + escH(SESSION_TITLE) + '　' + escH(SESSION_META) + '</div>')
      : ('<div class="page-subtitle">' + escH(title) + '（' + (idx + 1) + ' / ' + chunks.length + 'ページ）</div>');
    var footNote = (idx === chunks.length - 1) ? ('<div class="printed-at">印刷日: ' + now + '</div>') : '';
    return '<div class="sheet">'
      + '<div class="sheet-fit"><div class="rl-content-pad">' + head + tableHtml(chunk) + footNote + '</div></div>'
      + stampFooterHtml()
      + '<div class="page-no">' + (idx + 1) + ' / ' + chunks.length + '</div>'
      + '</div>';
  }).join('');

  document.getElementById('page-count-hint').textContent = '全' + rows.length + '名 / ' + chunks.length + 'ページ';
  fitAllSheets();
}

// A4シート(.sheet-fit)の自動縮小。収まるまで数回繰り返して収束させる
// （1回きりの補正だと縮小率がずれて行が欠けたり空白ページが出ることがあるための対策）
function fitAllSheets() {
  var pxPerMm = 96 / 25.4;
  var availablePx = (297 - 28) * pxPerMm;
  document.querySelectorAll('.sheet-fit').forEach(function (fit) {
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
  });
}

load();
window.addEventListener('beforeprint', fitAllSheets);
</script>
</body>
</html>`);
});

// ===== API =====

// 回（slot）を保存する。incoming に id 付きは更新、id 無しは新規、
// 既存で incoming に無いものは参加者ゼロなら削除・いれば拒否。
// 併せて study_sessions の start_time/end_time/capacity を先頭回にミラーする（ポスター等の後方互換）。
async function writeSlots(
  db: D1Database, sessionId: number,
  slots: { id: number | null; label: string | null; start_time: string | null; end_time: string | null; capacity: number }[],
): Promise<{ error?: string }> {
  const existing = await db.prepare('SELECT id FROM study_session_slots WHERE session_id = ?')
    .bind(sessionId).all<{ id: number }>();
  const existingIds = new Set((existing.results ?? []).map((r) => r.id));
  const keptIds = new Set<number>();

  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (s.id && existingIds.has(s.id)) {
      keptIds.add(s.id);
      await db.prepare(
        `UPDATE study_session_slots SET slot_order = ?, label = ?, start_time = ?, end_time = ?, capacity = ?, updated_at = datetime('now','localtime')
         WHERE id = ? AND session_id = ?`
      ).bind(i, s.label, s.start_time, s.end_time, s.capacity, s.id, sessionId).run();
    } else {
      await db.prepare(
        `INSERT INTO study_session_slots (session_id, slot_order, label, start_time, end_time, capacity)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(sessionId, i, s.label, s.start_time, s.end_time, s.capacity).run();
    }
  }

  for (const oldId of existingIds) {
    if (keptIds.has(oldId)) continue;
    const cnt = await db.prepare('SELECT COUNT(*) AS n FROM study_session_participants WHERE slot_id = ?')
      .bind(oldId).first<{ n: number }>();
    if ((cnt?.n ?? 0) > 0) return { error: '参加者がいる回は削除できません。先に参加者を移動・取り消してください' };
    await db.prepare('DELETE FROM study_session_slots WHERE id = ?').bind(oldId).run();
  }

  const first = slots[0];
  await db.prepare(
    `UPDATE study_sessions SET start_time = ?, end_time = ?, capacity = ?, updated_at = datetime('now','localtime') WHERE id = ?`
  ).bind(first.start_time, first.end_time, first.capacity, sessionId).run();
  return {};
}

app.get('/api/study-sessions', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT s.*, cat.name AS category_name,
      (SELECT COUNT(*) FROM study_session_participants p WHERE p.session_id = s.id) AS participant_count
    FROM study_sessions s
    LEFT JOIN study_session_categories cat ON cat.id = s.category_id
    ORDER BY s.date DESC, s.id DESC
  `).all<Record<string, unknown>>();
  const sessions = rows.results ?? [];
  const slotRows = await c.env.DB.prepare(`
    SELECT sl.id, sl.session_id, sl.slot_order, sl.label, sl.start_time, sl.end_time, sl.capacity,
      (SELECT COUNT(*) FROM study_session_participants p WHERE p.slot_id = sl.id) AS participant_count
    FROM study_session_slots sl
    ORDER BY sl.slot_order, sl.id
  `).all<{ session_id: number } & Record<string, unknown>>();
  const bySession = new Map<number, unknown[]>();
  for (const r of slotRows.results ?? []) {
    if (!bySession.has(r.session_id)) bySession.set(r.session_id, []);
    bySession.get(r.session_id)!.push(r);
  }
  for (const s of sessions) {
    s.slots = bySession.get(s.id as number) ?? [];
    const elig = parseEligibility(s.eligibility_json as string | null);
    s.eligibility = elig;
    s.eligibility_label = describeEligibility(elig);
  }
  return c.json({ sessions });
});

// カテゴリーマスター（公演／勉強会など・管理画面で編集）
app.get('/api/study-sessions/categories', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT cat.id, cat.name, cat.sort_order,
      (SELECT COUNT(*) FROM study_sessions s WHERE s.category_id = cat.id) AS use_count
    FROM study_session_categories cat ORDER BY cat.sort_order, cat.id
  `).all();
  return c.json({ categories: rows.results ?? [] });
});

app.post('/api/study-sessions/categories', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const b = await c.req.json<{ name?: string }>();
  const name = S(b.name, 40);
  if (!name) return c.json({ error: 'カテゴリー名を入力してください' }, 400);
  const max = await c.env.DB.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM study_session_categories').first<{ m: number }>();
  const r = await c.env.DB.prepare('INSERT INTO study_session_categories (name, sort_order) VALUES (?, ?)')
    .bind(name, (max?.m ?? 0) + 10).run();
  return c.json({ ok: true, id: r.meta.last_row_id });
});

app.put('/api/study-sessions/categories/:id', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const id = parseInt(c.req.param('id'));
  const b = await c.req.json<{ name?: string }>();
  const name = S(b.name, 40);
  if (!name) return c.json({ error: 'カテゴリー名を入力してください' }, 400);
  await c.env.DB.prepare("UPDATE study_session_categories SET name = ? WHERE id = ?").bind(name, id).run();
  return c.json({ ok: true });
});

// 並べ替え（管理画面の▲▼ボタン）: 与えられた id 配列の順に sort_order を振り直す
app.post('/api/study-sessions/categories/reorder', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const b = await c.req.json<{ order?: number[] }>();
  const order = Array.isArray(b.order) ? b.order.filter((n) => Number.isFinite(n)) : [];
  for (let i = 0; i < order.length; i++) {
    await c.env.DB.prepare('UPDATE study_session_categories SET sort_order = ? WHERE id = ?').bind((i + 1) * 10, order[i]).run();
  }
  return c.json({ ok: true });
});

app.delete('/api/study-sessions/categories/:id', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const id = parseInt(c.req.param('id'));
  const cnt = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM study_sessions WHERE category_id = ?').bind(id).first<{ n: number }>();
  if ((cnt?.n ?? 0) > 0) return c.json({ error: 'このカテゴリーを使っているイベントがあるため削除できません' }, 400);
  await c.env.DB.prepare('DELETE FROM study_session_categories WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// 「当日のご案内」チラシの名前付きテンプレート（他イベントへ使い回す雛形）
// ※ /:id/participants より前に置くこと（"guide-templates" が id に食われないように）
app.get('/api/study-sessions/guide-templates', async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT id, name, paper, created_at FROM study_session_guide_templates ORDER BY created_at DESC, id DESC'
  ).all();
  return c.json({ templates: rows.results ?? [] });
});

app.get('/api/study-sessions/guide-templates/:tid', async (c) => {
  const tid = parseInt(c.req.param('tid'));
  const row = await c.env.DB.prepare(
    'SELECT id, name, paper, layout_json, created_at FROM study_session_guide_templates WHERE id = ?'
  ).bind(tid).first();
  if (!row) return c.json({ error: '見つかりません' }, 404);
  return c.json({ template: row });
});

app.post('/api/study-sessions/guide-templates', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const b = await c.req.json<{ name?: string; paper?: string; layout_json?: string }>();
  const name = S(b.name, 60);
  if (!name) return c.json({ error: 'テンプレート名を入力してください' }, 400);
  const paper = ['a4p', 'a4l', 'a3p'].includes(String(b.paper)) ? String(b.paper) : 'a4p';
  const layoutJson = typeof b.layout_json === 'string' ? b.layout_json : JSON.stringify(b.layout_json ?? {});
  if (layoutJson.length > 1_800_000) return c.json({ error: 'データが大きすぎます（画像を減らしてください）' }, 413);
  let createdBy = '';
  try {
    const me = await c.env.DB.prepare('SELECT username FROM admins WHERE id = ?').bind(c.get('adminId')).first<{ username: string }>();
    createdBy = me?.username ?? '';
  } catch { /* username 取得失敗は無視 */ }
  const r = await c.env.DB.prepare(
    "INSERT INTO study_session_guide_templates (name, paper, layout_json, created_by) VALUES (?, ?, ?, ?)"
  ).bind(name, paper, layoutJson, createdBy).run();
  return c.json({ ok: true, id: r.meta.last_row_id });
});

app.delete('/api/study-sessions/guide-templates/:tid', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const tid = parseInt(c.req.param('tid'));
  await c.env.DB.prepare('DELETE FROM study_session_guide_templates WHERE id = ?').bind(tid).run();
  return c.json({ ok: true });
});

app.get('/api/study-sessions/:id/participants', async (c) => {
  const id = parseInt(c.req.param('id'));
  const rows = await c.env.DB.prepare(`
    SELECT p.emp_no, p.updated_at, p.attended, p.slot_id, sl.label AS slot_label, sl.slot_order, sl.start_time AS slot_start,
      e.name, e.division, e.team
    FROM study_session_participants p
    LEFT JOIN study_session_slots sl ON sl.id = p.slot_id
    LEFT JOIN employees e ON e.emp_no = p.emp_no
    WHERE p.session_id = ?
    ORDER BY sl.slot_order, sl.id, e.division, e.team, p.updated_at
  `).bind(id).all();
  return c.json({ participants: rows.results ?? [] });
});

// 突発的な参加者を社員名簿から検索して追加するためのオートコンプリート
app.get('/api/study-sessions/search-employees', async (c) => {
  const q = (c.req.query('q') ?? '').trim().slice(0, 40);
  const div = parseInt(c.req.query('division') ?? '', 10);
  // division 指定時は課の在籍社員を一括で返す（アンケートの対象者「○課を追加」用）
  if (!q && div >= 1 && div <= 4) {
    const rows = await c.env.DB.prepare(
      `SELECT emp_no, name, division, team FROM employees
       WHERE is_active = 1 AND division = ? ORDER BY team, seq_no LIMIT 400`
    ).bind(div).all<{ emp_no: string; name: string; division: number | null; team: number | null }>();
    return c.json(rows.results ?? []);
  }
  if (!q) return c.json([]);
  const rows = await c.env.DB.prepare(
    `SELECT emp_no, name, division, team FROM employees
     WHERE is_active = 1 AND (name LIKE ? OR name_kana LIKE ? OR emp_no LIKE ?)
     ORDER BY division, team, seq_no LIMIT 20`
  ).bind(`%${q}%`, `%${q}%`, `%${q}%`).all<{ emp_no: string; name: string; division: number | null; team: number | null }>();
  return c.json(rows.results ?? []);
});

// 管理者による突発的な参加者の手動追加（定員・締切・開催日を問わず追加できる）。slot_id 必須
app.post('/api/study-sessions/:id/participants', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const id = parseInt(c.req.param('id'));
  const session = await c.env.DB.prepare('SELECT id FROM study_sessions WHERE id = ?').bind(id).first();
  if (!session) return c.json({ error: 'イベントが見つかりません' }, 404);
  const b = await c.req.json<{ emp_no?: string; slot_id?: number }>();
  const empNo = S(b.emp_no, 20);
  if (!empNo) return c.json({ error: '社員番号を指定してください' }, 400);
  const slotId = Number.isFinite(b.slot_id) ? Math.floor(b.slot_id as number) : 0;
  const slot = await c.env.DB.prepare('SELECT id FROM study_session_slots WHERE id = ? AND session_id = ?').bind(slotId, id).first();
  if (!slot) return c.json({ error: '回を指定してください' }, 400);
  const emp = await c.env.DB.prepare('SELECT emp_no FROM employees WHERE emp_no = ? AND is_active = 1').bind(empNo).first();
  if (!emp) return c.json({ error: '該当する社員が見つかりません' }, 404);
  await c.env.DB.prepare(
    `INSERT INTO study_session_participants (session_id, slot_id, emp_no) VALUES (?, ?, ?)
     ON CONFLICT(session_id, emp_no, slot_id) DO UPDATE SET updated_at = datetime('now','localtime')`
  ).bind(id, slotId, empNo).run();
  return c.json({ ok: true });
});

// 当日の出席消し込み（管理者がチェック・取り消しできる）。slot_id で回を特定
app.post('/api/study-sessions/:id/participants/:emp_no/attend', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const id = parseInt(c.req.param('id'));
  const empNo = c.req.param('emp_no');
  const b = await c.req.json<{ attended?: number; slot_id?: number }>();
  const slotId = Number.isFinite(b.slot_id) ? Math.floor(b.slot_id as number) : 0;
  await c.env.DB.prepare(
    `UPDATE study_session_participants SET attended = ?, updated_at = datetime('now','localtime') WHERE session_id = ? AND emp_no = ? AND slot_id = ?`
  ).bind(b.attended ? 1 : 0, id, empNo, slotId).run();
  return c.json({ ok: true });
});

// 管理者による強制キャンセル（前日・当日以降でも取り消し可。公開側のキャンセル回数ペナルティには加算しない）
// slot_id 指定時はその回のみ、無指定ならイベント全回の登録を取り消す
app.delete('/api/study-sessions/:id/participants/:emp_no', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const id = parseInt(c.req.param('id'));
  const empNo = c.req.param('emp_no');
  const slotId = parseInt(c.req.query('slot_id') ?? '', 10);
  if (Number.isFinite(slotId) && slotId > 0) {
    await c.env.DB.prepare('DELETE FROM study_session_participants WHERE session_id = ? AND emp_no = ? AND slot_id = ?').bind(id, empNo, slotId).run();
  } else {
    await c.env.DB.prepare('DELETE FROM study_session_participants WHERE session_id = ? AND emp_no = ?').bind(id, empNo).run();
  }
  return c.json({ ok: true });
});

app.post('/api/study-sessions', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const b = await c.req.json<{
    title?: string; date?: string; location?: string; contact_name?: string;
    target_audience?: string; note?: string; category_id?: number; slots?: unknown; eligibility?: unknown;
  }>();
  const title = S(b.title, 60);
  const date = S(b.date, 10);
  if (!title) return c.json({ error: 'タイトルを入力してください' }, 400);
  if (!isValidDate(date)) return c.json({ error: '開催日の形式が正しくありません' }, 400);
  const { slots, error } = normalizeSlots(b.slots);
  if (error) return c.json({ error }, 400);
  const categoryId = Number.isFinite(b.category_id) && (b.category_id as number) > 0 ? Math.floor(b.category_id as number) : null;
  const eligibilityJson = serializeEligibility(b.eligibility);

  const result = await c.env.DB.prepare(
    `INSERT INTO study_sessions (title, date, start_time, end_time, location, contact_name, capacity, target_audience, note, category_id, eligibility_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(title, date, slots[0].start_time, slots[0].end_time, S(b.location, 60) || null, S(b.contact_name, 30) || null, slots[0].capacity, S(b.target_audience, 60) || null, S(b.note, 300) || null, categoryId, eligibilityJson).run();
  const sessionId = Number(result.meta.last_row_id);
  await writeSlots(c.env.DB, sessionId, slots);

  return c.json({ ok: true, id: sessionId });
});

app.put('/api/study-sessions/:id', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const id = parseInt(c.req.param('id'));
  const existing = await c.env.DB.prepare('SELECT id FROM study_sessions WHERE id = ?').bind(id).first();
  if (!existing) return c.json({ error: 'イベントが見つかりません' }, 404);

  const b = await c.req.json<{
    title?: string; date?: string; location?: string; contact_name?: string;
    target_audience?: string; note?: string; category_id?: number; slots?: unknown; eligibility?: unknown;
  }>();
  const title = S(b.title, 60);
  const date = S(b.date, 10);
  if (!title) return c.json({ error: 'タイトルを入力してください' }, 400);
  if (!isValidDate(date)) return c.json({ error: '開催日の形式が正しくありません' }, 400);
  const { slots, error } = normalizeSlots(b.slots);
  if (error) return c.json({ error }, 400);
  const categoryId = Number.isFinite(b.category_id) && (b.category_id as number) > 0 ? Math.floor(b.category_id as number) : null;
  const eligibilityJson = serializeEligibility(b.eligibility);

  await c.env.DB.prepare(
    `UPDATE study_sessions SET title = ?, date = ?, location = ?, contact_name = ?, target_audience = ?, note = ?, category_id = ?, eligibility_json = ?, updated_at = datetime('now','localtime')
     WHERE id = ?`
  ).bind(title, date, S(b.location, 60) || null, S(b.contact_name, 30) || null, S(b.target_audience, 60) || null, S(b.note, 300) || null, categoryId, eligibilityJson, id).run();
  const res = await writeSlots(c.env.DB, id, slots);
  if (res.error) return c.json({ error: res.error }, 400);

  return c.json({ ok: true });
});

app.post('/api/study-sessions/:id/close', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const id = parseInt(c.req.param('id'));
  const b = await c.req.json<{ is_closed?: number }>();
  await c.env.DB.prepare(`UPDATE study_sessions SET is_closed = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
    .bind(b.is_closed ? 1 : 0, id).run();
  return c.json({ ok: true });
});

app.delete('/api/study-sessions/:id', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const id = parseInt(c.req.param('id'));
  await c.env.DB.prepare('DELETE FROM study_session_participants WHERE session_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM study_session_slots WHERE session_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM study_sessions WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

app.get('/api/study-sessions/penalties', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT p.emp_no, p.cancel_count, p.penalty_until, e.name, e.division, e.team
    FROM study_session_penalties p
    LEFT JOIN employees e ON e.emp_no = p.emp_no
    WHERE p.cancel_count > 0 OR p.penalty_until IS NOT NULL
    ORDER BY (p.penalty_until IS NOT NULL) DESC, p.penalty_until, p.cancel_count DESC
  `).all();
  return c.json({ penalties: rows.results ?? [] });
});

app.post('/api/study-sessions/penalties/:emp_no/clear', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const empNo = c.req.param('emp_no');
  await c.env.DB.prepare('DELETE FROM study_session_penalties WHERE emp_no = ?').bind(empNo).run();
  return c.json({ ok: true });
});

app.get('/api/study-sessions/requests', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT r.id, r.emp_no, r.content, r.created_at, e.name, e.division, e.team
    FROM study_session_requests r
    LEFT JOIN employees e ON e.emp_no = r.emp_no
    ORDER BY r.created_at DESC
  `).all();
  return c.json({ requests: rows.results ?? [] });
});

app.delete('/api/study-sessions/requests/:id', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const id = parseInt(c.req.param('id'));
  await c.env.DB.prepare('DELETE FROM study_session_requests WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// ===== ご意見版（営業所へのご意見）API =====
// 一覧。匿名希望の意見は既定で社員番号・氏名を返さない（開示は /reveal・フル権限限定）
app.get('/api/office-opinions', async (c) => {
  const status = c.req.query('status') ?? 'open';
  const where = status === 'done' ? "WHERE o.status = 'done'"
    : status === 'all' ? '' : "WHERE o.status = 'open'";
  const rows = await c.env.DB.prepare(`
    SELECT o.id, o.emp_no, o.is_anonymous, o.category, o.content, o.status, o.admin_note, o.created_at,
           e.name, e.division, e.team
    FROM office_opinions o
    LEFT JOIN employees e ON e.emp_no = o.emp_no
    ${where}
    ORDER BY o.created_at DESC, o.id DESC
  `).all<{
    id: number; emp_no: string; is_anonymous: number; category: string | null; content: string;
    status: string; admin_note: string | null; created_at: string;
    name: string | null; division: number | null; team: number | null;
  }>();
  const opinions = (rows.results ?? []).map(r => r.is_anonymous
    ? { id: r.id, is_anonymous: 1, category: r.category, content: r.content, status: r.status, admin_note: r.admin_note, created_at: r.created_at }
    : { ...r, is_anonymous: 0 });
  return c.json({ opinions });
});

// 匿名希望の意見の送信者開示（フル権限アカウントのみ）
app.post('/api/office-opinions/:id/reveal', async (c) => {
  const perms = await getAdminPermissions(c.env.DB, c.get('adminId'));
  if (perms !== null) return c.json({ error: '開示できるのはフル権限アカウントのみです' }, 403);
  const id = parseInt(c.req.param('id'));
  const row = await c.env.DB.prepare(`
    SELECT o.emp_no, e.name, e.division, e.team
    FROM office_opinions o LEFT JOIN employees e ON e.emp_no = o.emp_no
    WHERE o.id = ?
  `).bind(id).first<{ emp_no: string; name: string | null; division: number | null; team: number | null }>();
  if (!row) return c.json({ error: 'ご意見が見つかりません' }, 404);
  return c.json(row);
});

app.post('/api/office-opinions/:id/status', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const id = parseInt(c.req.param('id'));
  const b = await c.req.json<{ status?: string }>();
  const status = b.status === 'done' ? 'done' : 'open';
  await c.env.DB.prepare(`UPDATE office_opinions SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?`).bind(status, id).run();
  return c.json({ ok: true });
});

app.post('/api/office-opinions/:id/note', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const id = parseInt(c.req.param('id'));
  const b = await c.req.json<{ admin_note?: string }>();
  await c.env.DB.prepare(`UPDATE office_opinions SET admin_note = ?, updated_at = datetime('now','localtime') WHERE id = ?`).bind(S(b.admin_note, 500) || null, id).run();
  return c.json({ ok: true });
});

app.delete('/api/office-opinions/:id', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const id = parseInt(c.req.param('id'));
  await c.env.DB.prepare('DELETE FROM office_opinions WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// ===== ヒヤリハット報告 API（設定「板橋」→ヒヤリハットタブ） =====
// 一覧。氏名は返さない（照会は /reveal・フル権限限定）。
app.get('/api/hiyari-reports', async (c) => {
  const filter = c.req.query('filter') ?? 'open';
  const where =
    filter === 'reviewed' ? "WHERE status = 'reviewed'"
    : filter === 'all' ? ''
    : filter === 'web' ? "WHERE source = 'web'"
    : "WHERE status = 'open'";
  const rows = await c.env.DB.prepare(`
    SELECT id, source, emp_no, division, team, occurred_at, weather, place_area, place_detail,
           counterpart, situation, situation_text, cause, cause_text, measure_text, severe, status,
           admin_note, created_at
      FROM hiyari_reports ${where}
     ORDER BY (status = 'open') DESC, created_at DESC, id DESC
  `).all();
  const reports = (rows.results ?? []).map((r) => {
    const { emp_no, ...rest } = r as Record<string, unknown>;
    return rest; // 社員番号は一覧に出さない
  });
  return c.json({ reports });
});

app.post('/api/hiyari-reports/:id/status', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const id = parseInt(c.req.param('id'));
  const b = await c.req.json<{ status?: string }>();
  const status = b.status === 'reviewed' ? 'reviewed' : 'open';
  await c.env.DB.prepare(`UPDATE hiyari_reports SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?`).bind(status, id).run();
  return c.json({ ok: true });
});

app.post('/api/hiyari-reports/:id/note', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const id = parseInt(c.req.param('id'));
  const b = await c.req.json<{ admin_note?: string }>();
  await c.env.DB.prepare(`UPDATE hiyari_reports SET admin_note = ?, updated_at = datetime('now','localtime') WHERE id = ?`).bind(S(b.admin_note, 500), id).run();
  return c.json({ ok: true });
});

app.delete('/api/hiyari-reports/:id', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const id = parseInt(c.req.param('id'));
  await c.env.DB.prepare('DELETE FROM hiyari_reports WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// ヒヤリハット報告フォームの掲示ポスター文面
app.get('/api/hiyari-poster', async (c) => {
  return c.json(await loadHiyariPoster(c.env.DB));
});
app.post('/api/hiyari-poster', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const b = await c.req.json<Partial<HiyariPoster>>().catch(() => ({} as Partial<HiyariPoster>));
  const next: HiyariPoster = {
    eyebrow: S(b.eyebrow, 40) || HIYARI_POSTER_DEFAULT.eyebrow,
    title: S(b.title, 60) || HIYARI_POSTER_DEFAULT.title,
    lead: S(b.lead, 400),
    body: S(b.body, 800),
    contact: S(b.contact, 80),
    qr_caption: S(b.qr_caption, 60) || HIYARI_POSTER_DEFAULT.qr_caption,
  };
  await c.env.DB.prepare(
    `INSERT INTO system_settings (key, value, updated_at) VALUES ('hiyari_poster', ?, datetime('now','localtime'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).bind(JSON.stringify(next)).run();
  return c.json({ ok: true, poster: next });
});

// 投稿者の氏名照会（フル権限アカウントのみ）。emp_no を持つ Web投稿のみ対象。
app.post('/api/hiyari-reports/:id/reveal', async (c) => {
  const perms = await getAdminPermissions(c.env.DB, c.get('adminId'));
  if (perms !== null) return c.json({ error: '照会できるのはフル権限アカウントのみです' }, 403);
  const id = parseInt(c.req.param('id'));
  const row = await c.env.DB.prepare(`
    SELECT h.emp_no, e.name, e.division, e.team
    FROM hiyari_reports h LEFT JOIN employees e ON e.emp_no = h.emp_no
    WHERE h.id = ?
  `).bind(id).first<{ emp_no: string; name: string | null; division: number | null; team: number | null }>();
  if (!row || !row.emp_no) return c.json({ error: '照会できる社員番号がありません' }, 404);
  return c.json(row);
});

// ===== アンケート API（設定「板橋」→アンケートタブ） =====
type DbSurveyQ = { id: number; qtype: string; label: string; help: string; required: number; settings_json: string };

async function getSurveyOfficeId(env: Env): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT CAST(value AS INTEGER) v FROM system_settings WHERE key = 'home_office_id'"
  ).first<{ v: number }>().catch(() => null);
  return row?.v && row.v > 0 ? row.v : 1;
}

function parseQuestionsInput(raw: unknown): { qtype: SurveyQType; label: string; help: string; required: number; settings_json: string }[] {
  if (!Array.isArray(raw)) return [];
  const out: { qtype: SurveyQType; label: string; help: string; required: number; settings_json: string }[] = [];
  for (const item of raw.slice(0, 60)) {
    const q = (item && typeof item === 'object') ? item as Record<string, unknown> : {};
    const qtype = (isQType(q.qtype) ? q.qtype : 'text') as SurveyQType;
    const label = S(q.label, 200);
    if (!label) continue;
    const settings = normalizeSettings(qtype, q.settings);
    if ((qtype === 'radio' || qtype === 'checkbox') && settings.choices.length === 0 && !settings.allowOther) continue;
    out.push({
      qtype, label,
      help: S(q.help, 500),
      required: (q.required === true || q.required === 1 || q.required === '1') ? 1 : 0,
      settings_json: JSON.stringify(settings),
    });
  }
  return out;
}

app.get('/api/surveys', async (c) => {
  const officeId = await getSurveyOfficeId(c.env);
  const rs = await c.env.DB.prepare(`
    SELECT s.id, s.title, s.is_closed, s.target_all, s.created_at,
      (SELECT COUNT(*) FROM survey_questions q WHERE q.survey_id = s.id) AS question_count,
      (SELECT COUNT(*) FROM survey_responses r WHERE r.survey_id = s.id) AS response_count,
      (SELECT COUNT(*) FROM survey_targets t WHERE t.survey_id = s.id) AS target_count
    FROM surveys s WHERE s.office_id = ?
    ORDER BY s.is_closed, s.created_at DESC, s.id DESC
  `).bind(officeId).all();
  return c.json({ surveys: rs.results ?? [] });
});

app.post('/api/surveys', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const b = await c.req.json<{ title?: string; description?: string }>().catch(() => ({} as { title?: string; description?: string }));
  const title = S(b.title, 200);
  if (!title) return c.json({ error: 'タイトルを入力してください' }, 400);
  const officeId = await getSurveyOfficeId(c.env);
  const ins = await c.env.DB.prepare(
    'INSERT INTO surveys (office_id, title, description) VALUES (?, ?, ?)'
  ).bind(officeId, title, S(b.description, 2000)).run();
  return c.json({ ok: true, id: ins.meta.last_row_id });
});

app.get('/api/surveys/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const officeId = await getSurveyOfficeId(c.env);
  const s = await c.env.DB.prepare(
    'SELECT id, title, description, is_closed, target_all FROM surveys WHERE id = ? AND office_id = ?'
  ).bind(id, officeId).first<{ id: number; title: string; description: string; is_closed: number; target_all: number }>();
  if (!s) return c.json({ error: '見つかりません' }, 404);
  const qs = await c.env.DB.prepare(
    'SELECT id, qtype, label, help, required, settings_json FROM survey_questions WHERE survey_id = ? ORDER BY sort_order, id'
  ).bind(id).all<DbSurveyQ>();
  const rc = await c.env.DB.prepare('SELECT COUNT(*) n FROM survey_responses WHERE survey_id = ?').bind(id).first<{ n: number }>();
  const tg = await c.env.DB.prepare(`
    SELECT t.emp_no, e.name, e.division, e.team
    FROM survey_targets t LEFT JOIN employees e ON e.emp_no = t.emp_no
    WHERE t.survey_id = ? ORDER BY e.division, e.team, e.seq_no
  `).bind(id).all<{ emp_no: string; name: string | null; division: number | null; team: number | null }>();
  const questions = (qs.results ?? []).map(q => {
    const qtype = (isQType(q.qtype) ? q.qtype : 'text') as SurveyQType;
    let raw: unknown = {};
    try { raw = JSON.parse(q.settings_json || '{}'); } catch { /* {} */ }
    return { id: q.id, qtype, label: q.label, help: q.help, required: !!q.required, settings: normalizeSettings(qtype, raw) };
  });
  return c.json({ ...s, response_count: rc?.n ?? 0, questions, targets: tg.results ?? [] });
});

app.put('/api/surveys/:id', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const id = parseInt(c.req.param('id'), 10);
  const officeId = await getSurveyOfficeId(c.env);
  const exist = await c.env.DB.prepare('SELECT id FROM surveys WHERE id = ? AND office_id = ?').bind(id, officeId).first();
  if (!exist) return c.json({ error: '見つかりません' }, 404);
  const b = await c.req.json<{ title?: string; description?: string; is_closed?: unknown; target_all?: unknown; targets?: unknown; questions?: unknown }>()
    .catch(() => ({} as { title?: string; description?: string; is_closed?: unknown; target_all?: unknown; targets?: unknown; questions?: unknown }));
  const title = S(b.title, 200);
  if (!title) return c.json({ error: 'タイトルを入力してください' }, 400);
  const isClosed = (b.is_closed === true || b.is_closed === 1 || b.is_closed === '1') ? 1 : 0;
  const targetAll = (b.target_all === false || b.target_all === 0 || b.target_all === '0') ? 0 : 1;
  await c.env.DB.prepare(
    "UPDATE surveys SET title = ?, description = ?, is_closed = ?, target_all = ?, updated_at = datetime('now','localtime') WHERE id = ?"
  ).bind(title, S(b.description, 2000), isClosed, targetAll, id).run();

  // 対象者（emp_no リスト）を入れ替え。回答の有無に関わらず変更可
  const empNos = Array.isArray(b.targets)
    ? [...new Set((b.targets as unknown[]).map(v => S(v, 20)).filter(Boolean))].slice(0, 2000)
    : [];
  await c.env.DB.prepare('DELETE FROM survey_targets WHERE survey_id = ?').bind(id).run();
  if (targetAll === 0 && empNos.length) {
    for (const en of empNos) {
      await c.env.DB.prepare('INSERT OR IGNORE INTO survey_targets (survey_id, emp_no) VALUES (?, ?)').bind(id, en).run();
    }
  }

  const rc = await c.env.DB.prepare('SELECT COUNT(*) n FROM survey_responses WHERE survey_id = ?').bind(id).first<{ n: number }>();
  if ((rc?.n ?? 0) > 0) {
    return c.json({ ok: true, questionsLocked: true }); // 回答があるため設問は変更しない
  }
  const questions = parseQuestionsInput(b.questions);
  await c.env.DB.prepare('DELETE FROM survey_questions WHERE survey_id = ?').bind(id).run();
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    await c.env.DB.prepare(
      'INSERT INTO survey_questions (survey_id, sort_order, qtype, label, help, required, settings_json) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, i, q.qtype, q.label, q.help, q.required, q.settings_json).run();
  }
  return c.json({ ok: true, questionsLocked: false, question_count: questions.length });
});

app.delete('/api/surveys/:id', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const id = parseInt(c.req.param('id'), 10);
  const officeId = await getSurveyOfficeId(c.env);
  const exist = await c.env.DB.prepare('SELECT id FROM surveys WHERE id = ? AND office_id = ?').bind(id, officeId).first();
  if (!exist) return c.json({ error: '見つかりません' }, 404);
  await c.env.DB.prepare(
    'DELETE FROM survey_answers WHERE response_id IN (SELECT id FROM survey_responses WHERE survey_id = ?)'
  ).bind(id).run();
  await c.env.DB.prepare('DELETE FROM survey_responses WHERE survey_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM survey_questions WHERE survey_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM survey_targets WHERE survey_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM surveys WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

async function loadSurveyForResults(env: Env, id: number) {
  const officeId = await getSurveyOfficeId(env);
  const s = await env.DB.prepare(
    'SELECT id, title, description, is_closed FROM surveys WHERE id = ? AND office_id = ?'
  ).bind(id, officeId).first<{ id: number; title: string; description: string; is_closed: number }>();
  if (!s) return null;
  const qs = await env.DB.prepare(
    'SELECT id, qtype, label, help, required, settings_json FROM survey_questions WHERE survey_id = ? ORDER BY sort_order, id'
  ).bind(id).all<DbSurveyQ>();
  const responses = await env.DB.prepare(
    'SELECT id, division, team, created_at, updated_at FROM survey_responses WHERE survey_id = ? ORDER BY created_at, id'
  ).bind(id).all<{ id: number; division: number | null; team: number | null; created_at: string; updated_at: string | null }>();
  const ans = await env.DB.prepare(`
    SELECT a.response_id, a.question_id, a.value_text
    FROM survey_answers a JOIN survey_responses r ON r.id = a.response_id
    WHERE r.survey_id = ?
  `).bind(id).all<{ response_id: number; question_id: number; value_text: string }>();
  const byQ = new Map<number, string[]>();
  const byResp = new Map<number, Map<number, string>>();
  for (const a of ans.results ?? []) {
    if (!byQ.has(a.question_id)) byQ.set(a.question_id, []);
    byQ.get(a.question_id)!.push(a.value_text);
    if (!byResp.has(a.response_id)) byResp.set(a.response_id, new Map());
    byResp.get(a.response_id)!.set(a.question_id, a.value_text);
  }
  const questions = (qs.results ?? []).map(q => {
    const qtype = (isQType(q.qtype) ? q.qtype : 'text') as SurveyQType;
    let raw: unknown = {};
    try { raw = JSON.parse(q.settings_json || '{}'); } catch { /* {} */ }
    const settings = normalizeSettings(qtype, raw);
    return { id: q.id, qtype, label: q.label, help: q.help, required: !!q.required, settings };
  });
  return { survey: s, questions, responses: responses.results ?? [], byQ, byResp };
}

app.get('/api/surveys/:id/results', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const data = await loadSurveyForResults(c.env, id);
  if (!data) return c.json({ error: '見つかりません' }, 404);
  const results = data.questions.map(q => ({
    id: q.id, label: q.label, qtype: q.qtype, required: q.required, settings: q.settings,
    summary: aggregateQuestion(q.qtype, q.settings, data.byQ.get(q.id) ?? []),
  }));
  const responses = data.responses.map((r, i) => {
    const m = data.byResp.get(r.id) ?? new Map<number, string>();
    return {
      id: r.id, idx: i + 1, division: r.division, team: r.team,
      created_at: r.created_at, updated_at: r.updated_at ?? r.created_at,
      answers: data.questions.map(q => ({ label: q.label, qtype: q.qtype, display: answerToCsvCell(q.qtype, m.get(q.id) ?? '') })),
    };
  });
  return c.json({
    survey: data.survey,
    total: data.responses.length,
    results,
    responses,
  });
});

// 個別回答の氏名照会（フル権限アカウントのみ）
app.post('/api/surveys/:id/responses/:rid/reveal', async (c) => {
  const perms = await getAdminPermissions(c.env.DB, c.get('adminId'));
  if (perms !== null) return c.json({ error: '照会できるのはフル権限アカウントのみです' }, 403);
  const rid = parseInt(c.req.param('rid'), 10);
  const row = await c.env.DB.prepare(`
    SELECT r.emp_no, e.name, e.division, e.team
    FROM survey_responses r LEFT JOIN employees e ON e.emp_no = r.emp_no
    WHERE r.id = ? AND r.survey_id = ?
  `).bind(rid, parseInt(c.req.param('id'), 10)).first<{ emp_no: string; name: string | null; division: number | null; team: number | null }>();
  if (!row) return c.json({ error: '見つかりません' }, 404);
  return c.json(row);
});

// 個別回答の削除
app.delete('/api/surveys/:id/responses/:rid', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const sid = parseInt(c.req.param('id'), 10);
  const rid = parseInt(c.req.param('rid'), 10);
  const row = await c.env.DB.prepare(
    `SELECT r.id FROM survey_responses r JOIN surveys s ON s.id = r.survey_id
     WHERE r.id = ? AND r.survey_id = ? AND s.office_id = ?`
  ).bind(rid, sid, await getSurveyOfficeId(c.env)).first<{ id: number }>();
  if (!row) return c.json({ error: '見つかりません' }, 404);
  await c.env.DB.prepare('DELETE FROM survey_answers WHERE response_id = ?').bind(rid).run();
  await c.env.DB.prepare('DELETE FROM survey_responses WHERE id = ?').bind(rid).run();
  return c.json({ ok: true });
});

app.get('/api/surveys/:id/results.csv', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const data = await loadSurveyForResults(c.env, id);
  if (!data) return c.text('not found', 404);
  const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = ['回答日時', '課', '班', ...data.questions.map(q => q.label)];
  const lines = [header.map(esc).join(',')];
  for (const r of data.responses) {
    const m = data.byResp.get(r.id) ?? new Map<number, string>();
    const row = [
      r.created_at,
      r.division != null ? `${r.division}課` : '',
      r.team != null ? `${r.team}班` : '',
      ...data.questions.map(q => answerToCsvCell(q.qtype, m.get(q.id) ?? '')),
    ];
    lines.push(row.map(esc).join(','));
  }
  const csv = '﻿' + lines.join('\r\n');
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="survey_${id}_results.csv"`,
    },
  });
});

// アンケートごとの回答用QR（印刷向けの1枚。A4縦・大きめQR）
app.get('/settings/study-sessions/survey/:id/qr', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const officeId = await getSurveyOfficeId(c.env);
  const s = await c.env.DB.prepare(
    'SELECT title, description, is_closed FROM surveys WHERE id = ? AND office_id = ?'
  ).bind(id, officeId).first<{ title: string; description: string; is_closed: number }>();
  if (!s) return c.text('アンケートが見つかりません', 404);
  const url = `${shareUrl()}?survey=${id}`;
  return c.html(`<!DOCTYPE html>
<html lang="ja"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>QR - ${escHtml(s.title)}</title>
<link rel="icon" type="image/svg+xml" href="${FAVICON_DATA_URI}">
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #e5e7eb; }
  body { font-family: 'Hiragino Sans','Meiryo',sans-serif; }
  .bar { display: flex; gap: 12px; align-items: center; padding: 14px 20px; background: #fff; border-bottom: 1px solid #e5e7eb; flex-wrap: wrap; }
  .bar a { color: #374151; font-size: 13px; text-decoration: none; padding: 6px 12px; border: 1px solid #d1d5db; border-radius: 6px; background: #fff; }
  .bar button { padding: 9px 22px; background: #2563eb; color: #fff; border: none; border-radius: 7px; font-size: 14px; font-weight: 700; cursor: pointer; }
  .sheet {
    width: 210mm; min-height: 297mm; margin: 20px auto; background: #fff; padding: 24mm 20mm;
    display: flex; flex-direction: column; align-items: center; text-align: center;
    box-shadow: 0 2px 14px rgba(0,0,0,0.18); -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .eyebrow { font-size: 16pt; font-weight: 700; color: #2563eb; letter-spacing: 4px; }
  .title { font-size: 34pt; font-weight: 900; color: #1e3a5f; line-height: 1.4; margin: 8mm 0 4mm; word-break: keep-all; }
  .desc { font-size: 13pt; color: #4b5563; line-height: 1.9; white-space: pre-wrap; max-width: 160mm; margin-bottom: 6mm; }
  .cap { font-size: 15pt; font-weight: 800; color: #1e3a5f; margin: 6mm 0; }
  .qr-box { width: 110mm; height: 110mm; border: 4px solid #1e3a5f; border-radius: 8mm; padding: 6mm; background: #fff; }
  .url { margin-top: 6mm; font-size: 10pt; color: #6b7280; word-break: break-all; max-width: 170mm; }
  .note { margin-top: auto; font-size: 10pt; color: #9ca3af; padding-top: 10mm; }
  .closed { margin-top: 6mm; font-size: 12pt; font-weight: 700; color: #b45309; }
  @media print {
    .bar { display: none; }
    body { background: #fff; }
    .sheet { margin: 0; box-shadow: none; }
    @page { size: A4 portrait; margin: 0; }
  }
</style>
</head><body>
  <div class="bar">
    <a href="${ADMIN_PATH}/settings/study-sessions?tab=surveys">← アンケート一覧</a>
    <button onclick="window.print()">印刷 / PDF保存</button>
  </div>
  <div class="sheet">
    <div class="eyebrow">アンケート</div>
    <div class="title">${escHtml(s.title)}</div>
    ${s.description ? `<div class="desc">${escHtml(s.description)}</div>` : ''}
    <div class="cap">QRを読み取って回答してください</div>
    <div class="qr-box">${tokenToQrSvg(url, 10)}</div>
    <div class="url">${escHtml(url)}</div>
    ${s.is_closed ? '<div class="closed">※このアンケートは現在「受付終了」です</div>' : ''}
    <div class="note">社員番号の入力が必要です（氏名は保存されません）</div>
  </div>
</body></html>`);
});

export default app;
