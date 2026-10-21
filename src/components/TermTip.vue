<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

// 术语提示（DESIGN_SPEC §4.8）：虚线下划线 + ? 图标；窄屏/桌面均为点击展开（避免 hover 误触）。
defineProps<{ term: string; text: string }>();
const open = ref(false);
const root = ref<HTMLElement | null>(null);

function onDocClick(e: MouseEvent) {
  if (root.value && !root.value.contains(e.target as Node)) open.value = false;
}
onMounted(() => document.addEventListener('click', onDocClick));
onBeforeUnmount(() => document.removeEventListener('click', onDocClick));
</script>

<template>
  <span ref="root" class="relative inline-block">
    <span class="term-tip-trigger" role="button" tabindex="0" @click="open = !open" @keydown.enter="open = !open">
      {{ term }}<span class="ml-0.5 text-xs text-blue-500">?</span>
    </span>
    <span
      v-if="open"
      class="absolute bottom-full left-0 z-20 mb-1 block w-72 max-w-[280px] rounded-lg border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600 shadow-sm"
    >
      {{ text }}
    </span>
  </span>
</template>
