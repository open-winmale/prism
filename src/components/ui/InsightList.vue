<script setup lang="ts">
import type { AnalysisResult } from '@/engine';
import ChartFrame from '@/components/ui/ChartFrame.vue';
import DataTable from './DataTable.vue';

defineProps<{ result: AnalysisResult }>();
</script>

<template>
  <div>
    <section v-for="block in result.blocks" :key="block.id" class="wb-section">
      <div class="wb-section__head">
        <div>
          <h2 class="wb-section__title">{{ block.title }}</h2>
          <div v-if="block.severity" class="wb-section__sub">
            {{ block.severity === 'high' ? '高危信号' : block.severity === 'mid' ? '需关注' : '信息' }}
          </div>
        </div>
      </div>
      <div class="wb-section__body">
        <p class="wb-verdict__thesis">{{ block.summary }}</p>
        <div v-for="(chart, index) in block.charts" :key="index" class="mt-3">
          <DataTable
            v-if="chart.type === 'table' && chart.table"
            :columns="chart.table.columns.map((c) => ({ key: c.key, label: c.cn }))"
            :rows="chart.table.rows"
            sticky-first
          />
          <ChartFrame v-else :spec="chart" :source="result.moduleTitle" />
        </div>
        <ul v-if="block.details?.length" class="wb-note mt-2 list-disc pl-5">
          <li v-for="(detail, index) in block.details" :key="index">{{ detail }}</li>
        </ul>
        <p v-if="block.laotang" class="wb-risk__laotang mt-3">老唐视角：{{ block.laotang }}</p>
      </div>
    </section>
    <p v-if="result.warnings?.length" class="wb-callout is-warn mt-4">
      {{ result.warnings.join('；') }}
    </p>
  </div>
</template>
