<script setup lang="ts">
import { computed } from 'vue';
import {
  runCashConversionCycle,
  runCashFlowQuality,
  runProfitDrivers,
  runQualityModels,
  runSeasonality,
  type AnalysisContext,
} from '@/engine';
import { useAppStore } from '@/store/useApp';
import InsightList from '@/components/ui/InsightList.vue';

const props = defineProps<{ ctx: AnalysisContext }>();
const store = useAppStore();

const profit = computed(() => runProfitDrivers(props.ctx));
const cash = computed(() => runCashFlowQuality(props.ctx));
const ccc = computed(() => runCashConversionCycle(props.ctx));
const models = computed(() => runQualityModels(props.ctx));
// 季节性只在季度口径下有意义：单季分布/同季同比需要至少两个完整年的季度数据
const seasonality = computed(() => (store.dataMode === 'quarterly' ? runSeasonality(props.ctx) : null));

const latest = computed(() => {
  const metrics = props.ctx.computed.metrics;
  return metrics[metrics.length - 1] ?? null;
});

function pct(value: number | null | undefined, digits = 1): string {
  return value == null || !Number.isFinite(value) ? '—' : `${(value * 100).toFixed(digits)}%`;
}
</script>

<template>
  <section class="wb-section">
    <div class="wb-section__head">
      <div>
        <h2 class="wb-section__title">质量概览</h2>
        <div class="wb-section__sub">盈利驱动 · 利润含金量 · 营运效率；不打总分，只给证据与方向</div>
      </div>
    </div>
    <div class="wb-section__body">
      <div class="wb-kpis">
        <div class="wb-kpi">
          <div class="wb-kpi__label">ROE（归母）</div>
          <div class="wb-kpi__value">{{ pct(latest?.roe_parent) }}</div>
          <div class="wb-kpi__meta">杜邦口径</div>
        </div>
        <div class="wb-kpi">
          <div class="wb-kpi__label">毛利率</div>
          <div class="wb-kpi__value">{{ pct(latest?.gross_margin) }}</div>
          <div class="wb-kpi__meta">营收 − 营业成本</div>
        </div>
        <div class="wb-kpi">
          <div class="wb-kpi__label">CFO / 归母净利</div>
          <div class="wb-kpi__value">{{ latest?.cfo_to_net_profit?.toFixed(2) ?? '—' }}</div>
          <div class="wb-kpi__meta">≥1 为佳</div>
        </div>
        <div class="wb-kpi">
          <div class="wb-kpi__label">应计 / 总资产</div>
          <div class="wb-kpi__value">{{ pct(latest?.accrual_ta, 2) }}</div>
          <div class="wb-kpi__meta">负值更优</div>
        </div>
        <div class="wb-kpi">
          <div class="wb-kpi__label">FCF</div>
          <div class="wb-kpi__value">
            {{ latest?.fcf == null ? '—' : (latest.fcf / 1e8).toFixed(0) }}
            <span class="wb-kpi__unit">亿</span>
          </div>
          <div class="wb-kpi__meta">CFO − 资本开支</div>
        </div>
      </div>
    </div>
  </section>

  <InsightList :result="models" />
  <InsightList :result="profit" />
  <InsightList :result="cash" />
  <InsightList :result="ccc" />
  <template v-if="seasonality">
    <InsightList :result="seasonality" />
    <p class="wb-note">季节性基于季度口径的单季值（DIFFQ_YTD）与同季同比；年度口径下本模块不展示。</p>
  </template>
</template>
