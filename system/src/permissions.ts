// アカウント別ページ権限
// admins.permissions が NULL のアカウントは全ページアクセス可（従来通り）。
// JSON配列（例: ["home","staff","settings","settings.offices"]）を持つアカウントは
// 許可されたページのみ表示・アクセスできる。
//
// 閲覧/編集の分離（migration_031〜）:
//   キー "X" は閲覧（GET）のみ。データ変更（非GETリクエスト）には "X.edit" が必要。
//   migration_031 で既存の制限付きアカウントには全キーの .edit を付与済み。

// 権限キーの一覧・階層は下部の PERMISSION_TREE（アカウント権限編集UIのカタログ）を参照。
// 主なもの:
//   サイドバー: home / kancho-shift / kanri-kobo / handover / tenko / newcomers / staff /
//               kacho-mission / sales-ai / accidents / vehicles / inspection /
//               announcements / line / requests / crew-portal / tantosha / todo / crew-shift / shift
//   「全アカウント共通だった機能」に付けた閲覧ON/OFFキー: benri / garage / shuttle / signage / cc-list
//     （いずれも編集はフル権限アカウントのみ。index.ts で「キーがあれば通す」形で判定）
//   板橋ページ: settings.study-sessions（全タブ）＋タブ別キー
//              settings.office-opinions / settings.hiyari / settings.surveys / settings.daihon
//              （親 settings.study-sessions を持てば全タブ利用可）
//   設定サブページ: settings.accounts / settings.manual-mode / settings.liff / settings.line-usage /
//              settings.notifications / settings.offices / settings.documents / settings.study-notes / settings.tutorial /
//              settings.status / settings.chosei / settings.announcement-bar / settings.birthday /
//              settings.wage-estimate / settings.driving-risk / settings.vehicle-search-guide /
//              settings.lost-items / settings.accidents / settings.violations / settings.general-reports /
//              settings.handover-memos / settings.violation-types /
//              settings.schedule-types / settings.dia / settings.coaches / settings.instructors /
//              settings.periods / settings.benten /
//              settings.kancho / settings.kancho-roster / settings.kancho-wish / settings.kancho-logic

// 管理画面パス（/{SECRET}/admin 以降）→ 必要権限キー。先頭一致で最初にマッチした行を採用
// キーは '|' 区切りで複数指定可（いずれか1つでも権限があればOK）。例: 'a|b|c'
const PATH_PERMISSIONS: Array<[RegExp, string]> = [
  // 報告センター入口（5種の報告タブいずれかの権限があれば入れる。各タブ自体の制御は個別エントリで行う）
  [/^\/settings\/reports/,              'settings.lost-items|settings.accidents|settings.violations|settings.general-reports|settings.handover-memos'],
  // 設定サブページ
  [/^\/settings\/accounts/,             'settings.accounts'],
  [/^\/settings\/manual-mode/,          'settings.manual-mode|settings'],
  [/^\/settings\/liff/,                 'settings.liff'],
  [/^\/settings\/lost-items/,           'settings.lost-items'],
  [/^\/settings\/accidents/,            'settings.accidents'],
  [/^\/settings\/violation-types/,      'settings.violation-types'],
  [/^\/settings\/violations/,           'settings.violations'],
  [/^\/settings\/general-reports/,      'settings.general-reports'],
  [/^\/settings\/handover-memos/,       'settings.handover-memos'],
  [/^\/settings\/benten/,               'settings.benten'],
  [/^\/settings\/schedule-types/,       'settings.schedule-types'],
  [/^\/settings\/dia/,                  'settings.dia'],
  [/^\/settings\/coaches/,              'settings.coaches'],
  [/^\/settings\/instructors/,          'settings.instructors'],
  [/^\/settings\/periods/,              'settings.periods'],
  [/^\/settings\/wage-estimate/,        'settings.wage-estimate'],
  [/^\/settings\/driving-risk/,         'settings.driving-risk'],
  [/^\/settings\/notifications/,        'settings.notifications'],
  [/^\/settings\/offices/,              'settings.offices'],
  [/^\/settings\/vehicle-search-guide/, 'settings.vehicle-search-guide'],
  // データセンター（資料センター拡張）: 資料/社員CSV/点検写真AI/乗務員シフトPDFの入口。各タブの表示は data-perm-key で個別制御
  [/^\/settings\/documents/,            'settings.documents|staff|inspection|crew-shift'],
  // 学習ノート（管理者本人の私的な学習用ノート教材。タイトルごとにページ保存しPDF出力）
  [/^\/settings\/study-notes/,          'settings.study-notes'],
  [/^\/settings\/tutorial/,             'settings.tutorial'],
  [/^\/settings\/status/,               'settings.status'],
  [/^\/settings\/announcement-bar/,     'settings.announcement-bar'],
  [/^\/settings\/birthday/,             'settings.birthday'],
  [/^\/settings\/face-auth/,            'face-auth'],
  // 板橋ページ本体。親キー settings.study-sessions を持てば全タブ利用可。
  // タブ単位で絞るための子キー（settings.hiyari 等）のいずれかでもページに入れる。
  [/^\/settings\/study-sessions/,       'settings.study-sessions|settings.hiyari|settings.surveys|settings.daihon|settings.office-opinions'],
  [/^\/settings\/chosei/,               'settings.chosei'],
  [/^\/settings\/kancho-wish/,          'settings.kancho-wish'],
  [/^\/settings\/kancho-roster/,        'settings.kancho-roster'],
  [/^\/settings\/kancho-logic/,         'settings.kancho-logic'],
  [/^\/settings\/kancho$/,              'settings.kancho'],
  [/^\/settings/,                       'settings'],
  // 設定配下のAPI
  [/^\/api\/accounts/,                  'settings.accounts'],
  [/^\/api\/account-presets/,           'settings.accounts'],
  [/^\/api\/offices/,                   'settings.offices'],
  [/^\/api\/benten/,                    'settings.benten'],
  [/^\/api\/liff-users/,                'settings.liff'],
  [/^\/api\/liff\/lost-items/,          'settings.lost-items'],
  [/^\/api\/liff\/accident-reports/,    'settings.accidents'],
  [/^\/api\/liff\/violation-reports/,   'settings.violations'],
  [/^\/api\/liff\/general-reports/,     'settings.general-reports'],
  [/^\/api\/handover-memos/,            'settings.handover-memos'],
  [/^\/api\/violation-types/,           'settings.violation-types'],
  [/^\/api\/study-sessions/,            'settings.study-sessions'],
  [/^\/api\/office-opinions/,           'settings.office-opinions|settings.study-sessions'],
  [/^\/api\/hiyari-reports/,            'settings.hiyari|settings.study-sessions'],
  [/^\/api\/hiyari-poster/,             'settings.hiyari|settings.study-sessions'],
  [/^\/api\/surveys/,                   'settings.surveys|settings.study-sessions'],
  [/^\/api\/daihon/,                    'settings.daihon|settings.study-sessions'],
  [/^\/api\/chosei/,                    'settings.chosei'],
  [/^\/api\/kancho-wish-settings/,      'settings.kancho-wish'],
  [/^\/api\/kancho-roster/,             'settings.kancho-roster'],
  [/^\/api\/announcement-bar/,          'settings.announcement-bar'],
  [/^\/api\/birthday/,                  'settings.birthday'],
  // 各ページ
  [/^\/daihon(\/|$)/, 'settings.daihon|settings.study-sessions'],
  [/^\/kancho-shift/, 'kancho-shift'],
  [/^\/api\/kancho/,  'kancho-shift'],
  [/^\/kanri-kobo/,     'kanri-kobo'],
  [/^\/api\/kanri-kobo/, 'kanri-kobo'],
  [/^\/handover/,     'handover'],
  [/^\/api\/handover/, 'handover'],
  [/^\/tenko/,        'tenko'],
  [/^\/api\/tenko/,   'tenko'],
  [/^\/tantosha/,     'tantosha'],
  [/^\/api\/tantosha/, 'tantosha'],
  [/^\/todo/,         'todo'],
  [/^\/api\/todo/,    'todo'],
  [/^\/crew-portal/,  'crew-portal'],
  [/^\/crew-shift/,        'crew-shift'],
  [/^\/attendance-board/,     'crew-shift'],
  [/^\/api\/attendance-board/, 'crew-shift'],
  [/^\/summer-report/,     'crew-shift'],
  [/^\/api\/crew-shift/,   'crew-shift'],
  [/^\/api\/summer-report/, 'crew-shift'],
  [/^\/utilization-report/,      'crew-shift'],
  [/^\/api\/utilization-report/, 'crew-shift'],
  [/^\/dispatch-board/,     'crew-shift'],
  [/^\/vehicle-rotation/,   'crew-shift'],
  [/^\/api\/dispatch/,      'crew-shift'],
  [/^\/shift/,        'shift'],
  [/^\/newcomers/,    'newcomers'],
  [/^\/employees/,    'newcomers'],
  [/^\/followup/,     'newcomers'],
  [/^\/interviews/,   'newcomers'],
  [/^\/staff/,        'staff'],
  // 課長ミッションは専用キー kacho-mission。社員管理(staff)の権限でも従来どおり利用可
  [/^\/kacho-mission/, 'kacho-mission|staff'],
  [/^\/api\/kacho-mission/, 'kacho-mission|staff'],
  [/^\/face-auth/,      'face-auth'],
  [/^\/api\/face-auth/, 'face-auth'],
  [/^\/sales-ai/,     'sales-ai'],
  [/^\/sales/,        'staff'],
  [/^\/vehicles/,     'vehicles'],
  // 車庫見取り図（/garage・/api/garage）は「便利」ハブ配下に移動し、index.ts で
  // ページ権限チェックを免除（閲覧は全アカウント共通・編集はルート側でフル権限判定）
  // デジタルサイネージ（/signage・/api/signage）も同様に index.ts で免除（投影は全アカウント・編集はフル権限のみ）
  [/^\/accidents/,       'accidents'],
  [/^\/api\/accidents/,  'accidents'],
  [/^\/inspection/,   'inspection'],
  [/^\/api\/vehicle-deadlines\/(meter|shaken|search-employees)/, 'inspection'],
  [/^\/announcements/, 'announcements'],
  [/^\/line/,         'line'],
  [/^\/requests/,     'requests'],
  [/^\/login-logs/,   'home'],
  [/^\/usage/,        'settings.line-usage'],
  [/^\/?$/,           'home'],
];

// permissions カラム（JSON文字列 or NULL）をパース。NULL・パース不能 = 全権限
export function parsePermissions(raw: string | null | undefined): string[] | null {
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr.map(String);
  } catch { /* 不正値は全権限扱いにせず空配列（安全側） */
    return [];
  }
  return [];
}

// 管理者IDから権限リストを取得（null = 全権限）
export async function getAdminPermissions(db: D1Database, adminId: number): Promise<string[] | null> {
  const row = await db.prepare('SELECT permissions FROM admins WHERE id = ?')
    .bind(adminId).first<{ permissions: string | null }>();
  return parsePermissions(row?.permissions);
}

// パスに必要な権限キーを返す（マッピング外のパスは null = 制限アカウントには拒否）
export function requiredPermissionKey(subPath: string): string | null {
  for (const [re, key] of PATH_PERMISSIONS) {
    if (re.test(subPath)) return key;
  }
  return null;
}

// ルートAPI（/{SECRET}/admin 配下ではない /api/...）の書き込みに必要な権限キー。
// GETは複数ページから参照されるため制限せず、データ変更（非GET）のみ .edit を要求する。
// 1つのAPIを複数ページが使う場合は、いずれかの .edit があれば許可。
const ROOT_API_WRITE_PERMISSIONS: Array<[RegExp, string[]]> = [
  [/^\/api\/line\/announcements/, ['announcements']],
  [/^\/api\/line\//,              ['line']],
  [/^\/api\/shift/,               ['shift']],
  [/^\/api\/instructor-schedule/, ['shift']],
  [/^\/api\/employees\/\d+\/newcomer/, ['newcomers.register']],
  [/^\/api\/employees/,           ['staff', 'newcomers', 'shift']],
  [/^\/api\/kacho-mission/,       ['kacho-mission', 'staff']],
  [/^\/api\/sales/,               ['staff']],
  [/^\/api\/info/,                ['newcomers']],
  [/^\/api\/interviews/,          ['newcomers']],
  [/^\/api\/schedule-types/,      ['settings.schedule-types']],
  [/^\/api\/dia/,                 ['settings.dia']],
  [/^\/api\/coaches/,             ['settings.coaches']],
  [/^\/api\/instructors/,         ['settings.instructors']],
  [/^\/api\/instructor-invite/,   ['settings.instructors']],
  [/^\/api\/period-settings/,     ['settings.periods']],
  [/^\/api\/wage-estimate-settings/, ['settings.wage-estimate']],
  [/^\/api\/driving-risk-settings/,  ['settings.driving-risk']],
  [/^\/api\/notifications/,       ['settings.notifications']],
  [/^\/api\/inspection/,          ['inspection']],
  [/^\/api\/vehicle-deadlines\/(meter|shaken)/, ['inspection']],
  [/^\/api\/documents/,           ['settings.documents']],
  [/^\/api\/study-notes/,         ['settings.study-notes']],
  [/^\/api\/line-reg/,            ['settings.liff']],
  [/^\/api\/requests/,            ['requests']],
];

// 制限アカウントによるルートAPIへの書き込みを判定（GET/HEAD/OPTIONSは常に許可）
// マッピングにないパスへの書き込みは安全側に倒して拒否
export function isRootApiWriteAllowed(perms: string[], path: string, method: string): boolean {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;
  for (const [re, keys] of ROOT_API_WRITE_PERMISSIONS) {
    if (re.test(path)) return keys.some(k => perms.includes(`${k}.edit`));
  }
  return false;
}

// 制限アカウントがアクセス可能か判定
// 非GETリクエスト（データ変更）には <key>.edit が必要
// キーが '|' 区切りの場合はいずれか1つでも条件を満たせば許可
export function isPathAllowed(perms: string[], subPath: string, method: string = 'GET'): boolean {
  const key = requiredPermissionKey(subPath);
  if (key === null) return false;
  const keys = key.split('|');
  if (!keys.some(k => perms.includes(k))) return false;
  const isRead = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
  return isRead || keys.some(k => perms.includes(`${k}.edit`));
}

// 権限設定UI用のカタログ（ツリー構造）。
//   key   … 権限キー。省略した節は「見出しグループ」で、そのチェックは配下の一括ON/OFFに使う
//   note  … 補足説明
//   viewOnly … 「編集」列を出さない（編集はフル権限アカウントのみ 等）
//   children … 子ノード（枝分かれ表示）
export type PermNode = {
  key?: string;
  label: string;
  note?: string;
  viewOnly?: boolean;
  children?: PermNode[];
};

export const PERMISSION_TREE: PermNode[] = [
  { label: 'サイドバー・主要ページ', children: [
    { key: 'home', label: 'ホーム' },
    { label: '報告センター', note: 'いずれか1つでも持てば入口を表示', children: [
      { key: 'settings.lost-items',      label: '忘れ物報告一覧' },
      { key: 'settings.accidents',       label: '事故報告一覧' },
      { key: 'settings.violations',      label: '違反報告一覧' },
      { key: 'settings.general-reports', label: '一般報告一覧' },
      { key: 'settings.handover-memos',  label: '引き継ぎメモ一覧' },
      { key: 'settings.violation-types', label: '違反種類・点数/反則金' },
    ]},
    { key: 'kancho-shift', label: '班長シフト' },
    { key: 'kanri-kobo',   label: '管理者公休表' },
    { key: 'handover',     label: '引き継ぎシート' },
    { key: 'tenko',        label: '点呼（仮眠室集合パワポ）' },
    { key: 'newcomers',    label: '総合新人管理', children: [
      { key: 'newcomers.register', label: '新人登録（新人フラグ・種別・新卒年度の設定）' },
    ]},
    { key: 'shift',        label: '新人シフト管理（研修スケジュール）' },
    { key: 'staff',        label: '社員管理（詳細検索・売上管理を含む）', children: [
      { key: 'kacho-mission', label: '課長ミッション', note: '社員管理(staff)の権限でも利用可' },
    ]},
    { key: 'settings.study-sessions', label: '板橋ページ', note: 'このキーだけで全タブ利用可。タブ単位で絞るときは下の子項目を使う', children: [
      { key: 'settings.office-opinions', label: 'ご意見版' },
      { key: 'settings.hiyari',          label: 'ヒヤリハット' },
      { key: 'settings.surveys',         label: 'アンケート' },
      { key: 'settings.daihon',          label: '台本（スライド＋台本デッキ）' },
    ]},
    { key: 'sales-ai',    label: 'AI売上分析' },
    { key: 'face-auth',   label: '顔認証（顔の登録・照合テスト）', note: 'セキュリティ機能の検証用。登録・削除は「編集」権限が必要（設定→顔認証で登録）' },
    { key: 'accidents',   label: '事故分析' },
    { key: 'vehicles',    label: '車両検索' },
    { key: 'inspection',  label: '点検管理（メーター検査・車検管理を含む）' },
    { key: 'announcements', label: 'お知らせ配信' },
    { key: 'line',        label: 'LINE管理' },
    { key: 'requests',    label: '要望欄（投稿）' },
    { key: 'crew-portal', label: '個人データ参照（日別明細・売上）' },
    { key: 'tantosha',    label: '担当車表' },
    { key: 'todo',        label: 'やることリスト' },
    { key: 'crew-shift',  label: '乗務員シフト・配車管理・夏季稼働' },
  ]},

  { label: '全アカウント共通だった機能（閲覧のON/OFF）', note: 'いずれも編集はフル権限アカウントのみ', children: [
    { key: 'benri',   label: '便利ハブ（距離控除・高速料金・空港定額 ほか）', viewOnly: true },
    { key: 'garage',  label: '車庫見取り図', viewOnly: true },
    { key: 'shuttle', label: 'シャトルバス', viewOnly: true },
    { key: 'signage', label: 'デジタルサイネージ', viewOnly: true },
    { key: 'cc-list', label: 'CC名簿', note: '別途、専用パスワードでも保護', viewOnly: true },
  ]},

  { label: '設定', children: [
    { key: 'settings',          label: '設定トップ' },
    { key: 'settings.accounts', label: 'アカウント権限管理', note: 'このページ。付与先に注意' },
    { key: 'settings.liff',     label: 'LINE連携（QR発行・連携ユーザー管理）' },
    { key: 'settings.line-usage', label: 'LINE利用状況（操作ログ）' },
    { key: 'settings.manual-mode', label: 'マニュアルモード（ショートカットバー）', note: '設定(settings)の権限でも利用可' },
    { key: 'settings.notifications', label: 'LINE通知設定' },
    { key: 'settings.offices',       label: '営業所' },
    { key: 'settings.announcement-bar', label: 'アナウンスバー' },
    { key: 'settings.birthday',         label: 'ハッピーバースデーモード' },
    { key: 'settings.chosei',           label: '調整（日程調整）' },
    { key: 'settings.documents',        label: 'データセンター（資料・社員CSV・点検写真AI・シフトPDF）' },
    { key: 'settings.study-notes',      label: '学習ノート（個人用ノート教材のページ保存・PDF出力）' },
    { key: 'settings.tutorial',         label: 'チュートリアル' },
    { key: 'settings.vehicle-search-guide', label: '車番検索ガイド' },
    { key: 'settings.status',           label: 'システムステータス' },
    { key: 'settings.wage-estimate',    label: '賃金試算設定' },
    { key: 'settings.driving-risk',     label: '運転リスク検証設定' },
    { label: 'シフト関連の設定', children: [
      { key: 'settings.schedule-types', label: 'シフト区分' },
      { key: 'settings.dia',            label: '勤務ダイヤ・サイクル' },
      { key: 'settings.coaches',        label: '研修担当' },
      { key: 'settings.instructors',    label: '班長・指導者' },
      { key: 'settings.periods',        label: '月度設定' },
      { key: 'settings.benten',         label: 'ベンテンクラブ シフト' },
    ]},
    { key: 'settings.kancho', label: '班長関連（ハブ）', children: [
      { key: 'settings.kancho-roster', label: '班長リスト（班長登録の解除のみ編集可）' },
      { key: 'settings.kancho-wish',   label: '希望休フォーム' },
      { key: 'settings.kancho-logic',  label: '班長シフト ロジック仕様（閲覧のみ）', viewOnly: true },
    ]},
  ]},
];

// ツリーをフラット化してキー一覧を得る（「すべて選択」等で使用）
export function flattenPermTree(nodes: PermNode[] = PERMISSION_TREE): Array<{ key: string; label: string; viewOnly: boolean }> {
  const out: Array<{ key: string; label: string; viewOnly: boolean }> = [];
  const walk = (ns: PermNode[]) => {
    for (const n of ns) {
      if (n.key) out.push({ key: n.key, label: n.label, viewOnly: !!n.viewOnly });
      if (n.children) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

// HTMLレスポンスから権限のないメニュー・設定カード・マニュアル章を除去
// layout.ts のナビ（data-nav-id）、設定トップのカードとチュートリアルの目次・章（data-perm-key、a/div/hr/button対応）が対象
// data-perm-key はスペース区切りで複数指定可（いずれか1つでも権限があれば表示）
export function filterHtmlByPermissions(res: Response, perms: string[]): Response {
  const remover = (attr: string) => ({
    element(el: Element) {
      const keys = (el.getAttribute(attr) ?? '').split(/\s+/).filter(Boolean);
      if (keys.length > 0 && !keys.some(k => perms.includes(k))) el.remove();
    }
  });
  return new HTMLRewriter()
    .on('a[data-nav-id]', remover('data-nav-id'))
    .on('a[data-perm-key]', remover('data-perm-key'))
    .on('div[data-perm-key]', remover('data-perm-key'))
    .on('hr[data-perm-key]', remover('data-perm-key'))
    .on('button[data-perm-key]', remover('data-perm-key'))
    .transform(res);
}
