import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { AnalysisContext, AnalysisResult, ComputedDataset, IndustryKey, ProblemId, ReportDataset } from '@/engine';
import { computeDataset, MODULES, runModule } from '@/engine';
import { createProvider, type DataProvider, type SymbolBrief } from '@/data/provider';
import { clearCredentials, loadCredentials, saveCredentials } from '@/data/wm/credentials';
import { clearTokenCache } from '@/data/wm/auth';
import type { FetchProgress } from '@/data/wm/dataset';
import { DEFAULT_SCENARIO } from '@/features/analysis/scenarios';

const proUrl = import.meta.env.VITE_PRO_URL || 'https://winmale.com';
// 引流归因：开源版所有指向专业版的 CTA 统一带 utm_source
const proUrlUtm = `${proUrl}?utm_source=report-lens&utm_medium=github`;

// Hero 报告的数据源模块（不在菜单中平铺，由 ReportHero 聚合渲染）
const HERO_SOURCE_IDS = new Set(['mineDetect', 'qualityCheck', 'cashFlowQuality']);

export const useAppStore = defineStore('app', () => {
  // ── 凭证与数据源 ──
  const credential = ref(loadCredentials());
  // provider 是带方法的类实例：不能用 ref() 包（reactive 代理会让方法调用丢 this）。
  // 数据源身份用一个普通字符串 ref 供 UI 响应，实例本体放普通变量。
  let providerInstance: DataProvider = createProvider(credential.value);
  const providerKind = ref(providerInstance.kind);
  /** 'live' = 接口实时；'snapshot' = 内置快照 */
  const dataSource = computed(() => providerKind.value);

  function useProvider(next: DataProvider) {
    providerInstance = next;
    providerKind.value = next.kind;
  }

  /** 应用用户填写的 AppId；传空串则清除并回到快照模式 */
  function applyCredentials(clientId: string, clientSecret: string) {
    if (!clientId.trim() || !clientSecret.trim()) {
      clearCredentials();
      clearTokenCache();
    } else {
      saveCredentials(clientId, clientSecret);
    }
    credential.value = loadCredentials();
    useProvider(createProvider(credential.value));
  }

  // ── 数据状态 ──
  const stockList = ref<SymbolBrief[]>([]);
  const currentSymbol = ref('');
  const dataset = ref<ReportDataset | null>(null);
  const computedDs = ref<ComputedDataset | null>(null);

  /** 最近一次取数的成本与降级信息（用于页脚透明化展示） */
  const fetchInfo = ref<{ ecCost: number; cached: boolean; missing: string[] }>({
    ecCost: 0,
    cached: false,
    missing: [],
  });
  /** 取数进度（15 张表，给骨架屏用） */
  const progress = ref<FetchProgress | null>(null);

  const problem = ref<ProblemId | null>(null);
  // 行业固定白酒（M1 收窄，IMPLEMENTATION_PLAN.md §4.1）
  const industry = ref<IndustryKey>('liquor');

  // 视图状态：'report' = 场景报告（默认）；其他值 = 次级维度模块 id
  const view = ref<string>('report');
  // 场景（view === 'report' 时生效）：mine 防踩雷 / quality 看质地 / cash 验真伪
  const scenario = ref<string>(DEFAULT_SCENARIO);

  function setScenario(id: string) {
    scenario.value = id;
    view.value = 'report'; // 场景切换回到报告视图
  }
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

  async function init() {
    loading.value = true;
    error.value = '';
    try {
      stockList.value = await providerInstance.list();
      if (stockList.value.length && !currentSymbol.value) {
        await selectStock(stockList.value[0].symbol);
      }
    } catch (e) {
      error.value = String(e instanceof Error ? e.message : e);
    } finally {
      loading.value = false;
    }
  }

  // 额外样本（如制造业对照样例）：不进首页白酒列表，但可在分析页下拉切换
  const extraSymbols = ref<SymbolBrief[]>([]);
  async function loadExtraSamples() {
    try {
      const all = await providerInstance.listAll();
      const known = new Set(stockList.value.map((s) => s.symbol));
      extraSymbols.value = all.filter((s) => !known.has(s.symbol));
    } catch {
      /* 静默：对照样本加载失败不影响主流程 */
    }
  }

  // 请求序号：快速切换标的时丢弃过期响应，避免慢请求覆盖新选择
  let selectSeq = 0;

  /** 数据口径：annual=年报（经审计，跟自己比年度趋势）；quarterly=最近 8 个报告期（单季推导） */
  const dataMode = ref<'annual' | 'quarterly'>('annual');

  async function selectStock(symbol: string, mode?: 'annual' | 'quarterly') {
    const seq = ++selectSeq;
    if (mode && mode !== dataMode.value) dataMode.value = mode;
    // 立即标记意图：防止与 init() 的自动选中竞态（URL 指定的标的会被首页第一家公司覆盖）
    currentSymbol.value = symbol;
    loading.value = true;
    error.value = '';
    progress.value = null;
    try {
      const res = await providerInstance.getDataset(symbol, {
        mode: dataMode.value,
        years: dataMode.value === 'quarterly' ? 8 : 5,
        onProgress: (p) => {
          if (seq === selectSeq) progress.value = p;
        },
      });
      if (seq !== selectSeq) return; // 过期结果丢弃
      dataset.value = res.dataset;
      computedDs.value = computeDataset(res.dataset);
      industry.value = res.dataset.industry;
      fetchInfo.value = { ecCost: res.ecCost, cached: res.cached, missing: res.missing };
      runCurrent();
    } catch (e) {
      if (seq !== selectSeq) return;
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      if (seq === selectSeq) {
        loading.value = false;
        progress.value = null;
      }
    }
  }

  /** 切换年度/季度口径（保留当前标的重新取数，命中不同缓存） */
  function switchMode(mode: 'annual' | 'quarterly') {
    if (mode === dataMode.value || !currentSymbol.value) return;
    void selectStock(currentSymbol.value, mode);
  }

  // ── 动态选标的 ──
  const searchResults = ref<SymbolBrief[]>([]);
  const searching = ref(false);
  let searchTimer: ReturnType<typeof setTimeout> | null = null;

  /** 防抖检索；无凭证时返回空（UI 负责引导填 AppId） */
  function searchSymbols(q: string, delay = 300) {
    if (searchTimer) clearTimeout(searchTimer);
    const text = q.trim();
    if (!text) {
      searchResults.value = [];
      searching.value = false;
      return;
    }
    searching.value = true;
    searchTimer = setTimeout(async () => {
      try {
        const fn = providerInstance.search?.bind(providerInstance);
        searchResults.value = fn ? await fn(text) : [];
      } catch {
        searchResults.value = [];
      } finally {
        searching.value = false;
      }
    }, delay);
  }

  function clearSearch() {
    searchResults.value = [];
    searching.value = false;
  }

  function setProblem(p: ProblemId) {
    problem.value = p;
  }

  function setIndustry(i: IndustryKey) {
    industry.value = i;
    runCurrent();
  }

  // M1 起行业固定白酒：外部传 general 等历史值时归一为 liquor
  function normalizeIndustry(i: IndustryKey | undefined): IndustryKey {
    return i === 'manufacturing' ? 'manufacturing' : 'liquor';
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
    proUrl: proUrlUtm,
    credential,
    dataSource,
    applyCredentials,
    stockList,
    currentSymbol,
    dataset,
    computedDs,
    fetchInfo,
    progress,
    problem,
    industry,
    view,
    lastResult,
    loading,
    error,
    secondaryModules,
    analysisCtx,
    ctxReady,
    init,
    loadExtraSamples,
    extraSymbols,
    selectStock,
    searchSymbols,
    searchResults,
    searching,
    clearSearch,
    setProblem,
    setIndustry,
    normalizeIndustry,
    setView,
    scenario,
    setScenario,
    dataMode,
    switchMode,
    runCurrent,
  };
});
