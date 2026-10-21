import { clearTokenCache, getAccessToken, WmAuthError } from './auth';
import { DEFAULT_API_BASE, type DiscoverHit, type RawEnvelope, type SkillRunResult, type WmCredentials } from './types';

// 取数客户端：对齐 ../skillhub 的调用约定，并把服务端约定的细节收在一处：
//   - body 必须包装为 {"args":{...}}（顶层裸 action 会被拒：ARGS_REQUIRED）
//   - 业务错误不体现在 HTTP 状态码，而在响应头 X-Status（JSON，URL-encoded）或 body.error
//   - 401 视为令牌失效：清缓存后重试一次

export class WmClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'WmClientError';
  }
}

/** 解析 X-Status 响应头（URL-encoded JSON），非 0 视为业务错误 */
function parseXStatus(header: string | null): { status?: number; message?: string } | null {
  if (!header) return null;
  try {
    return JSON.parse(decodeURIComponent(header)) as { status?: number; message?: string };
  } catch {
    return null;
  }
}

function pickError(body: RawEnvelope, header: string | null, httpStatus: number): WmClientError | null {
  const xs = parseXStatus(header);
  if (xs && xs.status != null && xs.status !== 0) {
    return new WmClientError(xs.message || `接口返回状态 ${xs.status}`, `X_STATUS_${xs.status}`, httpStatus);
  }
  const be = body.error;
  if (be?.code) {
    return new WmClientError(be.message || be.code, be.code, httpStatus);
  }
  if (body.success === false) {
    return new WmClientError('接口调用失败（未提供错误码）', 'UNKNOWN', httpStatus);
  }
  return null;
}

export class WmClient {
  readonly base: string;

  constructor(private creds: WmCredentials) {
    this.base = (creds.apiBase || DEFAULT_API_BASE).replace(/\/+$/, '');
  }

  /** 执行一个 skill，返回 data（泛型由调用方声明）；自动处理令牌与 401 重试 */
  async runSkill<T = unknown>(skillId: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<SkillRunResult<T>> {
    const call = async (isRetry: boolean): Promise<SkillRunResult<T>> => {
      const token = await getAccessToken(this.creds, signal);
      const res = await fetch(`${this.base}/v1/skills/${encodeURIComponent(skillId)}/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ args }),
        signal,
      });

      if (res.status === 401 && !isRetry) {
        clearTokenCache(this.creds);
        return call(true);
      }

      const text = await res.text();
      let body: RawEnvelope<T> = {};
      if (text) {
        try {
          body = JSON.parse(text) as RawEnvelope<T>;
        } catch {
          return {
            ok: false,
            data: null,
            error: { code: 'BAD_JSON', message: `响应不是合法 JSON（HTTP ${res.status}）` },
          };
        }
      }

      const ecCost = body.meta?.metering?.['analysis.ec_cost'];
      const err = pickError(body as RawEnvelope, res.headers.get('X-Status'), res.status);
      if (err) {
        return { ok: false, data: null, error: { code: err.code, message: err.message }, ecCost };
      }
      return { ok: true, data: (body.data ?? null) as T | null, ecCost };
    };

    return call(false);
  }

  /** 标的/行业检索；只保留调用方关心的 domain */
  async discover(q: string, signal?: AbortSignal): Promise<DiscoverHit[]> {
    const token = await getAccessToken(this.creds, signal);
    const res = await fetch(`${this.base}/v1/analysis/xs/discover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ q }),
      signal,
    });
    if (!res.ok) {
      throw new WmClientError(`检索失败：HTTP ${res.status}`, 'HTTP_ERROR', res.status);
    }
    const body = (await res.json()) as RawEnvelope<{ hits?: DiscoverHit[] }>;
    return body.data?.hits ?? [];
  }
}

/** 把任意异常归一化为可读文案，便于 UI 直接展示 */
export function describeError(e: unknown): string {
  if (e instanceof WmAuthError) {
    if (e.httpStatus === 401 || e.httpStatus === 403) return 'AppId 或 Secret 无效，请检查后重试';
    return e.message || '鉴权失败';
  }
  if (e instanceof WmClientError) {
    const known: Record<string, string> = {
      ARGS_REQUIRED: '请求参数格式错误',
      SKILL_NOT_RUNNABLE: '该技能在开放平台下不可直接调用',
      EVAL_FAILED: '接口执行失败，请稍后重试',
      INPUT_INVALID: '输入参数不合法',
      BAD_JSON: '接口返回了非预期内容',
    };
    return known[e.code] || e.message || `接口错误（${e.code}）`;
  }
  if (e instanceof Error) {
    if (e.name === 'AbortError') return '请求已取消';
    return e.message || '未知错误';
  }
  return '未知错误';
}
