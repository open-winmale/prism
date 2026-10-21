import { describe, it, expect } from 'vitest';
import { computeDataset } from '../compute';
import type { AnalysisContext } from './define';
import { maotaiSample } from '../../data/samples/maotai';
import { manufacturingSample } from '../../data/samples/manufacturing';
import { runCashFlowQuality } from './cashFlowQuality';
import { flowTypeRows } from './cashFlowType';
import { runQualityCheck, qualityScoreOf } from './qualityCheck';
import { runCashConversionCycle } from './cashConversionCycle';
import { runProfitDrivers } from './profitDrivers';
import { seasonalityOf } from './seasonality';
import { mineChecks, mineVerdict } from './mineDetect';
import { dataset as maotaiReal } from '../../data/samples/liquor/600519';

function ctx(ds: typeof maotaiSample | typeof manufacturingSample): AnalysisContext {
  return {
    dataset: ds,
    computed: computeDataset(ds),
    industry: ds.industry,
    peerBench: ds.peerBench,
  };
}

describe('现金流质量 cashFlowQuality', () => {
  it('白酒样例：销售收现比应 ≥ 100%', () => {
    const r = runCashFlowQuality(ctx(maotaiSample));
    expect(r.blocks.length).toBeGreaterThan(0);
    const ratio = r.blocks[0].charts[0].series![0].data as (number | null)[];
    const last = ratio[ratio.length - 1]!;
    expect(last).toBeGreaterThanOrEqual(100);
  });

  it('两样例均能无异常运行', () => {
    expect(runCashFlowQuality(ctx(manufacturingSample)).blocks.length).toBeGreaterThan(0);
  });

  it('自由现金流按亿元展示（不是元）', () => {
    const r = runCashFlowQuality(ctx(maotaiSample));
    const block = r.blocks.find((b) => b.id === 'fcf')!;
    const values = block.charts[0].series![0].data as (number | null)[];
    const last = values[values.length - 1]!;
    expect(last).toBeGreaterThan(1);
    expect(last).toBeLessThan(5000);
  });
});

describe('盈利驱动 profitDrivers', () => {
  it('用标准化偏离判断主导驱动：茅台真实数据应为净利率，而非权益乘数', () => {
    const context: AnalysisContext = {
      dataset: maotaiReal,
      computed: computeDataset(maotaiReal),
      industry: 'liquor',
    };
    const r = runProfitDrivers(context);
    expect(r.blocks[0].title).toContain('净利率');
  });
});

describe('现金流八型 cashFlowType', () => {
  it('白酒样例：典型奶牛型（+--）——经营流入覆盖投资与筹资流出', () => {
    const rows = flowTypeRows(ctx(maotaiSample));
    const last = rows[rows.length - 1];
    expect(last.signature).toBe('+--');
    expect(last.type).toBe('奶牛型');
    expect(last.healthy).toBe('good');
  });

  it('制造排雷样例：落入高危型（赌徒型 --+，经营失血靠筹资续命）', () => {
    const rows = flowTypeRows(ctx(manufacturingSample));
    const last = rows[rows.length - 1];
    expect(last.signature).toBe('--+');
    expect(last.healthy).toBe('bad');
  });
});

describe('质量体检 qualityCheck', () => {
  it('白酒样例：质量分 ≥ 80（优秀）', () => {
    const q = qualityScoreOf(ctx(maotaiSample));
    expect(q.score).toBeGreaterThanOrEqual(80);
    expect(q.grade).toBe('优秀');
  });

  it('制造排雷样例：质量分 < 60', () => {
    const q = qualityScoreOf(ctx(manufacturingSample));
    expect(q.score).toBeLessThan(60);
  });

  it('runQualityCheck 两样例均能无异常运行', () => {
    expect(runQualityCheck(ctx(maotaiSample)).blocks.length).toBeGreaterThan(0);
    expect(runQualityCheck(ctx(manufacturingSample)).blocks.length).toBeGreaterThan(0);
  });
});

describe('现金转换周期 cashConversionCycle', () => {
  it('白酒样例：零应收不断链，CCC 可算出数值', () => {
    const r = runCashConversionCycle(ctx(maotaiSample));
    const ccc = r.blocks[0].charts[0].series![0].data as (number | null)[];
    const last = ccc[ccc.length - 1];
    expect(last).not.toBeNull();
    expect(typeof last).toBe('number');
  });

  it('白酒样例：零应收 → 应收周转天数=0（无占用）', () => {
    const r = runCashConversionCycle(ctx(maotaiSample));
    const comp = r.blocks[1].charts[0];
    const arDays = comp.series!.find((s) => s.name === '应收周转天数')!.data as (number | null)[];
    expect(arDays[arDays.length - 1]).toBe(0);
  });
});

describe('排雷档案 mineChecks（Hero 数据源）', () => {
  it('白酒样例：无高危触发，verdict=safe，全部有 why 解释（9 项老唐规则 + 白酒渠道信心 = 10 项）', () => {
    const checks = mineChecks(ctx(maotaiSample));
    expect(checks.length).toBe(10);
    expect(mineVerdict(checks)).toBe('safe');
    for (const c of checks) expect(c.why).toBeTruthy();
  });

  it('制造样例：verdict=danger，含高危触发项，触发项有 next 行动指引', () => {
    const checks = mineChecks(ctx(manufacturingSample));
    expect(mineVerdict(checks)).toBe('danger');
    const triggered = checks.filter((c) => c.status === 'triggered');
    expect(triggered.length).toBeGreaterThan(0);
    for (const c of triggered) {
      if (c.severity === 'high') expect(c.next).toBeTruthy();
    }
  });
});

describe('季节性 seasonalityOf（季度口径防二次差分）', () => {
  const quarterlyView = {
    ...maotaiReal,
    meta: { ...maotaiReal.meta, dataMode: 'quarterly' as const },
    // 单季视图：2025Q2 营收 = 140（不是累计 260）
    reports: [
      { period: '2024-12-31', sampling: 'Q4' as const, balance: {}, income: { total_revenue: 500, net_profit_parent: 220 }, cashflow: {} },
      { period: '2025-03-31', sampling: 'Q1' as const, balance: {}, income: { total_revenue: 120, net_profit_parent: 50 }, cashflow: {} },
      { period: '2025-06-30', sampling: 'Q2' as const, balance: {}, income: { total_revenue: 140, net_profit_parent: 60 }, cashflow: {} },
      { period: '2025-09-30', sampling: 'Q3' as const, balance: {}, income: { total_revenue: 160, net_profit_parent: 70 }, cashflow: {} },
      { period: '2025-12-31', sampling: 'Q4' as const, balance: {}, income: { total_revenue: 180, net_profit_parent: 80 }, cashflow: {} },
    ],
  };

  it('季度模式：直接取单季值，绝不再做一次 DIFFQ', () => {
    const context: AnalysisContext = {
      dataset: quarterlyView,
      computed: computeDataset(quarterlyView),
      industry: 'liquor',
    };
    const { points } = seasonalityOf(context);
    const q2 = points.find((p) => p.year === 2025 && p.q === 2)!;
    expect(q2.rev).toBe(140); // 二次差分会得到 20
  });

  it('年度模式：仍按 DIFFQ_YTD 推导（原行为不回退）', () => {
    const annual = { ...maotaiReal, meta: { ...maotaiReal.meta, dataMode: 'annual' as const } };
    const context: AnalysisContext = {
      dataset: annual,
      computed: computeDataset(annual),
      industry: 'liquor',
    };
    const { points } = seasonalityOf(context);
    // 年报-only 数据集推不出单季 → points 为空且 skipped 提示
    expect(points.length).toBe(0);
  });
});
