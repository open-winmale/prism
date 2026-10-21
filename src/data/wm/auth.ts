import { DEFAULT_API_BASE, type WmCredentials, type WmToken } from './types';

// OAuth 鉴权（对齐 ../skillhub/scripts/wm-skillhub/_wm_runtime.py 的 get_access_token）：
//   - grant_type=client_credentials，form-urlencoded 提交
//   - 响应 token 可能在顶层或 data 下，两者都兼容
//   - 缓存到过期前 120s 即视为失效（与 skillhub 的 _cache_valid 一致）
//   - expires_in 兜底 7200s，最小 60s

const REFRESH_MARGIN_MS = 120_000; // 提前 2 分钟续期
const DEFAULT_EXPIRES_IN = 7200;

const memoryCache = new Map<string, WmToken>();

function cacheKey(creds: WmCredentials): string {
  return `${creds.apiBase || DEFAULT_API_BASE}|${creds.clientId}`;
}

const LS_PREFIX = 'report-lens:wm-token:';

function readCache(key: string): WmToken | null {
  const hit = memoryCache.get(key);
  if (hit && hit.expiresAt > Date.now() + REFRESH_MARGIN_MS) return hit;
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WmToken;
    if (!parsed?.accessToken || typeof parsed.expiresAt !== 'number') return null;
    if (parsed.expiresAt <= Date.now() + REFRESH_MARGIN_MS) return null;
    memoryCache.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(key: string, token: WmToken): void {
  memoryCache.set(key, token);
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(token));
  } catch {
    /* localStorage 不可用（隐私模式/配额满）时仅用内存缓存 */
  }
}

/** 丢弃缓存令牌（换号或鉴权失败后调用） */
export function clearTokenCache(creds?: WmCredentials): void {
  if (!creds) {
    memoryCache.clear();
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith(LS_PREFIX))
        .forEach((k) => localStorage.removeItem(k));
    } catch {
      /* ignore */
    }
    return;
  }
  const key = cacheKey(creds);
  memoryCache.delete(key);
  try {
    localStorage.removeItem(LS_PREFIX + key);
  } catch {
    /* ignore */
  }
}

export class WmAuthError extends Error {
  constructor(
    message: string,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'WmAuthError';
  }
}

/** 用 client_credentials 换取访问令牌（不查缓存，直接请求） */
export async function requestToken(creds: WmCredentials, signal?: AbortSignal): Promise<WmToken> {
  if (!creds.clientId || !creds.clientSecret) {
    throw new WmAuthError('缺少 ClientId 或 ClientSecret');
  }
  const base = (creds.apiBase || DEFAULT_API_BASE).replace(/\/+$/, '');
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
  });
  const res = await fetch(`${base}/v1/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new WmAuthError(`换取令牌失败：HTTP ${res.status} ${text.slice(0, 120)}`, res.status);
  }
  let doc: Record<string, unknown>;
  try {
    doc = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new WmAuthError('换取令牌失败：响应不是合法 JSON');
  }
  const inner = (doc.data && typeof doc.data === 'object' ? doc.data : {}) as Record<string, unknown>;
  const token = String(doc.access_token ?? inner.access_token ?? '').trim();
  if (!token) {
    throw new WmAuthError('换取令牌失败：响应中没有 access_token');
  }
  const expiresIn = Math.max(60, Number(doc.expires_in ?? inner.expires_in ?? DEFAULT_EXPIRES_IN) || DEFAULT_EXPIRES_IN);
  return { accessToken: token, expiresAt: Date.now() + expiresIn * 1000 };
}

/** 带缓存取令牌；必要时自动续期 */
export async function getAccessToken(creds: WmCredentials, signal?: AbortSignal): Promise<string> {
  const key = cacheKey(creds);
  const cached = readCache(key);
  if (cached) return cached.accessToken;
  const token = await requestToken(creds, signal);
  writeCache(key, token);
  return token.accessToken;
}
