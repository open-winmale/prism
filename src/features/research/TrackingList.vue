<script setup lang="ts">
import { computed } from 'vue';
import type { AnalysisContext } from '@/engine';
import type { CompanyCard } from '@/data/wm/types';
import { useAppStore } from '@/store/useApp';

const props = defineProps<{
  ctx: AnalysisContext;
  card: CompanyCard | null;
}>();

const store = useAppStore();
const latest = computed(() => {
  const metrics = props.ctx.computed.metrics;
  return metrics[metrics.length - 1] ?? null;
});
const reports = computed(() => props.ctx.dataset.reports);
const revenue = computed(() => reports.value.map((r) => r.income.total_revenue ?? null));
const revenueGrowth = computed(() => {
  const values = revenue.value;
  const a = values[values.length - 1];
  const b = values[values.length - 2];
  return a != null && b != null && b !== 0 ? a / b - 1 : null;
});

const grossMean = computed(() => {
  const values = props.ctx.computed.metrics.map((m) => m.gross_margin).filter((v): v is number => v != null);
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
});

const ibdRatio = computed(() => {
  const metrics = latest.value;
  const report = reports.value[reports.value.length - 1];
  if (!metrics || !report?.balance.total_assets) return null;
  return metrics.interest_bearing_debt == null ? null : metrics.interest_bearing_debt / report.balance.total_assets;
});

const rows = computed(() => {
  const items = [
    {
      label: '营收同比',
      value: revenueGrowth.value == null ? '—' : pct(revenueGrowth.value),
      threshold: '连续两期为负 → 需求走弱',
      state: revenueGrowth.value == null ? '数据不足' : revenueGrowth.value < 0 ? '需关注' : '正常',
      source: '三表',
    },
    {
      label: '毛利率',
      value: latest.value?.gross_margin == null ? '—' : pct(latest.value.gross_margin),
      threshold: `自身 5 年均值 ${grossMean.value == null ? '—' : pct(grossMean.value)}，偏离 >2pt 需解释`,
      state:
        latest.value?.gross_margin == null || grossMean.value == null
          ? '数据不足'
          : Math.abs(latest.value.gross_margin - grossMean.value) > 0.02
            ? '需关注'
            : '正常',
      source: '三表',
    },
    {
      label: 'CFO / 归母净利',
      value: latest.value?.cfo_to_net_profit == null ? '—' : latest.value.cfo_to_net_profit.toFixed(2),
      threshold: '<0.8 连续两年 → 利润含金量恶化',
      state:
        latest.value?.cfo_to_net_profit == null
          ? '数据不足'
          : latest.value.cfo_to_net_profit < 0.8
            ? '需关注'
            : '正常',
      source: '三表',
    },
    {
      label: '有息负债率',
      value: ibdRatio.value == null ? '—' : pct(ibdRatio.value),
      threshold: '>30% 且现金/短债 <1 → 杠杆风险',
      state: ibdRatio.value == null ? '数据不足' : ibdRatio.value > 0.3 ? '需关注' : '正常',
      source: '三表',
    },
    {
      label: 'PE 3 年分位',
      value: props.card?.pct_pe_3y == null ? '—' : pct(props.card.pct_pe_3y, 0),
      threshold: '>70% → 估值偏贵；<30% → 偏便宜',
      state:
        props.card?.pct_pe_3y == null ? '数据不足' : props.card.pct_pe_3y > 0.7 ? '需关注' : '正常',
      source: '行情',
    },
  ];
  if (props.ctx.industry === 'liquor') {
    items.push({
      label: '合同负债 / 营收',
      value: latest.value?.contract_liab_ratio == null ? '—' : pct(latest.value.contract_liab_ratio),
      threshold: '<5% 或连续两期下降 >20% → 渠道信心转弱',
      state:
        latest.value?.contract_liab_ratio == null
          ? '数据不足'
          : latest.value.contract_liab_ratio < 0.05
            ? '需关注'
            : '正常',
      source: '三表',
    });
  }
  return items;
});

function pct(value: number | null | undefined, digits = 1): string {
  return value == null || !Number.isFinite(value) ? '—' : `${(value * 100).toFixed(digits)}%`;
}
</script>

<template>
  <section id="sec-tracking" class="wb-section scroll-mt">
    <div class="wb-section__head">
      <div>
        <h2 class="wb-section__title">跟踪清单</h2>
        <div class="wb-section__sub">下一次看财报时，优先核对这 {{ rows.length }} 个指标</div>
      </div>
    </div>
    <div class="wb-section__body">
      <div class="wb-table-wrap">
        <table class="wb-table">
          <thead>
            <tr>
              <th>指标</th>
              <th class="is-num">当前</th>
              <th>阈值 / 触发条件</th>
              <th>状态</th>
              <th>来源</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.label">
              <td>{{ row.label }}</td>
              <td class="is-num">{{ row.value }}</td>
              <td>{{ row.threshold }}</td>
              <td>
                <span
                  class="wb-chip"
                  :class="row.state === '需关注' ? 'is-risk' : row.state === '数据不足' ? '' : ''"
                >
                  {{ row.state }}
                </span>
              </td>
              <td class="wb-note">{{ row.source }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="mt-5">
        <div class="wb-section__sub">什么会推翻本报告的结论？</div>
        <ul class="wb-note mt-1 list-disc pl-5">
          <li>合同负债/营收连续两期下降超过 20%，且 CFO/净利跌破 0.8。</li>
          <li>毛利率跌破自身 5 年均值 3pt 以上，且销售费用率同步上升。</li>
          <li>PE 进入自身 3 年 80% 分位以上，同时 ROE 连续两期下行。</li>
          <li>出现非标审计意见、商誉大额减值或大股东资金占用。</li>
        </ul>
      </div>

      <div class="wb-callout mt-5">
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span>
            想看附注明细、机构盈利预测或设置财报提醒？这些数据域由专业版提供。
          </span>
          <a :href="store.proUrl" target="_blank" rel="noopener" class="wb-btn wb-btn--primary">
            前往专业版 →
          </a>
        </div>
      </div>
    </div>
  </section>
</template>
