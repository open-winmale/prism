import type { AnalysisContext, AnalysisModule, AnalysisResult, InsightBlock } from './define';
import { LAOTANG_NOTE_QUALITY } from '../laotang/rules';
import { periodLabel } from '../utils';
import { trendLine } from '../methods/trend';
import { compareBars } from '../methods/horizontal';

// 模块源：../script 资产「基本面.现金流量」「真金白银包」
// 核心：利润到底是「真金白银」还是「纸面富贵」。老唐看重经营现金流对净利润的覆盖。
export function runCashFlowQuality(ctx: AnalysisContext): AnalysisResult {
  const labels = ctx.computed.periods.map(periodLabel);
  const m = ctx.computed.metrics;
  const reports = ctx.computed.dataset.reports;

  // 从原始三表取数（字段名与 stmt_tree.xs 的 col 一一对应）
  const all = reports.map((r) => ({ ...r.balance, ...r.income, ...r.cashflow }) as Record<string, number | null>);

  // 销售收现比 = 销售商品提供劳务收到的现金 / 营业收入
  const salesCashRatio = all.map((x) =>
    x.cash_from_sales != null && x.total_revenue ? (x.cash_from_sales / x.total_revenue) * 100 : null,
  );
  // 自由现金流 = 经营现金流 - 资本开支；FCF 展示单位统一为亿元；FCF/净利润为比率
  const fcf: (number | null)[] = [];
  const fcfNp: (number | null)[] = [];
  all.forEach((x) => {
    const v = x.net_cash_operating != null && x.capex_cash != null ? x.net_cash_operating - x.capex_cash : null;
    fcf.push(v == null ? null : v / 1e8);
    fcfNp.push(v != null && x.net_profit_parent ? (v / x.net_profit_parent) * 100 : null);
  });
  // 盈利含金量（已在 compute 中算好）
  const ncfNp = m.map((x) => (x.cfo_to_net_profit != null ? x.cfo_to_net_profit * 100 : null));
  const ncfOp = m.map((x) => (x.ncf_to_op_profit != null ? x.ncf_to_op_profit * 100 : null));

  const latestSalesCash = salesCashRatio[salesCashRatio.length - 1] ?? null;
  const blocks: InsightBlock[] = [];
  const warnings: string[] = [];
  if (latestSalesCash == null) warnings.push('销售收现比：缺少销售商品收到的现金或营收数据，未计算。');
  if (fcf.every((v) => v == null)) warnings.push('自由现金流：缺少经营现金流或资本开支数据，未计算。');

  blocks.push({
    id: 'sales_cash_ratio',
    title: '销售收现比（卖货收到的现金 / 营收）',
    summary:
      latestSalesCash == null
        ? '缺少销售商品收到的现金或营收数据，无法判断收现质量。'
        : latestSalesCash >= 100
          ? `最新销售收现比 ${latestSalesCash.toFixed(0)}%，营收基本都变成了真金白银（先款后货型生意往往 >100%）。`
          : `最新销售收现比 ${latestSalesCash.toFixed(0)}%，部分营收尚挂在应收上，需关注回款。`,
    charts: [
      trendLine(labels, [{ name: '销售收现比%', values: salesCashRatio, area: true }], {
        title: '销售收现比',
        unit: '%',
        refLines: [{ value: 100, label: '100%' }],
      }),
    ],
    laotang: '老唐：销售收现比长期低于 100%，说明卖出去的货没收回来钱，利润含「水分」。',
  });

  blocks.push({
    id: 'earnings_quality',
    title: '盈利含金量（经营现金流 vs 利润）',
    summary: '经营现金流/净利润 越接近甚至超过 100% 越好；长期低于 60% 要警惕利润质量。经营现金流/营业利润 同理。',
    charts: [
      compareBars(
        labels,
        [
          { name: '经营现金流/净利润%', data: ncfNp },
          { name: '经营现金流/营业利润%', data: ncfOp },
        ],
        { title: '盈利含金量', unit: '%' },
      ),
    ],
    laotang: LAOTANG_NOTE_QUALITY,
  });

  blocks.push({
    id: 'fcf',
    title: '自由现金流（经营现金流 − 资本开支）',
    summary: '自由现金流是企业在维持资产后再能自由支配的现金。持续为正，才具备分红、还贷、扩张的底气。',
    charts: [
      trendLine(labels, [{ name: '自由现金流(亿元)', values: fcf }], { title: '自由现金流', unit: '亿元' }),
    ],
  });

  blocks.push({
    id: 'fcf_np',
    title: '自由现金流 / 净利润',
    summary: '该比率长期 < 70% 意味着利润大半被资本开支吃掉，或回款质量差；持续 > 100% 是「现金牛」特征。',
    charts: [
      trendLine(labels, [{ name: 'FCF/净利润%', values: fcfNp }], {
        title: '自由现金流/净利润',
        unit: '%',
        refLines: [{ value: 100, label: '100%' }],
      }),
    ],
  });

  return {
    moduleId: 'cashFlowQuality',
    moduleTitle: '现金流质量',
    blocks,
    warnings: warnings.length ? warnings : undefined,
  };
}

export const cashFlowQualityModule: AnalysisModule = {
  id: 'cashFlowQuality',
  title: '现金流质量',
  desc: '销售收现比、盈利含金量、自由现金流——看清利润是真金白银还是纸面富贵。',
  problems: ['risk', 'profitability'],
  industries: [],
  run: runCashFlowQuality,
};
