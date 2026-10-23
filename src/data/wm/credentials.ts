import { DEFAULT_API_BASE, type WmCredentials } from './types';

// 凭证来源（优先级从高到低）：
//   1) 用户在「设置」里填写 → 存 localStorage（user）
//   2) 部署时注入的构建变量 VITE_WM_CLIENT_ID / VITE_WM_CLIENT_SECRET（env）
//      ⚠️ Vite 会把 VITE_* 变量打进前端产物，**任何访问该站点的人都能看到**。
//      仅适合私有部署 / 本地开发。
//   3) 内置体验密钥（demo）——作者决策（2026-10-22）：
//      新用户零注册即可查真实数据，缓解「AppId 劝退」流失。
//      代价：该密钥对所有人可见可提取，只配共享额度；provider 层对 demo
//      来源加最小调用间隔，且 24h 缓存优先。滥用/失效时改下面两个常量
//      重新部署即可轮换。E2E/CI 用 disable 标记跳过本层（快照路径 0 EC）。
//   4) 都没有 → 无凭证，走内置快照（snapshot 模式，0 EC）

const LS_ID = 'report-lens:wm-client-id';
const LS_SECRET = 'report-lens:wm-client-secret';
/** E2E/CI 防雷标记：置 '1' 跳过体验密钥层，保持无凭证快照路径（不烧共享配额） */
const LS_DISABLE_DEMO = 'report-lens:disable-demo-credential';

// 内置体验密钥做 XOR(0x5A)+Base64 可逆编码，避免在产物里明文可搜。
// ⚠️ 这是威慑不是安全：前端解码逻辑同样可见，决心足够的人仍能提取；
// 真正的防线是共享额度限量 + 服务端可随时轮换（更新下两串编码后重新部署）。
// 轮换方法：新 key 每字符 charCode ^ 0x5A 后转 base64 替换下方常量。
function reveal(encoded: string): string {
  const bin = atob(encoded);
  let out = '';
  for (let i = 0; i < bin.length; i++) out += String.fromCharCode(bin.charCodeAt(i) ^ 0x5a);
  return out;
}

const DEMO_CLIENT_ID = reveal('LTcFNSo/NAUjYzAsMjA0N25jMTZpPzZo');
const DEMO_CLIENT_SECRET = reveal('aT9ua2ljbjk+O284Yzg5Oz85P2toOW9jPjk+aGliaDhqb2k4OGxjamxuaW4/bGo8');

export type CredentialSource = 'user' | 'env' | 'demo' | 'none';

export interface CredentialState {
  clientId: string;
  clientSecret: string;
  source: CredentialSource;
}

interface Tier {
  id: string;
  secret: string;
}

/** 纯函数：四层优先级判定（user > env > demo > none），便于单测钉死 */
export function resolveCredentialTier(input: {
  user?: Tier | null;
  env?: Tier | null;
  demo?: Tier | null;
}): CredentialState {
  const t = (x?: Tier | null) => (x && x.id.trim() && x.secret.trim() ? x : null);
  const user = t(input.user);
  if (user) return { clientId: user.id.trim(), clientSecret: user.secret.trim(), source: 'user' };
  const env = t(input.env);
  if (env) return { clientId: env.id.trim(), clientSecret: env.secret.trim(), source: 'env' };
  const demo = t(input.demo);
  if (demo) return { clientId: demo.id.trim(), clientSecret: demo.secret.trim(), source: 'demo' };
  return { clientId: '', clientSecret: '', source: 'none' };
}

function envCredentials(): Tier {
  const clientId = (import.meta.env.VITE_WM_CLIENT_ID as string | undefined)?.trim() ?? '';
  const clientSecret = (import.meta.env.VITE_WM_CLIENT_SECRET as string | undefined)?.trim() ?? '';
  return { id: clientId, secret: clientSecret };
}

/** localStorage 最小接口（node 测试环境可注入 stub） */
interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

/** 体验密钥是否被显式关闭（E2E/CI 或用户主动停用） */
export function isDemoDisabled(storage: KV): boolean {
  try {
    return storage.getItem(LS_DISABLE_DEMO) === '1';
  } catch {
    return false;
  }
}

export function setDemoDisabled(storage: KV, disabled: boolean): void {
  try {
    if (disabled) storage.setItem(LS_DISABLE_DEMO, '1');
    else storage.removeItem(LS_DISABLE_DEMO);
  } catch {
    /* ignore */
  }
}

export function loadCredentials(storage: KV | Storage = typeof localStorage !== 'undefined' ? localStorage : undefined as unknown as KV): CredentialState {
  let id = '';
  let secret = '';
  try {
    id = storage.getItem(LS_ID)?.trim() ?? '';
    secret = storage.getItem(LS_SECRET)?.trim() ?? '';
  } catch {
    /* storage 不可用 */
  }
  return resolveCredentialTier({
    user: id && secret ? { id, secret } : null,
    env: envCredentials(),
    demo: isDemoDisabled(storage) ? null : { id: DEMO_CLIENT_ID, secret: DEMO_CLIENT_SECRET },
  });
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
