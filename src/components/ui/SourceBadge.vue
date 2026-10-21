<script setup lang="ts">
defineProps<{
  label: string;
  kind: 'live' | 'snapshot' | 'missing';
}>();
</script>

<template>
  <span class="wb-source" :class="`is-${kind}`">{{ label }}</span>
</template>
