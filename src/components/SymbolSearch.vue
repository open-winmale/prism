<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useAppStore } from '@/store/useApp';

// 动态选标的：输入名称/拼音/代码 → 检索 → 直达报告。
// 无 AppId 时检索能力不可用，此处给明确引导而不是静默失败。

const store = useAppStore();
const text = ref('');
const open = ref(false);
const cursor = ref(-1);
const inputEl = ref<HTMLInputElement | null>(null);

const usable = computed(() => store.dataSource === 'live');
const results = computed(() => store.searchResults);

watch(text, (v) => {
  cursor.value = -1;
  if (!usable.value) {
    open.value = false;
    return;
  }
  open.value = v.trim().length > 0;
  store.searchSymbols(v);
});

// 失焦时延迟关闭，避免点到结果项时下拉已消失（mousedown.prevent 也为此）
function closeSoon() {
  window.setTimeout(() => (open.value = false), 150);
}

function pick(symbol: string) {
  open.value = false;
  text.value = '';
  store.clearSearch();
  store.selectStock(symbol);
}

function onKey(e: KeyboardEvent) {
  const n = results.value.length;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    cursor.value = n ? (cursor.value + 1) % n : -1;
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    cursor.value = n ? (cursor.value - 1 + n) % n : -1;
  } else if (e.key === 'Enter') {
    if (cursor.value >= 0 && cursor.value < n) {
      e.preventDefault();
      pick(results.value[cursor.value].symbol);
    }
  } else if (e.key === 'Escape') {
    open.value = false;
    inputEl.value?.blur();
  }
}
</script>

<template>
  <div class="relative w-full">
    <input
      ref="inputEl"
      v-model="text"
      type="search"
      :placeholder="usable ? '搜索标的：名称 / 拼音 / 代码' : '填入 AppId 后可搜索任意标的'"
      :disabled="!usable"
      class="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm placeholder:text-slate-400 focus:border-brand focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
      @keydown="onKey"
      @focus="open = usable && text.trim().length > 0"
      @blur="closeSoon"
    />

    <div
      v-if="open"
      class="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
    >
      <div v-if="store.searching && !results.length" class="px-3 py-2 text-xs text-slate-400">检索中…</div>
      <div v-else-if="!results.length" class="px-3 py-2 text-xs text-slate-400">
        没有匹配的标的（仅支持平台已收录的证券）
      </div>
      <button
        v-for="(r, i) in results"
        :key="r.symbol"
        class="block w-full cursor-pointer px-3 py-2 text-left text-sm transition"
        :class="i === cursor ? 'bg-brandsoft text-brand' : 'text-slate-700 hover:bg-slate-50'"
        @mousedown.prevent="pick(r.symbol)"
      >
        {{ r.name }}
        <span class="ml-1 text-xs text-slate-400">{{ r.symbol }}</span>
      </button>
    </div>
  </div>
</template>
