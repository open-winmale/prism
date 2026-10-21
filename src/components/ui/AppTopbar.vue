<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>

<template>
  <header class="wb-topbar">
    <div class="wb-topbar__inner">
      <RouterLink to="/" class="wb-brand">
        <span class="wb-brand__name">财报透视</span>
        <span class="wb-brand__tag">个人版 · 专业版简化</span>
      </RouterLink>
      <div v-if="$slots.search" class="wb-topbar__search">
        <slot name="search" />
      </div>
      <div class="wb-topbar__spacer" />
      <div class="wb-topbar__actions">
        <slot name="actions" />
      </div>
    </div>
  </header>
</template>
