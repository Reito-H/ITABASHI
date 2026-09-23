import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

// 秘密パスは config.ts と同じ固定値（本番URLの外部公開はしていない）
const SECRET = 's7db8q6wys';
const BASE = `https://example.com/${SECRET}/admin`;
const REDIRECT_STATUSES = [301, 302, 303, 307, 308];

function jpRequest(url: string): Request {
  return new Request(url, { redirect: 'manual', headers: { 'CF-IPCountry': 'JP' } });
}

describe('シーズナル演出', () => {
  it('/settings/seasonal は未認証だとログインへリダイレクトされる（再発防止テスト）', async () => {
    const res = await SELF.fetch(jpRequest(`${BASE}/settings/seasonal`));
    expect(REDIRECT_STATUSES).toContain(res.status);
  });

  it('/api/seasonal/active はページ権限では止められず、誕生日の /api/birthday/active と同じ扱いを受ける（再発防止テスト）', async () => {
    // このAPIはADMIN_PATH配下ではなくルート /api/seasonal にマウントしており、
    // index.ts のページ権限ミドルウェア（settings.seasonal）の対象外になる設計（誕生日と同じ）。
    // ログインセッションなしでは requireAuth により両者とも同じステータスで弾かれるはずで、
    // 片方だけ403（権限不足）になっていないことを確認する。
    const [seasonalRes, birthdayRes] = await Promise.all([
      SELF.fetch(jpRequest('https://example.com/api/seasonal/active')),
      SELF.fetch(jpRequest('https://example.com/api/birthday/active')),
    ]);
    expect(seasonalRes.status).not.toBe(403);
    expect(seasonalRes.status).toBe(birthdayRes.status);
  });
});
