<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  label: string;
  value: string;
  unit?: string;
  meta?: string;
  spark?: (number | null)[];
}>();

const points = computed(() => {
  const values = (props.spark ?? []).filter((v): v is number => v != null && Number.isFinite(v));
  if (values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values
    .map((v, i) => `${(i / (values.length - 1)) * 100},${21 - ((v - min) / span) * 17}`)
    .join(' ');
});
</script>

<template>
  <div class="wb-kpi">
    <div class="wb-kpi__label">{{ label }}</div>
    <div class="wb-kpi__value">
      <span>{{ value }}</span>
      <span v-if="unit" class="wb-kpi__unit">{{ unit }}</span>
    </div>
    <div v-if="meta" class="wb-kpi__meta">{{ meta }}</div>
    <div v-if="points" class="wb-kpi__spark text-brand" aria-hidden="true">
      <svg viewBox="0 0 100 22" preserveAspectRatio="none">
        <polyline
          :points="points"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          vector-effect="non-scaling-stroke"
        />
      </svg>
    </div>
  </div>
</template>
