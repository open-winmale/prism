<script setup lang="ts">
import { ref } from 'vue';

// 条件条的窄屏收纳：≤767px 折叠成一行「摘要 + 展开箭头」，让表格进得了首屏
// （此前条件条在 375px 展开占 316px，表格被推到两屏外）；
// 桌面恒展开，布局与既有条件条一致。摘要由使用方如实计算当前条件状态。
defineProps<{ summary: string }>();
const open = ref(false);
</script>

<template>
  <div class="wb-filters wb-filters--collapse" :class="{ 'is-open': open }">
    <button type="button" class="wb-filters__toggle" :aria-expanded="open" @click="open = !open">
      <span class="wb-filters__summary">{{ summary }}</span>
      <i class="wb-filters__chev" aria-hidden="true" />
    </button>
    <div class="wb-filters__panel">
      <slot />
    </div>
  </div>
</template>
