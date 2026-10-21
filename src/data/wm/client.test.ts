import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WmClient, WmClientError, describeError } from './client';
import { clearTokenCache } from './auth';
import type { WmCredentials } from './types';

// 用 fetch 桩验证调用约定（与 ../skillhub 的 _wm_runtime.py 对齐）：
//   - OAuth 走 form-urlencoded 的 client_credentials
//   - 取数必须把参数包在 {"args":{...}} 里，顶层裸 action 会被拒（ARGS_REQUIRED）
//   - 业务错误在 X-Status 头或 body.error，不看 HTTP 状态码
//   - 401 清缓存后重试一次

const CREDS: WmCredentials = { clientId: 'cid', clientSecret: 'sec', apiBase: 'https://api.test' };

interface StubRequest {
  url: string;
  init?: RequestInit;
}

const calls: StubRequest[] = [];

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function stubFetch(handler: (req: StubRequest) => Response | Promise<Response>) {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return handler({ url: String(url), init });
  });
}

function okEnvelope(data: unknown, ec = 100) {
  return { success: true, data, meta: { metering: { 'analysis.ec_cost': ec } } };
}

beforeEach(() => {
  calls.length = 0;
  clearTokenCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function installFetch(handler: (req: StubRequest) => Response | Promise<Response>) {
  vi.stubGlobal('fetch', stubFetch(handler));
}

describe('鉴权', () => {
  it('用 form-urlencoded 提交 client_credentials', async () => {
    installFetch((req) => {
      if (req.url.endsWith('/v1/oauth/token')) {
        return jsonResponse({ access_token: 'tok-1', expires_in: 7200 });
      }
      return jsonResponse(okEnvelope({ ok: true }));
    });
    const client = new WmClient(CREDS);
    const res = await client.runSkill('wm-data', { action: 'finance' });

    const authCall = calls.find((c) => c.url.endsWith('/v1/oauth/token'))!;
    expect(authCall.init?.method).toBe('POST');
    expect(authCall.init?.headers).toMatchObject({
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    const body = new URLSearchParams(String(authCall.init?.body));
    expect(body.get('grant_type')).toBe('client_credentials');
    expect(body.get('client_id')).toBe('cid');
    expect(body.get('client_secret')).toBe('sec');
    expect(res.ok).toBe(true);
  });

  it('token 也兼容包在 data 下的响应', async () => {
    installFetch((req) => {
      if (req.url.endsWith('/v1/oauth/token')) {
        return jsonResponse({ data: { access_token: 'tok-inner', expires_in: 7200 } });
      }
      return jsonResponse(okEnvelope({ ok: true }));
    });
    const client = new WmClient(CREDS);
    await client.runSkill('wm-data', {});

    const dataCall = calls.find((c) => c.url.includes('/v1/skills/'))!;
    const authHeader = (dataCall.init!.headers as Record<string, string>).Authorization;
    expect(String(authHeader)).toBe('Bearer tok-inner');
  });

  it('缺少凭证时直接抛错，不发请求', async () => {
    installFetch(() => jsonResponse({ access_token: 'x' }));
    const client = new WmClient({ clientId: '', clientSecret: '' });
    await expect(client.runSkill('wm-data', {})).rejects.toThrow(/缺少 ClientId/);
  });
});

describe('runSkill 调用约定', () => {
  beforeEach(() => {
    installFetch((req) => {
      if (req.url.endsWith('/v1/oauth/token')) return jsonResponse({ access_token: 'tok', expires_in: 7200 });
      return jsonResponse(okEnvelope({ finance: { view: 'raw' } }, 1988));
    });
  });

  it('参数必须包在 {"args":{...}}（顶层裸 action 会被服务端拒绝）', async () => {
    const client = new WmClient(CREDS);
    await client.runSkill('wm-data', { action: 'finance', view: 'raw' });
    const call = calls.find((c) => c.url.includes('/v1/skills/'))!;
    expect(call.url).toBe('https://api.test/v1/skills/wm-data/run');
    expect(JSON.parse(String(call.init?.body))).toEqual({
      args: { action: 'finance', view: 'raw' },
    });
  });

  it('带上 Bearer 令牌', async () => {
    const client = new WmClient(CREDS);
    await client.runSkill('wm-data', {});
    const call = calls.find((c) => c.url.includes('/v1/skills/'))!;
    expect((call.init!.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('透出 EC 消耗', async () => {
    const client = new WmClient(CREDS);
    const res = await client.runSkill('wm-data', {});
    expect(res.ecCost).toBe(1988);
  });
});

describe('错误处理', () => {
  it('X-Status 非 0 → 判为失败', async () => {
    installFetch((req) => {
      if (req.url.endsWith('/v1/oauth/token')) return jsonResponse({ access_token: 'tok', expires_in: 7200 });
      return jsonResponse(
        { success: true, data: null },
        200,
        { 'X-Status': encodeURIComponent(JSON.stringify({ status: 6, message: '配额不足' })) },
      );
    });
    const client = new WmClient(CREDS);
    const res = await client.runSkill('wm-data', {});
    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe('X_STATUS_6');
    expect(res.error?.message).toBe('配额不足');
  });

  it('body.error.code 优先于 success 字段', async () => {
    installFetch((req) => {
      if (req.url.endsWith('/v1/oauth/token')) return jsonResponse({ access_token: 'tok', expires_in: 7200 });
      return jsonResponse({ success: true, data: null, error: { code: 'ARGS_REQUIRED', message: '参数要包 args' } });
    });
    const client = new WmClient(CREDS);
    const res = await client.runSkill('wm-data', {});
    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe('ARGS_REQUIRED');
  });

  it('401 → 清缓存后重试一次（第二次仍 401 则不再重试）', async () => {
    let tokenCalls = 0;
    let runCalls = 0;
    installFetch((req) => {
      if (req.url.endsWith('/v1/oauth/token')) {
        tokenCalls += 1;
        return jsonResponse({ access_token: `tok-${tokenCalls}`, expires_in: 7200 });
      }
      runCalls += 1;
      return jsonResponse({ success: false, data: null, error: { code: 'UNAUTHORIZED' } }, 401);
    });
    const client = new WmClient(CREDS);
    const res = await client.runSkill('wm-data', {});
    expect(res.ok).toBe(false);
    expect(runCalls).toBe(2); // 首次 + 重试一次
    expect(tokenCalls).toBe(2); // 重试前重新换取令牌
  });

  it('X-Status 无法解析时不误判为错误', async () => {
    installFetch((req) => {
      if (req.url.endsWith('/v1/oauth/token')) return jsonResponse({ access_token: 'tok', expires_in: 7200 });
      return jsonResponse(okEnvelope({ ok: true }), 200, { 'X-Status': 'not-json' });
    });
    const client = new WmClient(CREDS);
    expect((await client.runSkill('wm-data', {})).ok).toBe(true);
  });

  it('响应不是 JSON → BAD_JSON，不抛异常', async () => {
    installFetch((req) => {
      if (req.url.endsWith('/v1/oauth/token')) return jsonResponse({ access_token: 'tok', expires_in: 7200 });
      return new Response('<html>网关错误</html>', { status: 502 });
    });
    const client = new WmClient(CREDS);
    const res = await client.runSkill('wm-data', {});
    expect(res.error?.code).toBe('BAD_JSON');
  });
});

describe('discover', () => {
  it('返回 hits 数组', async () => {
    installFetch((req) => {
      if (req.url.endsWith('/v1/oauth/token')) return jsonResponse({ access_token: 'tok', expires_in: 7200 });
      return jsonResponse({ success: true, data: { hits: [{ domain: 'symbol', id: '600519', title: '贵州茅台' }] } });
    });
    const client = new WmClient(CREDS);
    const hits = await client.discover('茅台');
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe('600519');
    expect(calls.some((c) => c.url.endsWith('/v1/analysis/xs/discover'))).toBe(true);
  });
});

describe('describeError', () => {
  it('已知错误码给中文文案', () => {
    expect(describeError(new WmClientError('raw', 'ARGS_REQUIRED'))).toBe('请求参数格式错误');
    expect(describeError(new WmClientError('raw', 'EVAL_FAILED'))).toBe('接口执行失败，请稍后重试');
  });
  it('未知错误码回落到原始消息', () => {
    expect(describeError(new WmClientError('自定义错误', 'WHATEVER'))).toBe('自定义错误');
  });
  it('取消请求单独识别', () => {
    const e = new Error('canceled');
    e.name = 'AbortError';
    expect(describeError(e)).toBe('请求已取消');
  });
});
