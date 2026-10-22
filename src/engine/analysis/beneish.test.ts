import { describe, expect, it } from 'vitest';
import {
  BENEISH_BASELINE,
  BENEISH_HIGH,
  BENEISH_WATCH,
  beneishOf,
  computeDataset,
  runBeneish,
  type AnalysisContext,
} from '@/engine';
import type { BeneishFactor, BeneishKey, BeneishScore } from '@/engine';
import type { PeriodReport, ReportDataset } from '@/engine/schema/types';
import { dataset as maotai } from '@/data/samples/liquor/600519';
import { dataset as wuliangye } from '@/data/samples/liquor/000858';
import { manufacturingSample } from '@/data/samples/manufacturing';

function ctxOf(ds: ReportDataset, industry: AnalysisContext['industry'] = 'liquor'): AnalysisContext {
  return { dataset: ds, computed: computeDataset(ds), industry };
}

/** 造一个可完全控制的双期年报数据集（默认：所有比率与上期一致、TATA = 0） */
function mk(
  mutate: (r: PeriodReport, i: number) => Partial<PeriodReport> | void,
): ReportDataset {
  const base = (scale: number): PeriodReport => ({
    period: scale === 1 ? '2024-12-31' : '2025-12-31',
    sampling: 'Q4',
    balance: {
      accounts_receivable: 100 * scale,
      inventories: 200 * scale,
      total_current_assets: 500 * scale,
      fixed_assets: 300 * scale,
      total_assets: 1000 * scale,
      total_liabilities: 400 * scale,
      equity_parent: 600 * scale,
    },
    income: {
      total_revenue: 800 * scale,
      operating_cost: 400 * scale,
      selling_expense: 80 * scale,
      admin_expense: 40 * scale,
      net_profit: 120 * scale,
    },
    cashflow: { net_cash_operating: 120 * scale },
  });
  // 两期默认完全相同：所有指数型因子 = 1、TATA = 0，即「一切如常」的中性公司
  const reports = [base(1), base(1)].map((r, i) => {
    const patch = mutate(r, i);
    return patch ? ({ ...r, ...patch } as PeriodReport) : r;
  });
  return {
    symbol: 'TEST',
    name: '测试',
    industry: 'manufacturing',
    periods: reports.map((r) => r.period),
    reports,
  };
}

/** 取因子并断言存在（避免可选链后接非空断言） */
function factorOf(b: BeneishScore, key: BeneishKey): BeneishFactor {
  const f = b.factors.find((x) => x.key === key);
  if (!f) throw new Error(`因子缺失：${key}`);
  return f;
}

const maotaiCtx = ctxOf(maotai);
const wuliangyeCtx = ctxOf(wuliangye);
const manufCtx = ctxOf(manufacturingSample, 'manufacturing');

describe('Beneish M-Score 中性基准自洽性', () => {
  it('所有比率与上期一致、TATA=0 → M 落回 −2.48 且判定为「未见操纵嫌疑」', () => {
    // 等比缩放意味着所有指数型因子 = 1；net_profit = CFO 意味着 TATA = 0
    const b = beneishOf(ctxOf(mk(() => undefined), 'manufacturing'));
    expect(b.m).not.toBeNull();
    expect(b.m!).toBeCloseTo(BENEISH_BASELINE, 6);
    expect(b.verdict).toBe('ok');
    expect(b.m!).toBeLessThan(BENEISH_WATCH);
  });

  it('中性基准 −2.48 本身低于 −2.22 门线（公式自洽性校验）', () => {
    expect(BENEISH_BASELINE).toBeLessThan(BENEISH_WATCH);
    expect(BENEISH_WATCH).toBeLessThan(BENEISH_HIGH);
  });
});

describe('Beneish M-Score 因子口径', () => {
  it('M = 中性基准 + 各因子贡献之和（恒等式）', () => {
    for (const c of [maotaiCtx, wuliangyeCtx, manufCtx]) {
      const b = beneishOf(c);
      if (b.m == null) continue;
      const sum = b.factors.reduce((s, f) => s + f.contribution, 0);
      expect(b.baseline + sum).toBeCloseTo(b.m, 9);
    }
  });

  it('恒为 8 个因子，DEPI 因三表无折旧字段而恒为缺失', () => {
    const b = beneishOf(maotaiCtx);
    expect(b.factors.length).toBe(8);
    const depi = b.factors.find((f) => f.key === 'DEPI');
    expect(depi?.value).toBeNull();
    expect(depi?.missing).toBe(true);
    expect(depi?.contribution).toBe(0);
  });

  it('TATA 中性值为 0，其余指数型因子中性值为 1', () => {
    const b = beneishOf(maotaiCtx);
    for (const f of b.factors) {
      expect(f.neutral).toBe(f.key === 'TATA' ? 0 : 1);
    }
  });

  it('应收暴增（跑赢营收）→ DSRI > 1 且贡献为正', () => {
    // 第二期应收翻倍，营收只增 10%
    const b = beneishOf(
      ctxOf(
        mk((r, i) => (i === 1 ? { balance: { ...r.balance, accounts_receivable: 200 } } : undefined)),
        'manufacturing',
      ),
    );
    const dsri = factorOf(b, 'DSRI');
    expect(dsri.value).not.toBeNull();
    expect(dsri.value ?? 0).toBeGreaterThan(1);
    expect(dsri.contribution).toBeGreaterThan(0);
  });

  it('GMI > 1 必须读作「毛利率下滑」而不是「改善」（方向性回归测试）', () => {
    // GMI = 毛利率_{t−1} / 毛利率_t：>1 意味着本期毛利率更低
    const b = beneishOf(
      ctxOf(
        mk((r, i) => (i === 1 ? { income: { ...r.income, operating_cost: 500 } } : undefined)),
        'manufacturing',
      ),
    );
    const gmi = factorOf(b, 'GMI');
    expect(gmi.value ?? 0).toBeGreaterThan(1);
    expect(gmi.read).toContain('毛利率下滑');
    expect(gmi.read).not.toContain('改善');
  });

  it('先款后货公司（应收常年 <0.5% 营收）的 DSRI 要说明「几乎不携带信息」而非读作回款改善', () => {
    const b = beneishOf(
      ctxOf(
        mk((r) => ({ balance: { ...r.balance, accounts_receivable: 0.5 } })),
        'manufacturing',
      ),
    );
    expect(factorOf(b, 'DSRI').read).toContain('几乎不携带信息');
  });

  it('利润远高于经营现金流 → TATA 为正且把 M 大幅推高（权重 4.679 最高）', () => {
    const b = beneishOf(
      ctxOf(
        mk((r, i) =>
          i === 1
            ? { income: { ...r.income, net_profit: 300 }, cashflow: { net_cash_operating: 120 } }
            : undefined,
        ),
        'manufacturing',
      ),
    );
    const tata = factorOf(b, 'TATA');
    expect(tata.value).not.toBeNull();
    expect(tata.value ?? 0).toBeGreaterThan(0);
    expect(tata.coef).toBe(4.679);
    expect(tata.contribution).toBeGreaterThan(0.1);
    expect(b.verdict).not.toBe('ok');
  });
});

describe('Beneish M-Score 缺失传播', () => {
  it('缺 ≥3 个因子 → 整体置 na，不给分', () => {
    const broken = mk((r) => ({
      balance: { ...r.balance, accounts_receivable: null, total_current_assets: null, fixed_assets: null },
      income: { ...r.income, operating_cost: null },
    }));
    const b = beneishOf(ctxOf(broken, 'manufacturing'));
    expect(b.verdict).toBe('na');
    expect(b.m).toBeNull();
    expect(b.factors).toEqual([]);
  });

  it('只有一个报告期 → na', () => {
    const single = { ...maotai, periods: maotai.periods.slice(-1), reports: maotai.reports.slice(-1) };
    expect(beneishOf(ctxOf(single)).verdict).toBe('na');
  });

  it('季度报告不算（只认年报），避免单季/累计口径错位', () => {
    const quarterly = mk(() => undefined);
    quarterly.reports = quarterly.reports.map((r, i) => ({ ...r, sampling: i === 0 ? 'Q1' : 'Q3' } as PeriodReport));
    expect(beneishOf(ctxOf(quarterly, 'manufacturing')).verdict).toBe('na');
  });

  it('na 时 runBeneish 输出说明块而不是空白', () => {
    const single = { ...maotai, periods: maotai.periods.slice(-1), reports: maotai.reports.slice(-1) };
    const res = runBeneish(ctxOf(single));
    expect(res.blocks[0].id).toBe('beneish_na');
    expect(res.blocks[0].summary).toContain('缺数据不等于安全');
    expect(res.warnings?.length).toBeGreaterThan(0);
  });
});

describe('Beneish M-Score 输出结构', () => {
  it('可打分时输出瀑布图 + 因子表两块', () => {
    const blocks = runBeneish(maotaiCtx).blocks;
    expect(blocks.map((b) => b.id)).toEqual(['beneish_score', 'beneish_factors']);
    expect(blocks[0].charts[0].type).toBe('waterfall');
    expect(blocks[1].charts[0].type).toBe('table');
  });

  it('瀑布图首尾是总数柱（中性基准 / M-Score），中间 8 根是因子贡献', () => {
    const w = runBeneish(maotaiCtx).blocks[0].charts[0].waterfall;
    expect(w?.categories.length).toBe(10);
    expect(w?.isTotal?.[0]).toBe(true);
    expect(w?.isTotal?.[9]).toBe(true);
    expect(w?.isTotal?.slice(1, 9).every((x) => x === false)).toBe(true);
  });

  it('瀑布图带两条门线（−2.22 疑似 / −1.78 高危）', () => {
    const lines = runBeneish(maotaiCtx).blocks[0].charts[0].refLines ?? [];
    expect(lines.map((l) => l.value)).toEqual([BENEISH_WATCH, BENEISH_HIGH]);
  });

  it('缺数据的因子在瀑布图里是 null（不画柱子、不冒充 0）', () => {
    const w = runBeneish(maotaiCtx).blocks[0].charts[0].waterfall;
    // DEPI 是第 6 个因子，在 waterfall 里下标 5（下标 0 是中性基准）
    expect(w?.values[5]).toBeNull();
  });

  it('茅台与五粮液都能打分，且判定落在合法枚举内', () => {
    for (const c of [maotaiCtx, wuliangyeCtx]) {
      const b = beneishOf(c);
      expect(b.m).not.toBeNull();
      expect(['high', 'watch', 'ok']).toContain(b.verdict);
    }
  });

  it('明细表列出 8 行因子，缺数据的行显示中性值而不是 0', () => {
    const rows = runBeneish(maotaiCtx).blocks[1].charts[0].table?.rows ?? [];
    expect(rows.length).toBe(8);
    const depi = rows.find((r) => r.key === 'DEPI');
    expect(String(depi?.value)).toContain('—');
    expect(String(depi?.contrib)).toBe('—');
  });
});
