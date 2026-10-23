import type { AnalysisContext, AnalysisModule, AnalysisResult, InsightBlock } from './define';
import { periodLabel, safeDiv } from '../utils';
import { trendLine } from '../methods/trend';

export function runInventory(ctx: AnalysisContext): AnalysisResult {
  const labels = ctx.computed.periods.map(periodLabel);
  const reports = ctx.dataset.reports;
  const m = ctx.computed.metrics;

  const inv = reports.map((r) => r.balance.inventories ?? null);
  const rev = reports.map((r) => r.income.total_revenue ?? null);
  const turnover = m.map((x) => x.inventory_turnover);
  const days = turnover.map((v) => (v == null || v === 0 ? null : 365 / v));
  const invToRev = inv.map((v, i) => safeDiv(v, rev[i]));

  const blocks: InsightBlock[] = [];

  blocks.push({
    id: 'turnover',
    title: '存货周转率与周转天数',
    summary: '周转率越高、周转天数越短，货越好卖、积压越少。持续恶化是滞销或减值的先兆。',
    charts: [
      // 周转率（次）与周转天数（天）量纲不同：左轴看次数、右轴看天数，绝不共用一根轴。
      trendLine(
        labels,
        [
          { name: '周转率(次)', values: turnover },
          { name: '周转天数', values: days, axis: 'right' },
        ],
        { title: '存货周转', unit: '次', yLabelRight: '天' },
      ),
    ],
  });

  blocks.push({
    id: 'inv_to_rev',
    title: '存货 / 营收',
    summary: '存货占营收比重攀升，意味着生产出来的东西没跟上销售，警惕渠道压货。',
    charts: [trendLine(labels, [{ name: '存货/营收', values: invToRev.map((v) => (v == null ? null : v * 100)) }], { title: '存货占营收', unit: '%' })],
  });

  return { moduleId: 'inventory', moduleTitle: '存货分析', blocks };
}

export const inventoryModule: AnalysisModule = {
  id: 'inventory',
  title: '存货分析',
  desc: '存货周转率、周转天数与占营收比重，看货好不好卖。',
  problems: ['operations', 'assetQuality'],
  industries: ['manufacturing', 'realestate', 'cyclical', 'liquor'],
  run: runInventory,
};
