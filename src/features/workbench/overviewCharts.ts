import type { AnalysisContext, ChartSpec } from '@/engine';
import { comparableMetrics } from '@/engine';
import { reportLabel } from '@/engine/utils';

// 概览 2×2 的图表定义（与页面解耦，预览页复用同一组 spec，保证「草图 = 实现」）。

export interface OverviewChart {
  spec: ChartSpec;
  source: string;
}

function scaleYi(values: (number | null)[]): (number | null)[] {
  return values.map((v) => (v == null ? null : +(v / 1e8).toFixed(1)));
}

function scalePct(values: (number | null)[]): (number | null)[] {
  return values.map((v) => (v == null ? null : +(v * 100).toFixed(1)));
}

export function overviewTrendSpecs(ctx: AnalysisContext): OverviewChart[] {
  const metrics = comparableMetrics(ctx);
  const labels = ctx.dataset.reports.map(reportLabel);
  const values = (key: string): (number | null)[] =>
    metrics.find((metric) => metric.key === key)?.values ?? [];
  const growth = (key: string): (number | null)[] =>
    metrics.find((metric) => metric.key === key)?.growth ?? [];

  return [
    {
      spec: {
        type: 'bar',
        title: '规模与现金含量',
        unit: '亿元',
        categories: labels,
        series: [
          { name: '营业总收入', as: 'bar', data: scaleYi(values('revenue')) },
          { name: '归母净利润', as: 'line', data: scaleYi(values('net_profit_parent')) },
          { name: '经营现金流净额', as: 'line', data: scaleYi(values('cfo')) },
        ],
        note: '柱看规模，线看利润与现金是否同向。',
      },
      source: '三表',
    },
    {
      spec: {
        type: 'line',
        title: '增速对比',
        unit: '%',
        yFormat: 'percent',
        categories: labels,
        series: [
          { name: '营收同比', data: scalePct(growth('revenue')) },
          { name: '归母净利同比', data: scalePct(growth('net_profit_parent')) },
          { name: 'CFO 同比', data: scalePct(growth('cfo')) },
        ],
        refLines: [{ value: 0, label: '0%', kind: 'zero' }],
        note: '季度口径按同季对比；首期无同比。',
      },
      source: '三表 · 派生',
    },
    {
      spec: {
        type: 'line',
        title: '利润率对比',
        unit: '%',
        yFormat: 'percent',
        categories: labels,
        series: [
          { name: '毛利率', data: scalePct(values('gross_margin')) },
          { name: '归母净利率', data: scalePct(values('net_margin')) },
        ],
        note: '毛利率到净利率的裂口 = 费用与税费。',
      },
      source: '利润表 · 派生',
    },
    {
      spec: {
        type: 'line',
        title: 'CFO / 归母净利',
        unit: '%',
        yFormat: 'percent',
        categories: labels,
        series: [{ name: 'CFO/归母净利', data: scalePct(values('cfo_to_np')), area: true }],
        refLines: [{ value: 100, label: '100% 门线', kind: 'threshold' }],
        note: '100% 门线：经营现金流覆盖账面利润。',
      },
      source: '现金流量表 · 派生',
    },
  ];
}
