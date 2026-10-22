<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

// 表格横滚指示：容器可横滚但视觉上没有线索（375px 一屏只见一个期间的子列），
// 右缘常显一条渐隐提示「右边还有」，滚到底自动消失。纯视觉层，不拦点击。
const wrap = ref<HTMLElement | null>(null);
const scrollable = ref(false);
const atEnd = ref(true);

function sync() {
  const el = wrap.value;
  if (!el) return;
  scrollable.value = el.scrollWidth - el.clientWidth > 1;
  atEnd.value = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
}

let ro: ResizeObserver | null = null;

onMounted(() => {
  const el = wrap.value;
  if (!el) return;
  el.addEventListener('scroll', sync, { passive: true });
  window.addEventListener('resize', sync);
  // 内容宽度会变（切 5/10 年窗口、增删对比公司），监听容器与表格自身尺寸
  ro = new ResizeObserver(sync);
  ro.observe(el);
  if (el.firstElementChild instanceof HTMLElement) ro.observe(el.firstElementChild);
  sync();
});

onBeforeUnmount(() => {
  wrap.value?.removeEventListener('scroll', sync);
  window.removeEventListener('resize', sync);
  ro?.disconnect();
});
</script>

<template>
  <div class="wb-scroll" :class="{ 'is-scrollable': scrollable, 'is-at-end': atEnd }">
    <div ref="wrap" class="wb-table-wrap"><slot /></div>
  </div>
</template>
