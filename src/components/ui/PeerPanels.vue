<script setup lang="ts">
import { computed } from 'vue';
import type { AnalysisContext } from '@/engine';
import { peersScatter, quantile } from '@/engine/methods/peersChart';
import type { CompanyCard, IndustryMembersPayload } from '@/data/wm/types';
import ChartFrame from '@/components/ui/ChartFrame.vue';

// 同业面板（概览迷你表之外的完整形态）：KPI 分位 + 散点 + 分位条 + 全行业表。
// 由 PeersWorkspace 与 /compare 独立页复用；数据来自 store.peers（live），快照下调用方负责降级提示。

const props = defineProps<{
  ctx: AnalysisContext;
  card: CompanyCard | null;
  peers: IndustryMembersPayload | null;
}>();

const items = computed(() =>
  [...(props.peers?.items ?? [])].sort((a, b) => (b.mv ?? 0) - (a.mv ?? 0)),
);

function median(values: (number | null | undefined)[]): number | null {
  const valid = values.filter((v): v is number => v != null && Number.isFinite(v)).sort((a, b) => a - b);
  if (!valid.length) return null;
  const mid = valid.length >> 1;
  return valid.length % 2 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;
}

const medians = computed(() => ({
  pe: median(items.value.map((i) => i.pe_ttm)),
  pb: median(items.value.map((i) => i.pb)),
  ps: median(items.value.map((i) => i.ps_ttm)),
  roe: median(items.value.map((i) => i.roe_ttm)),
  mv: median(items.value.map((i) => i.mv)),
}));

const current = computed(() => items.value.find((item) => item.symbol === props.ctx.dataset.symbol) ?? null);

const rank = computed(() => ({
  pe: quantile('PE', current.value?.pe_ttm, items.value.map((i) => i.pe_ttm), (v) => `${v.toFixed(1)}x`),
  pb: quantile('PB', current.value?.pb, items.value.map((i) => i.pb), (v) => `${v.toFixed(2)}x`),
  roe: quantile('ROE', current.value?.roe_ttm, items.value.map((i) => i.roe_ttm), (v) => `${(v * 100).toFixed(1)}%`),
}));

const scatter = computed(() => peersScatter(props.peers?.items ?? [], props.ctx.dataset.symbol));

function num(value: number | null | undefined, digits = 1): string {
  return value == null || !Number.isFinite(value) ? '—' : value.toFixed(digits);
}
function pct(value: number | null | undefined, digits = 1): string {
  return value == null || !Number.isFinite(value) ? '—' : `${(value * 100).toFixed(digits)}%`;
}
function yi(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? '—' : (value / 1e8).toFixed(0);
}
</script>

<template>
  <div class="wb-kpis">
    <div class="wb-kpi">
      <div class="wb-kpi__label">当前 PE 分位</div>
      <div class="wb-kpi__value">{{ rank.pe.rank == null ? '—' : pct(rank.pe.rank, 0) }}</div>
      <div class="wb-kpi__meta">当前 {{ rank.pe.display }} · 中位数 {{ num(medians.pe) }}x</div>
    </div>
    <div class="wb-kpi">
      <div class="wb-kpi__label">当前 ROE 分位</div>
      <div class="wb-kpi__value">{{ rank.roe.rank == null ? '—' : pct(rank.roe.rank, 0) }}</div>
      <div class="wb-kpi__meta">当前 {{ rank.roe.display }} · 中位数 {{ pct(medians.roe) }}</div>
    </div>
    <div class="wb-kpi">
      <div class="wb-kpi__label">当前 PB</div>
      <div class="wb-kpi__value">{{ num(current?.pb, 2) }}x</div>
      <div class="wb-kpi__meta">行业中位数 {{ num(medians.pb, 2) }}x</div>
    </div>
    <div class="wb-kpi">
      <div class="wb-kpi__label">当前 PS</div>
      <div class="wb-kpi__value">{{ num(current?.ps_ttm, 2) }}x</div>
      <div class="wb-kpi__meta">行业中位数 {{ num(medians.ps, 2) }}x</div>
    </div>
    <div class="wb-kpi">
      <div class="wb-kpi__label">市值</div>
      <div class="wb-kpi__value">{{ yi(current?.mv) }} <span class="wb-kpi__unit">亿</span></div>
      <div class="wb-kpi__meta">行业中位数 {{ yi(medians.mv) }} 亿</div>
    </div>
  </div>

  <div class="wb-grid-2 mt-5">
    <ChartFrame :spec="scatter.spec" source="开放平台 industry members" :height="260" />
    <div>
      <div class="wb-section__sub mb-2">当前公司分位条（横截面）</div>
      <div v-for="bar in [rank.pe, rank.pb, rank.roe]" :key="bar.label" class="mb-3">
        <div class="flex items-center justify-between text-xs">
          <span class="wb-chart__title">{{ bar.label }}</span>
          <span class="wb-num text-slate-600">
            {{ bar.display }}
            <template v-if="bar.median != null"> · 中位 {{ bar.label === 'ROE' ? pct(bar.median) : num(bar.median, 2) + 'x' }}</template>
          </span>
        </div>
        <div class="wb-meter mt-1">
          <i :style="{ width: `${Math.round((bar.rank ?? 0) * 100)}%` }" />
        </div>
        <div class="wb-note mt-0.5">
          {{ bar.rank == null ? '分位不可用（样本不足）' : `横截面第 ${pct(bar.rank, 0)} 分位 · n=${scatter.stats.n}` }}
        </div>
      </div>
    </div>
  </div>

  <div class="wb-table-wrap mt-5">
    <table class="wb-table">
      <thead>
        <tr>
          <th class="is-sticky">公司</th>
          <th class="is-num">市值（亿）</th>
          <th class="is-num">PE(TTM)</th>
          <th class="is-num">PB</th>
          <th class="is-num">PS</th>
          <th class="is-num">ROE</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="item in items"
          :key="item.symbol"
          :class="{ 'is-section': item.symbol === ctx.dataset.symbol }"
        >
          <td class="is-sticky">{{ item.name }}</td>
          <td class="is-num">{{ yi(item.mv) }}</td>
          <td class="is-num">{{ num(item.pe_ttm) }}</td>
          <td class="is-num">{{ num(item.pb, 2) }}</td>
          <td class="is-num">{{ num(item.ps_ttm, 2) }}</td>
          <td class="is-num">{{ pct(item.roe_ttm) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
  <p class="wb-note mt-2">
    数据来源：赢麻了开放平台 industry members。行业分位为当前横截面排名，受样本与行业分类影响；不构成买卖建议。
  </p>
</template>
