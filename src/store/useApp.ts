import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { AnalysisContext, AnalysisResult, ComputedDataset, IndustryKey, ProblemId, ReportDataset } from '@/engine';
import {
  computeDataset,
  MODULES,
  runModule,
} from '@/engine';
import { createProvider, type DataProvider } from '@/data/provider';

const proUrl = import.meta.env.VITE_PRO_URL || 'https://winmale.com';
const envAppId = import.meta.env.VITE_WINMALE_OPEN_APPID || '';
const envBase = import.meta.env.VITE_WINMALE_OPEN_BASE || 'https://open.winmale.com';
// 引流归因：开源版所有指向专业版的 CTA 统一带 utm_source
const proUrlUtm = `${proUrl}?utm_source=report-lens&utm_medium=github`;

// Hero 报告的数据源模块（不在菜单中平铺，由 ReportHero 聚合渲染）
const HERO_SOURCE_IDS = new Set(['mineDetect', 'qualityCheck', 'cashFlowQuality']);

export const useAppStore = defineStore('app', () => {
  const appId = ref(envAppId);
  const base = ref(envBase);
  const provider = ref<DataProvider>(createProvider({ appId: appId.value, base: base.value }));
  const usingRealData = computed(() => provider.value.kind === 'winmale');

  const stockList = ref<{ symbol: string; name: string; industry: IndustryKey }[]>([]);
  const currentSymbol = ref('');
  const dataset = ref<ReportDataset | null>(null);
  const computedDs = ref<ComputedDataset | null>(null);

  const problem = ref<ProblemId | null>(null);
  const industry = ref<IndustryKey>('general');

  // 视图状态：'report' = Hero 报告（默认）；其他值 = 次级维度模块 id
  const view = ref<string>('report');
  const lastResult = ref<AnalysisResult | null>(null);

  const loading = ref(false);
  const error = ref('');

  // 次级维度：全部模块去掉 Hero 数据源（能力保留，不再平铺开门）
  const secondaryModules = computed(() => MODULES.filter((m) => !HERO_SOURCE_IDS.has(m.id)));

  // Hero 报告的分析上下文（引擎共享口径）
  const analysisCtx = computed<AnalysisContext | null>(() => {
    if (!dataset.value || !computedDs.value) return null;
    return {
      dataset: dataset.value,
      computed: computedDs.value,
      industry: industry.value,
      peerBench: dataset.value.peerBench,
    };
  });
  const ctxReady = computed(() => analysisCtx.value != null);

  function applyEnv(appIdVal: string, baseVal: string) {
    appId.value = appIdVal;
    base.value = baseVal;
    provider.value = createProvider({ appId: appIdVal, base: baseVal });
  }

  async function init() {
    loading.value = true;
    error.value = '';
    try {
      stockList.value = await provider.value.list();
      if (stockList.value.length && !currentSymbol.value) {
        await selectStock(stockList.value[0].symbol);
      }
    } catch (e) {
      error.value = String(e);
    } finally {
      loading.value = false;
    }
  }

  async function selectStock(symbol: string) {
    loading.value = true;
    error.value = '';
    try {
      const ds = await provider.value.get(symbol);
      currentSymbol.value = symbol;
      dataset.value = ds;
      computedDs.value = computeDataset(ds);
      industry.value = ds.industry;
      runCurrent();
    } catch (e) {
      error.value = String(e);
    } finally {
      loading.value = false;
    }
  }

  function setProblem(p: ProblemId) {
    problem.value = p;
  }

  function setIndustry(i: IndustryKey) {
    industry.value = i;
    runCurrent();
  }

  function setView(v: string) {
    view.value = v;
    runCurrent();
  }

  function runCurrent() {
    if (view.value === 'report') {
      lastResult.value = null; // Hero 由组件直取引擎，无需 result
      return;
    }
    if (!dataset.value || !computedDs.value || !analysisCtx.value) return;
    lastResult.value = runModule(view.value, analysisCtx.value) ?? null;
  }

  return {
    appId,
    base,
    proUrl: proUrlUtm,
    provider,
    usingRealData,
    stockList,
    currentSymbol,
    dataset,
    computedDs,
    problem,
    industry,
    view,
    lastResult,
    loading,
    error,
    secondaryModules,
    analysisCtx,
    ctxReady,
    applyEnv,
    init,
    selectStock,
    setProblem,
    setIndustry,
    setView,
    runCurrent,
  };
});
