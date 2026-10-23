import { describe, expect, it } from 'vitest';
import type { ChartSpec } from '@/engine';
import { buildOption, formatValue, mergeOption } from './option';

interface MarkLineItem {
  xAxis?: number;
  yAxis?: number;
  lineStyle?: { color?: string };
  label?: { show?: boolean; position?: string };
}

interface SeriesLike {
  type?: string;
  name?: string;
  data?: unknown;
  label?: { show?: boolean };
  markLine?: { data?: MarkLineItem[] };
}

interface AxisLike {
  type?: string;
  inverse?: boolean;
  name?: string;
}

function lineSpec(overrides: Partial<ChartSpec> = {}): ChartSpec {
  return {
    type: 'line',
    title: '测试',
    unit: '%',
    yFormat: 'percent',
    categories: ['2021', '2022'],
    series: [{ name: 'A', data: [10, 20] }],
    ...overrides,
  };
}

describe('chart option：图例与参考线', () => {
  it('单序列隐藏图例，多序列显示', () => {
    expect((buildOption(lineSpec()).legend as { show: boolean }).show).toBe(false);
    const two = buildOption(
      lineSpec({ series: [{ name: 'A', data: [1, 2] }, { name: 'B', data: [2, 3] }] }),
    );
    expect((two.legend as { show: boolean }).show).toBe(true);
  });

  it('参考线渲染成 markLine，并按语义分色', () => {
    const opt = buildOption(
      lineSpec({
        refLines: [
          { value: 100, label: '门线', kind: 'threshold' },
          { value: 50, label: '中位', kind: 'median' },
        ],
      }),
    );
    const series = opt.series as SeriesLike[];
    const data = series[0].markLine?.data ?? [];
    expect(data[0].yAxis).toBe(100);
    expect(data[0].lineStyle?.color).toBe('#b45309');
    expect(data[1].lineStyle?.color).toBe('#94a3b8');
    expect(data[0].label?.show).toBe(true);
  });

  it('横条图的 x 参考线映射到 xAxis，且中位数标签可关闭', () => {
    const opt = buildOption({
      type: 'horizontalBar',
      unit: '%',
      yFormat: 'percent',
      categories: ['A', 'B'],
      series: [{ name: '分位', data: [30, 70] }],
      highlightIndex: 0,
      refLines: [{ value: 50, label: '中位', axis: 'x', kind: 'median' }],
    });
    const series = opt.series as SeriesLike[];
    expect(series[0].markLine?.data?.[0].xAxis).toBe(50);
    expect(series[0].markLine?.data?.[0].label?.show).toBe(false);
  });
});

describe('chart option：横向柱与高亮', () => {
  it('horizontalBar 轴互换并反转类目顺序（第一项在最上）', () => {
    const opt = buildOption({
      type: 'horizontalBar',
      unit: '%',
      yFormat: 'percent',
      categories: ['A', 'B'],
      series: [{ name: 'x', data: [10, 20] }],
    });
    expect((opt.xAxis as AxisLike).type).toBe('value');
    expect((opt.yAxis as AxisLike).type).toBe('category');
    expect((opt.yAxis as AxisLike).inverse).toBe(true);
    expect((opt.series as SeriesLike[])[0].label?.show).toBe(true);
  });

  it('highlightIndex 只高亮本公司那一根柱，其余弱化', () => {
    const opt = buildOption({
      type: 'horizontalBar',
      unit: '%',
      yFormat: 'percent',
      categories: ['本公司', '同业'],
      series: [{ name: '毛利率', data: [90, 70] }],
      highlightIndex: 0,
    });
    const data = (opt.series as SeriesLike[])[0].data as { itemStyle: { color: string } }[];
    expect(data[0].itemStyle.color).toBe('#1d4ed8');
    expect(data[1].itemStyle.color).toBe('#cbd5e1');
  });
});

describe('chart option：tooltip 与格式', () => {
  it('tooltip 带单位；缺失显示 —', () => {
    const opt = buildOption(
      lineSpec({ series: [{ name: '毛利率', data: [91.3, null] }] }),
    );
    const formatter = (opt.tooltip as { formatter: (p: unknown) => string }).formatter;
    expect(formatter([{ axisValue: '2021', seriesName: '毛利率', value: 91.3 }])).toContain('91.3%');
    expect(formatter([{ axisValue: '2022', seriesName: '毛利率', value: null }])).toContain('—');
  });

  it('formatValue：percent / ratio / 货币', () => {
    expect(formatValue(91.34, 'percent')).toBe('91.3%');
    expect(formatValue(0.756, 'ratio')).toBe('0.76');
    expect(formatValue(1234.5, undefined, '亿元')).toBe('1234.5 亿元');
    expect(formatValue(null, 'percent')).toBe('—');
  });
});

describe('chart option：合并与散点', () => {
  it('mergeOption 深合并对象、数组整体替换', () => {
    const merged = mergeOption(
      { yAxis: [{ name: '亿元' }], grid: { left: 8 } },
      { yAxis: { axisLabel: { formatter: '{value}%' } }, grid: { right: 10 } },
    );
    // 数组被整体替换为对象（调用方显式覆盖轴配置的语义）
    expect(Array.isArray(merged.yAxis)).toBe(false);
    expect(merged.grid).toMatchObject({ left: 8, right: 10 });
  });

  it('scatter 的中位数参考线不显示标签，轴名由 xLabel/yLabel 驱动', () => {
    const opt = buildOption({
      type: 'scatter',
      xLabel: 'PE(TTM)',
      yLabel: 'ROE(%)',
      points: [
        { name: '甲', x: 10, y: 20 },
        { name: '乙', x: 12, y: 22, highlight: true },
      ],
      refLines: [{ value: 11, label: 'PE 中位数 11', axis: 'x', kind: 'median' }],
    });
    const series = opt.series as SeriesLike[];
    expect(series).toHaveLength(2);
    expect(series[0].markLine?.data?.[0].label?.show).toBe(false);
    expect((opt.xAxis as AxisLike).name).toBe('PE(TTM)');
    expect((opt.yAxis as AxisLike).name).toBe('ROE(%)');
  });
});
