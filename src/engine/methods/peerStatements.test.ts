import { describe, expect, it } from 'vitest';
import { peerStatementTable } from '@/engine/methods/peerStatements';
import type { PeriodReport, ReportDataset } from '@/engine/schema/types';
import { dataset as maotai } from '@/data/samples/liquor/600519';
import { dataset as wuliangye } from '@/data/samples/liquor/000858';
import { manufacturingSample } from '@/data/samples/manufacturing';

function mk(symbol: string, name: string, years: string[], mutate?: (i: number) => Partial<PeriodReport>): ReportDataset {
  const reports: PeriodReport[] = years.map((y, i) => ({
    period: `${y}-12-31`,
    sampling: 'Q4',
    balance: { total_assets: 1000 + i, inventories: 100 + i, accounts_receivable: 50 + i },
    income: { total_revenue: 500 + i, net_profit: 80 + i },
    cashflow: { net_cash_operating: 90 + i, cash_end: 300 + i, capex_cash: 20 + i },
    ...mutate?.(i),
  }));
  return { symbol, name, industry: 'liquor', periods: reports.map((r) => r.period), reports };
}

describe('三表横截面：期间对齐', () => {
  it('各家都有同一年 → 对齐到最新共同年份', () => {
    const a = mk('A', '甲', ['2022', '2023', '2024']);
    const b = mk('B', '乙', ['2023', '2024', '2025']);
    const t = peerStatementTable('balance', a, [b]);
    expect(t.aligned).toBe(true);
    expect(t.alignedYear).toBe('2024');
    expect(t.companies.map((c) => c.period)).toEqual(['2024-12-31', '2024-12-31']);
  });

  it('年份无交集 → 退回各自最新并标注未对齐（不拿 2025 比 2022）', () => {
    const a = mk('A', '甲', ['2020', '2021']);
    const b = mk('B', '乙', ['2024', '2025']);
    const t = peerStatementTable('balance', a, [b]);
    expect(t.aligned).toBe(false);
    expect(t.alignedYear).toBe('各自最新');
    expect(t.warnings.join()).toContain('没有交集');
  });

  it('align=false 时用各自最新期（显式选择，仍标注未对齐）', () => {
    const a = mk('A', '甲', ['2022', '2023', '2024', '2025']);
    const b = mk('B', '乙', ['2022', '2023']);
    const t = peerStatementTable('balance', a, [b], { align: false });
    expect(t.aligned).toBe(false);
    expect(t.companies.map((c) => c.period)).toEqual(['2025-12-31', '2023-12-31']);
  });

  it('只有本公司时也能出表（rank=1、中位数=自身）', () => {
    const a = mk('A', '甲', ['2023', '2024']);
    const t = peerStatementTable('balance', a, []);
    expect(t.companies.length).toBe(1);
    const ta = t.rows.find((r) => r.k === 'TA');
    expect(ta?.rank).toBe(1);
    expect(ta?.median).toBe(ta?.values[0]);
    expect(ta?.gap).toBe(0);
  });
});

describe('三表横截面：缺失传播', () => {
  it('某家该行缺值 → 不进中位数、不占排名', () => {
    const a = mk('A', '甲', ['2024']);
    // 乙缺存货（balances 里 inventories 为 null）
    const b = mk('B', '乙', ['2024'], () => ({ balance: { total_assets: 2000 } }));
    const t = peerStatementTable('balance', a, [b]);
    const inv = t.rows.find((r) => r.k === 'IO');
    expect(inv?.values[1]).toBeNull();
    expect(inv?.n).toBe(1); // 只有甲参与
    expect(inv?.median).toBe(inv?.values[0]);
    expect(inv?.rank).toBe(1);
  });

  it('缺值绝不按 0 拉低中位数', () => {
    const a = mk('A', '甲', ['2024']);
    const b = mk('B', '乙', ['2024'], () => ({ balance: { total_assets: 2000, inventories: null } }));
    const t = peerStatementTable('balance', a, [b]);
    const inv = t.rows.find((r) => r.k === 'IO');
    // 若按 0 参与，中位数会变成 (100+0)/2 = 50；实际应仍为 100
    expect(inv?.median).toBe(100);
  });

  it('本公司该行缺值 → rank 为 null（不冒充最后一名）', () => {
    const a = mk('A', '甲', ['2024'], () => ({ balance: { total_assets: 1000, inventories: null } }));
    const b = mk('B', '乙', ['2024']);
    const t = peerStatementTable('balance', a, [b]);
    const inv = t.rows.find((r) => r.k === 'IO');
    expect(inv?.values[0]).toBeNull();
    expect(inv?.rank).toBeNull();
    expect(inv?.gap).toBeNull();
    expect(inv?.outlier).toBe(false);
  });
});

describe('三表横截面：排名与偏离', () => {
  it('本公司最大 → rank=1；gap 为正', () => {
    const a = mk('A', '甲', ['2024'], () => ({ balance: { total_assets: 3000, inventories: 300 } }));
    const b = mk('B', '乙', ['2024'], () => ({ balance: { total_assets: 2000, inventories: 200 } }));
    const c = mk('C', '丙', ['2024'], () => ({ balance: { total_assets: 1000, inventories: 100 } }));
    const t = peerStatementTable('balance', a, [b, c]);
    const inv = t.rows.find((r) => r.k === 'IO');
    expect(inv?.rank).toBe(1);
    expect(inv?.median).toBe(200);
    expect(inv?.gap).toBeCloseTo(0.5, 6); // (300-200)/200
    expect(inv?.n).toBe(3);
  });

  it('本公司最小 → rank=3；gap 为负', () => {
    const a = mk('A', '甲', ['2024'], () => ({ balance: { total_assets: 1000, inventories: 100 } }));
    const b = mk('B', '乙', ['2024'], () => ({ balance: { total_assets: 2000, inventories: 200 } }));
    const c = mk('C', '丙', ['2024'], () => ({ balance: { total_assets: 3000, inventories: 300 } }));
    const t = peerStatementTable('balance', a, [b, c]);
    const inv = t.rows.find((r) => r.k === 'IO');
    expect(inv?.rank).toBe(3);
    expect(inv?.gap).toBeCloseTo(-0.5, 6);
  });

  it('outlier 阈值可调：默认 ±50%，收紧到 20% 会多标出异常', () => {
    const a = mk('A', '甲', ['2024'], () => ({ balance: { total_assets: 1000, inventories: 130 } }));
    const b = mk('B', '乙', ['2024'], () => ({ balance: { total_assets: 2000, inventories: 100 } }));
    const c = mk('C', '丙', ['2024'], () => ({ balance: { total_assets: 3000, inventories: 100 } }));
    // 三家时中位数 = 100，gap = (130−100)/100 = 0.3
    expect(peerStatementTable('balance', a, [b, c]).rows.find((r) => r.k === 'IO')?.outlier).toBe(false);
    expect(
      peerStatementTable('balance', a, [b, c], { outlierGap: 0.2 }).rows.find((r) => r.k === 'IO')?.outlier,
    ).toBe(true);
  });

  it('中位数为 0 → gap 为 null（不产生 Infinity）', () => {
    const a = mk('A', '甲', ['2024'], () => ({ balance: { total_assets: 1000, inventories: 50 } }));
    const b = mk('B', '乙', ['2024'], () => ({ balance: { total_assets: 2000, inventories: 0 } }));
    const c = mk('C', '丙', ['2024'], () => ({ balance: { total_assets: 3000, inventories: 0 } }));
    const inv = peerStatementTable('balance', a, [b, c]).rows.find((r) => r.k === 'IO');
    expect(inv?.median).toBe(0);
    expect(inv?.gap).toBeNull();
    expect(inv?.outlier).toBe(false);
  });
});

describe('三表横截面：共同比口径', () => {
  it('资产负债表共同比 = 科目 ÷ 总资产', () => {
    const a = mk('A', '甲', ['2024'], () => ({ balance: { total_assets: 1000, inventories: 250 } }));
    const t = peerStatementTable('balance', a, []);
    const inv = t.rows.find((r) => r.k === 'IO');
    expect(inv?.shares[0]).toBeCloseTo(0.25, 6);
  });

  it('现金流量表：流量项 ÷ 营收，期末现金 ÷ 总资产（CCF 走总资产口径）', () => {
    const a = mk('A', '甲', ['2024']);
    const t = peerStatementTable('cashflow', a, []);
    const cfo = t.rows.find((r) => r.k === 'NCFO');
    const ccf = t.rows.find((r) => r.k === 'CCF');
    expect(cfo?.shares[0]).toBeCloseTo(90 / 500, 6);
    expect(ccf?.shares[0]).toBeCloseTo(300 / 1000, 6);
  });

  it('比率行（pct）不参与共同比', () => {
    const a = mk('A', '甲', ['2024']);
    const t = peerStatementTable('income', a, []);
    const pctRows = t.rows.filter((r) => r.pct);
    expect(pctRows.length).toBeGreaterThan(0);
    expect(pctRows.every((r) => r.shares.every((s) => s == null))).toBe(true);
  });
});

describe('三表横截面：真实样本', () => {
  it('茅台 vs 五粮液：能对齐且有非空科目', () => {
    const t = peerStatementTable('income', maotai, [wuliangye]);
    expect(t.companies.map((c) => c.symbol)).toEqual(['600519', '000858']);
    expect(t.rows.length).toBeGreaterThan(5);
    const rev = t.rows.find((r) => r.k === 'RVE');
    expect(rev?.values[0]).not.toBeNull();
    expect(rev?.values[1]).not.toBeNull();
  });

  it('跨行业对照（白酒 vs 制造）仍出表，但会因年份不齐而标注', () => {
    const t = peerStatementTable('balance', maotai, [manufacturingSample]);
    expect(t.rows.length).toBeGreaterThan(5);
    // 制造样本年份与白酒样本不同，必须如实标注未对齐或给出共同年
    expect(typeof t.aligned).toBe('boolean');
    expect(t.alignedYear.length).toBeGreaterThan(0);
  });
});
