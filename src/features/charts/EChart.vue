<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { BarChart, HeatmapChart, LineChart, PieChart, ScatterChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent, VisualMapComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { ChartSpec } from '@/engine';

// 仅注册用到的模块，控制打包体积
echarts.use([
  BarChart,
  HeatmapChart,
  LineChart,
  PieChart,
  ScatterChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  VisualMapComponent,
  CanvasRenderer,
]);

const props = defineProps<{ spec: ChartSpec; /** 自定义高度（px）；缺省用响应式默认 */ height?: number }>();
const el = ref<HTMLElement | null>(null);
let chart: echarts.EChartsType | null = null;

// 品牌序列色——首色与设计 token brand 一致
const SERIES_COLORS = ['#1d4ed8', '#0f766e', '#b45309', '#b91c1c', '#6d28d9', '#0891b2'];
const MUTED = '#94a3b8';

// 空数据检测（禁止渲染空白画布）
const spec = computed(() => props.spec);
const isEmpty = computed(() => {
  const s = spec.value;
  if (s.type === 'pie') return !s.pie || s.pie.length === 0;
  if (s.type === 'table') return !s.table || s.table.rows.length === 0;
  if (s.type === 'scatter') return !s.points || s.points.length === 0;
  if (s.type === 'waterfall') return !s.waterfall || s.waterfall.values.every((v) => v == null);
  if (s.type === 'heatmap') return !s.heatmap || s.heatmap.values.every((v) => v == null);
  const series = s.series ?? [];
  return series.every((x) => x.data.every((v) => v == null));
});

// 参考线 → markLine（阈值线 / 中位数线；支持 x / y 轴）
function markLineOf(s: ChartSpec): Record<string, unknown> | undefined {
  if (!s.refLines?.length) return undefined;
  return {
    silent: true,
    symbol: 'none',
    lineStyle: { type: 'dashed', color: '#b45309', width: 1 },
    label: {
      show: true,
      position: 'insideEndTop',
      fontSize: 10,
      color: '#b45309',
      formatter: (params: { name?: string }) => params.name || '',
    },
    data: s.refLines.map((line) =>
      line.axis === 'x' ? { name: line.label ?? '', xAxis: line.value } : { name: line.label ?? '', yAxis: line.value },
    ),
  };
}

// 把通用 ChartSpec 翻译成 ECharts option（图表适配层，框架无关）
function build(s: ChartSpec): Record<string, unknown> {
  if (s.type === 'pie') {
    return {
      color: SERIES_COLORS,
      tooltip: { trigger: 'item' },
      legend: { bottom: 0, type: 'scroll' },
      series: [
        {
          type: 'pie',
          radius: ['42%', '70%'],
          data: s.pie || [],
          label: { formatter: '{b}: {d}%' },
        },
      ],
    };
  }
  // 瀑布：总数柱整根落地，增量柱按正负悬浮在累计值上。
  // 配色遵循 A 股「涨红跌绿」：增加 #b91c1c、减少 #0f766e，首尾总数柱用品牌蓝。
  if (s.type === 'waterfall') {
    const w = s.waterfall;
    if (!w) return {};
    const cats = w.categories;
    const isTotal = w.isTotal ?? cats.map((_, i) => i === 0 || i === cats.length - 1);
    const placeholder: (number | null)[] = [];
    const bars: Record<string, unknown>[] = [];
    let running = 0;
    cats.forEach((_, i) => {
      const v = w.values[i] ?? null;
      if (v == null) {
        placeholder.push(null);
        bars.push({ value: null, itemStyle: { color: 'transparent' } });
        return;
      }
      if (isTotal[i]) {
        placeholder.push(0);
        bars.push({ value: v, itemStyle: { color: '#1d4ed8' } });
        running = v;
        return;
      }
      if (v >= 0) {
        placeholder.push(running);
        bars.push({ value: v, itemStyle: { color: '#b91c1c' } });
      } else {
        placeholder.push(running + v);
        bars.push({ value: -v, itemStyle: { color: '#0f766e' } });
      }
      running += v;
    });
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: { name?: string; data?: { value?: number } }[]) => {
          const idx = cats.indexOf(params[0]?.name ?? '');
          const raw = idx >= 0 ? w.values[idx] : null;
          const p = params.find((x) => x.data && x.data.value != null);
          if (p == null) return `${params[0]?.name ?? ''}：—`;
          const sign = (raw ?? 0) > 0 && !isTotal[idx] ? '+' : '';
          return `${params[0]?.name ?? ''}：${sign}${(raw ?? 0).toFixed(1)}${s.unit ?? ''}`;
        },
      },
      grid: { left: 56, right: 18, top: 28, bottom: 56 },
      xAxis: { type: 'category', data: cats, axisLabel: { interval: 0, fontSize: 10, rotate: cats.length > 6 ? 30 : 0 } },
      yAxis: { type: 'value', name: s.unit, nameTextStyle: { fontSize: 10 } },
      series: [
        {
          type: 'bar',
          stack: 'wf',
          data: placeholder,
          itemStyle: { color: 'transparent' },
          emphasis: { itemStyle: { color: 'transparent' } },
          silent: true,
          tooltip: { show: false },
        },
        {
          type: 'bar',
          stack: 'wf',
          data: bars,
          barWidth: '56%',
          // 门线（如 M-Score 的 −2.22 / −1.78）画在增量柱系列上，随悬浮柱一起对齐坐标系
          markLine: markLineOf(s),
          label: {
            show: true,
            position: 'top',
            fontSize: 10,
            formatter: (p: { dataIndex: number; data: { value: number } }) => {
              const raw = w.values[p.dataIndex];
              if (raw == null) return '';
              const sign = raw > 0 && !isTotal[p.dataIndex] ? '+' : '';
              return `${sign}${raw.toFixed(1)}`;
            },
          },
        },
      ],
      ...s.option,
    };
  }
  // 热力矩阵：季节占比、共同比逐年结构——一眼看出哪一行哪一列偏离了常态
  if (s.type === 'heatmap') {
    const h = s.heatmap;
    if (!h) return {};
    const nCols = h.cols.length;
    const data: [number, number, number | null][] = [];
    h.rows.forEach((_, ri) => {
      h.cols.forEach((__, ci) => {
        data.push([ci, ri, h.values[ri * nCols + ci] ?? null]);
      });
    });
    const valid = h.values.filter((v): v is number => v != null);
    const min = h.visualMin ?? (valid.length ? Math.min(...valid) : 0);
    const max = h.visualMax ?? (valid.length ? Math.max(...valid) : 1);
    return {
      tooltip: {
        position: 'top',
        formatter: (p: { data: [number, number, number | null] }) => {
          const [ci, ri, v] = p.data;
          if (v == null) return `${h.rows[ri]} · ${h.cols[ci]}：—`;
          return `${h.rows[ri]} · ${h.cols[ci]}：${(v * 100).toFixed(1)}${h.unit ?? '%'}`;
        },
      },
      grid: { left: 92, right: 20, top: 20, bottom: 64 },
      xAxis: { type: 'category', data: h.cols, splitArea: { show: true }, axisLabel: { fontSize: 10 } },
      yAxis: { type: 'category', data: h.rows, splitArea: { show: true }, axisLabel: { fontSize: 10 } },
      visualMap: {
        min,
        max,
        calculable: false,
        orient: 'horizontal',
        left: 'center',
        bottom: 4,
        itemWidth: 12,
        itemHeight: 80,
        textStyle: { fontSize: 10 },
        formatter: (v: number) => `${(v * 100).toFixed(0)}${h.unit ?? '%'}`,
        inRange: { color: ['#f1f5f9', '#bfdbfe', '#1d4ed8'] },
      },
      series: [
        {
          type: 'heatmap',
          data,
          label: {
            show: true,
            fontSize: 10,
            formatter: (p: { data: [number, number, number | null] }) =>
              p.data[2] == null ? '—' : `${(p.data[2] * 100).toFixed(0)}`,
          },
          itemStyle: { borderColor: '#ffffff', borderWidth: 1 },
          emphasis: { itemStyle: { borderColor: '#1d4ed8', borderWidth: 2 } },
        },
      ],
      ...s.option,
    };
  }
  if (s.type === 'scatter') {
    const pts = s.points ?? [];
    const normal = pts.filter((p) => !p.highlight).map((p) => [p.x, p.y]);
    const highlighted = pts.filter((p) => p.highlight);
    const series: Record<string, unknown>[] = [
      {
        type: 'scatter',
        name: '同业',
        data: normal,
        symbolSize: 8,
        itemStyle: { color: MUTED, opacity: 0.75 },
        markLine: markLineOf(s),
      },
    ];
    if (highlighted.length) {
      series.push({
        type: 'scatter',
        name: highlighted[0].name,
        data: highlighted.map((p) => [p.x, p.y]),
        symbolSize: 12,
        itemStyle: { color: '#b91c1c' },
        label: { show: true, position: 'top', fontSize: 10, formatter: '{b}' },
      });
    }
    return {
      color: SERIES_COLORS,
      tooltip: {
        trigger: 'item',
        formatter: (params: { seriesName?: string; data?: [number, number] }) =>
          `${params.seriesName}：PE ${params.data?.[0]} / ROE ${params.data?.[1]}%`,
      },
      grid: { left: 56, right: 18, top: 32, bottom: 40 },
      xAxis: { type: 'value', name: s.xLabel, scale: true, nameTextStyle: { fontSize: 10 } },
      yAxis: { type: 'value', name: s.yLabel, scale: true, nameTextStyle: { fontSize: 10 } },
      series,
      ...s.option,
    };
  }
  const isLine = s.type === 'line';
  // 双轴组合：任一系列声明 axis:'right' 即启用右轴（例：营收柱 + 增速线）
  const useRight = (s.series || []).some((x) => x.axis === 'right');
  const series = (s.series || []).map((x) => {
    const t = x.as ?? (isLine ? 'line' : 'bar');
    return {
      name: x.name,
      type: t,
      data: x.data,
      smooth: t === 'line',
      areaStyle: t === 'line' && x.area ? {} : undefined,
      stack: s.type === 'stackedBar' && !useRight ? 'total' : undefined,
      yAxisIndex: x.axis === 'right' ? 1 : 0,
      // 参考线只挂在左轴系列上，避免右轴系列把阈值画到错误坐标系
      markLine: x.axis === 'right' ? undefined : markLineOf(s),
    };
  });
  return {
    color: SERIES_COLORS,
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0, type: 'scroll' },
    grid: { left: 52, right: useRight ? 52 : 18, top: 36, bottom: 52 },
    xAxis: { type: 'category', data: s.categories, axisLabel: { interval: 0 } },
    yAxis: [
      { type: 'value', name: s.unit, nameTextStyle: { fontSize: 10 } },
      ...(useRight
        ? [
            {
              type: 'value',
              name: s.yLabelRight,
              nameTextStyle: { fontSize: 10 },
              splitLine: { show: false },
            },
          ]
        : []),
    ],
    series,
    ...s.option,
  };
}

function render() {
  if (!el.value) return;
  if (!chart) chart = echarts.init(el.value);
  chart.setOption(build(props.spec), true);
}

function onResize() {
  chart?.resize();
}

/** 导出当前图表为 PNG（2x 分辨率、白底）；空数据占位时无实例，静默跳过 */
function downloadPng(filename?: string) {
  if (!chart) return;
  const url = chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#ffffff' });
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(filename || 'chart').replace(/[\\/:*?"<>|]/g, '_')}.png`;
  a.click();
}

defineExpose({ downloadPng });

onMounted(() => {
  render();
  window.addEventListener('resize', onResize);
});
onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  chart?.dispose();
});
watch(() => props.spec, render, { deep: true });
</script>

<template>
  <!-- 空数据占位：说明缺什么，不允许渲染空白画布 -->
  <div
    v-if="isEmpty"
    class="flex items-center justify-center rounded-lg bg-slate-50"
    :class="height ? 'w-full' : 'h-60 w-full lg:h-72'"
    :style="height ? { height: `${height}px` } : undefined"
    role="img"
    :aria-label="spec.title || '图表'"
  >
    <span class="text-xs text-slate-400">该指标无数据{{ spec.title ? ` · ${spec.title}` : '' }}</span>
  </div>
  <div
    v-else
    ref="el"
    class="w-full"
    :class="height ? '' : 'h-60 lg:h-72'"
    :style="height ? { height: `${height}px` } : undefined"
    role="img"
    :aria-label="spec.title || '图表'"
  />
</template>
