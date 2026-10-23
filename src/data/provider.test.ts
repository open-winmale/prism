import { describe, expect, it } from 'vitest';
import { servesBuiltinSnapshot } from './provider';

describe('servesBuiltinSnapshot', () => {
  it('内置样本年度口径默认走快照（0 EC）', () => {
    expect(servesBuiltinSnapshot('600519', 'annual')).toBe(true);
    expect(servesBuiltinSnapshot('600519', undefined)).toBe(true);
    expect(servesBuiltinSnapshot('DEMO-000001', 'annual')).toBe(true);
  });

  it('私有 AppId 显式拉实时时绕过快照', () => {
    expect(servesBuiltinSnapshot('600519', 'annual', true)).toBe(false);
  });

  it('季度口径与非内置样本不走快照', () => {
    expect(servesBuiltinSnapshot('600519', 'quarterly')).toBe(false);
    expect(servesBuiltinSnapshot('000001', 'annual')).toBe(false);
  });
});
