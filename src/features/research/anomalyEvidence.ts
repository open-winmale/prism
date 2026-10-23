import type { AnalysisContext, AnomalySignal, ChartSpec } from '@/engine';
import { STMT_TREE, expandStatement } from '@/engine/derivations';
import { fieldGetter } from '@/engine/compute';
import { sameQuarterYoyOf, yoyOf } from '@/engine/methods/columns';
import { trendLine } from '@/engine/methods/trend';
import { relatedOf } from '@/engine/analysis/anomalyScan';

// 异动信号的「证据图」：检出突变后，不是只给一行文字，而是立刻给两张图——
//   1) 历史趋势：该科目的完整序列（原值或占基项比重），跳变点在长序列里看是不是一次性事件；
//   2) 关联对比：该科目同比 vs 主关联指标同比（营收/净利/经营现金流…），看突变是孤立的还是同步的。
// 原则：科目自己涨不算事，与关联指标的方向背离才是问题。

/** 百分比刻度：自适应小数位——研发费用率 0.057% 这类量级 toFixed(1) 会全塌成 0.1 画成直线 */
function scalePct(xs: (number | null)[]): (number | null)[] {
  const finite = xs.filter((v): v is number => v != null && Number.isFinite(v)).map((v) => v * 100);
  const maxAbs = finite.length ? Math.max(...finite.map(Math.abs)) : 0;
  // 位级自适应：<0.5% 保 3 位、<5% 保 2 位、其余 1 位
  const digits = maxAbs < 0.5 ? 3 : maxAbs < 5 ? 2 : 1;
  return xs.map((v) => (v == null ? null : +(v * 100).toFixed(digits)));
}

/** 金额刻度（亿元）：同样自适应——0.6 亿 vs 200 亿 的图表需要的精度不同 */
function scaleRaw(xs: (number | null)[]): (number | null)[] {
  const finite = xs.filter((v): v is number => v != null && Number.isFinite(v)).map((v) => v / 1e8);
  const maxAbs = finite.length ? Math.max(...finite.map(Math.abs)) : 0;
  const digits = maxAbs < 10 ? 2 : maxAbs < 100 ? 1 : 0;
  return xs.map((v) => (v == null ? null : +(v / 1e8).toFixed(digits)));
}

function labelsOf(ctx: AnalysisContext): string[] {
  return ctx.dataset.reports.map((r) =>
    r.sampling && r.sampling !== 'Q4' ? `${r.period.slice(0, 4)}Q${r.sampling.slice(1)}` : r.period.slice(0, 4),
  );
}

function valuesOf(ctx: AnalysisContext, kind: 'balance' | 'income' | 'cashflow', rowKey: string): (number | null)[] {
  const row = STMT_TREE[kind].find((r) => r.k === rowKey);
  if (!row) return [];
  return ctx.dataset.reports.map((r) => {
    const matrix = expandStatement(kind, fieldGetter(r));
    const idx = STMT_TREE[kind].findIndex((x) => x.k === rowKey);
    const v = idx >= 0 ? matrix[idx]?.value : null;
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  });
}

/** 同比口径：年度序列相邻比；季度单季序列必须走同季对比（相邻比是环比，会被季节效应污染） */
function yoyOfKind(reports: AnalysisContext['dataset']['reports'], values: (number | null)[]): (number | null)[] {
  const quarterly = reports.some((r) => r.sampling && r.sampling !== 'Q4');
  return quarterly ? sameQuarterYoyOf(reports, values) : yoyOf(values);
}

/** 图 1：该科目的历史变化趋势（金额行 = 原值 + 占基项比重；比率行 = 比率本身） */
export function anomalyTrendSpec(ctx: AnalysisContext, signal: AnomalySignal): ChartSpec | null {
  const labels = labelsOf(ctx);
  const row = STMT_TREE[signal.kind].find((r) => r.k === signal.itemKey);
  if (!row) return null;

  if (row.pct) {
    // 比率行：直接看比率历史
    return trendLine(labels, [{ name: signal.itemName, values: scalePct(signal.shareSeries), area: true }], {
      title: `${signal.itemName} 历史趋势`,
      unit: '%',
      yFormat: 'percent',
      note: '比率行的突变直接看比率本身的历史位置：一次性跳变还是趋势拐点。',
    });
  }

  // 金额行：原值（柱）+ 占基项比重（线，右轴）
  const raw = valuesOf(ctx, signal.kind, signal.itemKey);
  return trendLine(
    labels,
    [
      { name: `${signal.itemName}（亿）`, values: scaleRaw(raw), as: 'bar' },
      { name: '占总资产比重（%）', values: scalePct(signal.shareSeries), axis: 'right', as: 'line' },
    ],
    {
      title: `${signal.itemName} 历史趋势`,
      unit: '亿元 / %',
      yLabelRight: '占比 %',
      yFormatRight: 'percent',
      note: '柱看绝对规模，线看占总资产（利润/现金流科目为占营收）的比重——跳变发生在长序列的什么位置一目了然。',
    },
  );
}

/** 图 2：该科目同比 vs 主关联指标同比（同图双线，看背离） */
export function anomalyCompareSpec(ctx: AnalysisContext, signal: AnomalySignal, related: { key: string; name: string; kind: 'balance' | 'income' | 'cashflow' }): ChartSpec | null {
  const labels = labelsOf(ctx);
  const selfValues = valuesOf(ctx, signal.kind, signal.itemKey);
  const relValues = valuesOf(ctx, related.kind, related.key);
  if (!selfValues.length || !relValues.length) return null;
  const selfYoy = yoyOfKind(ctx.dataset.reports, selfValues);
  const relYoy = yoyOfKind(ctx.dataset.reports, relValues);
  return trendLine(
    labels,
    [
      { name: `${signal.itemName} 同比`, values: scalePct(selfYoy) },
      { name: `${related.name} 同比`, values: scalePct(relYoy), dashed: true },
    ],
    {
      title: `${signal.itemName} vs ${related.name}（同比）`,
      unit: '%',
      yFormat: 'percent',
      refLines: [{ value: 0, label: '0%', kind: 'zero' }],
      note: '两条线的背离是关键：科目增速持续快于关联指标 = 信用换收入/占款/囤积；同步波动多为行业共性。',
    },
  );
}

/** 科目的主关联指标（供 UI 展示名称） */
export function relatedOfSignal(itemKey: string): { key: string; name: string; kind: 'balance' | 'income' | 'cashflow' } {
  return relatedOf(itemKey)[0] ?? { key: 'TR', name: '营业总收入', kind: 'income' as const };
}

/** 一次给齐两张证据图 */
export function anomalyEvidenceSpecs(ctx: AnalysisContext, signal: AnomalySignal): { trend: ChartSpec | null; compare: ChartSpec | null; related: { key: string; name: string } } {
  const related = relatedOfSignal(signal.itemKey);
  return {
    trend: anomalyTrendSpec(ctx, signal),
    compare: anomalyCompareSpec(ctx, signal, related),
    related: { key: related.key, name: related.name },
  };
}
