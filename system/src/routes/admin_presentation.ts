// ホシコン発表資料（フル権限adminのみ・設定ページ配下のカードからアクセス）
// パス /presentation は permissions.ts の PATH_PERMISSIONS に載せない。
// これにより権限制限アカウント（permissionsがJSON配列のアカウント）はrequiredPermissionKey=null → 403となり、
// permissions=NULLのフル権限adminだけがアクセスできる（src/routes/admin_line_usage.tsと同じ設計）。
import { Hono } from 'hono';
import type { Env } from '../auth';
import { presentationPage } from '../html/presentation';

const app = new Hono<{ Bindings: Env }>();

app.get('/presentation', (c) => c.html(presentationPage()));

export default app;
