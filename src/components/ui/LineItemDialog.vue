<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { ChartSpec } from '@/engine';
import { dossierOf } from '@/engine';
import { flagOf, lineItemValues, shareDenominator, shareOf, yoyOf, type LineItemDef } from '@/engine/methods/columns';
import { trendLine } from '@/engine/methods/trend';
import type { PeriodReport } from '@/engine';
import EChart from '@/features/charts/EChart.vue';
import DataTable from './DataTable.vue';

// 科目下钻：点三表任一科目 → 趋势 / 同比 / 数据 / 解读 四视图；ESC 或点遮罩关闭。
// 「解读」是下钻的落点：不只要看到数字怎么变，还要知道这个科目是什么、为什么值得盯、下一步查什么。
const props = withDefaults(
  defineProps<{
    item: LineItemDef | null;
    kind: 'balance' | 'income' | 'cashflow';
    reports: PeriodReport[];
    /** 打开时落在哪个视图；深链下钻时传 'doc' 直接进解读 */
    initialMode?: 'line' | 'bar' | 'table' | 'doc';
    /** 行业附注：行业模版对该科目在该行业语境下的针对性解读（未命中不显示） */
    industryNote?: string;
  }>(),
  { initialMode: 'line' },
);
const emit = defineEmits<{
  (e: 'close'): void;
}>();

const mode = ref<'line' | 'bar' | 'table' | 'doc'>(props.initialMode);
const closeBtn = ref<HTMLButtonElement | null>(null);

// 换科目时回到本次指定的初始视图（连点不同科目时保持一致的手感）
watch(
  () => props.item?.cn,
  () => {
    mode.value = props.initialMode;
  },
);

const quarterly = computed(() => props.reports.some((r) => r.sampling && r.sampling !== 'Q4'));
const labels = computed(() =>
  props.reports.map((r) => (quarterly.value ? `${r.period.slice(0, 4)}Q${(r.sampling ?? 'Q4').slice(1)}` : r.period.slice(0, 4))),
);

const values = computed(() => (props.item ? lineItemValues(props.reports, props.item) : []));
const yoys = computed(() => yoyOf(values.value));
const shares = computed(() =>
  shareOf(
    values.value,
    props.reports.map((r) => shareDenominator(props.kind, r, props.item?.k)),
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
  if (mode.value === 'table' || mode.value === 'doc') return null;
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

// ── 解读视图 ──
const dossier = computed(() => dossierOf(props.item?.k ?? ''));

/** 占比口径文案：现金流量表分流量项与期末现金两套分母 */
const baseName = computed(() => {
  if (props.kind === 'balance') return '总资产';
  if (props.kind === 'income') return '营业总收入';
  return props.item?.k === 'CCF' ? '总资产' : '营业总收入';
});

/** 区间变化：首 → 末；缺任一端则 null */
const rangeChange = computed(() => {
  const first = values.value[0];
  const last = values.value[values.value.length - 1];
  if (first == null || last == null) return null;
  return isPct.value ? last - first : first === 0 ? null : last / first - 1;
});

const rangeText = computed(() => {
  const c = rangeChange.value;
  if (c == null) return '—';
  return isPct.value ? `${c > 0 ? '+' : ''}${(c * 100).toFixed(1)} pct` : `${c > 0 ? '+' : ''}${(c * 100).toFixed(1)}%`;
});

/** 逐年波动幅度：最大单期跳变（用于「这个科目稳不稳」） */
const maxJump = computed(() => {
  const valid = yoys.value.filter((v): v is number => v != null);
  if (!valid.length) return null;
  return valid.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), valid[0]);
});

const latestYoy = computed(() => yoys.value[yoys.value.length - 1] ?? null);
const flags = computed(() => flagOf(yoys.value, 0.3));
const jumpPeriods = computed(() =>
  flags.value
    .map((f, i) => (f ? labels.value[i] : null))
    .filter((x): x is string => x != null)
    .slice(-5),
);

/** 派生行的公式可读化；直取科目行没有公式 */
const formulaText = computed(() => {
  const d = props.item?.drv;
  if (!d) return '直接取自报表科目，无派生计算';
  switch (d.d) {
    case 'add':
      return `${FIELD_CN[d.a]} + ${d.a2 ? FIELD_CN[d.a2] : '0'}`;
    case 'sub':
      return `${FIELD_CN[d.a]} − ${FIELD_CN[d.b]}`;
    case 'div':
      return `${FIELD_CN[d.a]} ÷ ${FIELD_CN[d.b]}`;
    case 'quick':
      return `(${FIELD_CN[d.a]} − ${FIELD_CN[d.m]}) ÷ ${FIELD_CN[d.b]}`;
    case 'margin':
      return `(${FIELD_CN[d.b]} − ${FIELD_CN[d.a]}) ÷ ${FIELD_CN[d.b]}`;
    case 'share':
      return `${FIELD_CN[d.a]} ÷ ${FIELD_CN[d.b]}`;
    case 'sum':
      return d.as.map((k) => FIELD_CN[k]).join(' + ');
    case 'sum_all':
      return `${d.as.map((k) => FIELD_CN[k]).join(' + ')}（任一项缺失则不出数）`;
    case 'sum_share':
      return `(${d.as.map((k) => FIELD_CN[k]).join(' + ')}) ÷ ${FIELD_CN[d.b]}`;
    default:
      return '派生口径';
  }
});

const FIELD_CN: Record<string, string> = {
  total_assets: '总资产',
  total_liabilities: '负债合计',
  total_current_assets: '流动资产',
  total_current_liabilities: '流动负债',
  total_noncurrent_assets: '非流动资产',
  equity_parent: '归母权益',
  total_equity: '所有者权益',
  inventories: '存货',
  notes_receivable: '应收票据',
  accounts_receivable: '应收账款',
  total_revenue: '营业总收入',
  operating_cost: '营业成本',
  selling_expense: '销售费用',
  admin_expense: '管理费用',
  rd_expense: '研发费用',
  finance_expense: '财务费用',
  short_term_loans: '短期借款',
  noncurrent_liab_1y: '一年内到期非流动负债',
  long_term_loans: '长期借款',
  bonds_payable: '应付债券',
  lease_liabilities: '租赁负债',
  net_cash_operating: '经营现金流净额',
  net_cash_investing: '投资现金流净额',
  net_cash_financing: '筹资现金流净额',
};

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
  return pct
    ? `${(v * 100).toFixed(1)}%`
    : (v / 1e8).toLocaleString('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
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
          <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div class="wb-seg" role="group" aria-label="下钻视图">
              <button :class="{ 'is-on': mode === 'line' }" @click="mode = 'line'">趋势</button>
              <button :class="{ 'is-on': mode === 'bar' }" @click="mode = 'bar'">同比</button>
              <button :class="{ 'is-on': mode === 'table' }" @click="mode = 'table'">数据</button>
              <button :class="{ 'is-on': mode === 'doc' }" @click="mode = 'doc'">解读</button>
            </div>
          </div>

          <EChart v-if="spec" :spec="spec" :height="260" />

          <DataTable
            v-else-if="mode === 'table'"
            :columns="[
              { key: 'period', label: '报告期' },
              { key: 'value', label: `原值（${unitLabel}）`, align: 'right' },
              { key: 'yoy', label: '同比', align: 'right' },
              { key: 'share', label: '占比', align: 'right' },
            ]"
            :rows="tableRows"
          />

          <!-- 解读：这个科目是什么、怎么算的、现在什么状态、下一步查什么 -->
          <div v-else class="wb-doc">
            <dl class="wb-doc__list">
              <div class="wb-doc__row">
                <dt>是什么</dt>
                <dd>{{ dossier.what }}</dd>
              </div>
              <div class="wb-doc__row">
                <dt>怎么算</dt>
                <dd class="wb-doc__formula">{{ formulaText }}</dd>
              </div>
              <div class="wb-doc__row">
                <dt>区间变化</dt>
                <dd>
                  {{ labels[0] }} → {{ labels[labels.length - 1] }}：{{ rangeText }}
                  <span v-if="latestYoy != null" class="wb-note">
                    （最新一期同比 {{ (latestYoy * 100).toFixed(1) }}%）
                  </span>
                </dd>
              </div>
              <div class="wb-doc__row">
                <dt>波动性</dt>
                <dd>
                  <template v-if="maxJump != null">
                    单期最大跳变 {{ (maxJump * 100).toFixed(1) }}%
                    <span v-if="jumpPeriods.length" class="wb-note">（发生在 {{ jumpPeriods.join('、') }}）</span>
                  </template>
                  <template v-else>数据不足，无法判断波动</template>
                </dd>
              </div>
              <div class="wb-doc__row">
                <dt>为什么盯它</dt>
                <dd>{{ dossier.why }}</dd>
              </div>
              <div v-if="industryNote" class="wb-doc__row">
                <dt>行业附注</dt>
                <dd>{{ industryNote }}</dd>
              </div>
              <div class="wb-doc__row">
                <dt>下一步</dt>
                <dd>{{ dossier.next }}</dd>
              </div>
            </dl>
          </div>

          <p class="wb-note mt-2">
            缺失期显示「—」，不按 0 补齐；占比 = 本科目 ÷ {{ baseName }}。
          </p>
        </div>
      </div>
    </div>
  </Teleport>
</template>
