<script setup lang="ts">
import { computed } from 'vue';
import { expandStatement, STMT_TREE } from '@/engine/derivations';
import { fieldGetter, type PeriodReport } from '@/engine';
import {
  sameQuarterYoyOf,
  shareDenominator,
  shareOf,
  yoyOf,
  type LineItemDef,
} from '@/engine/methods/columns';

// 三表列组工作台：每个期间一组「原值 + 同比/占比」子列；科目行可点 → 科目下钻。
// 与专业版同构的信息密度：同一屏回答「今年多少、同比多少、占比多少」。
// 季度口径：流量已由父组件换成单季视图，同比必须用「同季对比」（sameQuarterYoyOf），
// 拿相邻期比会被季节效应污染（Q1→Q2 是环比不是同比）。

type StatementKind = 'balance' | 'income' | 'cashflow';

const props = defineProps<{
  kind: StatementKind;
  reports: PeriodReport[];
  /** 期间内的子列：同比 或 占比 */
  sub: 'yoy' | 'share';
  /** 季度口径：同比切换为同季对比 */
  quarterly?: boolean;
}>();

const emit = defineEmits<{ (e: 'select', item: LineItemDef): void }>();

const hasQuarters = computed(() => props.reports.some((r) => r.sampling && r.sampling !== 'Q4'));

const labels = computed(() =>
  props.reports.map((r) => {
    const year = r.period.slice(0, 4);
    const sampling = r.sampling ?? 'Q4';
    return hasQuarters.value ? `${year}Q${sampling.slice(1)}` : year;
  }),
);

const subLabel = computed(() => {
  if (props.sub === 'share') return '占比';
  return props.quarterly ? '同比(同季)' : '同比';
});

const rows = computed(() => {
  const matrix = props.reports.map((r) => expandStatement(props.kind, fieldGetter(r)));
  const template = STMT_TREE[props.kind];
  return template.map((row, index) => {
    const values = matrix.map((period) => period[index]?.value ?? null);
    const subValues =
      props.sub === 'yoy'
        ? props.quarterly
          ? sameQuarterYoyOf(props.reports, values)
          : yoyOf(values)
        : shareOf(
            values,
            props.reports.map((r) => shareDenominator(props.kind, r)),
          );
    return {
      def: row as LineItemDef,
      key: row.k,
      name: row.cn,
      section: row.section,
      pctRow: row.pct === true,
      cells: values.map((v) => fmtValue(v, row.pct === true)),
      subs: subValues.map((v) => (row.pct === true && props.sub === 'share' ? '—' : fmtSub(v))),
      allMissing: values.every((v) => v == null),
    };
  });
});

function fmtValue(v: number | null, pct: boolean): string {
  if (v == null) return '—';
  if (pct) return `${(v * 100).toFixed(1)}%`;
  return (v / 1e8).toLocaleString('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function fmtSub(v: number | null): string {
  if (v == null) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

function onClick(row: (typeof rows.value)[number]) {
  if (row.section) return;
  emit('select', row.def);
}

/** 供父组件导出 CSV 使用 */
defineExpose({
  exportData: () => ({
    rows: rows.value.map((row) => ({
      name: row.name.replace(/\u3000/g, ''),
      values: [...row.cells, ...row.subs],
      section: row.section,
    })),
    labels: labels.value,
    subLabel: subLabel.value,
  }),
});
</script>

<template>
  <div>
    <div class="wb-table-wrap">
      <table class="wb-table">
        <thead>
          <tr>
            <th rowspan="2" class="is-sticky wb-th-rowspan">科目</th>
            <th v-for="label in labels" :key="label" colspan="2" class="is-num wb-th-group">{{ label }}</th>
          </tr>
          <tr>
            <template v-for="label in labels" :key="label">
              <th class="is-num wb-th-sub">原值</th>
              <th class="is-num wb-th-sub">{{ subLabel }}</th>
            </template>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.key"
            :class="{ 'is-section': row.section, 'is-clickable': !row.section }"
            :title="row.section ? undefined : '点击查看趋势与同比'"
            @click="onClick(row)"
          >
            <td class="is-sticky">{{ row.name }}</td>
            <template v-for="(cell, index) in row.cells" :key="index">
              <td class="is-num" :class="{ 'is-missing': cell === '—' }">{{ cell }}</td>
              <td class="is-num wb-td-sub" :class="{ 'is-missing': row.subs[index] === '—' }">{{ row.subs[index] }}</td>
            </template>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="wb-note">
      单位：亿元{{ sub === 'yoy' ? ' ／ 子列：同比 %' : ' ／ 子列：占比 %（本期 ÷ ' }}
      {{ kind === 'balance' ? '总资产' : kind === 'income' ? '营业总收入' : '经营现金流净额' }}{{ sub === 'share' ? '）' : '' }}。
      缺失显示「—」，不按 0 处理；点击科目行可下钻趋势。
    </p>
  </div>
</template>
