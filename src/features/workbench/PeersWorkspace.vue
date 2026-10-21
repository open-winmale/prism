<script setup lang="ts">
import { computed } from 'vue';
import type { AnalysisContext } from '@/engine';
import type { CompanyCard, IndustryMembersPayload } from '@/data/wm/types';
import PeerPanels from '@/components/ui/PeerPanels.vue';

const props = defineProps<{
  ctx: AnalysisContext;
  card: CompanyCard | null;
  peers: IndustryMembersPayload | null;
}>();

const items = computed(() => props.peers?.items ?? []);
</script>

<template>
  <section class="wb-section">
    <div class="wb-section__head">
      <div>
        <h2 class="wb-section__title">同业对比</h2>
        <div class="wb-section__sub">
          {{ peers?.name ?? '行业组未取到' }} · {{ peers?.count ?? 0 }} 家
          <span v-if="peers?.truncated"> · 样本已截断</span>
          · 按市值排序 · 横截面分位，不是历史分位
        </div>
      </div>
    </div>
    <div class="wb-section__body">
      <p v-if="!items.length" class="wb-callout">
        同业数据未取到。连接开放平台后可查看行业成分与估值分位。
      </p>
      <PeerPanels v-else :ctx="ctx" :card="card" :peers="peers" />
    </div>
  </section>
</template>
