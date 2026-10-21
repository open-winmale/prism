<script setup lang="ts">
// 公司卡（DESIGN_SPEC §3.2）：名称/代码/香型·价格带/一句话特征；选中态 brandsoft。
defineProps<{
  name: string;
  symbol: string;
  tags?: string;
  feature?: string;
  selected: boolean;
  sourceReal?: boolean;
}>();
defineEmits<{ (e: 'select'): void }>();
</script>

<template>
  <button
    class="cursor-pointer rounded-xl border p-4 text-left transition hover:shadow"
    :class="selected ? 'border-brand bg-brandsoft' : 'border-slate-200 bg-white'"
    @click="$emit('select')"
  >
    <div class="flex items-center justify-between">
      <span class="text-base font-semibold text-slate-800">{{ name }}</span>
      <span
        v-if="sourceReal != null"
        class="rounded px-1.5 py-0.5 text-xs"
        :class="sourceReal ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'"
      >
        {{ sourceReal ? '真实数据' : '示例数据' }}
      </span>
    </div>
    <div class="mt-1 text-xs text-slate-400">{{ symbol }}</div>
    <div v-if="tags" class="mt-2 flex flex-wrap gap-1">
      <span v-for="t in tags.split('·').map((s) => s.trim()).filter(Boolean)" :key="t" class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
        {{ t }}
      </span>
    </div>
    <p v-if="feature" class="mb-0 mt-2 text-xs leading-5 text-slate-500">{{ feature }}</p>
  </button>
</template>
