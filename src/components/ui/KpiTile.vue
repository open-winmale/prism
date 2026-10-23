<script setup lang="ts">
import { computed, ref } from 'vue';

const props = defineProps<{
  label: string;
  value: string;
  unit?: string;
  meta?: string;
  spark?: (number | null)[];
  /** 口径公式（含取数来源表）；悬浮展示并支持一键复制——证据可追溯到公式层 */
  formula?: string;
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

const copied = ref(false);

async function copyFormula() {
  if (!props.formula) return;
  try {
    await navigator.clipboard.writeText(props.formula);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    /* 剪贴板不可用（非安全上下文）——用户仍可手动选中复制 */
  }
}
</script>

<template>
  <div class="wb-kpi">
    <div class="wb-kpi__label">
      {{ label }}
      <span v-if="formula" class="wb-kpi__q" tabindex="0" aria-label="查看口径公式">?</span>
      <div v-if="formula" class="wb-kpi__formula" role="tooltip">
        <code>{{ formula }}</code>
        <button type="button" class="wb-kpi__copy" @click.stop="copyFormula">
          {{ copied ? '已复制' : '复制公式' }}
        </button>
      </div>
    </div>
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
