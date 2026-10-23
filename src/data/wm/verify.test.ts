import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyCredentialPair } from './verify';

// 只验证 OAuth 令牌交换：不查数据、不写 token 缓存，因此不产生 EC。

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('verifyCredentialPair', () => {
  it('空字段直接失败，不发请求', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await verifyCredentialPair({ clientId: ' ', clientSecret: '' });
    expect(res.ok).toBe(false);
    expect(res.message).toContain('完整');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('令牌交换成功 → 有效，且请求体是 client_credentials', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init });
        return jsonResponse({ access_token: 'tok-1', expires_in: 7200 });
      }),
    );
    const res = await verifyCredentialPair({
      clientId: '  cid  ',
      clientSecret: ' sec ',
      apiBase: 'https://api.test/',
    });
    expect(res.ok).toBe(true);
    expect(res.message).toContain('凭证有效');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.test/v1/oauth/token');
    const body = new URLSearchParams(String(calls[0].init?.body));
    expect(body.get('grant_type')).toBe('client_credentials');
    expect(body.get('client_id')).toBe('cid');
    expect(body.get('client_secret')).toBe('sec');
  });

  it('401 → 明确提示 AppId/Secret 无效', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'invalid_client' }, 401)));
    const res = await verifyCredentialPair({ clientId: 'cid', clientSecret: 'bad', apiBase: 'https://api.test' });
    expect(res.ok).toBe(false);
    expect(res.message).toContain('AppId 或 Secret 无效');
  });

  it('网络不可达 → 提示检查网络而不是抛英文异常', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    const res = await verifyCredentialPair({ clientId: 'cid', clientSecret: 'sec', apiBase: 'https://api.test' });
    expect(res.ok).toBe(false);
    expect(res.message).toContain('无法连接开放平台');
  });
});
