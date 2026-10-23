import { describe, expect, it } from 'vitest';
import { isDemoDisabled, loadCredentials, resolveCredentialTier, setDemoDisabled } from './credentials';

// 体验密钥层：四层优先级 + E2E 防雷标记。
// 不测 env 层与 demo 的相对顺序——import.meta.env 在本地（.env.local 有个人密钥）
// 与 CI（无凭证）结果不同，断言会不稳定；env>demo 由 resolveCredentialTier 的纯函数测试覆盖。

function kv(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe('resolveCredentialTier · 四层优先级', () => {
  const demo = { id: 'demo-id', secret: 'demo-secret' };

  it('user > env > demo > none', () => {
    expect(resolveCredentialTier({ user: { id: 'u', secret: 's' }, env: { id: 'e', secret: 's' }, demo }).source).toBe('user');
    expect(resolveCredentialTier({ env: { id: 'e', secret: 's' }, demo }).source).toBe('env');
    expect(resolveCredentialTier({ demo }).source).toBe('demo');
    expect(resolveCredentialTier({}).source).toBe('none');
  });

  it('空白凭证视为缺失（不产出半截状态）', () => {
    expect(resolveCredentialTier({ user: { id: '  ', secret: 's' }, demo }).source).toBe('demo');
    expect(resolveCredentialTier({ env: { id: 'e', secret: '' }, demo }).source).toBe('demo');
  });

  it('凭证做 trim', () => {
    const st = resolveCredentialTier({ user: { id: ' u ', secret: ' s ' } });
    expect(st.clientId).toBe('u');
    expect(st.clientSecret).toBe('s');
  });
});

describe('体验密钥防雷标记（E2E/CI 走快照路径）', () => {
  it('默认未停用；置 1 后识别，清除后恢复', () => {
    const s = kv();
    expect(isDemoDisabled(s)).toBe(false);
    setDemoDisabled(s, true);
    expect(isDemoDisabled(s)).toBe(true);
    setDemoDisabled(s, false);
    expect(isDemoDisabled(s)).toBe(false);
  });

  it('storage 抛错按未停用处理（不因隐私模式崩掉）', () => {
    const boom = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    expect(isDemoDisabled(boom)).toBe(false);
    expect(() => setDemoDisabled(boom, true)).not.toThrow();
  });
});

describe('loadCredentials · 用户自有密钥永远最高', () => {
  it('用户填写后 source=user（压过内置体验密钥与构建注入）', () => {
    const s = kv({ 'report-lens:wm-client-id': 'my-id', 'report-lens:wm-client-secret': 'my-secret' });
    expect(loadCredentials(s).source).toBe('user');
  });
});
