// アカウント別ページ権限
// admins.permissions が NULL のアカウントは全ページアクセス可（従来通り）。
// JSON配列（例: ["home","staff","settings","settings.offices"]）を持つアカウントは
// 許可されたページのみ表示・アクセスできる。
//
// 閲覧/編集の分離（migration_031〜）:
//   キー "X" は閲覧（GET）のみ。データ変更（非GETリクエスト）には "X.edit" が必要。
//   migration_031 で既存の制限付きアカウントには全キーの .edit を付与済み。

// 権限キー一覧
//   サイドバー: home / shift / newcomers / staff / staff-search / events /
//               vehicles / inspection / manual-chat / settings / announcements / line
//   設定カード: settings.liff / settings.lost-items / settings.accidents /
//               settings.violations / settings.violation-types /
//               settings.general-reports /
//               settings.benten / settings.schedule-types / settings.dia / settings.coaches /
//               settings.instructors / settings.periods / settings.notifications /
//               settings.offices / settings.vehicle-search-guide /
//               settings.tutorial / settings.status

// 管理画面パス（/{SECRET}/admin 以降）→ 必要権限キー。先頭一致で最初にマッチした行を採用
const PATH_PERMISSIONS: Array<[RegExp, string]> = [
  // 設定サブページ
  [/^\/settings\/accounts/,             'settings.accounts'],
  [/^\/settings\/liff/,                 'settings.liff'],
  [/^\/settings\/lost-items/,           'settings.lost-items'],
  [/^\/settings\/accidents/,            'settings.accidents'],
  [/^\/settings\/violation-types/,      'settings.violation-types'],
  [/^\/settings\/violations/,           'settings.violations'],
  [/^\/settings\/general-reports/,      'settings.general-reports'],
  [/^\/settings\/benten/,               'settings.benten'],
  [/^\/settings\/schedule-types/,       'settings.schedule-types'],
  [/^\/settings\/dia/,                  'settings.dia'],
  [/^\/settings\/coaches/,              'settings.coaches'],
  [/^\/settings\/instructors/,          'settings.instructors'],
  [/^\/settings\/periods/,              'settings.periods'],
  [/^\/settings\/notifications/,        'settings.notifications'],
  [/^\/settings\/offices/,              'settings.offices'],
  [/^\/settings\/vehicle-search-guide/, 'settings.vehicle-search-guide'],
  [/^\/settings\/tutorial/,             'settings.tutorial'],
  [/^\/settings\/status/,               'settings.status'],
  [/^\/settings/,                       'settings'],
  // 設定配下のAPI
  [/^\/api\/accounts/,                  'settings.accounts'],
  [/^\/api\/offices/,                   'settings.offices'],
  [/^\/api\/benten/,                    'settings.benten'],
  [/^\/api\/liff-users/,                'settings.liff'],
  [/^\/api\/liff\/lost-items/,          'settings.lost-items'],
  [/^\/api\/liff\/accident-reports/,    'settings.accidents'],
  [/^\/api\/liff\/violation-reports/,   'settings.violations'],
  [/^\/api\/liff\/general-reports/,     'settings.general-reports'],
  [/^\/api\/violation-types/,           'settings.violation-types'],
  // 各ページ
  [/^\/kancho-shift/, 'kancho-shift'],
  [/^\/api\/kancho/,  'kancho-shift'],
  [/^\/tantosha/,     'tantosha'],
  [/^\/api\/tantosha/, 'tantosha'],
  [/^\/shift/,        'shift'],
  [/^\/newcomers/,    'newcomers'],
  [/^\/employees/,    'newcomers'],
  [/^\/followup/,     'newcomers'],
  [/^\/interviews/,   'newcomers'],
  [/^\/info/,         'newcomers'],
  [/^\/staff\/search/, 'staff-search'],
  [/^\/staff/,        'staff'],
  [/^\/sales/,        'staff'],
  [/^\/events/,       'events'],
  [/^\/vehicles/,     'vehicles'],
  [/^\/inspection/,   'inspection'],
  [/^\/manual-chat/,  'manual-chat'],
  [/^\/announcements/, 'announcements'],
  [/^\/line/,         'line'],
  [/^\/login-logs/,   'home'],
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
  [/^\/api\/employees/,           ['staff', 'newcomers', 'shift']],
  [/^\/api\/sales/,               ['staff']],
  [/^\/api\/info/,                ['newcomers']],
  [/^\/api\/events/,              ['events']],
  [/^\/api\/interviews/,          ['newcomers']],
  [/^\/api\/schedule-types/,      ['settings.schedule-types']],
  [/^\/api\/dia/,                 ['settings.dia']],
  [/^\/api\/coaches/,             ['settings.coaches']],
  [/^\/api\/instructors/,         ['settings.instructors']],
  [/^\/api\/instructor-invite/,   ['settings.instructors']],
  [/^\/api\/period-settings/,     ['settings.periods']],
  [/^\/api\/notifications/,       ['settings.notifications']],
  [/^\/api\/inspection/,          ['inspection']],
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
export function isPathAllowed(perms: string[], subPath: string, method: string = 'GET'): boolean {
  const key = requiredPermissionKey(subPath);
  if (key === null || !perms.includes(key)) return false;
  const isRead = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
  return isRead || perms.includes(`${key}.edit`);
}

// 権限設定UI用のカタログ（キー・表示名）。各キーに閲覧/編集のチェックを持つ
export const PERMISSION_CATALOG: Array<{ group: string; items: Array<{ key: string; label: string }> }> = [
  { group: 'ページ', items: [
    { key: 'home',          label: 'ホーム' },
    { key: 'shift',         label: '新人シフト管理' },
    { key: 'kancho-shift',  label: '班長シフト' },
    { key: 'tantosha',      label: '担当車表' },
    { key: 'newcomers',     label: '総合新人管理' },
    { key: 'staff',         label: '社員管理' },
    { key: 'staff-search',  label: '社員絞り込み検索' },
    { key: 'events',        label: '報告一覧' },
    { key: 'vehicles',      label: '車両検索' },
    { key: 'inspection',    label: '点検管理' },
    { key: 'manual-chat',   label: 'マニュアルBot' },
    { key: 'announcements', label: 'お知らせ配信' },
    { key: 'line',          label: 'LINE管理' },
    { key: 'settings',      label: '設定（トップ）' },
  ]},
  { group: '設定サブページ', items: [
    { key: 'settings.accounts',             label: 'アカウント権限管理' },
    { key: 'settings.liff',                 label: 'LINEリフ権限管理' },
    { key: 'settings.lost-items',           label: '忘れ物報告一覧' },
    { key: 'settings.accidents',            label: '事故報告一覧' },
    { key: 'settings.violations',           label: '違反報告一覧' },
    { key: 'settings.general-reports',      label: '一般報告一覧' },
    { key: 'settings.violation-types',      label: '違反種類・点数/反則金' },
    { key: 'settings.benten',               label: 'ベンテンクラブ シフト' },
    { key: 'settings.schedule-types',       label: 'シフト区分' },
    { key: 'settings.dia',                  label: '勤務ダイヤ・サイクル' },
    { key: 'settings.coaches',              label: '研修担当' },
    { key: 'settings.instructors',          label: '班長・指導者' },
    { key: 'settings.periods',              label: '月度設定' },
    { key: 'settings.notifications',        label: 'LINE通知設定' },
    { key: 'settings.offices',              label: '営業所' },
    { key: 'settings.vehicle-search-guide', label: '車番検索ガイド' },
    { key: 'settings.tutorial',             label: 'チュートリアル' },
    { key: 'settings.status',               label: 'システムステータス' },
  ]},
];

// HTMLレスポンスから権限のないメニュー・設定カードを除去
// layout.ts のナビ（data-nav-id）と設定トップのカード（data-perm-key）が対象
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
    .transform(res);
}
