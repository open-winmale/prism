<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { ChartSpec } from '@/engine';
import { lineItemValues, shareDenominator, shareOf, yoyOf, type LineItemDef } from '@/engine/methods/columns';
import { trendLine } from '@/engine/methods/trend';
import type { PeriodReport } from '@/engine';
import EChart from '@/features/charts/EChart.vue';
import DataTable from './DataTable.vue';

// 科目下钻：点三表任一科目 → 折线/柱状/表格 + 同比/占比；ESC 或点遮罩关闭。
const props = defineProps<{
  item: LineItemDef | null;
  kind: 'balance' | 'income' | 'cashflow';
  reports: PeriodReport[];
}>();
const emit = defineEmits<{ (e: 'close'): void }>();

const mode = ref<'line' | 'bar' | 'table'>('line');
const closeBtn = ref<HTMLButtonElement | null>(null);

const quarterly = computed(() => props.reports.some((r) => r.sampling && r.sampling !== 'Q4'));
const labels = computed(() =>
  props.reports.map((r) => (quarterly.value ? `${r.period.slice(0, 4)}Q${(r.sampling ?? 'Q4').slice(1)}` : r.period.slice(0, 4))),
);

const values = computed(() => (props.item ? lineItemValues(props.reports, props.item) : []));
const yoys = computed(() => yoyOf(values.value));
const shares = computed(() =>
  shareOf(
    values.value,
    props.reports.map((r) => shareDenominator(props.kind, r)),
  ),
);

const isPct = computed(() => props.item?.pct === true);
const unitLabel = computed(() => (isPct.value ? '%' : '亿元'));

/** 展示值：pct 行直接用比率×100；金额行折亿元 */
const displayValues = computed(() =>
  values.value.map((v) => {
    if (v == null) return null;
    return isPct.value ? v * 100 : v / 1e8;
  }),
);

const spec = computed<ChartSpec | null>(() => {
  if (!props.item) return null;
  if (mode.value === 'table') return null;
  if (mode.value === 'bar') {
    return {
      type: 'bar',
      title: `${props.item.cn} · 同比`,
      unit: '%',
      categories: labels.value,
      series: [{ name: '同比', data: yoys.value.map((v) => (v == null ? null : v * 100)) }],
      refLines: [{ value: 0, label: '0' }],
    };
  }
  return trendLine(labels.value, [{ name: props.item.cn, values: displayValues.value }], {
    title: props.item.cn,
    unit: unitLabel.value,
  });
});

const tableRows = computed(() =>
  labels.value.map((label, i) => ({
    period: label,
    value: fmtCell(values.value[i], false),
    yoy: yoys.value[i] == null ? '—' : `${(yoys.value[i]! * 100).toFixed(1)}%`,
    share: shares.value[i] == null ? '—' : `${(shares.value[i]! * 100).toFixed(1)}%`,
  })),
);

function fmtCell(v: number | null | undefined, pct: boolean): string {
  if (v == null) return '—';
  return pct ? `${(v * 100).toFixed(1)}%` : (v / 1e8).toLocaleString('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close');
}
onMounted(() => {
  window.addEventListener('keydown', onKey);
  closeBtn.value?.focus();
});
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <Teleport to="body">
    <div v-if="item" class="wb-dialog-mask" @click.self="emit('close')">
      <div class="wb-dialog" role="dialog" aria-modal="true" :aria-label="item.cn">
        <div class="wb-dialog__head">
          <div>
            <div class="wb-dialog__title">{{ item.cn }}</div>
            <div class="wb-dialog__meta">
              {{ labels[0] }}–{{ labels[labels.length - 1] }} · 来源：{{ item.drv ? '派生口径' : '三表科目' }} ·
              单位：{{ unitLabel }}
            </div>
          </div>
          <button ref="closeBtn" class="wb-dialog__close" @click="emit('close')">关闭 ESC</button>
        </div>
        <div class="wb-dialog__body">
          <div class="wb-seg mb-3" role="group" aria-label="下钻视图">
            <button :class="{ 'is-on': mode === 'line' }" @click="mode = 'line'">趋势</button>
            <button :class="{ 'is-on': mode === 'bar' }" @click="mode = 'bar'">同比</button>
            <button :class="{ 'is-on': mode === 'table' }" @click="mode = 'table'">数据</button>
          </div>
          <EChart v-if="spec" :spec="spec" :height="260" />
          <DataTable
            v-else
            :columns="[
              { key: 'period', label: '报告期' },
              { key: 'value', label: `原值（${unitLabel}）`, align: 'right' },
              { key: 'yoy', label: '同比', align: 'right' },
              { key: 'share', label: '占比', align: 'right' },
            ]"
            :rows="tableRows"
          />
          <p class="wb-note mt-2">缺失期显示「—」，不按 0 补齐；占比 = 本科目 ÷ {{ kind === 'balance' ? '总资产' : kind === 'income' ? '营业总收入' : '经营现金流净额' }}。</p>
        </div>
      </div>
    </div>
  </Teleport>
</template>
