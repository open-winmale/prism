// B2 引擎行业化单测（IMPLEMENTATION_PLAN.md §3.3）
// 核心命题：白酒样例不再误报 + 制造样例仍触发（行业化没有削弱通用能力）
import { describe, expect, it } from 'vitest';
import { computeDataset, mineChecks, mineVerdict, qualityScoreOf, runMineDetect, type AnalysisContext } from '@/engine';
import { maotaiSample } from '@/data/samples/maotai';
import { manufacturingSample } from '@/data/samples/manufacturing';

function ctx(ds: typeof maotaiSample | typeof manufacturingSample): AnalysisContext {
  return { dataset: ds, computed: computeDataset(ds), industry: ds.industry, peerBench: ds.peerBench };
}

describe('排雷行业化 · 白酒样例', () => {
  const checks = mineChecks(ctx(maotaiSample));
  const byId = Object.fromEntries(checks.map((c) => [c.id, c]));

  it('不触发任何高危（白酒画像：低应收/高毛利/收现好）', () => {
    const r = runMineDetect(ctx(maotaiSample));
    expect(r.blocks.filter((b) => b.severity === 'high').length).toBe(0);
    expect(mineVerdict(checks)).toBe('safe');
  });

  it('应收项不误报且安全文案含白酒注脚', () => {
    expect(byId.ar_growth.status).toBe('safe');
    expect(byId.ar_growth.why).toContain('先款后货');
  });

  it('存货项：无成品拆分时回退总额口径并放宽阈值，不误报', () => {
    // 茅台样例未拆 inventory_finished → 回退总额（阈 0.6），30% 存货不再触发
    expect(byId.inventory_growth.name).toBe('存货增速持续高于营收增速');
    expect(byId.inventory_growth.status).toBe('safe');
    expect(byId.inventory_growth.evidence).toContain('阈放宽');
  });

  it('补成品拆分后切换为成品口径（阈 0.25）', () => {
    const ds = JSON.parse(JSON.stringify(maotaiSample));
    for (const r of ds.reports) {
      r.balance.inventory_finished = (r.balance.inventories as number) * 0.2; // 成品占 20%，远低于阈
      r.balance.inventory_wip = (r.balance.inventories as number) * 0.7;
    }
    const checks2 = mineChecks(ctx(ds));
    const inv = checks2.find((c) => c.id === 'inventory_growth')!;
    expect(inv.name).toContain('成品');
    expect(inv.status).toBe('safe');
    expect(inv.evidence).toContain('基酒口径已排除');
  });

  it('现金流项：3 年均值判定且不误报', () => {
    expect(byId.cfo_vs_profit.status).toBe('safe');
    expect(byId.cfo_vs_profit.evidence).toContain('均值');
  });

  it('毛利率项对自身均值（不依赖同业基准）', () => {
    expect(byId.gross_margin_anomaly.status).toBe('safe');
    expect(byId.gross_margin_anomaly.evidence).toContain('自身');
  });

  it('渠道信心项：无合同负债时输出 na（不报 safe）', () => {
    const stripped = JSON.parse(JSON.stringify(maotaiSample));
    for (const r of stripped.reports) {
      delete r.balance.contract_liabilities;
    }
    const checks2 = mineChecks(ctx(stripped));
    expect(checks2.find((c) => c.id === 'channel_confidence')!.status).toBe('na');
  });

  it('渠道信心项：有合同负债且稳定 → safe，占比约 10%', () => {
    expect(byId.channel_confidence.status).toBe('safe');
    expect(byId.channel_confidence.evidence).toContain('%');
  });
});

describe('排雷行业化 · 制造样例回归', () => {
  const checks = mineChecks(ctx(manufacturingSample));

  it('三项高危仍触发（通用能力未被削弱）', () => {
    const high = checks.filter((c) => c.status === 'triggered' && c.severity === 'high');
    expect(high.length).toBeGreaterThanOrEqual(3);
    expect(mineVerdict(checks)).toBe('danger');
  });

  it('制造样例不出现白酒专属渠道信心项', () => {
    expect(checks.find((c) => c.id === 'channel_confidence')).toBeUndefined();
  });

  it('制造样例存货用总额口径', () => {
    expect(checks.find((c) => c.id === 'inventory_growth')!.name).toBe('存货增速持续高于营收增速');
  });
});

describe('质量分行业化', () => {
  it('白酒六维：合同负债维度参与计分（茅台样例已含数据）', () => {
    const q = qualityScoreOf(ctx(maotaiSample));
    expect(q.subs.length).toBe(6);
    const cl = q.subs.find((s) => s.key === 'contract_liab')!;
    expect(cl.na).toBe(false);
    expect(q.excluded.length).toBe(0);
  });

  it('na 剔除归一化：剥掉合同负债后该维权重从分母剔除（不是 0 分拉低）', () => {
    const stripped = JSON.parse(JSON.stringify(maotaiSample));
    for (const r of stripped.reports) delete r.balance.contract_liabilities;
    const q = qualityScoreOf(ctx(stripped));
    const cl = q.subs.find((s) => s.key === 'contract_liab')!;
    expect(cl.na).toBe(true);
    expect(q.excluded.length).toBe(1);
    const active = q.subs.filter((s) => !s.na);
    const weightSum = active.reduce((s, x) => s + x.weight, 0);
    expect(weightSum).toBeCloseTo(0.85, 5);
    const expected = Math.round(active.reduce((s, x) => s + x.score * x.weight, 0) / weightSum);
    expect(q.score).toBe(expected);
    // 归一化后分数应显著高于把 na 按 0 计入的结果
    const zeroPenalty = Math.round(active.reduce((s, x) => s + x.score * x.weight, 0) / 1.0);
    expect(q.score).toBeGreaterThan(zeroPenalty);
  });

  it('白酒样例质量分应为「优秀」档（>80）', () => {
    const q = qualityScoreOf(ctx(maotaiSample));
    expect(q.score).toBeGreaterThan(80);
    expect(q.grade).toBe('优秀');
  });

  it('制造样例仍走通用七维', () => {
    const q = qualityScoreOf(ctx(manufacturingSample));
    expect(q.subs.length).toBe(7);
  });
});
