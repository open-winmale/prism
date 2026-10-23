import type { AnalysisContext, AnalysisModule, AnalysisResult, InsightBlock } from './define';
import { LAOTANG_DUPONT_NOTE } from '../laotang/rules';
import { periodLabel } from '../utils';
import { compareBars } from '../methods/horizontal';
import { trendLine, type TrendSeries } from '../methods/trend';

export function runRoe(ctx: AnalysisContext): AnalysisResult {
  const labels = ctx.computed.periods.map(periodLabel);
  const m = ctx.computed.metrics;
  const roe = m.map((x) => x.roe_parent);
  const netMargin = m.map((x) => x.net_margin_parent_dupont);
  const turnover = m.map((x) => x.asset_turnover);
  const multiplier = m.map((x) => x.equity_multiplier_dupont);

  const blocks: InsightBlock[] = [];

  // ROE 趋势 + 同业
  const roeSeries: TrendSeries[] = [{ name: `${ctx.dataset.name} ROE`, values: roe.map((v) => (v == null ? null : v * 100)) }];
  if (ctx.peerBench?.roe != null) {
    roeSeries.push({ name: '同业基准', values: roe.map(() => ctx.peerBench!.roe! * 100), benchmark: true });
  }
  blocks.push({
    id: 'roe_trend',
    title: '归母 ROE 趋势',
    summary:
      (roe[roe.length - 1] ?? 0) >= 0.15
        ? `最新 ROE ${(roe[roe.length - 1]! * 100).toFixed(1)}%，达到巴菲特眼中「优秀」的 15% 门槛。`
        : `最新 ROE ${(roe[roe.length - 1] ?? 0) * 100 | 0}%，距离 15% 的优秀线尚有差距。`,
    charts: [trendLine(labels, roeSeries, { title: '归母 ROE', unit: '%' })],
  });

  // 杜邦三因子
  blocks.push({
    id: 'dupont',
    title: '杜邦拆解：高 ROE 来自哪？',
    summary: '把 ROE 拆成「净利率 × 总资产周转率 × 权益乘数」，看清楚回报是靠生意好、运营强，还是靠加杠杆借来的。',
    charts: [
      compareBars(
        labels,
        [
          { name: '净利率%', data: netMargin.map((v) => (v == null ? null : v * 100)) },
          { name: '总资产周转率', data: turnover.map((v) => (v == null ? null : v * 100)) },
          { name: '权益乘数', data: multiplier.map((v) => (v == null ? null : v * 100)) },
        ],
        { title: '杜邦三因子（单位不同，仅看趋势）', unit: '—' },
      ),
    ],
    laotang: LAOTANG_DUPONT_NOTE,
  });

  // 最新一期分解表
  const last = m.length - 1;
  blocks.push({
    id: 'dupont_table',
    title: '最新期杜邦分解',
    summary: 'ROE = 净利率 × 总资产周转率 × 权益乘数。三条因子共同决定股东回报。',
    charts: [
      {
        type: 'table',
        title: '杜邦分解（最新期）',
        table: {
          columns: [
            { key: 'factor', cn: '因子' },
            { key: 'value', cn: '数值' },
          ],
          rows: [
            { factor: '净利率', value: `${((netMargin[last] ?? 0) * 100).toFixed(1)}%` },
            { factor: '× 总资产周转率', value: (turnover[last] ?? 0).toFixed(2) },
            { factor: '× 权益乘数', value: (multiplier[last] ?? 0).toFixed(2) },
            { factor: '= 归母 ROE', value: `${((roe[last] ?? 0) * 100).toFixed(1)}%` },
          ],
        },
      },
    ],
  });

  return { moduleId: 'roe', moduleTitle: 'ROE 杜邦分析', blocks };
}

export const roeModule: AnalysisModule = {
  id: 'roe',
  title: 'ROE 杜邦分析',
  desc: '净利率×总资产周转率×权益乘数，看清高回报的来源与质量。',
  problems: ['profitability'],
  industries: [],
  run: runRoe,
};
