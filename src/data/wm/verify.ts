import { requestToken } from './auth';
import { describeError } from './client';

// 凭证有效性测试：只走 OAuth client_credentials 换取访问令牌，
// 不查询任何财报数据（0 EC），也不写令牌缓存。
// 失败原因统一收口到 describeError（401/403 → AppId/Secret 无效）。

export interface VerifyCredentialResult {
  ok: boolean;
  message: string;
}

export async function verifyCredentialPair(
  input: { clientId: string; clientSecret: string; apiBase?: string },
  signal?: AbortSignal,
): Promise<VerifyCredentialResult> {
  const clientId = input.clientId.trim();
  const clientSecret = input.clientSecret.trim();
  if (!clientId || !clientSecret) {
    return { ok: false, message: '请填写完整的 AppId（ClientId）与 Secret（ClientSecret）' };
  }
  try {
    await requestToken(
      {
        clientId,
        clientSecret,
        apiBase: input.apiBase?.trim() || undefined,
      },
      signal,
    );
    return { ok: true, message: '凭证有效：已换取访问令牌，本次验证不查询财报数据（0 EC）。' };
  } catch (e) {
    return { ok: false, message: describeError(e) };
  }
}
