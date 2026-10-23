import type { ChartRefLine, ChartSpec, ChartValueFormat } from '../analysis/define';
import type { Num } from '../schema/types';
import { periodLabel } from '../utils';

// 方法一：看数据趋势（多年折线）
// 序列支持右轴 / 柱线混排 / 基准线与颜色覆盖，供「多指标对比」直接复用。
export interface TrendSeries {
  name: string;
  values: Num[];
  area?: boolean;
  axis?: 'left' | 'right';
  as?: 'bar' | 'line';
  color?: string;
  dashed?: boolean;
  benchmark?: boolean;
  unit?: string;
}

export interface TrendOptions {
  title?: string;
  unit?: string;
  /** 右轴名称（存在右轴序列时必填） */
  yLabelRight?: string;
  /** 百分比轴（值已 ×100）；等价于 yFormat: 'percent' */
  percent?: boolean;
  yFormat?: ChartValueFormat;
  yFormatRight?: ChartValueFormat;
  refLines?: ChartRefLine[];
  note?: string;
}

export function trendLine(periods: string[], series: TrendSeries[], opts?: TrendOptions): ChartSpec {
  return {
    type: 'line',
    title: opts?.title,
    unit: opts?.unit,
    note: opts?.note,
    yFormat: opts?.yFormat ?? (opts?.percent ? 'percent' : undefined),
    yFormatRight: opts?.yFormatRight,
    yLabelRight: opts?.yLabelRight,
    categories: periods.map(periodLabel),
    series: series.map((item) => ({
      name: item.name,
      data: item.values,
      area: item.area,
      axis: item.axis,
      as: item.as,
      color: item.color,
      dashed: item.dashed,
      benchmark: item.benchmark,
      unit: item.unit,
    })),
    refLines: opts?.refLines,
  };
}

// 同比柱状（首期无同比，置 null；输入是小数，展示为 %）
export function yoyBars(periods: string[], yoys: Num[], name = '同比', unit = '%'): ChartSpec {
  const data = yoys.map((v, i) => (i === 0 || v == null ? null : v * 100));
  return {
    type: 'bar',
    unit,
    yFormat: 'percent',
    categories: periods.map(periodLabel),
    series: [{ name, data }],
  };
}
