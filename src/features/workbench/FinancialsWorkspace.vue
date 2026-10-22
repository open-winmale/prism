<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { STMT_TREE } from '@/engine/derivations';
import {
  flowTypeRows,
  runAssetStructure,
  runFixedAssets,
  runInventory,
  type AnalysisContext,
} from '@/engine';
import type { AnalysisResult } from '@/engine/analysis/define';
import type { LineItemDef } from '@/engine/methods/columns';
import { useAppStore } from '@/store/useApp';
import StatementTable from '@/components/ui/StatementTable.vue';
import FilterCollapse from '@/components/ui/FilterCollapse.vue';
import LineItemDialog from '@/components/ui/LineItemDialog.vue';
import InsightList from '@/components/ui/InsightList.vue';

const props = defineProps<{ ctx: AnalysisContext }>();
const store = useAppStore();
const route = useRoute();
const router = useRouter();

type Kind = 'income' | 'balance' | 'cashflow';
type Sub = 'yoy' | 'share';

const kind = ref<Kind>('income');
const sub = ref<Sub>('yoy');
const years = ref<number>(store.fetchYears);
const selectedItem = ref<LineItemDef | null>(null);
/** 下钻弹窗的初始视图：从异动信号深链进来时直接落在「解读」 */
const drillMode = ref<'line' | 'bar' | 'table' | 'doc'>('line');

// ── 条件选项 ──
/** 同比异动阈值（小数）：跳到这个幅度才高亮 */
const yoyThreshold = ref<number>(0.3);
/** 结构占比异动阈值（百分点） */
const shareThreshold = ref<number>(0.05);
/** 只看存在跳变的科目 */
const onlyAnomaly = ref(false);

const yoyOptions = [0.2, 0.3, 0.5];
const shareOptions = [0.03, 0.05, 0.1];

// ── 科目深挖 ──
// 主表是「逐行看数」，深挖是「选定一个方向横向拆开」。默认收起，不与主表竞争注意力。
type DeepId = 'assetStructure' | 'inventory' | 'fixedAssets';
const deep = ref<DeepId | null>(null);
const deepTabs: { id: DeepId; label: string; hint: string }[] = [
  { id: 'assetStructure', label: '资产结构', hint: '钱压在哪、有多重、杠杆多少' },
  { id: 'inventory', label: '存货', hint: '周转率、周转天数、占营收比重' },
  { id: 'fixedAssets', label: '固定资产', hint: '产能利用率与在建工程转固节奏' },
];
const deepResult = computed<AnalysisResult | null>(() => {
  if (deep.value === 'assetStructure') return runAssetStructure(props.ctx);
  if (deep.value === 'inventory') return runInventory(props.ctx);
  if (deep.value === 'fixedAssets') return runFixedAssets(props.ctx);
  return null;
});
function pickDeep(id: DeepId) {
  deep.value = deep.value === id ? null : id;
}

/**
 * 季度口径：ctx.dataset 在季度模式下已是单季视图（store.analysisDataset 统一做了 DIFFQ_YTD），
 * 这里直接消费——绝不能再过一遍 singleQuarterView，否则对单季值二次差分，
 * 会算出「Q2 = H1 − 2×Q1」这类负营收（实测泸州老窖 2025Q2 −22.5 亿）。
 * 年度模式下 ctx.dataset 即原始年报。资产负债表为时点值不受差分影响。
 */
const displayReports = computed(() => props.ctx.dataset.reports);

/** 现金流八型：CFO/CFI/CFF 三个符号决定企业当年的现金流「性格」 */
const flows = computed(() => flowTypeRows(props.ctx).slice(-6));

const tabs: { id: Kind; label: string }[] = [
  { id: 'income', label: '利润表' },
  { id: 'balance', label: '资产负债表' },
  { id: 'cashflow', label: '现金流量表' },
];

const subs: { id: Sub; label: string }[] = [
  { id: 'yoy', label: '同比' },
  { id: 'share', label: '共同比' },
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

/** 窄屏条件条收起时的摘要：不展开也要如实知道当前口径 */
const filterSummary = computed(() => {
  const mode =
    store.dataMode === 'annual' ? `年度 · ${years.value} 年窗口` : '季度 · 单季口径';
  const th =
    sub.value === 'yoy'
      ? `同比阈值 ${Math.round(yoyThreshold.value * 100)}%`
      : `结构阈值 ${Math.round(shareThreshold.value * 100)}pct`;
  return `${mode} · ${th}${onlyAnomaly.value ? ' · 只看跳变' : ''}`;
});

const filterNote = computed(
  () =>
    `高亮规则：同比列标记 ±${Math.round(yoyThreshold.value * 100)}% 以上的变化，` +
    `共同比列标记 ${Math.round(shareThreshold.value * 100)} 个百分点以上的结构位移。` +
    '颜色只表达升降方向，不表达好坏——是否危险要看科目的语义（存货涨 vs 收现涨完全不同）。',
);

function pickYears(next: number) {
  years.value = next;
  store.switchYears(next);
}

// 切报表时保留筛选状态，但「只看异常」在无数异动时会呈现空表，需提醒而不是空白
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

function pctText(v: number | null): string {
  return v == null ? '—' : `${(v / 1e8).toFixed(0)}`;
}

// 切换报表时关掉下钻弹窗，避免弹窗内容指向上一张表的科目。
// 这里用显式调用而不是 watch(kind)：深链下钻会先设 kind 再设 selectedItem，
// watcher 是异步刷新的，会在之后把刚设好的弹窗内容清掉。
function pickKind(next: Kind) {
  if (next === kind.value) return;
  kind.value = next;
  selectedItem.value = null;
}

/**
 * 深链下钻：概览页点异动信号 → /financials?kind=balance&item=IO
 * 落到财报工作台后自动切到对应报表并直接打开该科目的「解读」视图，
 * 让用户从「发现异常」一步走到「知道这个科目是什么、下一步查什么」。
 * 用完即清掉 query，避免刷新时反复弹窗。
 */
function applyDeepLink() {
  const qKind = route.query.kind;
  const qItem = route.query.item;
  if (qKind === 'income' || qKind === 'balance' || qKind === 'cashflow') kind.value = qKind;
  if (typeof qItem !== 'string') return;
  const row = STMT_TREE[kind.value].find((r) => r.k === qItem);
  if (!row) return;
  selectedItem.value = { cn: row.cn, k: row.k, col: row.col, drv: row.drv, pct: row.pct };
  drillMode.value = 'doc';
  void router.replace({ name: 'company', params: { symbol: props.ctx.dataset.symbol, workspace: 'financials' } });
}

onMounted(applyDeepLink);
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
          <button v-for="tab in tabs" :key="tab.id" :class="{ 'is-on': kind === tab.id }" @click="pickKind(tab.id)">
            {{ tab.label }}
          </button>
        </div>
        <div class="wb-seg" role="group" aria-label="子列">
          <button v-for="item in subs" :key="item.id" :class="{ 'is-on': sub === item.id }" @click="sub = item.id">
            {{ item.label }}
          </button>
        </div>
        <button class="wb-btn" @click="exportCsv">导出 CSV</button>
      </div>
    </div>
    <div class="wb-section__body">
      <!-- 条件条：口径 + 窗口 + 异动阈值 + 只看异常（窄屏收纳，摘要可见） -->
      <FilterCollapse :summary="filterSummary" class="mb-3">
        <span class="wb-filters__label">口径</span>
        <div class="wb-seg" role="group" aria-label="年度/季度">
          <button :class="{ 'is-on': store.dataMode === 'annual' }" @click="store.switchMode('annual')">年度</button>
          <button :class="{ 'is-on': store.dataMode === 'quarterly' }" @click="store.switchMode('quarterly')">
            季度
          </button>
        </div>
        <template v-if="store.dataMode === 'annual'">
          <span class="wb-filters__label ml-2">窗口</span>
          <div class="wb-seg" role="group" aria-label="年份窗口">
            <button :class="{ 'is-on': years === 5 }" @click="pickYears(5)">5 年</button>
            <button :class="{ 'is-on': years === 10 }" @click="pickYears(10)">10 年</button>
          </div>
        </template>
        <span class="wb-filters__label ml-2">异动阈值</span>
        <div class="wb-seg" role="group" aria-label="同比异动阈值">
          <button
            v-for="t in yoyOptions"
            :key="t"
            :class="{ 'is-on': yoyThreshold === t }"
            @click="yoyThreshold = t"
          >
            同比 {{ Math.round(t * 100) }}%
          </button>
        </div>
        <div class="wb-seg" role="group" aria-label="结构占比异动阈值">
          <button
            v-for="t in shareOptions"
            :key="t"
            :class="{ 'is-on': shareThreshold === t }"
            @click="shareThreshold = t"
          >
            结构 {{ Math.round(t * 100) }}pct
          </button>
        </div>
        <button
          class="wb-toggle"
          :class="{ 'is-on': onlyAnomaly }"
          :aria-pressed="onlyAnomaly"
          @click="onlyAnomaly = !onlyAnomaly"
        >
          <span class="wb-toggle__box" />只看跳变科目
        </button>
        <p class="wb-filters__note">
          {{
            store.dataMode === 'annual'
              ? yearsNote
              : '季度口径：流量为单季值（DIFFQ_YTD 差分推导），同比为同季对比；推不出的期次显示 —；资产负债表为时点值'
          }}
        </p>
        <p class="wb-filters__note">{{ filterNote }}</p>
      </FilterCollapse>
      <StatementTable
        ref="tableRef"
        :kind="kind"
        :reports="displayReports"
        :sub="sub"
        :quarterly="store.dataMode === 'quarterly'"
        :yoy-threshold="yoyThreshold"
        :share-threshold="shareThreshold"
        :only-anomaly="onlyAnomaly"
        @select="selectedItem = $event"
      />
    </div>

    <!-- 现金流八型：三个符号看完一家公司当年在干什么 -->
    <div v-if="kind === 'cashflow' && flows.length" class="wb-section__body mt-4">
      <h3 class="wb-section__sub mb-2">现金流八型（CFO / CFI / CFF 符号 → 企业当年在干什么）</h3>
      <div class="wb-table-wrap">
        <table class="wb-table">
          <thead>
            <tr>
              <th>期间</th>
              <th>类型</th>
              <th class="is-num">经营</th>
              <th class="is-num">投资</th>
              <th class="is-num">筹资</th>
              <th>怎么读</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in flows" :key="row.period">
              <td class="wb-num">{{ row.period }}</td>
              <td>
                <span
                  class="wb-anomaly__item"
                  style="border-left-width: 3px; padding: 0 6px"
                  :class="
                    row.healthy === 'good' ? 'is-good' : row.healthy === 'bad' ? 'is-bad' : 'is-high'
                  "
                  >{{ row.type }}</span
                >
              </td>
              <td class="is-num">{{ pctText(row.cfo === null ? null : row.cfo * 1e8) }}</td>
              <td class="is-num">{{ pctText(row.cfi === null ? null : row.cfi * 1e8) }}</td>
              <td class="is-num">{{ pctText(row.cff === null ? null : row.cff * 1e8) }}</td>
              <td class="wb-note">{{ row.desc }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="wb-note mt-1">
        单位：亿元。八型只看三类现金流的正负号，是快速判断企业处于哪个阶段的粗筛工具，不是结论。
      </p>
    </div>

    <!-- 科目深挖：把三表里的一个方向横向拆开看，默认收起 -->
    <div class="wb-section__body mt-4">
      <div class="flex flex-wrap items-center gap-2">
        <span class="wb-filters__label">科目深挖</span>
        <div class="wb-seg" role="group" aria-label="科目深挖方向">
          <button
            v-for="tab in deepTabs"
            :key="tab.id"
            :class="{ 'is-on': deep === tab.id }"
            :aria-pressed="deep === tab.id"
            @click="pickDeep(tab.id)"
          >
            {{ tab.label }}
          </button>
        </div>
        <span class="wb-note">{{ deepTabs.find((t) => t.id === deep)?.hint ?? '展开后在主表下方看到该方向的拆解' }}</span>
      </div>
      <div v-if="deepResult" class="mt-3">
        <InsightList :result="deepResult" />
      </div>
    </div>

    <LineItemDialog
      :item="selectedItem"
      :kind="kind"
      :reports="displayReports"
      :initial-mode="drillMode"
      @close="
        selectedItem = null;
        drillMode = 'line';
      "
    />
  </section>
</template>
