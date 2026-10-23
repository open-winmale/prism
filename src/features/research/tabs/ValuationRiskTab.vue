<script setup lang="ts">
import { computed } from 'vue';
import type { AnalysisContext } from '@/engine';
import type { CompanyCard } from '@/data/wm/types';
import { useAppStore } from '@/store/useApp';
import { peerPercentileSpec } from '@/engine/methods/peersChart';
import ChartFrame from '@/components/ui/ChartFrame.vue';
import ValuationDividend from '../ValuationDividend.vue';
import RiskDigest from '../RiskDigest.vue';
import TrackingList from '../TrackingList.vue';

// 估值·风险页：估值/分红/股本 + 同业坐标 + 风险 + 跟踪。

const props = defineProps<{ ctx: AnalysisContext; card: CompanyCard | null }>();
const store = useAppStore();

const peerPercentile = computed(() =>
  store.peers?.items?.length ? peerPercentileSpec(store.peers.items, props.ctx.dataset.symbol) : null,
);
</script>

<template>
  <ValuationDividend :ctx="ctx" :card="card" />
  <section v-if="peerPercentile" class="wb-section scroll-mt">
    <div class="wb-section__head">
      <div>
        <h2 class="wb-section__title">同业坐标</h2>
        <div class="wb-section__sub">{{ store.peers?.name }} · {{ store.peers?.count ?? 0 }} 家 · 行业横截面分位</div>
      </div>
    </div>
    <div class="wb-section__body">
      <ChartFrame :spec="peerPercentile" source="开放平台 industry members" :height="220" />
    </div>
  </section>
  <RiskDigest :ctx="ctx" />
  <TrackingList :ctx="ctx" :card="card" />
</template>
