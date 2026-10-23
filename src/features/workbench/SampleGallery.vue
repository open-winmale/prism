<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { SAMPLES } from '@/data/loader';
import { useAppStore } from '@/store/useApp';

// 样板画廊：4 个内置案例，点选即切换。
// 关键：统一走 selectSample（强制年度口径 → 内置快照 0 EC），
// 避免用户当前在季度口径时点样板触发实时取数。

const store = useAppStore();
const router = useRouter();

interface SampleCard {
  symbol: string;
  name: string;
  tag: string;
  demo: boolean;
}

const cards = computed<SampleCard[]>(() =>
  SAMPLES.map((sample) => ({
    symbol: sample.symbol,
    name: sample.name.replace('（排雷样例）', ''),
    tag: sample.meta?.galleryTag ?? '',
    demo: sample.symbol.startsWith('DEMO-'),
  })),
);

function isActive(symbol: string): boolean {
  return symbol === store.currentSymbol && store.fetchInfo.kind === 'snapshot';
}

function openSample(symbol: string): void {
  if (isActive(symbol)) {
    void router.push(`/company/${symbol}/overview`);
    return;
  }
  void store.selectSample(symbol).then(() => router.push(`/company/${symbol}/overview`));
}
</script>

<template>
  <section class="wb-samples" aria-label="样板案例">
    <div class="wb-samples__head">
      <span class="wb-samples__title">
        样板
        <span class="wb-note">快照 · 0 EC</span>
        <span v-if="store.fetchInfo.kind === 'live'" class="wb-note">当前为实时数据，点样板可切回快照</span>
      </span>
      <RouterLink to="/about" class="wb-samples__more">了解更多 →</RouterLink>
    </div>
    <div class="wb-samples__track">
      <button
        v-for="card in cards"
        :key="card.symbol"
        type="button"
        class="wb-sample"
        :class="{ 'is-on': isActive(card.symbol) }"
        :aria-current="isActive(card.symbol) ? 'true' : undefined"
        :title="`${card.name} · ${card.tag}（内置快照，0 EC）`"
        @click="openSample(card.symbol)"
      >
        <span class="wb-sample__name">{{ card.name }}</span>
        <span class="wb-sample__tag">
          <span v-if="card.demo" class="wb-sample__demo">演示</span>
          {{ card.tag }}
        </span>
      </button>
    </div>
  </section>
</template>
