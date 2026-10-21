<script setup lang="ts">
import { computed } from 'vue';
import { mineChecks, type AnalysisContext } from '@/engine';
import RiskRow from '@/components/ui/RiskRow.vue';

const props = defineProps<{ ctx: AnalysisContext }>();

const checks = computed(() => mineChecks(props.ctx));
const naCount = computed(() => checks.value.filter((c) => c.status === 'na').length);
const triggered = computed(() => checks.value.filter((c) => c.status === 'triggered'));
const highCount = computed(() => triggered.value.filter((c) => c.severity === 'high').length);
const midCount = computed(() => triggered.value.filter((c) => c.severity === 'mid').length);

const groups = computed(() => {
  const byId = new Map(checks.value.map((c) => [c.id, c]));
  const definitions = [
    {
      label: '利润质量',
      ids: ['ar_growth', 'inventory_growth', 'cfo_vs_profit', 'nonrecurring', 'gross_margin_anomaly'],
    },
    { label: '资产质量', ids: ['goodwill', 'other_receivables', 'cip_stuck'] },
    { label: '负债安全', ids: ['big_deposit_big_loan'] },
    { label: '渠道 / 治理', ids: ['channel_confidence'] },
  ];
  return definitions
    .map((group) => ({
      label: group.label,
      items: group.ids.map((id) => byId.get(id)).filter((item): item is NonNullable<typeof item> => Boolean(item)),
    }))
    .filter((group) => group.items.length > 0);
});
</script>

<template>
  <section class="wb-section">
    <div class="wb-section__head">
      <div>
        <h2 class="wb-section__title">风险清单</h2>
        <div class="wb-section__sub">
          {{ checks.length - naCount }}/{{ checks.length }} 项已核查 · 高危 {{ highCount }} · 中度
          {{ midCount }} · 数据不足 {{ naCount }}
        </div>
      </div>
    </div>
    <div class="wb-section__body">
      <p v-if="naCount" class="wb-callout is-warn">
        有 {{ naCount }} 项因数据不足未执行。缺数据不等于安全，报告结论不会把「无法判断」说成「通过」。
      </p>
      <div v-for="group in groups" :key="group.label" class="mt-5">
        <div class="wb-section__sub mb-1">{{ group.label }}</div>
        <div class="wb-risk-list">
          <RiskRow v-for="check in group.items" :key="check.id" :check="check" :symbol="ctx.dataset.symbol" />
        </div>
      </div>
    </div>
  </section>
</template>
