// LIFF共通ヘルパー（旧 benten.ts。ベンテンクラブシフト機能の廃止に伴い、
// 他機能からも使われている汎用部分だけを残して切り出した）
//   - todayJST: 配車・乗務員シフト等が利用
//   - bentenUidFromRequest: 各LIFFページのLINEログイン確認（トークンからLINE UIDを解決）
//   - loadBentenFont: PDF出力（勤務実績+売上PDF 等）で使う日本語TTFフォントの取得
import type { Env } from './auth';

export function todayJST(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
}

// LIFF認証（liff.ts と同方式）: Authorization: Bearer <アクセストークン> からLINE UIDを解決
export async function bentenUidFromRequest(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  const res = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = await res.json<{ userId?: string }>();
  return data.userId ?? null;
}

// PDF生成用フォント: R2の NotoSansJP-Regular.ttf → BENTEN_FONT_URL の順で取得
export async function loadBentenFont(env: Env): Promise<ArrayBuffer | null> {
  if (env.BENTEN_FONTS) {
    const obj = await env.BENTEN_FONTS.get('NotoSansJP-Regular.ttf');
    if (obj) return obj.arrayBuffer();
  }
  if (env.BENTEN_FONT_URL) {
    const cache = caches.default;
    const cacheKey = new Request(env.BENTEN_FONT_URL);
    let res = await cache.match(cacheKey);
    if (!res) {
      // リダイレクトするURL（github.com等）でも取得できるよう明示的にfollow
      res = await fetch(env.BENTEN_FONT_URL, { redirect: 'follow' });
      if (!res.ok) return null;
      try {
        const toCache = new Response(res.clone().body, { status: 200, headers: { 'Cache-Control': 'public, max-age=86400' } });
        await cache.put(cacheKey, toCache);
      } catch { /* キャッシュ失敗は無視（毎回fetchになるだけ） */ }
    }
    return res.arrayBuffer();
  }
  return null;
}
