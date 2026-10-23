<script setup lang="ts">
import { computed } from 'vue';
import type { AnalysisContext } from '@/engine';
import type { CompanyCard } from '@/data/wm/types';
import OverviewTab from './tabs/OverviewTab.vue';
import OperatingAssetTab from './tabs/OperatingAssetTab.vue';
import LiabilityEquityTab from './tabs/LiabilityEquityTab.vue';
import ProfitTab from './tabs/ProfitTab.vue';
import CashflowTab from './tabs/CashflowTab.vue';
import ValuationRiskTab from './tabs/ValuationRiskTab.vue';

// 研究页分发器：按当前页渲染对应 tab 组件。页面切换 = 路由跳转（左栏导航），组件随页面卸载重建。

const props = defineProps<{
  ctx: AnalysisContext;
  card: CompanyCard | null;
  tab: string;
}>();

const TABS = {
  overview: OverviewTab,
  operating: OperatingAssetTab,
  liability: LiabilityEquityTab,
  profit: ProfitTab,
  cashflow: CashflowTab,
  valuation: ValuationRiskTab,
} as const;

const active = computed(() => TABS[(props.tab as keyof typeof TABS) in TABS ? (props.tab as keyof typeof TABS) : 'overview']);
</script>

<template>
  <component :is="active" :ctx="ctx" :card="card" />
</template>
