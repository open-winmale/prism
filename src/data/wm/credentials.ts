import { DEFAULT_API_BASE, type WmCredentials } from './types';

// 凭证来源（优先级从高到低）：
//   1) 用户在「设置」里填写 → 存 localStorage（user）
//   2) 部署时注入的构建变量 VITE_WM_CLIENT_ID / VITE_WM_CLIENT_SECRET（env）
//      ⚠️ Vite 会把 VITE_* 变量打进前端产物，**任何访问该站点的人都能看到**。
//      仅适合私有部署 / 本地开发；公开站点不要这么做。
//   3) 都没有 → 无凭证，走内置快照（snapshot 模式，0 EC）
//
// 公开站点（open-winmale.github.io）默认不内置任何 AppId：
// 想看任意标的，请在设置里填自己申请的 AppId（open.winmale.com 申请）。

const LS_ID = 'report-lens:wm-client-id';
const LS_SECRET = 'report-lens:wm-client-secret';

export type CredentialSource = 'user' | 'env' | 'none';

export interface CredentialState {
  clientId: string;
  clientSecret: string;
  source: CredentialSource;
}

function envCredentials(): { clientId: string; clientSecret: string } {
  const clientId = (import.meta.env.VITE_WM_CLIENT_ID as string | undefined)?.trim() ?? '';
  const clientSecret = (import.meta.env.VITE_WM_CLIENT_SECRET as string | undefined)?.trim() ?? '';
  return { clientId, clientSecret };
}

export function loadCredentials(): CredentialState {
  let id = '';
  let secret = '';
  try {
    id = localStorage.getItem(LS_ID)?.trim() ?? '';
    secret = localStorage.getItem(LS_SECRET)?.trim() ?? '';
  } catch {
    /* localStorage 不可用 */
  }
  if (id && secret) return { clientId: id, clientSecret: secret, source: 'user' };

  const env = envCredentials();
  if (env.clientId && env.clientSecret) return { ...env, source: 'env' };

  return { clientId: '', clientSecret: '', source: 'none' };
}

export function saveCredentials(clientId: string, clientSecret: string): void {
  try {
    localStorage.setItem(LS_ID, clientId.trim());
    localStorage.setItem(LS_SECRET, clientSecret.trim());
  } catch {
    /* ignore */
  }
}

export function clearCredentials(): void {
  try {
    localStorage.removeItem(LS_ID);
    localStorage.removeItem(LS_SECRET);
  } catch {
    /* ignore */
  }
}

export function toWmCredentials(state: CredentialState): WmCredentials | null {
  if (!state.clientId || !state.clientSecret) return null;
  const apiBase = (import.meta.env.VITE_WM_API_BASE as string | undefined)?.trim() || DEFAULT_API_BASE;
  return { clientId: state.clientId, clientSecret: state.clientSecret, apiBase };
}
