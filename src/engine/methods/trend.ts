import type { ChartRefLine, ChartSpec } from '../analysis/define';
import type { Num } from '../schema/types';
import { periodLabel } from '../utils';

// 方法一：看数据趋势（多年折线）
export function trendLine(
  periods: string[],
  series: { name: string; values: Num[]; area?: boolean }[],
  opts?: { title?: string; unit?: string; percent?: boolean; refLines?: ChartRefLine[] },
): ChartSpec {
  return {
    type: 'line',
    title: opts?.title,
    unit: opts?.unit,
    categories: periods.map(periodLabel),
    series: series.map((s) => ({ name: s.name, data: s.values, area: s.area })),
    refLines: opts?.refLines,
    option: opts?.percent ? { yAxis: { axisLabel: { formatter: '{value}%' } } } : undefined,
  };
}

// 同比柱状（首期无同比，置 null）
export function yoyBars(periods: string[], yoys: Num[], name = '同比', unit = '%'): ChartSpec {
  const data = yoys.map((v, i) => (i === 0 ? null : v));
  return {
    type: 'bar',
    unit,
    categories: periods.map(periodLabel),
    series: [{ name, data }],
  };
}
