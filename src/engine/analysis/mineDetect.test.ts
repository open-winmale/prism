import { describe, expect, it } from 'vitest';
import {
  computeDataset,
  mineChecks,
  mineVerdict,
  runMineDetect,
  runRoe,
  type AnalysisContext,
} from '@/engine';
import { maotaiSample } from '@/data/samples/maotai';
import { manufacturingSample } from '@/data/samples/manufacturing';

function ctx(ds: typeof maotaiSample | typeof manufacturingSample): AnalysisContext {
  return { dataset: ds, computed: computeDataset(ds), industry: ds.industry, peerBench: ds.peerBench };
}

describe('财报排雷', () => {
  it('排雷样例应触发高危信号', () => {
    const r = runMineDetect(ctx(manufacturingSample));
    const high = r.blocks.filter((b) => b.severity === 'high');
    expect(high.length).toBeGreaterThan(0);
    expect(r.warnings).toBeUndefined(); // 排雷样例含扣非，不应缺数据
  });

  it('白酒样例不应触发高危（优质画像）', () => {
    const r = runMineDetect(ctx(maotaiSample));
    const high = r.blocks.filter((b) => b.severity === 'high');
    expect(high.length).toBe(0);
  });

  it('缺数据不判安全：关键字段全缺时 verdict=insufficient', () => {
    const stripped = JSON.parse(JSON.stringify(maotaiSample));
    const balanceKeys = [
      'accounts_receivable',
      'notes_receivable',
      'receivables_financing',
      'inventories',
      'other_receivables',
      'monetary_funds',
      'goodwill',
      'cip',
      'fixed_assets',
      'total_assets',
      'equity_parent',
      'contract_liabilities',
    ];
    const incomeKeys = ['total_revenue', 'net_profit_parent', 'net_profit_excl_nonrecurring'];
    const cashKeys = ['net_cash_operating'];
    for (const r of stripped.reports) {
      for (const k of balanceKeys) delete r.balance[k];
      for (const k of incomeKeys) delete r.income[k];
      for (const k of cashKeys) delete r.cashflow[k];
    }
    const checks = mineChecks(ctx(stripped));
    expect(checks.filter((c) => c.status === 'na').length).toBeGreaterThanOrEqual(3);
    expect(mineVerdict(checks)).toBe('insufficient');
  });
});

describe('ROE 杜邦', () => {
  it('白酒样例产出杜邦分解', () => {
    const r = runRoe(ctx(maotaiSample));
    expect(r.blocks.length).toBeGreaterThan(0);
    expect(r.blocks.find((b) => b.id === 'dupont_table')).toBeTruthy();
  });
});
