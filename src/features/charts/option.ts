import type { ChartRefLine, ChartSpec, ChartValueFormat } from '@/engine';

// ChartSpec → ECharts option 的纯函数适配层（无 Vue 依赖，可直接单测）。
// 三条约定：
//   1. 参考线必须真的画出来——markLine 由 EChart.vue 注册的 MarkLineComponent 渲染。
//   2. 单序列不占图例；多序列图例置顶右侧，可点击隐藏。
//   3. tooltip 带单位与百分比格式；缺失显示「—」，绝不补 0。

export const SERIES_COLORS = ['#1d4ed8', '#0f766e', '#b45309', '#b91c1c', '#6d28d9', '#0891b2'];
export const MUTED = '#94a3b8';

const AMBER = '#b45309';
const GRID_LINE = '#eef2f7';
const AXIS_LABEL = '#64748b';
const AXIS_NAME = '#94a3b8';
const TEXT = '#334155';
const BENCHMARK = '#94a3b8';
const WEAK_BAR = '#cbd5e1';

type Option = Record<string, unknown>;

interface TooltipParam {
  name?: string;
  seriesName?: string;
  axisValue?: string;
  axisValueLabel?: string;
  marker?: string;
  value?: unknown;
  data?: unknown;
}

function isPlainObject(value: unknown): value is Option {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 深合并：对象递归，数组整体替换；避免 ...spec.option 把 yAxis 数组整个覆盖 */
export function mergeOption(base: Option, extra?: Option): Option {
  if (!extra) return base;
  const out: Option = { ...base };
  for (const key of Object.keys(extra)) {
    const b = out[key];
    const e = extra[key];
    out[key] = isPlainObject(b) && isPlainObject(e) ? mergeOption(b, e) : e;
  }
  return out;
}

export function formatValue(
  value: number | null,
  format: ChartValueFormat | undefined,
  unit?: string,
): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const fmt = format ?? (unit === '%' ? 'percent' : 'number');
  if (fmt === 'percent') return `${value.toFixed(1)}%`;
  if (fmt === 'ratio') return value.toFixed(2);
  return unit && unit !== '%' ? `${value.toFixed(1)} ${unit}` : value.toFixed(1);
}

function axisFormatter(format: ChartValueFormat | undefined): ((value: number) => string) | undefined {
  if (format === 'percent') return (value: number) => `${value}%`;
  if (format === 'ratio') return (value: number) => value.toFixed(2);
  return undefined;
}

function resolvedFormat(spec: ChartSpec, unit?: string): ChartValueFormat | undefined {
  return spec.yFormat ?? (unit === '%' ? 'percent' : undefined);
}

function unitOfSeries(spec: ChartSpec, seriesName?: string): string | undefined {
  const series = (spec.series ?? []).find((item) => item.name === seriesName);
  if (series?.unit) return series.unit;
  if (series?.axis === 'right') return spec.yLabelRight ?? spec.unit;
  return spec.unit;
}

function formatOfSeries(spec: ChartSpec, seriesName: string | undefined, unit?: string): ChartValueFormat | undefined {
  const series = (spec.series ?? []).find((item) => item.name === seriesName);
  if (series?.axis === 'right' && spec.yFormatRight) return spec.yFormatRight;
  return resolvedFormat(spec, unit);
}

function numericValue(param: TooltipParam): number | null {
  const raw = param.value;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (Array.isArray(raw)) {
    const second = raw[1];
    if (typeof second === 'number' && Number.isFinite(second)) return second;
  }
  const data = param.data;
  if (isPlainObject(data)) {
    const value = data.value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (Array.isArray(value) && typeof value[1] === 'number') return value[1];
  }
  return null;
}

function tooltipOf(spec: ChartSpec): Option {
  return {
    trigger: 'axis',
    confine: true,
    axisPointer: { type: 'line', lineStyle: { color: '#cbd5e1', type: 'dashed' } },
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderWidth: 1,
    padding: [6, 8],
    textStyle: { color: TEXT, fontSize: 11 },
    extraCssText: 'box-shadow:0 6px 18px rgba(15,23,42,.12);border-radius:4px;',
    formatter: (params: unknown): string => {
      const list = (Array.isArray(params) ? params : [params]) as TooltipParam[];
      if (!list.length) return '';
      const first = list[0];
      const title = first.axisValueLabel ?? first.axisValue ?? first.name ?? '';
      const rows = list.map((param) => {
        const unit = unitOfSeries(spec, param.seriesName);
        const format = formatOfSeries(spec, param.seriesName, unit);
        return `${param.marker ?? ''}${param.seriesName ?? ''}：${formatValue(numericValue(param), format, unit)}`;
      });
      return title ? `${title}<br/>${rows.join('<br/>')}` : rows.join('<br/>');
    },
  };
}

function refColor(kind: ChartRefLine['kind']): string {
  if (kind === 'median') return MUTED;
  if (kind === 'zero') return '#cbd5e1';
  return AMBER;
}

interface MarkLineOptions {
  /** false = 隐藏中位数标签，只留线与脚注（横条图里避免和末端数值打架） */
  labelMedian?: boolean;
  /** 散点的 y 轴是 value 轴，x 参考线标签要放到顶端 */
  xLabelPosition?: 'insideStartBottom' | 'insideEndTop';
}

function markLineOf(spec: ChartSpec, opts: MarkLineOptions = {}): Option | undefined {
  if (!spec.refLines?.length) return undefined;
  return {
    silent: true,
    symbol: ['none', 'none'],
    animation: false,
    label: { show: false },
    data: spec.refLines.map((line, index) => {
      const color = refColor(line.kind);
      const showLabel = Boolean(line.label) && !(line.kind === 'median' && opts.labelMedian === false);
      const item: Option = {
        name: line.label ?? '',
        lineStyle: { color, width: 1, type: 'dashed' },
        label: {
          show: showLabel,
          // 两条门线挨得近时（如 Beneish −2.22/−1.78），标签上下错开，避免叠在一起。
          position:
            line.axis === 'x'
              ? (opts.xLabelPosition ?? 'insideStartBottom')
              : index % 2 === 0
                ? 'insideEndTop'
                : 'insideEndBottom',
          rotate: 0,
          align: line.axis === 'x' ? 'right' : undefined,
          formatter: line.label ?? '',
          color,
          fontSize: 11,
          backgroundColor: 'rgba(255,255,255,0.9)',
          padding: [1, 3],
        },
      };
      if (line.axis === 'x') item.xAxis = line.value;
      else item.yAxis = line.value;
      return item;
    }),
  };
}

function legendOf(spec: ChartSpec): Option {
  const names = (spec.series ?? []).map((series) => series.name);
  return {
    show: spec.legend ?? names.length > 1,
    top: 0,
    right: 0,
    type: 'scroll',
    itemWidth: 10,
    itemHeight: 8,
    icon: 'circle',
    textStyle: { fontSize: 11, color: '#475569' },
    data: names,
  };
}

function gridOf(showLegend: boolean): Option {
  // containLabel 负责轴标签，但线图最右一个类目标签仍需要额外的右侧留白。
  return { left: 8, right: 18, top: showLegend ? 26 : 8, bottom: 2, containLabel: true };
}

function categoryAxis(spec: ChartSpec, boundaryGap: boolean): Option {
  return {
    type: 'category',
    data: spec.categories ?? [],
    boundaryGap,
    axisLine: { lineStyle: { color: '#e2e8f0' } },
    axisTick: { show: false },
    axisLabel: { fontSize: 11, color: AXIS_LABEL, hideOverlap: true },
  };
}

function valueAxis(
  format: ChartValueFormat | undefined,
  name: string | undefined,
  splitLine = true,
): Option {
  return {
    type: 'value',
    name: name || undefined,
    nameTextStyle: { fontSize: 11, color: AXIS_NAME, align: 'left' },
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { fontSize: 11, color: AXIS_LABEL, formatter: axisFormatter(format) },
    splitLine: splitLine
      ? { show: true, lineStyle: { color: GRID_LINE, type: 'dashed' } }
      : { show: false },
  };
}

function buildCartesian(spec: ChartSpec): Option {
  const isLine = spec.type === 'line';
  const isHorizontal = spec.type === 'horizontalBar';
  const useRight = !isHorizontal && (spec.series ?? []).some((series) => series.axis === 'right');
  const showLegend = spec.legend ?? (spec.series ?? []).length > 1;
  const barCount = (spec.series ?? []).filter(
    (series) => (series.as ?? (isLine ? 'line' : 'bar')) === 'bar',
  ).length;
  const lineCount = (spec.series ?? []).filter(
    (series) => (series.as ?? (isLine ? 'line' : 'bar')) === 'line',
  ).length;
  const autoArea = lineCount === 1 && barCount === 0;
  // 参考线只挂在一个左轴系列上，避免多序列重复画同一条线。
  const firstLeft = (spec.series ?? []).findIndex((series) => !(series.axis === 'right' && !isHorizontal));

  const series = (spec.series ?? []).map((series, index) => {
    const type = isHorizontal ? 'bar' : (series.as ?? (isLine ? 'line' : 'bar'));
    const benchmark = Boolean(series.benchmark);
    const color = benchmark ? BENCHMARK : series.color;
    let data: unknown = series.data;
    if (
      type === 'bar' &&
      barCount === 1 &&
      spec.highlightIndex != null &&
      spec.highlightIndex >= 0
    ) {
      data = series.data.map((value, index) => ({
        value,
        itemStyle: { color: index === spec.highlightIndex ? (color ?? SERIES_COLORS[0]) : WEAK_BAR },
      }));
    }
    return {
      name: series.name,
      type,
      data,
      color: color ?? undefined,
      smooth: type === 'line' ? 0.25 : undefined,
      showSymbol: type === 'line' ? series.data.length <= 8 : undefined,
      symbolSize: 6,
      barMaxWidth: 28,
      stack: spec.type === 'stackedBar' && !useRight ? 'total' : undefined,
      yAxisIndex: series.axis === 'right' && !isHorizontal ? 1 : 0,
      itemStyle: {
        borderRadius: type === 'bar' ? [3, 3, 0, 0] : undefined,
        opacity: benchmark ? 0.9 : undefined,
      },
      lineStyle:
        type === 'line'
          ? {
              width: benchmark ? 1.5 : 2,
              type: benchmark || series.dashed ? 'dashed' : 'solid',
            }
          : undefined,
      areaStyle: type === 'line' && !benchmark && (series.area || autoArea) ? { opacity: 0.12 } : undefined,
      emphasis: { focus: 'series' },
      label:
        isHorizontal && barCount === 1
          ? {
              show: true,
              position: 'insideRight',
              fontSize: 11,
              color: '#334155',
              backgroundColor: 'rgba(255,255,255,0.82)',
              padding: [1, 3],
              formatter: (param: { value?: unknown }) => {
                const value = typeof param.value === 'number' ? param.value : null;
                if (value == null || value === 0) return '';
                return formatValue(value, spec.yFormat, spec.unit);
              },
            }
          : undefined,
      markLine:
        index === firstLeft && !(series.axis === 'right' && !isHorizontal)
          ? markLineOf(spec, { labelMedian: spec.highlightIndex == null })
          : undefined,
    };
  });

  const base: Option = {
    color: SERIES_COLORS,
    tooltip: tooltipOf(spec),
    legend: legendOf(spec),
    grid: gridOf(showLegend),
    series,
  };

  if (isHorizontal) {
    // 横条右侧要留出「末端数值」的位置；否则 100% 的柱子会把标签顶出画布。
    base.grid = { ...gridOf(showLegend), right: 44 };
    // 横条的单位已在 ChartFrame 标题右侧显示，轴上不再重复放「%」造成右端裁切。
    base.xAxis = valueAxis(spec.yFormat, undefined);
    base.yAxis = {
      type: 'category',
      data: spec.categories ?? [],
      inverse: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { fontSize: 11, color: AXIS_LABEL },
    };
  } else {
    base.xAxis = categoryAxis(spec, !isLine);
    base.yAxis = [
      valueAxis(spec.yFormat, spec.unit),
      ...(useRight ? [valueAxis(spec.yFormatRight, spec.yLabelRight, false)] : []),
    ];
  }

  return mergeOption(base, spec.option);
}

function buildPie(spec: ChartSpec): Option {
  return mergeOption(
    {
      color: SERIES_COLORS,
      tooltip: { trigger: 'item', confine: true },
      legend: {
        bottom: 0,
        type: 'scroll',
        itemWidth: 10,
        itemHeight: 8,
        icon: 'circle',
        textStyle: { fontSize: 11, color: '#475569' },
      },
      series: [
        {
          type: 'pie',
          radius: ['42%', '70%'],
          data: spec.pie ?? [],
          label: { formatter: '{b}: {d}%', fontSize: 11, color: TEXT },
          itemStyle: { borderColor: '#ffffff', borderWidth: 1 },
        },
      ],
    },
    spec.option,
  );
}

function buildWaterfall(spec: ChartSpec): Option {
  const waterfall = spec.waterfall;
  if (!waterfall) return {};
  const categories = waterfall.categories;
  const isTotal = waterfall.isTotal ?? categories.map((_, index) => index === 0 || index === categories.length - 1);
  const placeholder: (number | null)[] = [];
  const bars: Option[] = [];
  let running = 0;

  categories.forEach((_, index) => {
    const value = waterfall.values[index] ?? null;
    if (value == null) {
      placeholder.push(null);
      bars.push({ value: null, itemStyle: { color: 'transparent' } });
      return;
    }
    if (isTotal[index]) {
      placeholder.push(0);
      bars.push({ value, itemStyle: { color: SERIES_COLORS[0] } });
      running = value;
      return;
    }
    if (value >= 0) {
      placeholder.push(running);
      bars.push({ value, itemStyle: { color: '#b91c1c' } });
    } else {
      placeholder.push(running + value);
      bars.push({ value: -value, itemStyle: { color: '#0f766e' } });
    }
    running += value;
  });

  return mergeOption(
    {
      tooltip: {
        trigger: 'axis',
        confine: true,
        axisPointer: { type: 'shadow' },
        backgroundColor: '#ffffff',
        borderColor: '#e2e8f0',
        borderWidth: 1,
        textStyle: { color: TEXT, fontSize: 11 },
        formatter: (params: TooltipParam[]): string => {
          const index = categories.indexOf(params[0]?.name ?? '');
          const raw = index >= 0 ? waterfall.values[index] : null;
          const found = params.find((param) => param.data && isPlainObject(param.data) && param.data.value != null);
          if (!found) return `${params[0]?.name ?? ''}：—`;
          const sign = (raw ?? 0) > 0 && !isTotal[index] ? '+' : '';
          return `${params[0]?.name ?? ''}：${sign}${(raw ?? 0).toFixed(1)}${spec.unit ?? ''}`;
        },
      },
      grid: { left: 4, right: 16, top: 12, bottom: 2, containLabel: true },
      xAxis: {
        type: 'category',
        data: categories,
        axisLine: { lineStyle: { color: '#e2e8f0' } },
        axisTick: { show: false },
        axisLabel: { fontSize: 11, color: AXIS_LABEL, interval: 0, rotate: categories.length > 6 ? 30 : 0 },
      },
      yAxis: valueAxis(spec.yFormat, spec.unit),
      series: [
        {
          type: 'bar',
          stack: 'waterfall',
          data: placeholder,
          itemStyle: { color: 'transparent' },
          emphasis: { itemStyle: { color: 'transparent' } },
          silent: true,
          tooltip: { show: false },
        },
        {
          type: 'bar',
          stack: 'waterfall',
          data: bars,
          barMaxWidth: 28,
          markLine: markLineOf(spec),
          label: {
            show: true,
            position: 'top',
            fontSize: 11,
            color: TEXT,
            formatter: (param: { dataIndex: number }) => {
              const raw = waterfall.values[param.dataIndex];
              if (raw == null) return '';
              const sign = raw > 0 && !isTotal[param.dataIndex] ? '+' : '';
              return `${sign}${raw.toFixed(1)}`;
            },
          },
        },
      ],
    },
    spec.option,
  );
}

function buildHeatmap(spec: ChartSpec): Option {
  const heatmap = spec.heatmap;
  if (!heatmap) return {};
  const nCols = heatmap.cols.length;
  const data: [number, number, number | null][] = [];
  heatmap.rows.forEach((_, rowIndex) => {
    heatmap.cols.forEach((__, colIndex) => {
      data.push([colIndex, rowIndex, heatmap.values[rowIndex * nCols + colIndex] ?? null]);
    });
  });
  const valid = heatmap.values.filter((value): value is number => value != null);
  const min = heatmap.visualMin ?? (valid.length ? Math.min(...valid) : 0);
  const max = heatmap.visualMax ?? (valid.length ? Math.max(...valid) : 1);

  return mergeOption(
    {
      tooltip: {
        position: 'top',
        confine: true,
        backgroundColor: '#ffffff',
        borderColor: '#e2e8f0',
        borderWidth: 1,
        textStyle: { color: TEXT, fontSize: 11 },
        formatter: (param: { data: [number, number, number | null] }): string => {
          const [col, row, value] = param.data;
          if (value == null) return `${heatmap.rows[row]} · ${heatmap.cols[col]}：—`;
          return `${heatmap.rows[row]} · ${heatmap.cols[col]}：${(value * 100).toFixed(1)}${heatmap.unit ?? '%'}`;
        },
      },
      grid: { left: 4, right: 16, top: 6, bottom: 10, containLabel: true },
      xAxis: {
        type: 'category',
        data: heatmap.cols,
        splitArea: { show: true },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { fontSize: 11, color: AXIS_LABEL },
      },
      yAxis: {
        type: 'category',
        data: heatmap.rows,
        splitArea: { show: true },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { fontSize: 11, color: AXIS_LABEL },
      },
      visualMap: {
        min,
        max,
        calculable: false,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        itemWidth: 12,
        itemHeight: 80,
        textStyle: { fontSize: 11, color: AXIS_LABEL },
        formatter: (value: number) => `${(value * 100).toFixed(0)}${heatmap.unit ?? '%'}`,
        inRange: { color: ['#f1f5f9', '#bfdbfe', '#1d4ed8'] },
      },
      series: [
        {
          type: 'heatmap',
          data,
          label: {
            show: true,
            fontSize: 11,
            color: TEXT,
            formatter: (param: { data: [number, number, number | null] }) =>
              param.data[2] == null ? '—' : `${(param.data[2] * 100).toFixed(0)}`,
          },
          itemStyle: { borderColor: '#ffffff', borderWidth: 1 },
          emphasis: { itemStyle: { borderColor: '#1d4ed8', borderWidth: 2 } },
        },
      ],
    },
    spec.option,
  );
}

function buildScatter(spec: ChartSpec): Option {
  const points = spec.points ?? [];
  const normal = points.filter((point) => !point.highlight);
  const highlighted = points.filter((point) => point.highlight);
  const series: Option[] = [
    {
      type: 'scatter',
      name: '同业',
      data: normal.map((point) => ({ value: [point.x, point.y], name: point.name })),
      symbolSize: 9,
      itemStyle: { color: MUTED, opacity: 0.65 },
      emphasis: { scale: 1.8 },
      markLine: markLineOf(spec, { labelMedian: false }),
    },
  ];
  if (highlighted.length) {
    series.push({
      type: 'scatter',
      name: highlighted[0].name,
      data: highlighted.map((point) => ({ value: [point.x, point.y], name: point.name })),
      symbolSize: 13,
      itemStyle: { color: '#b91c1c' },
      label: { show: true, position: 'top', fontSize: 11, color: '#b91c1c', formatter: '{b}' },
      emphasis: { scale: 1.5 },
    });
  }

  return mergeOption(
    {
      color: SERIES_COLORS,
      tooltip: {
        trigger: 'item',
        confine: true,
        backgroundColor: '#ffffff',
        borderColor: '#e2e8f0',
        borderWidth: 1,
        textStyle: { color: TEXT, fontSize: 11 },
        formatter: (param: TooltipParam & { data?: { value?: [number, number]; name?: string } }): string => {
          const value = param.data?.value;
          const name = param.data?.name ?? param.seriesName ?? '';
          if (!value) return name;
          return `${name}：${spec.xLabel ?? 'X'} ${value[0]} / ${spec.yLabel ?? 'Y'} ${value[1]}`;
        },
      },
      grid: { left: 44, right: 24, top: 18, bottom: 34, containLabel: true },
      xAxis: {
        type: 'value',
        name: spec.xLabel,
        nameLocation: 'middle',
        nameGap: 24,
        nameTextStyle: { fontSize: 11, color: AXIS_NAME },
        scale: true,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { fontSize: 11, color: AXIS_LABEL },
        splitLine: { show: true, lineStyle: { color: GRID_LINE, type: 'dashed' } },
      },
      yAxis: {
        type: 'value',
        name: spec.yLabel,
        nameLocation: 'middle',
        nameGap: 30,
        nameRotate: 90,
        nameTextStyle: { fontSize: 11, color: AXIS_NAME },
        scale: true,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { fontSize: 11, color: AXIS_LABEL },
        splitLine: { show: true, lineStyle: { color: GRID_LINE, type: 'dashed' } },
      },
      series,
    },
    spec.option,
  );
}

export function buildOption(spec: ChartSpec): Option {
  if (spec.type === 'pie') return buildPie(spec);
  if (spec.type === 'waterfall') return buildWaterfall(spec);
  if (spec.type === 'heatmap') return buildHeatmap(spec);
  if (spec.type === 'scatter') return buildScatter(spec);
  if (spec.type === 'table') return {};
  return buildCartesian(spec);
}
