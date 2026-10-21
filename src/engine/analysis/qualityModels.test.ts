import { describe, expect, it } from 'vitest';
import {
  altmanZ,
  computeDataset,
  growthCapitalOf,
  piotroskiF,
  runQualityModels,
  type AnalysisContext,
} from '@/engine';
import { dataset } from '@/data/samples/liquor/600519';

const ctx: AnalysisContext = {
  dataset,
  computed: computeDataset(dataset),
  industry: 'liquor',
  // 2026-10-21 实测 card：总市值 1.637e12 元，股息率 3.97%
  marketValue: 1637219372013.69,
  dividendYield: 0.03968972,
};

describe('质量模型 qualityModels', () => {
  it('茅台真实数据：Altman Z 在安全区', () => {
    const result = altmanZ(ctx);
    expect(result.z).not.toBeNull();
    expect(result.z!).toBeGreaterThan(2.99);
    expect(result.zone).toBe('safe');
  });

  it('缺市值时 Altman 明确数据不足，不用账面权益硬凑', () => {
    const result = altmanZ({ ...ctx, marketValue: null });
    expect(result.z).toBeNull();
    expect(result.missing).toContain('总市值');
  });

  it('茅台真实数据：Piotroski 九项都有数据', () => {
    const result = piotroskiF(ctx);
    expect(result).not.toBeNull();
    expect(result!.checked).toBe(9);
    expect(result!.items).toHaveLength(9);
    expect(result!.score).toBeGreaterThanOrEqual(0);
    expect(result!.score).toBeLessThanOrEqual(result!.checked);
  });

  it('茅台真实数据：ROIC 高于 5% WACC，SGR 可算', () => {
    const result = growthCapitalOf(ctx);
    expect(result.roic).not.toBeNull();
    expect(result.roic!).toBeGreaterThan(0.05);
    expect(result.spread!).toBeGreaterThan(0);
    expect(result.sgr).not.toBeNull();
  });

  it('runQualityModels 产出 Altman / Piotroski / 增长回报三块', () => {
    const result = runQualityModels(ctx);
    expect(result.blocks.map((b) => b.id)).toEqual(['altman', 'piotroski', 'growth_capital']);
  });
});
