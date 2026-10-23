<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { BarChart, HeatmapChart, LineChart, PieChart, ScatterChart } from 'echarts/charts';
import {
  AxisPointerComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { ChartSpec } from '@/engine';
import { buildOption } from './option';

// 仅注册用到的模块，控制打包体积。
// MarkLineComponent 必须注册：参考线（门线/中位数/零线）由 markLine 渲染，
// 此前漏注册导致所有 refLines 静默失效——这是「阈值看不见」的根因。
echarts.use([
  BarChart,
  HeatmapChart,
  LineChart,
  PieChart,
  ScatterChart,
  AxisPointerComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
  CanvasRenderer,
]);

const props = defineProps<{ spec: ChartSpec; /** 自定义高度（px）；缺省用响应式默认 */ height?: number }>();
const el = ref<HTMLElement | null>(null);
let chart: echarts.EChartsType | null = null;
let resizeObserver: ResizeObserver | null = null;

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

function ensureObserver() {
  if (!resizeObserver && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => chart?.resize());
  }
  if (resizeObserver && el.value) {
    resizeObserver.disconnect();
    resizeObserver.observe(el.value);
  }
}

function render() {
  if (!el.value) {
    // 空数据占位出现时释放实例，避免继续持有已被移除的 DOM。
    chart?.dispose();
    chart = null;
    return;
  }
  if (chart && chart.getDom() !== el.value) {
    chart.dispose();
    chart = null;
  }
  if (!chart) chart = echarts.init(el.value);
  ensureObserver();
  chart.setOption(buildOption(props.spec), true);
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
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  chart?.dispose();
  chart = null;
});

// flush: 'post' 保证空态切回图表时 el 已挂载
watch(
  () => [props.spec, props.height],
  () => render(),
  { deep: true, flush: 'post' },
);
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
    :aria-label="spec.note ? `${spec.title || '图表'}。${spec.note}` : spec.title || '图表'"
  />
</template>
