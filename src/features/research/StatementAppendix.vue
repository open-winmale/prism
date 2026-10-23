<script setup lang="ts">
import { computed } from 'vue';
import type { AnalysisContext } from '@/engine';
import StatementTable from '@/components/ui/StatementTable.vue';
import LineItemDialog from '@/components/ui/LineItemDialog.vue';
import { useAppStore } from '@/store/useApp';
import { industryTemplate } from '@/engine';
import type { LineItemDef } from '@/engine/methods/columns';
import { ref } from 'vue';

// 三表附录：完整数据底座（直出不折叠）。正文（六域）讲结论，附录给可核查的明细。

const props = defineProps<{ ctx: AnalysisContext }>();
const store = useAppStore();

type Kind = 'income' | 'balance' | 'cashflow';
const kind = ref<Kind>('income');
const sub = ref<'yoy' | 'share'>('yoy');
const selectedItem = ref<LineItemDef | null>(null);

const tpl = computed(() => industryTemplate(props.ctx.industry));
const tabs: { id: Kind; label: string }[] = [
  { id: 'income', label: '利润表' },
  { id: 'balance', label: '资产负债表' },
  { id: 'cashflow', label: '现金流量表' },
];

const periodLabel = computed(() => {
  const periods = props.ctx.dataset.periods;
  if (!periods.length) return '—';
  return `${periods[0].slice(0, 4)}–${periods[periods.length - 1].slice(0, 4)}`;
});
</script>

<template>
  <section id="sec-appendix" class="wb-section scroll-mt">
    <div class="wb-section__head">
      <div>
        <h2 class="wb-section__title">三表附录</h2>
        <div class="wb-section__sub">合并报表 · {{ periodLabel }} · 单位：亿元 · 正文结论都可回溯到这里</div>
      </div>
    </div>
    <div class="wb-section__body">
      <div class="flex flex-wrap items-center gap-2 mb-3">
        <div class="wb-seg" role="group" aria-label="报表">
          <button v-for="tab in tabs" :key="tab.id" :class="{ 'is-on': kind === tab.id }" @click="kind = tab.id">
            {{ tab.label }}
          </button>
        </div>
        <div class="wb-seg" role="group" aria-label="子列">
          <button :class="{ 'is-on': sub === 'yoy' }" @click="sub = 'yoy'">同比</button>
          <button :class="{ 'is-on': sub === 'share' }" @click="sub = 'share'">共同比</button>
        </div>
        <span class="wb-note">异动高亮阈值：行业模版预设（同比 ±{{ Math.round(tpl.yoyThreshold * 100) }}%、结构 ±{{ Math.round(tpl.shareThreshold * 100) }}pct）</span>
      </div>
      <StatementTable
        :kind="kind"
        :reports="ctx.dataset.reports"
        :sub="sub"
        :quarterly="store.dataMode === 'quarterly'"
        :yoy-threshold="tpl.yoyThreshold"
        :share-threshold="tpl.shareThreshold"
        :only-anomaly="false"
        @select="selectedItem = $event"
      />
      <LineItemDialog
        :item="selectedItem"
        :kind="kind"
        :reports="ctx.dataset.reports"
        :industry-note="selectedItem?.k ? tpl.itemNotes[selectedItem.k] : undefined"
        @close="selectedItem = null"
      />
    </div>
  </section>
</template>
