<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart, ScatterChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { ChartSpec } from '@/engine';

// 仅注册用到的模块，控制打包体积
echarts.use([BarChart, LineChart, PieChart, ScatterChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

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
  const series = (s.series || []).map((x) => ({
    name: x.name,
    type: isLine ? 'line' : 'bar',
    data: x.data,
    smooth: isLine,
    areaStyle: isLine && x.area ? {} : undefined,
    stack: s.type === 'stackedBar' ? 'total' : undefined,
    markLine: markLineOf(s),
  }));
  return {
    color: SERIES_COLORS,
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0, type: 'scroll' },
    grid: { left: 52, right: 18, top: 36, bottom: 52 },
    xAxis: { type: 'category', data: s.categories, axisLabel: { interval: 0 } },
    yAxis: { type: 'value', name: s.unit },
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
