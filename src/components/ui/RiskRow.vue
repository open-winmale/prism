<script setup lang="ts">
import { computed } from 'vue';
import type { MineCheck } from '@/engine';

// 排雷条目（2026-10-23 拍平）：why/next/老唐视角全部直出，不再折叠——
// 两层交互原则下，风险页不应有「点 + 才能看到为什么」的第 3 层。

const props = withDefaults(
  defineProps<{ check: MineCheck; /** 当前公司代码：提供时显示「在财报中查看」回链 */ symbol?: string }>(),
  { symbol: '' },
);

const icon = computed(() => {
  if (props.check.status === 'safe') return '✓';
  if (props.check.status === 'triggered') return props.check.severity === 'high' ? '✗' : '!';
  return '—';
});

const iconClass = computed(() => {
  if (props.check.status === 'safe') return 'is-safe';
  if (props.check.status === 'na') return 'is-na';
  return props.check.severity === 'high' ? 'is-triggered' : 'is-mid';
});

const tag = computed(() => {
  if (props.check.status === 'safe') return '安全';
  if (props.check.status === 'na') return '数据不足';
  if (props.check.severity === 'high') return '高危';
  if (props.check.severity === 'mid') return '中度';
  return '轻度';
});

const ledgerHref = computed(() =>
  props.check.field && props.symbol ? `#/company/${props.symbol}/operating` : null,
);

const whyLabel = computed(() =>
  props.check.status === 'triggered' ? '为什么危险：' : props.check.status === 'safe' ? '为什么安全：' : '数据缺口：',
);
</script>

<template>
  <div class="wb-risk is-open">
    <div class="wb-risk__head">
      <span class="wb-risk__icon" :class="iconClass">{{ icon }}</span>
      <span>
        <span class="wb-risk__name">{{ check.name }}</span>
        <span class="wb-risk__evidence">{{ check.evidence }}</span>
      </span>
      <span class="wb-risk__tag">{{ tag }}</span>
    </div>
    <div class="wb-risk__body">
      <p class="wb-risk__why">
        <b>{{ whyLabel }}</b>
        {{ check.why }}
      </p>
      <p v-if="check.next" class="wb-risk__next">{{ check.next }}</p>
      <p v-if="check.laotang" class="wb-risk__laotang">老唐视角：{{ check.laotang }}</p>
      <p v-if="ledgerHref" class="wb-note mt-2">
        <a :href="ledgerHref" class="text-brand hover:underline">在「经营·资产」页查看「{{ check.field }}」科目 →</a>
      </p>
    </div>
  </div>
</template>
