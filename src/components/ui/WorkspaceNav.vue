<script setup lang="ts">
import { RouterLink } from 'vue-router';

const props = withDefaults(
  defineProps<{ symbol: string; active: string; mode?: 'desktop' | 'mobile' }>(),
  { mode: 'desktop' },
);

const items = [
  { id: 'overview', label: '概览', index: '01' },
  { id: 'financials', label: '财报', index: '02' },
  { id: 'quality', label: '质量', index: '03' },
  { id: 'peers', label: '同业', index: '04' },
  { id: 'valuation', label: '估值', index: '05' },
  { id: 'risk', label: '风险', index: '06' },
  { id: 'tracking', label: '跟踪', index: '07' },
];

const mobileItems = [
  { id: 'overview', label: '概览' },
  { id: 'financials', label: '财报' },
  { id: 'peers', label: '同业' },
  { id: 'risk', label: '风险' },
  { id: 'tracking', label: '更多' },
];

const to = (id: string) => `/company/${props.symbol}/${id}`;
</script>

<template>
  <nav v-if="mode === 'desktop'" class="wb-nav" aria-label="工作区">
    <div class="wb-nav__label">工作区</div>
    <RouterLink
      v-for="item in items"
      :key="item.id"
      :to="to(item.id)"
      class="wb-nav__item"
      :class="{ 'is-active': item.id === active }"
    >
      <span class="wb-nav__index">{{ item.index }}</span>
      <span>{{ item.label }}</span>
    </RouterLink>
  </nav>

  <nav v-if="mode === 'mobile'" class="wb-mobile-nav" aria-label="移动端工作区">
    <RouterLink
      v-for="item in mobileItems"
      :key="item.id"
      :to="to(item.id)"
      :class="{ 'is-active': item.id === active }"
    >
      {{ item.label }}
    </RouterLink>
  </nav>
</template>
