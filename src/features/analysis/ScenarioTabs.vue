<script setup lang="ts">
import { useAppStore } from '@/store/useApp';
import { getScenario, SCENARIOS } from './scenarios';

// 场景切换器：一次取数，三场景免费切换（成本护栏的核心设计）
const store = useAppStore();
</script>

<template>
  <div class="flex flex-wrap items-center gap-1.5">
    <button
      v-for="s in SCENARIOS"
      :key="s.id"
      class="cursor-pointer rounded-full px-4 py-1.5 text-sm font-medium transition"
      :title="s.question"
      :class="
        store.scenario === s.id
          ? 'bg-brand text-white shadow-sm'
          : 'border border-slate-200 bg-white text-slate-600 hover:border-brand hover:text-brand'
      "
      @click="store.setScenario(s.id)"
    >
      {{ s.icon }} {{ s.label }}
    </button>
    <span class="ml-1 hidden text-xs text-slate-400 sm:inline">{{ getScenario(store.scenario).question }}</span>
  </div>
</template>
