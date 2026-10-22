<script setup lang="ts">
import { computed } from 'vue';
import TableScroll from '@/components/ui/TableScroll.vue';
import { expandStatement, STMT_TREE } from '@/engine/derivations';
import { fieldGetter, type PeriodReport } from '@/engine';
import {
  flagOf,
  sameQuarterYoyOf,
  shareDenominator,
  shareOf,
  yoyOf,
  type LineItemDef,
  type MoveFlag,
} from '@/engine/methods/columns';

// 三表列组工作台：每个期间一组「原值 + 同比/占比」子列；科目行可点 → 科目下钻。
// 与专业版同构的信息密度：同一屏回答「今年多少、同比多少、占比多少」。
// 季度口径：流量已由父组件换成单季视图，同比必须用「同季对比」（sameQuarterYoyOf），
// 拿相邻期比会被季节效应污染（Q1→Q2 是环比不是同比）。
//
// 条件视图：几十期数字人眼扫不出跳变，所以由引擎标记「幅度越过阈值的那一格」，
// 并提供阈值与「只看异常」两个条件开关——把注意力先放到变化最大的地方。

type StatementKind = 'balance' | 'income' | 'cashflow';

const props = withDefaults(
  defineProps<{
    kind: StatementKind;
    reports: PeriodReport[];
    /** 期间内的子列：同比 或 占比 */
    sub: 'yoy' | 'share';
    /** 季度口径：同比切换为同季对比 */
    quarterly?: boolean;
    /** 同比异动阈值（小数）；默认 0.3 */
    yoyThreshold?: number;
    /** 结构占比异动阈值（百分点）；默认 0.05 */
    shareThreshold?: number;
    /** 只显示存在异动的科目行 */
    onlyAnomaly?: boolean;
  }>(),
  { quarterly: false, yoyThreshold: 0.3, shareThreshold: 0.05, onlyAnomaly: false },
);

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

/** 当前子列生效的异动阈值：同比用百分比，占比用百分点 */
const activeThreshold = computed(() =>
  props.sub === 'yoy' ? props.yoyThreshold : props.shareThreshold,
);

const rows = computed(() => {
  const matrix = props.reports.map((r) => expandStatement(props.kind, fieldGetter(r)));
  const template = STMT_TREE[props.kind];
  return template.map((row, index) => {
    const values = matrix.map((period) => period[index]?.value ?? null);
    // 共同比分母按行取：现金流量表的流量项 ÷ 营业总收入，期末现金 ÷ 总资产
    const shares = shareOf(
      values,
      props.reports.map((r) => shareDenominator(props.kind, r, row.k)),
    );
    const yoys = props.quarterly ? sameQuarterYoyOf(props.reports, values) : yoyOf(values);

    let subValues: (number | null)[];
    let flags: MoveFlag[];
    if (props.sub === 'yoy') {
      subValues = yoys;
      flags = flagOf(yoys, props.yoyThreshold);
    } else {
      // 占比列标的是「占比变了多少个百分点」，不是占比水平本身
      const deltas = shares.map((v, i) =>
        i === 0 || v == null || shares[i - 1] == null ? null : v - shares[i - 1]!,
      );
      subValues = shares;
      flags = flagOf(deltas, props.shareThreshold);
    }

    return {
      def: { cn: row.cn, k: row.k, col: row.col, drv: row.drv, pct: row.pct } as LineItemDef,
      key: row.k,
      name: row.cn,
      section: row.section,
      pctRow: row.pct === true,
      cells: values.map((v) => fmtValue(v, row.pct === true)),
      subs: subValues.map((v) => (row.pct === true && props.sub === 'share' ? '—' : fmtSub(v))),
      flags,
      hasAnomaly: flags.some((f) => f != null),
      allMissing: values.every((v) => v == null),
    };
  });
});

/** 条件视图：只看异常时过滤掉无跳变的科目；小计行保留，保证表格结构不断裂 */
const visibleRows = computed(() =>
  props.onlyAnomaly ? rows.value.filter((r) => r.section || r.hasAnomaly) : rows.value,
);

const anomalyCount = computed(() => rows.value.filter((r) => r.hasAnomaly).length);

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

/** 供父组件导出 CSV 使用：导出当前可见行，做到「看到什么就导出什么」 */
defineExpose({
  exportData: () => ({
    rows: visibleRows.value.map((row) => ({
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
    <div v-if="onlyAnomaly && !anomalyCount" class="wb-callout">
      当前阈值下没有科目跳变：同比 ±{{ Math.round(yoyThreshold * 100) }}%、结构占比
      ±{{ Math.round(shareThreshold * 100) }} 个百分点都未被越过。调低阈值可以看到更细微的变化。
    </div>
    <TableScroll>
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
            v-for="row in visibleRows"
            :key="row.key"
            :class="{ 'is-section': row.section, 'is-clickable': !row.section }"
            :title="row.section ? undefined : '点击查看趋势、同比与解读'"
            @click="onClick(row)"
          >
            <td class="is-sticky">
              <span v-if="!row.section && row.hasAnomaly" class="wb-flag-dot" aria-hidden="true" />
              {{ row.name }}
            </td>
            <template v-for="(cell, index) in row.cells" :key="index">
              <td class="is-num" :class="{ 'is-missing': cell === '—' }">{{ cell }}</td>
              <td
                class="is-num wb-td-sub"
                :class="{
                  'is-missing': row.subs[index] === '—',
                  'is-up': row.flags[index] === 'up',
                  'is-down': row.flags[index] === 'down',
                }"
              >
                {{ row.subs[index] }}
              </td>
            </template>
          </tr>
        </tbody>
      </table>
    </TableScroll>
    <p class="wb-note">
      单位：亿元{{ sub === 'yoy' ? ' ／ 子列：同比 %' : ' ／ 子列：占比 %' }}。
      共同比口径：{{
        kind === 'balance'
          ? '各项 ÷ 总资产'
          : kind === 'income'
            ? '各项 ÷ 营业总收入'
            : '流量项 ÷ 营业总收入、期末现金 ÷ 总资产'
      }}。缺失显示「—」，不按 0 处理；点击科目行可下钻趋势与解读。
    </p>
    <div class="wb-legend">
      <span class="wb-legend__item">
        <i class="wb-swatch is-up" />上升 ≥{{ Math.round(activeThreshold * 100)
        }}{{ sub === 'yoy' ? '%' : ' pct' }}
      </span>
      <span class="wb-legend__item">
        <i class="wb-swatch is-down" />下降 ≥{{ Math.round(activeThreshold * 100)
        }}{{ sub === 'yoy' ? '%' : ' pct' }}
      </span>
      <span class="wb-legend__item wb-legend__item--muted">
        {{ onlyAnomaly ? `已筛选：仅显示 ${anomalyCount} 个跳变科目` : `本次共 ${anomalyCount} 个科目出现跳变` }}
      </span>
    </div>
  </div>
</template>
