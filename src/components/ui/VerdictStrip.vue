<script setup lang="ts">
export type VerdictStatus = 'safe' | 'watch' | 'danger' | 'insufficient';

defineProps<{
  status: VerdictStatus;
  label: string;
  thesis: string;
  evidence: string[];
  risks: string[];
  sufficiency: string;
  audit?: string;
  asOf?: string;
}>();
</script>

<template>
  <section class="wb-verdict" :class="`is-${status}`">
    <div class="wb-verdict__top">
      <span class="wb-verdict__status">{{ label }}</span>
      <div class="wb-verdict__meta">
        <span>{{ sufficiency }}</span>
        <span v-if="audit">审计：{{ audit }}</span>
        <span v-if="asOf">数据截至 {{ asOf }}</span>
      </div>
    </div>
    <p class="wb-verdict__thesis">{{ thesis }}</p>
    <div class="wb-verdict__chips">
      <span v-for="item in evidence" :key="item" class="wb-chip">{{ item }}</span>
      <span v-for="item in risks" :key="item" class="wb-chip is-risk">风险 · {{ item }}</span>
    </div>
  </section>
</template>
