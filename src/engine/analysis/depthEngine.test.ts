import { describe, expect, it } from 'vitest';
import {
  anomalySignals,
  computeDataset,
  evalDrv,
  growthSourcesOf,
  runAnomalyScan,
  runGrowthSources,
  type AnalysisContext,
} from '@/engine';
import { dataset as maotai } from '@/data/samples/liquor/600519';
import { dataset as wuliangye } from '@/data/samples/liquor/000858';
import { manufacturingSample } from '@/data/samples/manufacturing';

function ctxOf(ds: typeof maotai, industry: AnalysisContext['industry'] = 'liquor'): AnalysisContext {
  return { dataset: ds, computed: computeDataset(ds), industry };
}

const maotaiCtx = ctxOf(maotai);
const wuliangyeCtx = ctxOf(wuliangye);
const manufCtx = ctxOf(manufacturingSample, 'manufacturing');

// ── 派生运算：严格求和 sum_all ──
describe('派生运算 sum_all（现金净增加额恒等式）', () => {
  it('三项俱全 → 求和正确', () => {
    const get = (k: string) => ({ a: 10, b: -3, c: 5 })[k] ?? null;
    expect(evalDrv({ d: 'sum_all', as: ['a', 'b', 'c'] }, get)).toBe(12);
  });

  it('缺任一项 → null（缺失 ≠ 0，恒等式不硬凑）', () => {
    const get = (k: string) => ({ a: 10, b: -3 })[k] ?? null;
    expect(evalDrv({ d: 'sum_all', as: ['a', 'b', 'c'] }, get)).toBeNull();
  });

  it('宽松求和 sum 仍保留「有值就加」的旧行为（有息负债口径依赖它）', () => {
    const get = (k: string) => ({ a: 10, b: null })[k] ?? null;
    expect(evalDrv({ d: 'sum', as: ['a', 'b'] }, get)).toBe(10);
  });

  it('现金流量表 NCF 行由三项净额构成，不再与 NCFO 重复', () => {
    const reports = maotaiCtx.dataset.reports;
    for (const r of reports) {
      const cfo = r.cashflow.net_cash_operating;
      const cfi = r.cashflow.net_cash_investing;
      const cff = r.cashflow.net_cash_financing;
      if (cfo == null || cfi == null || cff == null) continue;
      expect(evalDrv({ d: 'sum_all', as: ['net_cash_operating', 'net_cash_investing', 'net_cash_financing'] }, (k) =>
        k === 'net_cash_operating' ? cfo : k === 'net_cash_investing' ? cfi : cff,
      )).toBeCloseTo(cfo + cfi + cff, 4);
    }
  });
});

// ── 异动扫描 ──
describe('异动扫描 anomalyScan', () => {
  it('茅台真实数据能扫出跳变，且每条信号证据完整', () => {
    const signals = anomalySignals(maotaiCtx, { limit: 8 });
    expect(signals.length).toBeGreaterThan(0);
    for (const s of signals) {
      expect(s.itemName).toBeTruthy();
      expect(s.evidence).toContain(s.itemName);
      expect(s.why).toBeTruthy();
      expect(s.next).toBeTruthy();
      expect(['up', 'down']).toContain(s.direction);
      expect(['high', 'mid']).toContain(s.severity);
      // 六大问题域：每条信号都必须可归组
      expect(['operating', 'asset', 'liability', 'equity', 'profit', 'cashflow']).toContain(s.domain);
    }
  });

  // 重要性门槛（2026-10-22）：占比非常小的科目不构成有意义的突变（门槛看当期占比）
  it('占比 <1% 的金额科目即使巨幅跳变也不报（小数点级噪音过滤）', () => {
    const base = maotai.reports[0].balance.total_assets ?? 1e12;
    // 每期都只占总资产 0.45%~0.8%（低于默认 minShare=1%），同比 +80%
    const tiny = base * 0.0045;
    const ds = {
      ...maotai,
      reports: maotai.reports.map((r, i) => ({
        ...r,
        balance: { ...r.balance, other_receivables: i === 0 ? tiny : tiny * 1.8 },
      })),
    };
    const signals = anomalySignals(ctxOf(ds), { limit: 50 });
    expect(signals.filter((s) => s.itemKey === 'ORNET')).toHaveLength(0);
  });

  it('占比 ≥3% 的同科目跳变正常报出（重要性门槛不误伤大科目）', () => {
    const base = maotai.reports[0].balance.total_assets ?? 1e12;
    const big = base * 0.05; // 占总资产 5%，远超 minShare 与 3 倍下限
    const ds = {
      ...maotai,
      reports: maotai.reports.map((r, i) => ({
        ...r,
        balance: { ...r.balance, other_receivables: i === 0 ? big : big * 2 },
      })),
    };
    const signals = anomalySignals(ctxOf(ds), { limit: 50 });
    expect(signals.filter((s) => s.itemKey === 'ORNET').length).toBeGreaterThan(0);
  });

  it('当期占比在 1%~3% 之间的跳变报出但强制降级为 mid', () => {
    const base = maotai.reports[0].balance.total_assets ?? 1e12;
    // 基期 0.4% → 当期 2%（落在 1~3 倍下限区间），同比 5 倍
    const mid = base * 0.004;
    const ds = {
      ...maotai,
      reports: maotai.reports.map((r, i) => ({
        ...r,
        balance: { ...r.balance, other_receivables: i === 0 ? mid : mid * 5 },
      })),
    };
    const signals = anomalySignals(ctxOf(ds), { limit: 50 });
    const hits = signals.filter((s) => s.itemKey === 'ORNET');
    expect(hits.length).toBeGreaterThan(0);
    for (const s of hits) expect(s.severity).toBe('mid');
  });

  it('行业附注：白酒语境下存货异动挂上「基酒/成品」附注', () => {
    const signals = anomalySignals(maotaiCtx, { limit: 60, industry: 'liquor' });
    const io = signals.find((s) => s.itemKey === 'IO');
    if (io) expect(io.note).toContain('基酒');
  });

  it('按严重度再按幅度排序', () => {
    const signals = anomalySignals(manufCtx, { limit: 10 });
    if (signals.length < 2) return;
    for (let i = 1; i < signals.length; i++) {
      const rank = (s: typeof signals[number]) => (s.severity === 'high' ? 0 : 1);
      if (rank(signals[i - 1]) === rank(signals[i])) {
        expect(Math.abs(signals[i - 1].delta)).toBeGreaterThanOrEqual(Math.abs(signals[i].delta) - 1e-9);
      } else {
        expect(rank(signals[i - 1])).toBeLessThanOrEqual(rank(signals[i]));
      }
    }
  });

  it('阈值提高 → 信号减少（条件选项真的在过滤）', () => {
    const low = anomalySignals(maotaiCtx, { yoyThreshold: 0.1, shareThreshold: 0.02 });
    const high = anomalySignals(maotaiCtx, { yoyThreshold: 0.8, shareThreshold: 0.2 });
    expect(high.length).toBeLessThan(low.length);
  });

  it('同一「科目 × 期间」最多一条信号，不重复报', () => {
    const signals = anomalySignals(wuliangyeCtx);
    const keys = signals.map((s) => `${s.itemKey}-${s.period}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('只有一个报告期时无信号（没有对比就没有异动）', () => {
    const single = { ...maotaiCtx, dataset: { ...maotai, reports: maotai.reports.slice(-1) } };
    expect(anomalySignals(single)).toEqual([]);
  });

  it('全空报表不产生任何信号，也不抛异常', () => {
    const empty = {
      ...maotaiCtx,
      dataset: {
        ...maotai,
        reports: [
          { period: '2024-12-31', sampling: 'Q4' as const, balance: {}, income: {}, cashflow: {} },
          { period: '2025-12-31', sampling: 'Q4' as const, balance: {}, income: {}, cashflow: {} },
        ],
      },
    };
    expect(anomalySignals(empty)).toEqual([]);
    expect(runAnomalyScan(empty).blocks[0].id).toBe('anomaly_none');
  });

  // 回归：茅台 2024/2025 现金净增加额跨越正负，旧口径会报出「−1070.7%」这种无解释力的信号
  it('金额跨越正负时不报同比异动（改用结构占比或不出信号）', () => {
    const signals = anomalySignals(maotaiCtx, { limit: 30 });
    const ncf = signals.filter((s) => s.itemKey === 'NCF');
    for (const s of ncf) {
      if (s.type !== 'yoy') continue;
      // 同比型信号的基期必须为正，否则这个百分比没有意义
      expect(s.from).not.toBeNull();
      expect(s.from!).toBeGreaterThan(0);
    }
    for (const s of signals) {
      if (s.type === 'yoy') {
        expect(Math.abs(s.delta * 100)).toBeLessThan(10000); // 不出现失真巨值
      }
    }
  });

  it('比率行的同比用百分比单位、结构位移用百分点单位，两者不混用', () => {
    const signals = anomalySignals(maotaiCtx, { limit: 40 });
    const rates = signals.filter((s) => s.itemKey.endsWith('_RATE') || s.itemKey === 'GM');
    for (const s of rates) {
      if (s.type === 'yoy') expect(s.evidence).toContain('%');
      else expect(s.evidence).toContain('pct');
    }
  });

  it('制造排雷样本能被扫出异动（刻意构造的异常）', () => {
    expect(anomalySignals(manufCtx, { limit: 20 }).length).toBeGreaterThan(0);
  });

  it('runAnomalyScan 在无数异动时输出数据不足态而不是空区块', () => {
    const result = runAnomalyScan(maotaiCtx);
    expect(result.moduleId).toBe('anomalyScan');
    expect(result.blocks).toHaveLength(1);
  });
});

// ── 增长来源 ──
describe('增长来源 growthSources', () => {
  // 真实数据约束：600519 的留存收益/股本只覆盖了最近两个报告期，
  // 跨全窗口的增量推不出来 → 归母权益不细分（缺失 ≠ 0，绝不用 0 补齐）。
  it('茅台：少数股东权益按恒等式倒轧，归母权益未能细分时合并为一根柱', () => {
    const g = growthSourcesOf(maotaiCtx);
    expect(g.minorityDerived).toBe(true); // 源数据未直接披露 minority_interest
    expect(g.equityDetail).toBe(false);
    expect(g.verdict).toBe('equity');
    expect(g.items.map((i) => i.key)).toEqual(['TA0', 'TL', 'MIN', 'SE', 'TA1']);
    expect(g.missing).toContain('未分配利润（归母权益无法细分）');
  });

  it('增量恒等式：各来源增量之和 = 总资产增量（精确闭合）', () => {
    for (const c of [maotaiCtx, wuliangyeCtx, manufCtx]) {
      const g = growthSourcesOf(c);
      if (g.totalDelta == null) continue;
      const sum = g.items
        .filter((i) => i.role === 'delta')
        .reduce((a, b) => a + (b.value ?? 0), 0);
      expect(Math.abs(sum - g.totalDelta)).toBeLessThan(Math.abs(g.totalDelta) * 0.005 + 1);
    }
  });

  // 构造一份权益科目齐全的数据，验证 7 根柱的细分路径（真实样本暂不覆盖）
  it('权益明细齐全时展开为 7 根瀑布柱，且各项之和精确等于总资产增量', () => {
    const mk = (ta: number, tl: number, se: number, min: number, re: number, share: number) => ({
      period: '2021-12-31',
      sampling: 'Q4' as const,
      balance: {
        total_assets: ta,
        total_liabilities: tl,
        equity_parent: se,
        minority_interest: min,
        retained_earnings: re,
        share_capital: share,
      },
      income: {},
      cashflow: {},
    });
    const ds = {
      ...maotai,
      reports: [
        mk(1000, 200, 700, 100, 400, 100),
        { ...mk(1500, 400, 900, 200, 640, 100), period: '2023-12-31' },
      ],
    };
    const g = growthSourcesOf({ dataset: ds, computed: computeDataset(ds), industry: 'liquor' });
    expect(g.equityDetail).toBe(true);
    expect(g.minorityDerived).toBe(false);
    expect(g.items.map((i) => i.key)).toEqual(['TA0', 'TL', 'MIN', 'RE', 'SHARE', 'OTHER', 'TA1']);
    // Δ总资产 500 = 负债 +200 + 少数股东 +100 + 留存收益 +240 + 股本 0 + 其他 −40
    const sum = g.items.filter((i) => i.role === 'delta').reduce((a, b) => a + (b.value ?? 0), 0);
    expect(sum).toBeCloseTo(500, 6);
    expect(g.verdict).toBe('profit'); // 留存收益增量最大 → 内生长
  });

  it('瀑布首尾是总数柱，中间是增量柱', () => {
    const g = growthSourcesOf(maotaiCtx);
    expect(g.items[0].role).toBe('total');
    expect(g.items[g.items.length - 1].role).toBe('total');
    expect(g.items.slice(1, -1).every((i) => i.role === 'delta')).toBe(true);
  });

  it('年化增速贡献：三项之和 ≈ 总资产年化增速（专业版口径）', () => {
    const g = growthSourcesOf(maotaiCtx);
    const a = g.annualized;
    if (a.taAr == null || a.seContrib == null || a.tlContrib == null) return;
    expect(g.years).toBeGreaterThan(0);
    // 少数股东贡献可能缺失（茅台无少数股东权益变动数据时为 null），按 0 计入比较
    const sum = a.seContrib + a.tlContrib + (a.minContrib ?? 0);
    expect(sum).toBeGreaterThan(a.taAr * 0.85);
    expect(sum).toBeLessThan(a.taAr * 1.15);
  });

  it('权益科目缺失时整图不出，而不是画半张让人误读的瀑布', () => {
    const noEquity = {
      ...maotaiCtx,
      dataset: {
        ...maotai,
        reports: maotai.reports.map((r) => ({ ...r, balance: { ...r.balance, equity_parent: null } })),
      },
    };
    const g = growthSourcesOf(noEquity);
    expect(g.items).toEqual([]);
    expect(g.missing).toContain('归母权益');
    expect(runGrowthSources(noEquity).blocks[0].id).toBe('growth_sources_na');
  });

  it('只有一个报告期时整体数据不足', () => {
    const single = { ...maotaiCtx, dataset: { ...maotai, reports: maotai.reports.slice(-1) } };
    const g = growthSourcesOf(single);
    expect(g.verdict).toBe('na');
    expect(g.items).toEqual([]);
    expect(runGrowthSources(single).blocks[0].id).toBe('growth_sources_na');
  });

  it('runGrowthSources 输出瀑布图 + 明细表两块', () => {
    const chartTypes = runGrowthSources(maotaiCtx).blocks[0].charts.map((c) => c.type);
    expect(chartTypes).toEqual(['waterfall', 'table']);
  });
});

// 重要性门槛强化（2026-10-23）：绝对额增量也必须够大——占比过线但增量太小不报
describe('异动扫描 · 绝对额增量门槛', () => {
  it('占比过线、增量过线、同比达标的科目正常报出（门槛不误伤）', () => {
    const base = maotai.reports[0].balance.total_assets ?? 1e12;
    // 5% → 6.75% 占比：同比 35%（远离白酒阈值 20% 边界）、增量 1.75% 总资产（> minShare 1%）→ 全过，应报出
    const v0 = base * 0.05;
    const v1 = base * 0.0675;
    const ds = {
      ...maotai,
      reports: maotai.reports.map((r, i) => ({
        ...r,
        balance: { ...r.balance, other_receivables: i === 0 ? v0 : v1 },
      })),
    };
    const signals = anomalySignals(ctxOf(ds), { limit: 60 });
    expect(signals.filter((s) => s.itemKey === 'ORNET').length).toBeGreaterThan(0);
  });

  it('占比过线、同比达标、但绝对额增量 <1% 基项的科目不报', () => {
    const base = maotai.reports[0].balance.total_assets ?? 1e12;
    // 占比 25% 但增量只有 0.5% 总资产 → 同比 2%，低于阈值，本就不会报
    // 更尖锐的构造：小基数科目
    const v0 = base * 0.008;
    const v1 = base * 0.012; // 占比过 1% 线；同比 50% 达标；增量 0.4% 总资产 < 1% → 被增量门槛拦下
    const ds = {
      ...maotai,
      reports: maotai.reports.map((r, i) => ({
        ...r,
        balance: { ...r.balance, other_receivables: i === 0 ? v0 : v1 },
      })),
    };
    const signals = anomalySignals(ctxOf(ds), { limit: 60 });
    expect(signals.filter((s) => s.itemKey === 'ORNET')).toHaveLength(0);
  });

  it('每条信号携带 shareSeries（证据图数据）', () => {
    const signals = anomalySignals(maotaiCtx, { limit: 10 });
    for (const s of signals) {
      expect(Array.isArray(s.shareSeries)).toBe(true);
      expect(s.shareSeries.length).toBe(maotai.reports.length);
    }
  });
});
