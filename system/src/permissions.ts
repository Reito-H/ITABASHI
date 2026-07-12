// アカウント別ページ権限
// admins.permissions が NULL のアカウントは全ページアクセス可（従来通り）。
// JSON配列（例: ["home","staff","settings","settings.offices"]）を持つアカウントは
// 許可されたページのみ表示・アクセスできる。

// 権限キー一覧
//   サイドバー: home / shift / newcomers / staff / staff-search / events /
//               vehicles / inspection / manual-chat / settings / announcements / line
//   設定カード: settings.liff / settings.lost-items / settings.accidents /
//               settings.benten / settings.schedule-types / settings.coaches /
//               settings.instructors / settings.periods / settings.notifications /
//               settings.offices / settings.vehicle-search-guide /
//               settings.tutorial / settings.status

// 管理画面パス（/{SECRET}/admin 以降）→ 必要権限キー。先頭一致で最初にマッチした行を採用
const PATH_PERMISSIONS: Array<[RegExp, string]> = [
  // 設定サブページ
  [/^\/settings\/liff/,                 'settings.liff'],
  [/^\/settings\/lost-items/,           'settings.lost-items'],
  [/^\/settings\/accidents/,            'settings.accidents'],
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
  [/^\/api\/offices/,                   'settings.offices'],
  [/^\/api\/benten/,                    'settings.benten'],
  [/^\/api\/liff-users/,                'settings.liff'],
  [/^\/api\/liff\/lost-items/,          'settings.lost-items'],
  [/^\/api\/liff\/accident-reports/,    'settings.accidents'],
  // 各ページ
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
export function isPathAllowed(perms: string[], subPath: string): boolean {
  const key = requiredPermissionKey(subPath);
  return key !== null && perms.includes(key);
}

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
