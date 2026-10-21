<script setup lang="ts">
import type { AnalysisResult } from '@/engine';
import EChart from '@/features/charts/EChart.vue';
import SeverityBadge from '@/components/SeverityBadge.vue';

defineProps<{ result: AnalysisResult; /** 头条强调样式（场景视图的首个结论块） */ highlight?: boolean }>();
</script>

<template>
  <div class="space-y-5">
    <div
      v-for="b in result.blocks"
      :key="b.id"
      class="rounded-xl bg-white p-4 shadow-sm"
      :class="highlight ? 'border-2 border-brand/30' : 'border border-slate-200'"
    >
      <div class="mb-2 flex items-center gap-2">
        <SeverityBadge v-if="b.severity" :severity="b.severity" />
        <h3 class="m-0 text-base font-semibold">{{ b.title }}</h3>
      </div>
      <p class="mt-0 text-sm leading-6 text-slate-700">{{ b.summary }}</p>

      <div v-for="(c, i) in b.charts" :key="i" class="mt-3">
        <div v-if="c.title" class="mb-1 text-xs text-slate-400">{{ c.title }}</div>
        <table v-if="c.type === 'table' && c.table" class="data-table">
          <thead>
            <tr>
              <th v-for="col in c.table.columns" :key="col.key">{{ col.cn }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, r) in c.table.rows" :key="r">
              <td v-for="col in c.table.columns" :key="col.key">{{ row[col.key] }}</td>
            </tr>
          </tbody>
        </table>
        <EChart v-else :spec="c" />
      </div>

      <ul v-if="b.details" class="mt-2 list-disc pl-5 text-sm text-slate-500">
        <li v-for="(d, i) in b.details" :key="i">{{ d }}</li>
      </ul>
      <p v-if="b.laotang" class="mt-2 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
        老唐视角：{{ b.laotang }}
      </p>
    </div>

    <p v-if="result.warnings" class="rounded bg-slate-50 px-3 py-2 text-sm text-slate-500">
      ⓘ {{ result.warnings.join(' ') }}
    </p>
  </div>
</template>
