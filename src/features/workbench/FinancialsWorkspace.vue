<script setup lang="ts">
import { computed, ref } from 'vue';
import { singleQuarterView, type AnalysisContext } from '@/engine';
import type { LineItemDef } from '@/engine/methods/columns';
import { useAppStore } from '@/store/useApp';
import StatementTable from '@/components/ui/StatementTable.vue';
import LineItemDialog from '@/components/ui/LineItemDialog.vue';

const props = defineProps<{ ctx: AnalysisContext }>();
const store = useAppStore();

type Kind = 'income' | 'balance' | 'cashflow';
type Sub = 'yoy' | 'share';

const kind = ref<Kind>('income');
const sub = ref<Sub>('yoy');
const years = ref<number>(store.fetchYears);
const selectedItem = ref<LineItemDef | null>(null);

/** 季度口径：流量表换成单季视图（DIFFQ_YTD）；资产负债表保持时点值 */
const displayReports = computed(() =>
  store.dataMode === 'quarterly' ? singleQuarterView(props.ctx.dataset.reports) : props.ctx.dataset.reports,
);

const tabs: { id: Kind; label: string }[] = [
  { id: 'income', label: '利润表' },
  { id: 'balance', label: '资产负债表' },
  { id: 'cashflow', label: '现金流量表' },
];

const subs: { id: Sub; label: string }[] = [
  { id: 'yoy', label: '同比' },
  { id: 'share', label: '占比' },
];

const periodLabel = computed(() => {
  const periods = props.ctx.dataset.periods;
  if (!periods.length) return '—';
  return `${periods[0].slice(0, 4)}–${periods[periods.length - 1].slice(0, 4)}`;
});

const isSnapshot = computed(() => store.fetchInfo.kind === 'snapshot');
const yearsNote = computed(() => {
  if (isSnapshot.value) return '内置快照仅 5 年；连接开放平台后可选 10 年（首次约 +3 万 EC，24h 缓存）。';
  if (years.value >= 10) return '10 年窗口：实时取 30 张表，约 6 万 EC；24h 内缓存命中 0 EC。';
  return '5 年窗口：实时取 15 张表，约 3 万 EC；24h 内缓存命中 0 EC。';
});

function pickYears(next: number) {
  years.value = next;
  store.switchYears(next);
}

const tableRef = ref<InstanceType<typeof StatementTable> | null>(null);

function exportCsv() {
  const data = tableRef.value?.exportData();
  if (!data) return;
  const header = ['科目', ...data.labels.flatMap((label) => [`${label} 原值`, `${label} ${data.subLabel}`])];
  const lines = [header.join(','), ...data.rows.map((row) => [row.name, ...row.values].join(','))];
  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${props.ctx.dataset.symbol}-${kind.value}-${sub.value}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <section class="wb-section">
    <div class="wb-section__head">
      <div>
        <h2 class="wb-section__title">三表工作台</h2>
        <div class="wb-section__sub">
          合并报表 · {{ periodLabel }} · 单位：亿元
          <span v-if="ctx.dataset.meta?.auditOpinion"> · {{ ctx.dataset.meta.auditOpinion }}</span>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <div class="wb-seg" role="group" aria-label="报表">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            :class="{ 'is-on': kind === tab.id }"
            @click="kind = tab.id"
          >
            {{ tab.label }}
          </button>
        </div>
        <div class="wb-seg" role="group" aria-label="子列">
          <button
            v-for="item in subs"
            :key="item.id"
            :class="{ 'is-on': sub === item.id }"
            @click="sub = item.id"
          >
            {{ item.label }}
          </button>
        </div>
        <button class="wb-btn" @click="exportCsv">导出 CSV</button>
      </div>
    </div>
    <div class="wb-section__body">
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <span class="wb-note">口径：</span>
        <div class="wb-seg" role="group" aria-label="年度/季度">
          <button :class="{ 'is-on': store.dataMode === 'annual' }" @click="store.switchMode('annual')">
            年度
          </button>
          <button
            :class="{ 'is-on': store.dataMode === 'quarterly' }"
            @click="store.switchMode('quarterly')"
          >
            季度
          </button>
        </div>
        <template v-if="store.dataMode === 'annual'">
          <span class="wb-note ml-2">窗口：</span>
          <div class="wb-seg" role="group" aria-label="年份窗口">
            <button :class="{ 'is-on': years === 5 }" @click="pickYears(5)">5 年</button>
            <button :class="{ 'is-on': years === 10 }" @click="pickYears(10)">10 年</button>
          </div>
        </template>
        <span class="wb-note">
          {{
            store.dataMode === 'annual'
              ? yearsNote
              : '季度口径：流量为单季值（DIFFQ_YTD 差分推导），同比为同季对比；推不出的期次显示 —；资产负债表为时点值'
          }}
        </span>
      </div>
      <StatementTable
        ref="tableRef"
        :kind="kind"
        :reports="displayReports"
        :sub="sub"
        :quarterly="store.dataMode === 'quarterly'"
        @select="selectedItem = $event"
      />
    </div>

    <LineItemDialog
      :item="selectedItem"
      :kind="kind"
      :reports="displayReports"
      @close="selectedItem = null"
    />
  </section>
</template>
