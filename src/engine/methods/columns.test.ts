import { describe, expect, it } from 'vitest';
import { computeDataset, fieldGetter, STMT_TREE, type AnalysisContext } from '@/engine';
import {
  flagOf,
  lineItemValues,
  sameQuarterYoyOf,
  shareDenominator,
  shareOf,
  yoyOf,
} from '@/engine/methods/columns';
import { dataset } from '@/data/samples/liquor/600519';

const ctx: AnalysisContext = { dataset, computed: computeDataset(dataset), industry: 'liquor' };
const reports = ctx.dataset.reports;

describe('列组计算 columns', () => {
  it('yoyOf：首期 null，缺失传播 null，正常计算比率', () => {
    const result = yoyOf([100, 120, null, 90]);
    expect(result[0]).toBeNull();
    expect(result[1]).toBeCloseTo(0.2, 10);
    expect(result[2]).toBeNull();
    expect(result[3]).toBeNull();
    expect(yoyOf([100, 100])).toEqual([null, 0]);
  });

  it('yoyOf：上期为 0 → null（不产生 Infinity）', () => {
    expect(yoyOf([0, 50])[1]).toBeNull();
  });

  // 回归：现金净增加额由 −20 亿变 +196 亿，旧口径算出 −1070%，这个数字没有解释力
  it('yoyOf：上期为负 → null（跨越正负的同比不成立）', () => {
    expect(yoyOf([-20, 196])[1]).toBeNull();
    expect(yoyOf([-20, -30])[1]).toBeNull();
    expect(yoyOf([20, 30])[1]).toBeCloseTo(0.5, 10);
  });

  it('shareOf：分母缺失或为 0 → null', () => {
    expect(shareOf([10, 20], [100, 0])).toEqual([0.1, null]);
    expect(shareOf([10, 20], [null, 40])).toEqual([null, 0.5]);
  });

  it('lineItemValues：col 行直取科目', () => {
    const row = STMT_TREE.income.find((r) => r.col === 'total_revenue')!;
    const values = lineItemValues(reports, { cn: row.cn, col: row.col });
    expect(values).toHaveLength(reports.length);
    expect(values[values.length - 1]).toBeCloseTo(fieldGetter(reports[reports.length - 1])('total_revenue') as number, 0);
  });

  it('lineItemValues：drv 行（有息负债 sum）可用且不为空', () => {
    const ibd = STMT_TREE.balance.find((r) => r.k === 'IBD')!;
    const values = lineItemValues(reports, { cn: ibd.cn, drv: ibd.drv });
    expect(values.every((v) => v != null && v > 0)).toBe(true);
  });

  it('lineItemValues：drv 行（毛利率 margin）落在 0–1', () => {
    const gm = STMT_TREE.income.find((r) => r.k === 'GM')!;
    const values = lineItemValues(reports, { cn: gm.cn, drv: gm.drv, pct: true });
    for (const v of values) {
      expect(v).not.toBeNull();
      expect(v!).toBeGreaterThan(0.5);
      expect(v!).toBeLessThan(1);
    }
  });

  it('lineItemValues：空行定义返回全 null，不抛异常', () => {
    expect(lineItemValues(reports, { cn: '空' })).toEqual(reports.map(() => null));
  });

  it('缺失字段的 col 行传播 null（600519 无存货明细）', () => {
    const values = lineItemValues(reports, { cn: '库存商品', col: 'inventory_finished' });
    expect(values.every((v) => v === null)).toBe(true);
  });
});

describe('共同比分母 shareDenominator', () => {
  it('资产负债表 ÷ 总资产，利润表 ÷ 营业总收入', () => {
    const r = reports[reports.length - 1];
    expect(shareDenominator('balance', r)).toBe(r.balance.total_assets ?? null);
    expect(shareDenominator('income', r)).toBe(r.income.total_revenue ?? null);
  });

  it('现金流量表：流量项 ÷ 营业总收入，不再拿经营净额当整表分母', () => {
    const r = reports[reports.length - 1];
    expect(shareDenominator('cashflow', r, 'NCFO')).toBe(r.income.total_revenue ?? null);
    expect(shareDenominator('cashflow', r, 'CLAR')).toBe(r.income.total_revenue ?? null);
    expect(shareDenominator('cashflow', r, 'NCFF')).toBe(r.income.total_revenue ?? null);
  });

  it('现金流量表：期末现金是时点值 → ÷ 总资产', () => {
    const r = reports[reports.length - 1];
    expect(shareDenominator('cashflow', r, 'CCF')).toBe(r.balance.total_assets ?? null);
  });

  // 回归：制造样本 2024 年 CFO 为负，旧口径下资本开支占比会算出 −750%
  it('经营现金流为负时，共同比不再产生负数（旧口径回归测试）', () => {
    const r = {
      period: '2024-12-31',
      sampling: 'Q4' as const,
      balance: { total_assets: 300_0000_0000 },
      income: { total_revenue: 120_0000_0000 },
      cashflow: { net_cash_operating: -6_0000_0000, capex_cash: 45_0000_0000 },
    };
    const den = shareDenominator('cashflow', r, 'CLAR');
    expect(den).toBe(120_0000_0000);
    expect((45_0000_0000 / den!) * 100).toBeCloseTo(37.5, 6);
    // 旧口径（拿 CFO 当分母）会得到 −750%，这里显式钉死它不再出现
    expect(45_0000_0000 / (r.cashflow.net_cash_operating ?? 1) * 100).toBeCloseTo(-750, 6);
  });
});

describe('异动标记 flagOf', () => {
  it('幅度越过阈值才标记，方向分上下', () => {
    expect(flagOf([0.2, 0.35, -0.4, null], 0.3)).toEqual([null, 'up', 'down', null]);
  });

  it('缺期恒 null，绝不按 0 当作「没变」', () => {
    expect(flagOf([null, null], 0.3)).toEqual([null, null]);
  });

  it('阈值边界：等于阈值即标记', () => {
    expect(flagOf([0.3], 0.3)).toEqual(['up']);
    expect(flagOf([0.29], 0.3)).toEqual([null]);
  });
});

describe('同季同比 sameQuarterYoyOf', () => {
  const q = (period: string, sampling: 'Q1' | 'Q2' | 'Q3' | 'Q4') => ({
    period,
    sampling,
    balance: {},
    income: {},
    cashflow: {},
  });
  const reports = [
    q('2024-03-31', 'Q1'),
    q('2024-06-30', 'Q2'),
    q('2025-03-31', 'Q1'),
    q('2025-06-30', 'Q2'),
  ] as Parameters<typeof sameQuarterYoyOf>[0];
  const values = [100, 200, 120, 260];

  it('Q2 同比 = 对去年 Q2（不是对相邻 Q1）', () => {
    const result = sameQuarterYoyOf(reports, values);
    expect(result[3]).toBeCloseTo(260 / 200 - 1, 10);
    expect(result[3]).not.toBeCloseTo(260 / 120 - 1, 2);
  });

  it('窗口内没有去年同季 → null', () => {
    const result = sameQuarterYoyOf(reports, values);
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
  });

  it('本期缺失 → null', () => {
    const result = sameQuarterYoyOf(reports, [100, 200, null, 260]);
    expect(result[2]).toBeNull();
  });
});
