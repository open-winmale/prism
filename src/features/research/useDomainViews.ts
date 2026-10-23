import { computed, type Ref } from 'vue';
import {
  anomalySignals,
  industryTemplate,
  runAssetStructure,
  runCashConversionCycle,
  runCashFlowQuality,
  runCashFlowType,
  runFixedAssets,
  runGrossMargin,
  runGrowthSources,
  runInventory,
  runNetProfit,
  runProfitDrivers,
  runQualityCheck,
  runQualityModels,
  runRoe,
  runSeasonality,
  type AnalysisContext,
  type DomainId,
} from '@/engine';
import { domainSectionViews, type DomainSectionView } from './domainSections';
import { useAppStore } from '@/store/useApp';

// 分页共享状态：每页从 useDomainViews 拿自己域的完整视图（KPI/图/信号/深度模块）。
// 阈值、行业附注、突变扫描在这里统一算一次，分页组件保持纯展示。

export function useDomainViews(ctx: Ref<AnalysisContext>) {
  const store = useAppStore();
  const tpl = computed(() => industryTemplate(ctx.value.industry));
  const signals = computed(() =>
    anomalySignals(ctx.value, {
      quarterly: store.dataMode === 'quarterly',
      yoyThreshold: tpl.value.yoyThreshold,
      shareThreshold: tpl.value.shareThreshold,
      minShare: tpl.value.minShare,
      industry: ctx.value.industry,
    }),
  );

  const domainInsights = computed<Partial<Record<DomainId, ReturnType<typeof runProfitDrivers>[]>>>(() => ({
    operating: [runInventory(ctx.value)],
    asset: [runAssetStructure(ctx.value), runFixedAssets(ctx.value)],
    equity: [runGrowthSources(ctx.value), runQualityCheck(ctx.value)],
    profit: [
      runProfitDrivers(ctx.value),
      runGrossMargin(ctx.value),
      runNetProfit(ctx.value),
      runRoe(ctx.value),
      store.dataMode === 'quarterly' ? runSeasonality(ctx.value) : runQualityModels(ctx.value),
    ],
    cashflow: [runCashFlowQuality(ctx.value), runCashConversionCycle(ctx.value), runCashFlowType(ctx.value)],
  }));

  const sections = computed<DomainSectionView[]>(() =>
    domainSectionViews(ctx.value, signals.value, tpl.value, domainInsights.value),
  );

  const byDomain = (id: DomainId): DomainSectionView =>
    sections.value.find((s) => s.id === id) ?? {
      id,
      name: '',
      question: '',
      kpis: [],
      signals: [],
      chart: null,
      charts: [],
      insights: [],
    };

  return { store, tpl, signals, sections, byDomain };
}
