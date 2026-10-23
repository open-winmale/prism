import type { AnalysisContext, AnalysisModule, AnalysisResult, InsightBlock } from './define';
import { LAOTANG_GROSS_MARGIN_NOTE } from '../laotang/rules';
import { periodLabel } from '../utils';
import { compareBars } from '../methods/horizontal';
import { trendLine, type TrendSeries } from '../methods/trend';

export function runGrossMargin(ctx: AnalysisContext): AnalysisResult {
  const labels = ctx.computed.periods.map(periodLabel);
  const m = ctx.computed.metrics;
  const gm = m.map((x) => x.gross_margin);
  const nm = m.map((x) => x.net_margin_parent);
  const sell = m.map((x) => x.selling_rate);
  const admin = m.map((x) => x.admin_rate);
  const rd = m.map((x) => x.rd_rate);

  const blocks: InsightBlock[] = [];

  const gmSeries: TrendSeries[] = [{ name: '毛利率', values: gm.map((v) => (v == null ? null : v * 100)) }];
  if (ctx.peerBench?.gross_margin != null) {
    gmSeries.push({ name: '同业基准', values: gm.map(() => ctx.peerBench!.gross_margin! * 100), benchmark: true });
  }
  blocks.push({
    id: 'gm_trend',
    title: '毛利率趋势与同业',
    summary:
      (gm[gm.length - 1] ?? 0) >= 0.4
        ? `最新毛利率 ${(gm[gm.length - 1]! * 100).toFixed(1)}%，处于高毛利区间，需结合稳定性与同业判断护城河。`
        : `最新毛利率 ${(gm[gm.length - 1] ?? 0) * 100 | 0}%，属中等水平。`,
    charts: [trendLine(labels, gmSeries, { title: '毛利率', unit: '%' })],
    laotang: LAOTANG_GROSS_MARGIN_NOTE,
  });

  blocks.push({
    id: 'gm_vs_nm',
    title: '毛利到净利的「漏损」',
    summary: '毛利率与净利率的裂口，就是税费与各项费用吃掉的部分。裂口扩大，说明费用失控或税赋上升。',
    charts: [
      compareBars(
        labels,
        [
          { name: '毛利率%', data: gm.map((v) => (v == null ? null : v * 100)) },
          { name: '净利率%', data: nm.map((v) => (v == null ? null : v * 100)) },
        ],
        { title: '毛利率 vs 净利率', unit: '%' },
      ),
    ],
  });

  blocks.push({
    id: 'expense',
    title: '费用结构（占营收）',
    summary: '销售/管理/研发费用率逐年变化，反映渠道投入、管理效率与研发强度。',
    charts: [
      compareBars(
        labels,
        [
          { name: '销售费用率%', data: sell.map((v) => (v == null ? null : v * 100)) },
          { name: '管理费用率%', data: admin.map((v) => (v == null ? null : v * 100)) },
          { name: '研发费用率%', data: rd.map((v) => (v == null ? null : v * 100)) },
        ],
        { title: '三项费用率', unit: '%' },
      ),
    ],
  });

  return { moduleId: 'grossMargin', moduleTitle: '毛利率分析', blocks };
}

export const grossMarginModule: AnalysisModule = {
  id: 'grossMargin',
  title: '毛利率分析',
  desc: '看毛利率趋势、与同业差距，以及从毛利到净利的费用漏损。',
  problems: ['profitability'],
  industries: [],
  run: runGrossMargin,
};
