import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

// 秘密パスは config.ts と同じ固定値（本番URLの外部公開はしていない）
const SECRET = 's7db8q6wys';
const BASE = `https://example.com/${SECRET}/admin`;
const REDIRECT_STATUSES = [301, 302, 303, 307, 308];

function adminRequest(path: string): Request {
  return new Request(`${BASE}${path}`, {
    redirect: 'manual',
    headers: { 'CF-IPCountry': 'JP' },
  });
}

describe('管理画面の認証ゲート', () => {
  it('/login-logs は未認証だと閲覧できない（再発防止テスト）', async () => {
    const res = await SELF.fetch(adminRequest('/login-logs'));
    expect(res.status).not.toBe(200);
    expect(REDIRECT_STATUSES).toContain(res.status);
  });

  it('他の管理画面ページも未認証だとログインへリダイレクトされる', async () => {
    for (const path of ['/staff', '/settings']) {
      const res = await SELF.fetch(adminRequest(path));
      expect(REDIRECT_STATUSES).toContain(res.status);
    }
  });

  it('ログインページ自体は未認証でも表示できる', async () => {
    const res = await SELF.fetch(adminRequest('/login'));
    expect(res.status).toBe(200);
  });

  it('ログイン背景画像は未認証でも表示できる', async () => {
    const res = await SELF.fetch(adminRequest('/login-bg.jpg'));
    expect(res.status).toBe(200);
  });

  it('/logout はセッションなしでも認証ゲートでブロックされない', async () => {
    const res = await SELF.fetch(adminRequest('/logout'));
    expect(res.status).not.toBe(403);
  });
});
