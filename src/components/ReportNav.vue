<script setup lang="ts">
// 章节锚点条（DESIGN_SPEC §4.2）：点击滚动到区块，非路由跳转；窄屏横向滚动。
const props = defineProps<{ sections: { id: string; label: string }[]; active: string }>();
const emit = defineEmits<{ (e: 'select', id: string): void }>();

function onClick(id: string) {
  emit('select', id);
  const el = document.getElementById(`sec-${id}`);
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
void props;
</script>

<template>
  <nav class="flex gap-2 overflow-x-auto whitespace-nowrap" aria-label="报告章节导航">
    <button
      v-for="s in sections"
      :key="s.id"
      class="cursor-pointer rounded-lg px-3 py-1.5 text-sm transition"
      :class="active === s.id ? 'bg-brandsoft font-medium text-brand' : 'bg-white text-slate-600 hover:bg-slate-50'"
      @click="onClick(s.id)"
    >
      {{ s.label }}
    </button>
  </nav>
</template>
