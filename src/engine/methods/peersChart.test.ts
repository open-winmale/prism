import { describe, expect, it } from 'vitest';
import {
  peerPercentileSpec,
  peerStats,
  peersScatter,
  quantile,
  rankOf,
  selfVsIndustrySpec,
  type PeerLike,
} from './peersChart';

function peer(symbol: string, pe: number | null, roe: number | null, pb = 3): PeerLike {
  return { symbol, name: `公司${symbol}`, pe_ttm: pe, roe_ttm: roe, pb };
}

const SAMPLE: PeerLike[] = [
  peer('1', 10, 0.1),
  peer('2', 20, 0.2),
  peer('3', 30, 0.3),
  peer('4', 40, 0.4),
  peer('5', 50, 0.5),
];

describe('同业散点 peersChart', () => {
  it('peersScatter：过滤 PE≤0 与缺失，保留可用样本', () => {
    const items = [...SAMPLE, peer('6', null, 0.6), peer('7', -5, 0.7)];
    const { spec, usable } = peersScatter(items, '1');
    expect(usable).toBe(5);
    expect(spec.points).toHaveLength(5);
    expect(spec.points?.every((p) => p.x > 0)).toBe(true);
  });

  it('peersScatter：当前公司进入高亮系列，其余为普通点', () => {
    const { spec } = peersScatter(SAMPLE, '3');
    const highlight = spec.points?.filter((p) => p.highlight) ?? [];
    expect(highlight).toHaveLength(1);
    expect(highlight[0].name).toBe('公司3');
  });

  it('peersScatter：中位数参考线（PE x 轴 + ROE y 轴）', () => {
    const { spec, stats } = peersScatter(SAMPLE, '1');
    expect(stats.medianPe).toBe(30);
    expect(stats.medianRoe).toBeCloseTo(0.3, 5);
    const axes = (spec.refLines ?? []).map((l) => l.axis);
    expect(axes).toContain('x');
    expect(axes).toContain('y');
  });

  it('peerStats：n 与中位数', () => {
    const stats = peerStats(SAMPLE);
    expect(stats.n).toBe(5);
    expect(stats.medianPe).toBe(30);
  });

  it('空样本：返回空散点而不是抛异常', () => {
    const { spec, usable } = peersScatter([], 'x');
    expect(usable).toBe(0);
    expect(spec.points).toHaveLength(0);
  });
});

describe('分位 rankOf / quantile', () => {
  it('rankOf：横截面分位，含自身', () => {
    expect(rankOf(30, [10, 20, 30, 40, 50])).toBeCloseTo(3 / 5, 5);
    expect(rankOf(50, [10, 20, 30, 40, 50])).toBe(1);
  });

  it('rankOf：null / 样本不足 → null', () => {
    expect(rankOf(null, [1, 2, 3])).toBeNull();
    expect(rankOf(5, [1])).toBeNull();
    expect(rankOf(undefined, [1, 2])).toBeNull();
  });

  it('quantile：当前值、分位、中位数齐全', () => {
    const q = quantile('PE', 20, [10, 20, 30, 40], (v) => `${v}x`);
    expect(q.value).toBe(20);
    expect(q.rank).toBeCloseTo(0.5, 5);
    expect(q.median).toBe(25);
    expect(q.display).toBe('20x');
  });

  it('quantile：值缺失 → display 为 —，rank null', () => {
    const q = quantile('PB', null, [1, 2, 3], (v) => `${v}`);
    expect(q.display).toBe('—');
    expect(q.rank).toBeNull();
  });
});

describe('散点换轴 / 横截面分位', () => {
  it('peersScatter 支持 PB vs ROE，轴标签随指标变化', () => {
    const { spec, xKey, yKey } = peersScatter(SAMPLE, '1', { xKey: 'pb', yKey: 'roe_ttm' });
    expect(xKey).toBe('pb');
    expect(yKey).toBe('roe_ttm');
    expect(spec.xLabel).toContain('PB');
    expect(spec.yLabel).toContain('ROE');
  });

  it('市值轴按亿元缩放（内部元 → 展示亿）', () => {
    const items: PeerLike[] = [{ symbol: '1', name: '甲', pe_ttm: 10, roe_ttm: 0.1, mv: 2e11 }];
    const { spec } = peersScatter(items, '1', { xKey: 'mv', yKey: 'pe_ttm' });
    expect(spec.points?.[0].x).toBe(2000);
  });

  it('peerPercentileSpec：当前公司 PE/ROE 分位 60%，50% 中位线', () => {
    const spec = peerPercentileSpec(SAMPLE, '3');
    expect(spec.type).toBe('horizontalBar');
    expect(spec.series?.[0].data).toHaveLength(4);
    expect(spec.series?.[0].data?.[0]).toBeCloseTo(60, 0);
    expect(spec.series?.[0].data?.[3]).toBeCloseTo(60, 0);
    expect(spec.refLines?.[0]).toMatchObject({ value: 50, axis: 'x', kind: 'median' });
  });

  it('selfVsIndustrySpec：自身 3 年分位与行业横截面分位并列', () => {
    const spec = selfVsIndustrySpec(
      { symbol: '3', pe_ttm: 30, pct_pe_3y: 0.2, pct_pb_3y: 0.4 },
      SAMPLE,
      '3',
    );
    expect(spec?.series).toHaveLength(2);
    expect(spec?.series?.[0].data).toEqual([20, 40]);
    expect(spec?.series?.[1].data?.[0]).toBeCloseTo(60, 0);
    expect(spec?.series?.[1].data?.[1]).toBeCloseTo(100, 0);
  });
});
