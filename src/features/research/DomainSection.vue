<script setup lang="ts">
import { computed } from 'vue';
import { domainMeta } from '@/engine';
import type { DomainSectionView } from './domainSections';
import ChartFrame from '@/components/ui/ChartFrame.vue';
import InsightList from '@/components/ui/InsightList.vue';
import KpiTile from '@/components/ui/KpiTile.vue';

// 六大问题域的 section（2026-10-23 拍平）：无折叠、无「展开深度分析」按钮——
// 两层交互原则：1 级 = 左栏页面导航，2 级 = 点异动信号看证据图。其余内容全部直出。

const props = defineProps<{
  section: DomainSectionView;
  symbol: string;
}>();

const meta = computed(() => domainMeta(props.section.id));

const kpiUnit = (kpi: DomainSectionView['kpis'][number]): string =>
  kpi.format === 'pct' ? '%' : kpi.format === 'x' ? 'x' : kpi.format === 'yi' ? '亿' : '';

const kpiText = (kpi: DomainSectionView['kpis'][number]): string => {
  const v = kpi.value;
  if (v == null || !Number.isFinite(v)) return '—';
  if (kpi.format === 'pct') return (v * 100).toFixed(1);
  if (kpi.format === 'x') return v.toFixed(2);
  if (kpi.format === 'yi') return v.toFixed(1);
  return String(v);
};

/** spark 已在数据层（domainSections.kpi 构造处）换算完毕——展示层绝不再换算，避免二次 ÷1e8 */
const sparkOf = (kpi: DomainSectionView['kpis'][number]): (number | null)[] => kpi.spark;

function toneText(s: { tone: string; severity: string }): string {
  const t = s.tone === 'bad' ? '需警惕' : s.tone === 'good' ? '偏正面' : '需结合上下文';
  return s.severity === 'high' ? `${t} · 高危` : t;
}
</script>

<template>
  <section :id="`domain-${section.id}`" class="wb-section wb-domain scroll-mt">
    <div class="wb-section__head">
      <div>
        <h2 class="wb-section__title">
          {{ section.name }}问题
          <span class="wb-domain__count" v-if="section.signals.length">{{ section.signals.length }}</span>
        </h2>
        <div class="wb-section__sub">{{ meta.question }}</div>
      </div>
    </div>

    <div class="wb-section__body">
      <!-- 行业附注：为什么这个行业要盯这个域 -->
      <p v-if="section.note" class="wb-domain__note">行业附注：{{ section.note }}</p>

      <!-- 域 KPI：sparkline + 公式悬浮 -->
      <div class="wb-kpis wb-domain__kpis">
        <KpiTile
          v-for="kpi in section.kpis"
          :key="kpi.label"
          :label="kpi.label"
          :value="kpiText(kpi)"
          :unit="kpiUnit(kpi)"
          :meta="kpi.meta"
          :spark="sparkOf(kpi)"
          :formula="kpi.formula"
        />
      </div>

      <!-- 突变信号（固定检查方法产出）：数据 + 附注 -->
      <div v-if="section.signals.length" class="wb-anomaly mt-3">
        <div
          v-for="signal in section.signals"
          :key="signal.id"
          class="wb-anomaly__item"
          :class="{ 'is-high': signal.severity === 'high', 'is-bad': signal.tone === 'bad', 'is-good': signal.tone === 'good' }"
        >
          <span class="wb-anomaly__period">{{ signal.period }}</span>
          <strong>{{ signal.itemName }}</strong>
          <span class="wb-note">{{ toneText(signal) }}</span>
          <span class="wb-anomaly__evidence">{{ signal.evidence }}</span>
          <span v-if="signal.note" class="wb-anomaly__why">行业附注：{{ signal.note }}</span>
          <span class="wb-anomaly__why">{{ signal.why }} {{ signal.next }}</span>
        </div>
      </div>

      <!-- 核心图（预先编排，只读）+ 追加图 -->
      <div v-if="section.chart" class="mt-4">
        <ChartFrame :spec="section.chart.spec" :source="section.chart.source" :height="240" />
      </div>
      <div v-for="(chart, i) in section.charts" :key="i" class="mt-3">
        <ChartFrame :spec="chart.spec" :source="chart.source" :height="220" />
      </div>

      <!-- 深度模块（引擎 InsightList）：直出，不再折叠 -->
      <div v-if="section.insights.length" class="mt-4 wb-domain__insights">
        <InsightList v-for="(result, i) in section.insights" :key="i" :result="result" />
      </div>
    </div>
  </section>
</template>
