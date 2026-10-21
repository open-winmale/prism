<script setup lang="ts">
import { ref } from 'vue';
import type { ChartSpec } from '@/engine';
import EChart from '@/features/charts/EChart.vue';

// 图表框架：标题 + 单位 + 图 + 脚注（来源 / 数据截至 / 参考线说明）+ PNG 导出。
// 每张图都能回答「这条线是什么、数据从哪来、阈值在哪」，并能带走复用。

const props = withDefaults(
  defineProps<{
    spec: ChartSpec;
    source?: string;
    asOf?: string;
    /** 覆盖默认高度（px），小倍数用 150 */
    height?: number;
    /** 是否显示 PNG 导出按钮（默认开） */
    downloadable?: boolean;
  }>(),
  { downloadable: true },
);

const chartRef = ref<InstanceType<typeof EChart> | null>(null);

function download() {
  chartRef.value?.downloadPng(props.spec.title || 'chart');
}
</script>

<template>
  <figure class="wb-chart">
    <figcaption class="wb-chart__head">
      <span class="wb-chart__title">{{ spec.title }}</span>
      <span class="wb-chart__head-right">
        <span v-if="spec.unit" class="wb-chart__unit">单位：{{ spec.unit }}</span>
        <button v-if="downloadable" class="wb-btn wb-btn--ghost wb-chart__dl" title="导出 PNG" @click="download">
          PNG
        </button>
      </span>
    </figcaption>
    <EChart ref="chartRef" :spec="spec" :height="height" />
    <div class="wb-chart__foot">
      <span v-if="spec.refLines?.length">
        参考线：{{ spec.refLines.map((l) => l.label ?? String(l.value)).join('；') }}
      </span>
      <span v-if="source">来源：{{ source }}</span>
      <span v-if="asOf">数据截至 {{ asOf }}</span>
    </div>
  </figure>
</template>
