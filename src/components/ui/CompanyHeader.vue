<script setup lang="ts">
import { computed } from 'vue';
import type { AnalysisContext } from '@/engine';
import { useAppStore } from '@/store/useApp';
import SourceBadge from './SourceBadge.vue';

const props = defineProps<{ ctx: AnalysisContext }>();
const store = useAppStore();

const sourceKind = computed<'live' | 'snapshot' | 'missing'>(() => {
  if (store.fetchInfo.kind === 'live') return 'live';
  if (store.fetchInfo.kind === 'snapshot') return 'snapshot';
  return 'missing';
});

const industry = computed(() => store.peers?.name ?? props.ctx.dataset.meta?.fragrance ?? '—');
const period = computed(() => {
  const periods = props.ctx.dataset.periods;
  if (!periods.length) return '—';
  const first = periods[0].slice(0, 4);
  const last = periods[periods.length - 1].slice(0, 4);
  return first === last ? `${last} 年报` : `${first}–${last}`;
});
const audit = computed(() => props.ctx.dataset.meta?.auditOpinion ?? '—');
const asOf = computed(() => store.card?.quote_date ?? props.ctx.dataset.periods.at(-1)?.slice(0, 10) ?? '—');

const chgClass = computed(() => {
  const pct = store.card?.percent;
  if (pct == null || !Number.isFinite(pct)) return '';
  return pct > 0 ? 'is-up' : pct < 0 ? 'is-down' : '';
});

function num(value: number | null | undefined, digits = 1): string {
  return value == null || !Number.isFinite(value) ? '—' : value.toFixed(digits);
}
function pct(value: number | null | undefined, digits = 1): string {
  return value == null || !Number.isFinite(value) ? '—' : `${(value * 100).toFixed(digits)}%`;
}
</script>

<template>
  <div class="wb-company">
    <div>
      <div class="wb-company__name">
        <span>{{ ctx.dataset.name }}</span>
        <span class="wb-company__code">{{ ctx.dataset.symbol }}</span>
      </div>
      <div class="wb-company__meta">
        <span>{{ industry }}</span>
        <span>·</span>
        <span>{{ period }}</span>
        <span>·</span>
        <span>审计：{{ audit }}</span>
        <span>·</span>
        <SourceBadge :label="store.sourceLabel" :kind="sourceKind" />
      </div>
    </div>
    <div class="wb-company__quote">
      <div v-if="store.card">
        <span class="wb-company__price">{{ num(store.card.close, 2) }}</span>
        <span class="wb-company__chg" :class="chgClass">{{ pct(store.card.percent, 2) }}</span>
      </div>
      <div v-else class="wb-note">示例快照 · 无实时行情</div>
      <div v-if="store.card" class="wb-company__valuation">
        <span>PE(TTM) {{ num(store.card.pe_ttm, 1) }}x</span>
        <span>PB {{ num(store.card.pb_ttm, 2) }}x</span>
        <span>ROE {{ pct(store.card.roe_ttm) }}</span>
        <span>PE 3Y {{ pct(store.card.pct_pe_3y, 0) }}</span>
        <span>股息 {{ pct(store.card.bonus_rate_ttm, 2) }}</span>
        <span>截至 {{ asOf }}</span>
      </div>
    </div>
  </div>
</template>
