<script setup lang="ts">
import { computed } from 'vue';
import { mineChecks, runBeneish, type AnalysisContext } from '@/engine';
import RiskRow from '@/components/ui/RiskRow.vue';
import InsightList from '@/components/ui/InsightList.vue';

// 风险摘要：Beneish 综合侦测 + 排雷清单。触发项置顶，安全项折叠为计数。

const props = defineProps<{ ctx: AnalysisContext }>();

const beneish = computed(() => runBeneish(props.ctx));
const checks = computed(() => mineChecks(props.ctx));
const triggered = computed(() =>
  checks.value
    .filter((c) => c.status === 'triggered')
    .sort((a, b) => (a.severity === 'high' ? -1 : b.severity === 'high' ? 1 : 0)),
);
const naCount = computed(() => checks.value.filter((c) => c.status === 'na').length);
</script>

<template>
  <section id="sec-risk" class="wb-section scroll-mt">
    <div class="wb-section__head">
      <div>
        <h2 class="wb-section__title">风险</h2>
        <div class="wb-section__sub">
          {{ checks.length - naCount }}/{{ checks.length }} 项已核查 · 触发 {{ triggered.length }}
          <span v-if="naCount"> · 数据不足 {{ naCount }}（缺数据不判安全）</span>
        </div>
      </div>
    </div>
    <div class="wb-section__body">
      <InsightList :result="beneish" />
      <div v-if="triggered.length" class="wb-risk-list mt-4">
        <RiskRow v-for="check in triggered" :key="check.id" :check="check" :symbol="ctx.dataset.symbol" />
      </div>
      <p v-else class="wb-callout mt-4">
        {{ naCount ? `${naCount} 项因数据不足未执行，不能据此判定安全。` : '本次排雷规则均未触发。' }}
      </p>
    </div>
  </section>
</template>
