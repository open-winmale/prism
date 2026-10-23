<script setup lang="ts">
// 移动端页面导航 chip 条（桌面端左栏在 <768px 被 CSS 隐藏，这是移动端唯一的页面切换入口）。
// 点击 → 路由跳整页（与桌面左栏同一套 PAGES）。

const props = defineProps<{
  items: { id: string; label: string }[];
  active: string;
}>();

const emit = defineEmits<{ (e: 'switch', id: string): void }>();
void props;
</script>

<template>
  <nav class="wb-mobile-nav--chips" aria-label="研究页面">
    <button
      v-for="item in items"
      :key="item.id"
      type="button"
      :class="{ 'is-active': item.id === active }"
      @click="emit('switch', item.id)"
    >
      {{ item.label }}
    </button>
  </nav>
</template>
