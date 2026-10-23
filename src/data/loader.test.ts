import { describe, expect, it } from 'vitest';
import { SAMPLES, getSample } from './loader';

describe('样板画廊数据', () => {
  it('4 个样本，每个都有画廊标签', () => {
    expect(SAMPLES).toHaveLength(4);
    for (const sample of SAMPLES) {
      expect(sample.meta?.galleryTag?.length).toBeGreaterThan(0);
    }
  });

  it('制造样板明确标注演示，不伪装真实公司', () => {
    const demo = SAMPLES.find((sample) => sample.symbol.startsWith('DEMO-'));
    expect(demo).toBeDefined();
    expect(demo?.meta?.galleryTag).toContain('排雷');
    expect(demo?.disclaimer).toContain('演示');
  });

  it('getSample 能命中内置样本', () => {
    expect(getSample('600519')?.name).toBe('贵州茅台');
    expect(getSample('DEMO-000001')?.industry).toBe('manufacturing');
  });
});
