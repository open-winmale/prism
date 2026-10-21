import { describe, expect, it } from 'vitest';
import { deriveSingleQuarter, samplingOrder, singleQuarterReports, singleQuarterYoy, ttmFlowAt } from './quarter';
import type { PeriodReport } from './schema/types';

// 口径铁律：Q2/Q3/Q4 是「年初至今累计」，单季 = 本期累计 − 上期累计。
// 拿累计值冒充单季值是财报分析最常见的错误之一——同比/环比会全错。

function pr(period: string, sampling: 'Q1' | 'Q2' | 'Q3' | 'Q4', tr: number, npp: number, ta = 1000): PeriodReport {
  return {
    period,
    sampling,
    balance: { total_assets: ta },
    income: { total_revenue: tr, net_profit_parent: npp },
    cashflow: { net_cash_operating: tr * 0.9 },
  };
}

// 茅台 2025 真实口径（亿元）：Q1=514.4, 累计Q2=910.9, 累计Q3=1309.0, 累计Q4=1720.5
const REPORTS: PeriodReport[] = [
  pr('2024-12-31', 'Q4', 1741.4, 862.3),
  pr('2025-03-31', 'Q1', 514.4, 268.5),
  pr('2025-06-30', 'Q2', 910.9, 487.0),
  pr('2025-09-30', 'Q3', 1309.0, 670.3),
  pr('2025-12-31', 'Q4', 1720.5, 882.5),
];

describe('samplingOrder', () => {
  it('Q1..Q4 → 1..4', () => {
    expect(samplingOrder('Q1')).toBe(1);
    expect(samplingOrder('Q4')).toBe(4);
  });
});

describe('deriveSingleQuarter（DIFFQ_YTD 语义）', () => {
  it('Q1 原样返回（一季报本身就是单季）', () => {
    const sq = deriveSingleQuarter(REPORTS[1], null)!;
    expect(sq.income.total_revenue).toBe(514.4);
    expect(sq.balance.total_assets).toBe(1000); // 时点值原样
  });

  it('Q2 单季 = 累计Q2 − 累计Q1（910.9 − 514.4 = 396.5）', () => {
    const sq = deriveSingleQuarter(REPORTS[2], REPORTS[1])!;
    expect(sq.income.total_revenue).toBeCloseTo(396.5, 5);
    expect(sq.income.net_profit_parent).toBeCloseTo(218.5, 5);
  });

  it('Q4 单季 = 累计Q4 − 累计Q3（1720.5 − 1309.0 = 411.5）', () => {
    const sq = deriveSingleQuarter(REPORTS[4], REPORTS[3])!;
    expect(sq.income.total_revenue).toBeCloseTo(411.5, 5);
  });

  it('上期缺失 → null（绝不拿累计冒充单季）', () => {
    expect(deriveSingleQuarter(REPORTS[4], null)).toBeNull();
  });

  it('跨年「上期」→ null（Q4 与次年 Q1 无累计关系）', () => {
    // 用去年 Q4 当今年 Q2 的「上期」——年份不同必须拒绝
    expect(deriveSingleQuarter(REPORTS[2], REPORTS[0])).toBeNull();
  });

  it('上期采样不对（跳期）→ null', () => {
    // Q3 的上期应该是 Q2，给 Q1 要拒绝
    expect(deriveSingleQuarter(REPORTS[3], REPORTS[1])).toBeNull();
  });

  it('单季现金流同步差分', () => {
    const sq = deriveSingleQuarter(REPORTS[2], REPORTS[1])!;
    expect(sq.cashflow.net_cash_operating).toBeCloseTo((910.9 - 514.4) * 0.9, 5);
  });
});

describe('singleQuarterReports', () => {
  it('全部期次推导；首期 Q4 因缺 Q3 → null', () => {
    const sqs = singleQuarterReports(REPORTS);
    expect(sqs[0]).toBeNull(); // 2024-Q4 缺 2024-Q3
    expect(sqs[1]!.income.total_revenue).toBe(514.4);
    expect(sqs[2]!.income.total_revenue).toBeCloseTo(396.5, 5);
    expect(sqs[3]!.income.total_revenue).toBeCloseTo(398.1, 5);
    expect(sqs[4]!.income.total_revenue).toBeCloseTo(411.5, 5);
  });

  it('四季单季之和 = 年报累计（勾稽自洽）', () => {
    const sqs = singleQuarterReports(REPORTS).slice(1);
    const total = sqs.reduce((s, q) => s + (q!.income.total_revenue as number), 0);
    expect(total).toBeCloseTo(1720.5, 5);
  });
});

describe('ttmFlowAt', () => {
  it('2025-Q4 的 TTM = 2025 四个单季之和 = 年报值（1720.5）', () => {
    const ttm = ttmFlowAt(REPORTS, 4)!;
    expect(ttm).not.toBeNull();
    expect(ttm!.income.total_revenue).toBeCloseTo(1720.5, 5);
    expect(ttm!.balance.total_assets).toBe(1000); // 时点值取当期
  });

  it('2025-Q2 的 TTM：区间内有推不出的单季 → null（不猜）', () => {
    // 2024-Q4 单季缺 2024-Q3 → null，导致 2025-Q2 的 TTM 不可得
    expect(ttmFlowAt(REPORTS, 2)).toBeNull();
  });

  it('期次不足四季 → null', () => {
    expect(ttmFlowAt(REPORTS, 1)).toBeNull();
  });
});

describe('singleQuarterYoy', () => {
  it('2025-Q4 单季 vs 2024-Q4 单季', () => {
    // 2025Q4 单季 411.5；2024Q4 单季推不出 → null
    expect(singleQuarterYoy(411.5, null)).toBeNull();
    expect(singleQuarterYoy(411.5, 400)).toBeCloseTo(0.02875, 5);
  });

  it('上期为 0 / 负数的安全处理', () => {
    expect(singleQuarterYoy(100, 0)).toBeNull();
    // 负基数：100 / |−200| − 1 = −0.5（本期比负基数「少了 50%」的直观口径）
    expect(singleQuarterYoy(100, -200)).toBeCloseTo(-0.5, 5);
  });
});
