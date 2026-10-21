import { describe, expect, it } from 'vitest';
import { computeDataset, fieldGetter, STMT_TREE, type AnalysisContext } from '@/engine';
import { lineItemValues, sameQuarterYoyOf, shareOf, yoyOf } from '@/engine/methods/columns';
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
