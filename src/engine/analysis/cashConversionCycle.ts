import type { AnalysisContext, AnalysisModule, AnalysisResult, ChartSpec, InsightBlock } from './define';
import { periodLabel } from '../utils';
import { trendLine } from '../methods/trend';
import { compareBars } from '../methods/horizontal';

// 模块源：../script/sys/metric/shared/ccf.xs（现金转换周期 / 营运能力）
// CCC = 应收周转天数 + 存货周转天数 − 应付周转天数；越短，说明对营运资金的占用越少、产业链话语权越强。
const DAYS = 365;

function toDays(numerator: number | null, denominator: number | null): number | null {
  // 周转天数 = 365 × 平均余额 / 流量。
  // 分子或分母缺失 → null（不猜）；分母为 0（如零应收）→ 0 天，表示「没有占用」。
  if (numerator == null || denominator == null) return null;
  if (denominator <= 0) return 0;
  return +((DAYS * numerator) / denominator).toFixed(1);
}

function sumOptional(...values: (number | null | undefined)[]): number | null {
  const present = values.filter((v): v is number => v != null);
  if (!present.length) return null;
  return present.reduce((sum, v) => sum + v, 0);
}

export function runCashConversionCycle(ctx: AnalysisContext): AnalysisResult {
  const labels = ctx.computed.periods.map(periodLabel);
  const reports = ctx.computed.dataset.reports;

  // 直接从原始报表取平均余额（本期+上期)/2，避免 safeDiv 对零余额断链
  const rows = reports.map((r, i) => {
    const p = i > 0 ? reports[i - 1] : null;
    const avgOf = (cur: number | null, prev: number | null): number | null => {
      // 本期余额缺失 → 无法算平均（缺失≠0）；首期无上期时用本期余额。
      if (cur == null) return null;
      if (prev == null) return cur;
      return (cur + prev) / 2;
    };
    const ar = avgOf(
      sumOptional(r.balance.accounts_receivable, r.balance.notes_receivable, r.balance.receivables_financing),
      p ? sumOptional(p.balance.accounts_receivable, p.balance.notes_receivable, p.balance.receivables_financing) : null,
    );
    const inv = avgOf(r.balance.inventories ?? null, p ? p.balance.inventories ?? null : null);
    const ap = avgOf(r.balance.accounts_payable ?? null, p ? p.balance.accounts_payable ?? null : null);
    const cost = r.income.operating_cost ?? null;
    const rev = r.income.total_revenue ?? null;

    const arDays = toDays(ar, rev);
    const invDays = toDays(inv, cost);
    const apDays = toDays(ap, cost);
    const ccc =
      arDays != null && invDays != null && apDays != null ? +(arDays + invDays - apDays).toFixed(1) : null;
    return { arDays, invDays, apDays, ccc };
  });

  const arDays = rows.map((x) => x.arDays);
  const invDays = rows.map((x) => x.invDays);
  const apDays = rows.map((x) => x.apDays);
  const ccc = rows.map((x) => x.ccc);

  const tableChart: ChartSpec = {
    type: 'table',
    title: '营运能力明细（最新期）',
    table: {
      columns: [
        { key: 'cn', cn: '指标' },
        { key: 'days', cn: '周转天数' },
      ],
      rows: [
        { cn: '应收账款周转', days: arDays[arDays.length - 1] ?? '—' },
        { cn: '存货周转', days: invDays[invDays.length - 1] ?? '—' },
        { cn: '应付账款周转', days: apDays[apDays.length - 1] ?? '—' },
        { cn: '现金转换周期(CCC)', days: ccc[ccc.length - 1] ?? '—' },
      ],
    },
  };

  const blocks: InsightBlock[] = [];
  const latestCcc = ccc[ccc.length - 1] ?? null;

  blocks.push({
    id: 'ccc',
    title: '现金转换周期（CCC）趋势',
    summary:
      latestCcc == null
        ? '缺少应收/存货/应付或营收/成本数据，无法计算 CCC。'
        : latestCcc <= 0
          ? `最新 CCC 为 ${latestCcc.toFixed(0)} 天，已为负数——占用上游的资金覆盖了自身应收与存货占用，产业链话语权极强（先款后货、货又卖得快）。`
          : `最新 CCC 为 ${latestCcc.toFixed(0)} 天。CCC 越短，营运资金占用越少、资金效率越高。`,
    charts: [trendLine(labels, [{ name: 'CCC(天)', values: ccc }], { title: '现金转换周期', unit: '天' })],
    laotang: '老唐：能占用别人（预收/应付）而自己被占用少的企业，是「好生意」的典型特征；反之存货与应收越堆越多，要警惕。',
  });

  blocks.push({
    id: 'components',
    title: '三大周转天数拆解',
    summary: '应收天数 + 存货天数 − 应付天数 = CCC。应付天数拉长（占用供应商）会缩短 CCC，但过度占用也可能损害供应链关系。',
    charts: [
      compareBars(
        labels,
        [
          { name: '应收周转天数', data: arDays },
          { name: '存货周转天数', data: invDays },
          { name: '应付周转天数', data: apDays },
        ],
        { title: '周转天数拆解', unit: '天' },
      ),
    ],
  });

  blocks.push({
    id: 'detail',
    title: '营运能力明细',
    summary: '周转天数对照，定位瓶颈在应收回款、存货去化还是对供应商的占款能力。',
    charts: [tableChart],
  });

  return {
    moduleId: 'cashConversionCycle',
    moduleTitle: '现金转换周期',
    blocks,
    warnings: latestCcc == null ? ['现金转换周期：缺少应收/存货/应付或营收/成本数据，未计算。'] : undefined,
  };
}

export const cashConversionCycleModule: AnalysisModule = {
  id: 'cashConversionCycle',
  title: '现金转换周期',
  desc: '应收/存货/应付周转天数与 CCC——看清营运资金效率与产业链话语权。',
  problems: ['operations'],
  industries: [],
  run: runCashConversionCycle,
};
