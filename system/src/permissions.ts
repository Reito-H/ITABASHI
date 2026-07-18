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
//               settings.benten / settings.schedule-types / settings.coaches /
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
  [/^\/settings\/benten/,               'settings.benten'],
  [/^\/settings\/schedule-types/,       'settings.schedule-types'],
  [/^\/settings\/legacy/,               'settings.schedule-types'],
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
  [/^\/api\/violation-types/,           'settings.violation-types'],
  // 各ページ
  [/^\/kancho-shift/, 'kancho-shift'],
  [/^\/api\/kancho/,  'kancho-shift'],
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
    { key: 'settings.violation-types',      label: '違反種類・点数/反則金' },
    { key: 'settings.benten',               label: 'ベンテンクラブ シフト' },
    { key: 'settings.schedule-types',       label: 'シフト区分' },
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
export function filterHtmlByPermissions(res: Response, perms: string[]): Response {
  const remover = (attr: string) => ({
    element(el: Element) {
      const key = el.getAttribute(attr);
      if (key && !perms.includes(key)) el.remove();
    }
  });
  return new HTMLRewriter()
    .on('a[data-nav-id]', remover('data-nav-id'))
    .on('a[data-perm-key]', remover('data-perm-key'))
    .transform(res);
}
