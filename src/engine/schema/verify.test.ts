// B1 数据模型 + 校验器单测（IMPLEMENTATION_PLAN.md §2.3 / §3.3）
import { describe, expect, it } from 'vitest';
import { computeDataset, verifyDataset, hasErrors, type ReportDataset } from '@/engine';
import { maotaiSample } from '@/data/samples/maotai';
import { manufacturingSample } from '@/data/samples/manufacturing';

describe('verifyDataset · 现有样例准入', () => {
  it('茅台样例 0 error', () => {
    const issues = verifyDataset(maotaiSample);
    expect(hasErrors(issues)).toBe(false);
  });
  it('制造样例 0 error', () => {
    const issues = verifyDataset(manufacturingSample);
    expect(hasErrors(issues)).toBe(false);
  });
});

describe('verifyDataset · 勾稽规则', () => {
  const base: ReportDataset = JSON.parse(JSON.stringify(maotaiSample));

  it('规则1：periods 与 reports 数量不一致 → error', () => {
    const ds = { ...base, periods: base.periods.slice(0, 3) };
    const issues = verifyDataset(ds);
    expect(issues.some((i) => i.level === 'error' && i.field === 'periods')).toBe(true);
  });

  it('规则1：periods 乱序 → error', () => {
    const periods = [...base.periods];
    [periods[0], periods[1]] = [periods[1], periods[0]];
    const ds = { ...base, periods };
    const issues = verifyDataset(ds);
    expect(issues.some((i) => i.level === 'error' && i.msg.includes('升序'))).toBe(true);
  });

  it('规则2：资产 ≠ 负债+权益（改大 2%）→ error', () => {
    const ds = {
      ...base,
      reports: base.reports.map((r, i) =>
        i === 4
          ? {
              ...r,
              balance: {
                ...r.balance,
                total_assets: (r.balance.total_assets as number) * 1.02,
                // 补上权益合计（真实年报必有；样例缺省时走归母兜底分支，容差 5%）
                total_equity: r.balance.total_equity ?? (r.balance.equity_parent as number),
              },
            }
          : r,
      ),
    };
    const issues = verifyDataset(ds);
    expect(issues.some((i) => i.level === 'error' && i.field === 'total_assets')).toBe(true);
  });

  it('规则2：仅有归母权益时 8% 偏差走兜底 → warn 不 error', () => {
    const ds = {
      ...base,
      reports: base.reports.map((r, i) => (i === 4 ? { ...r, balance: { ...r.balance, total_assets: (r.balance.total_assets as number) * 1.08 } } : r)),
    };
    const issues = verifyDataset(ds);
    expect(issues.some((i) => i.level === 'warn' && i.field === 'total_assets')).toBe(true);
    expect(issues.some((i) => i.level === 'error' && i.field === 'total_assets')).toBe(false);
  });

  it('规则6：字段量级疑似非元（填成亿元数值）→ warn', () => {
    const ds = { ...base, reports: base.reports.map((r, i) => (i === 2 ? { ...r, balance: { ...r.balance, monetary_funds: 2163 } } : r)) };
    const issues = verifyDataset(ds);
    expect(issues.some((i) => i.level === 'warn' && i.field === 'monetary_funds')).toBe(true);
  });

  it('规则5：白酒全期缺合同负债 → warn（不 error）', () => {
    const stripped: ReportDataset = {
      ...base,
      reports: base.reports.map((r) => {
        const { contract_liabilities: _cl, advance_receipts: _ar, ...rest } = r.balance;
        return { ...r, balance: rest };
      }),
    };
    const issues = verifyDataset(stripped);
    expect(issues.some((i) => i.level === 'warn' && i.field === 'contract_liabilities')).toBe(true);
    expect(hasErrors(issues)).toBe(false);
  });

  it('规则8：期末现金与货币资金偏离 >50% → warn', () => {
    const ds = { ...base, reports: base.reports.map((r, i) => (i === 4 ? { ...r, cashflow: { ...r.cashflow, cash_end: (r.balance.monetary_funds as number) * 0.3 } } : r)) };
    const issues = verifyDataset(ds);
    expect(issues.some((i) => i.level === 'warn' && i.field === 'cash_end')).toBe(true);
  });
});

describe('白酒派生指标（compute.ts）', () => {
  it('contract_liab_ratio 缺失时为 null 而非 0（禁止把缺失当安全）', () => {
    const stripped: ReportDataset = {
      ...JSON.parse(JSON.stringify(maotaiSample)),
      reports: maotaiSample.reports.map((r) => {
        const { contract_liabilities: _cl, ...rest } = r.balance;
        return { ...r, balance: rest };
      }),
    };
    const cd = computeDataset(stripped);
    for (const m of cd.metrics) {
      expect(m.contract_liab_ratio).toBeNull();
    }
  });
  it('收现比 sales_cash_ratio > 1（先款后货）', () => {
    const cd = computeDataset(maotaiSample);
    const last = cd.metrics[cd.metrics.length - 1];
    expect(last.sales_cash_ratio!).toBeGreaterThan(1);
  });
  it('补上合同负债后 ratio 正确计算（茅台样例现含合同负债）', () => {
    const cd = computeDataset(maotaiSample);
    const last = cd.metrics[cd.metrics.length - 1];
    expect(last.contract_liab_ratio).not.toBeNull();
    expect(last.contract_liab_ratio!).toBeGreaterThan(0.05);
    expect(last.contract_liab_ratio!).toBeLessThan(0.2);
  });
});
