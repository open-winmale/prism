<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { ChartSpec } from '@/engine';

// 仅注册用到的模块，控制打包体积
echarts.use([BarChart, LineChart, PieChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

const props = defineProps<{ spec: ChartSpec }>();
const el = ref<HTMLElement | null>(null);
let chart: echarts.EChartsType | null = null;

// 品牌序列色（DESIGN_SPEC §2.1）——替代 ECharts 默认色板
const SERIES_COLORS = ['#2f6bff', '#0f766e', '#b45309', '#b91c1c', '#6d28d9', '#0891b2'];

// 空数据检测（DESIGN_SPEC §5：禁止渲染空白画布）
const spec = computed(() => props.spec);
const isEmpty = computed(() => {
  const s = spec.value;
  if (s.type === 'pie') return !s.pie || s.pie.length === 0;
  if (s.type === 'table') return !s.table || s.table.rows.length === 0;
  const series = s.series ?? [];
  return series.every((x) => x.data.every((v) => v == null));
});
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
  const isLine = s.type === 'line';
  const series = (s.series || []).map((x) => ({
    name: x.name,
    type: isLine ? 'line' : 'bar',
    data: x.data,
    smooth: isLine,
    areaStyle: isLine && x.area ? {} : undefined,
    stack: s.type === 'stackedBar' ? 'total' : undefined,
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
  <!-- 高度：桌面 288px / 窄屏 240px（DESIGN_SPEC §5） -->
  <div v-if="isEmpty" class="flex h-60 items-center justify-center rounded-lg bg-slate-50 lg:h-72" role="img" :aria-label="spec.title || '图表'">
    <span class="text-xs text-slate-400">该指标无数据{{ spec.title ? ` · ${spec.title}` : '' }}</span>
  </div>
  <div v-else ref="el" class="h-60 w-full lg:h-72" role="img" :aria-label="spec.title || '图表'"></div>
</template>
