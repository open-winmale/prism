import { describe, expect, it } from 'vitest';
import { verifyDataset, formatIssues, computeDataset } from '@/engine';
import { LIQUOR_SAMPLES } from '@/data/loader';

describe('真实白酒数据准入门禁', () => {
  for (const ds of LIQUOR_SAMPLES) {
    it(`${ds.name}(${ds.symbol}): 0 error`, () => {
      const issues = verifyDataset(ds);
      const errs = issues.filter((i) => i.level === 'error');
      if (errs.length) console.log(formatIssues(issues));
      expect(errs).toEqual([]);
    });
    it(`${ds.name}: 0 噪声告警（真实数据不得触发「请核对」类提示甩给用户）`, () => {
      const issues = verifyDataset(ds);
      const warns = issues.filter((i) => i.level === 'warn');
      if (warns.length) console.log(formatIssues(issues));
      expect(warns).toEqual([]);
    });
    it(`${ds.name}: 合同负债全期有值`, () => {
      for (const r of ds.reports) {
        expect(r.balance.contract_liabilities).not.toBeNull();
        expect(r.balance.contract_liabilities!).toBeGreaterThan(0);
      }
    });
    it(`${ds.name}: 勾稽 资产≈负债+权益 (0.5%)`, () => {
      for (const r of ds.reports) {
        const b = r.balance;
        const rel = Math.abs(b.total_assets! - (b.total_liabilities! + b.total_equity!)) / b.total_assets!;
        expect(rel).toBeLessThan(0.005);
      }
    });
    it(`${ds.name}: 毛利率在 50–95% 区间(白酒合理带)`, () => {
      const cd = computeDataset(ds);
      for (const m of cd.metrics) {
        expect(m.gross_margin!).toBeGreaterThan(0.5);
        expect(m.gross_margin!).toBeLessThan(0.95);
      }
    });
    it(`${ds.name}: 收现比 > 0.9(先款后货行业)`, () => {
      const cd = computeDataset(ds);
      const last = cd.metrics[cd.metrics.length - 1];
      expect(last.sales_cash_ratio!).toBeGreaterThan(0.9);
    });
  }
});
