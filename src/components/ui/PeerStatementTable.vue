<script setup lang="ts">
import { computed, ref } from 'vue';
import FilterCollapse from '@/components/ui/FilterCollapse.vue';
import TableScroll from '@/components/ui/TableScroll.vue';
import { peerStatementTable, yi, type PeerCompareTable, type StatementKind } from '@/engine/methods/peerStatements';
import type { ReportDataset } from '@/engine/schema/types';

// 三表逐行横截面：同一行科目摆到多家公司旁边。
// 信息密度高的同时必须能「一眼找到异常」，所以提供三个条件开关：
//   ① 报表（利润表/资产负债表/现金流量表）② 只看偏离中位数超过阈值的行 ③ 排序（按偏离幅度 / 按原表顺序）
// 默认不开启过滤——先给全貌，再把注意力引向偏离项。

const props = withDefaults(
  defineProps<{
    main: ReportDataset;
    others: ReportDataset[];
    /** 偏离中位数多少算异常（倍数） */
    outlierGap?: number;
  }>(),
  { outlierGap: 0.5 },
);
const emit = defineEmits<{ (e: 'update:outlierGap', v: number): void }>();

function pickGap(g: number) {
  emit('update:outlierGap', g);
}

type Kind = StatementKind;
const kind = ref<Kind>('income');
const align = ref(true);
const onlyOutlier = ref(false);
const sortByGap = ref(false);
const gapOptions = [0.2, 0.5, 1];

const tabs: { id: Kind; label: string }[] = [
  { id: 'income', label: '利润表' },
  { id: 'balance', label: '资产负债表' },
  { id: 'cashflow', label: '现金流量表' },
];

const table = computed<PeerCompareTable>(() =>
  peerStatementTable(kind.value, props.main, props.others, { align: align.value, outlierGap: props.outlierGap }),
);

const rows = computed(() => {
  const rs = table.value.rows;
  const filtered = onlyOutlier.value ? rs.filter((r) => r.outlier) : rs;
  if (!sortByGap.value) return filtered;
  return [...filtered].sort((a, b) => Math.abs(b.gap ?? -1) - Math.abs(a.gap ?? -1));
});

const outlierCount = computed(() => table.value.rows.filter((r) => r.outlier).length);

/** 窄屏条件条收起时的摘要：报表 + 期间口径 + 阈值 + 开关状态 */
const filterSummary = computed(() => {
  const kindLabel = tabs.find((t) => t.id === kind.value)?.label ?? '';
  const parts = [
    kindLabel,
    align.value ? '对齐共同年' : '各自最新',
    `偏离 ${Math.round(props.outlierGap * 100)}%`,
  ];
  if (onlyOutlier.value) parts.push('只看偏离项');
  if (sortByGap.value) parts.push('按偏离排序');
  return parts.join(' · ');
});

function gapText(gap: number | null): string {
  if (gap == null) return '—';
  const pct = gap * 100;
  return `${pct > 0 ? '+' : ''}${pct.toFixed(0)}%`;
}

function shareText(v: number | null): string {
  return v == null ? '—' : `${(v * 100).toFixed(1)}%`;
}

/** 排名徽标：前三名/后三名用不同底色，一眼看出位置 */
function rankClass(rank: number | null, n: number): string {
  if (rank == null || n < 2) return '';
  if (rank === 1) return 'is-top';
  if (rank === n) return 'is-bottom';
  return 'is-mid';
}

function exportCsv() {
  const head = ['科目', ...table.value.companies.map((c) => `${c.name}(${c.period.slice(0, 4)})值`), ...table.value.companies.map((c) => `${c.name}占比`), '中位数(亿)', '本公司排名', '偏离中位数'];
  const lines = [
    head.join(','),
    ...rows.value.map((r) =>
      [
        r.cn,
        ...r.values.map((v) => (v == null ? '' : (v / 1e8).toFixed(2))),
        ...r.shares.map((v) => (v == null ? '' : (v * 100).toFixed(2))),
        r.median == null ? '' : (r.median / 1e8).toFixed(2),
        r.rank ?? '',
        gapText(r.gap),
      ].join(','),
    ),
  ];
  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${props.main.symbol}-${kind.value}-横截面.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <div>
    <!-- 条件条：报表 / 期间对齐 / 异常阈值 / 只看偏离 / 按偏离排序（窄屏收纳） -->
    <FilterCollapse :summary="filterSummary" class="mb-3">
      <span class="wb-filters__label">报表</span>
      <div class="wb-seg" role="group" aria-label="报表">
        <button v-for="tab in tabs" :key="tab.id" :class="{ 'is-on': kind === tab.id }" @click="kind = tab.id">
          {{ tab.label }}
        </button>
      </div>
      <span class="wb-filters__label ml-2">期间</span>
      <div class="wb-seg" role="group" aria-label="期间对齐">
        <button :class="{ 'is-on': align }" @click="align = true">对齐共同年</button>
        <button :class="{ 'is-on': !align }" @click="align = false">各自最新</button>
      </div>
      <span class="wb-filters__label ml-2">异常阈值</span>
      <div class="wb-seg" role="group" aria-label="偏离中位数阈值">
        <button
          v-for="g in gapOptions"
          :key="g"
          :class="{ 'is-on': outlierGap === g }"
          @click="pickGap(g)"
        >
          偏离 {{ Math.round(g * 100) }}%
        </button>
      </div>
      <button class="wb-toggle" :class="{ 'is-on': onlyOutlier }" :aria-pressed="onlyOutlier" @click="onlyOutlier = !onlyOutlier">
        <span class="wb-toggle__box" />只看偏离项
      </button>
      <button class="wb-toggle" :class="{ 'is-on': sortByGap }" :aria-pressed="sortByGap" @click="sortByGap = !sortByGap">
        <span class="wb-toggle__box" />按偏离排序
      </button>
      <button class="wb-btn" @click="exportCsv">导出 CSV</button>
      <p class="wb-filters__note">
        单位：亿元 · 对齐期间 {{ table.alignedYear }}
        <template v-if="!table.aligned">（未对齐：各家用的年份不同，结论要打折）</template>
        · 偏离中位数超 {{ Math.round(outlierGap * 100) }}% 的科目 {{ outlierCount }} 项
      </p>
    </FilterCollapse>

    <p v-if="table.warnings.length" class="wb-callout is-warn mb-3">
      {{ table.warnings.join('；') }}
    </p>

    <TableScroll>
      <table class="wb-table wb-table--peer">
        <thead>
          <tr>
            <th class="is-sticky">科目</th>
            <th v-for="(c, i) in table.companies" :key="c.symbol" class="is-num">
              <div>{{ c.name }}</div>
              <div class="wb-th-sub">{{ c.period.slice(0, 4) }}</div>
              <div v-if="i === 0" class="wb-th-sub is-mine">本公司</div>
            </th>
            <th class="is-num">中位数</th>
            <th class="is-num">本公司排名</th>
            <th class="is-num">偏离中位数</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.k" :class="{ 'is-section': row.section, 'is-outlier': row.outlier }">
            <td class="is-sticky">
              <span v-if="row.outlier" class="wb-flag-dot is-bad" :title="`偏离中位数 ${gapText(row.gap)}`" />
              {{ row.cn }}
            </td>
            <td v-for="(v, i) in row.values" :key="i" class="is-num" :class="{ 'is-mine': i === 0 }">
              <div>{{ row.pct ? shareText(v) : yi(v) }}</div>
              <div v-if="!row.pct" class="wb-td-sub">{{ shareText(row.shares[i]) }}</div>
            </td>
            <td class="is-num">{{ row.pct ? shareText(row.median) : yi(row.median) }}</td>
            <td class="is-num">
              <span v-if="row.rank != null" class="wb-rank" :class="rankClass(row.rank, row.n)">
                {{ row.rank }}/{{ row.n }}
              </span>
              <span v-else>—</span>
            </td>
            <td class="is-num" :class="row.gap == null ? '' : row.gap > 0 ? 'is-up' : 'is-down'">
              {{ gapText(row.gap) }}
            </td>
          </tr>
          <tr v-if="rows.length === 0">
            <td :colspan="table.companies.length + 4" class="wb-note">
              当前阈值下没有偏离项。把阈值调低，或关掉「只看偏离项」看全貌。
            </td>
          </tr>
        </tbody>
      </table>
    </TableScroll>
    <p class="wb-note mt-1">
      排名按原值从大到小，缺值的公司不参与排名与中位数（缺失 ≠ 0）。
      中位数与排名只在{{ table.companies.length }}家的样本内成立——样本越小，分位越不可靠。
    </p>
  </div>
</template>
