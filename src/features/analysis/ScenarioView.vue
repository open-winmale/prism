<script setup lang="ts">
import { computed } from 'vue';
import type { AnalysisContext } from '@/engine';
import { runModule } from '@/engine';
import ModuleResult from './ModuleResult.vue';
import { getScenario, scenarioHeadline } from './scenarios';

// 场景视图（S2 看质地 / S3 验真伪）：
// 头条结论（场景主模块的第一个 block 置顶强调）+ 场景正文模块依次渲染。
// 数据全部来自 ctx（与 S1 共用同一次取数），切换场景零额外成本。

const props = defineProps<{ scenarioId: string; ctx: AnalysisContext }>();

const scenario = computed(() => getScenario(props.scenarioId));
const headline = computed(() => scenarioHeadline(scenario.value, (id) => runModule(id, props.ctx)));
const sections = computed(() =>
  scenario.value.modules.map((id) => ({ id, result: runModule(id, props.ctx) })).filter((s) => s.result),
);
</script>

<template>
  <div class="space-y-3">
    <!-- 场景开场：入口问题 -->
    <div class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="text-lg font-semibold">{{ scenario.icon }} {{ scenario.label }}</div>
      <p class="mt-1 text-sm text-slate-500">{{ scenario.question }}</p>
    </div>

    <!-- 头条结论 -->
    <ModuleResult v-if="headline" :result="headline" highlight />
    <div v-else class="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-400">
      该场景所需数据不足（见上方数据缺失提示），无法给出判定。
    </div>

    <!-- 场景正文 -->
    <template v-for="s in sections" :key="s.id">
      <ModuleResult v-if="s.result" :result="s.result" />
    </template>
  </div>
</template>
