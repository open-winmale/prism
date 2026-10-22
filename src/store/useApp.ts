import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { AnalysisContext, ComputedDataset, IndustryKey, ReportDataset, VerifyIssue } from '@/engine';
import { computeDataset, singleQuarterView } from '@/engine';
import { createProvider, clearAllCaches, type DataProvider, type DataSourceKind, type SymbolBrief } from '@/data/provider';
import { getSample } from '@/data/loader';
import type { CompanyCard, IndustryMembersPayload } from '@/data/wm/types';
import { clearCredentials, loadCredentials, saveCredentials } from '@/data/wm/credentials';
import { clearTokenCache } from '@/data/wm/auth';
import type { FetchProgress } from '@/data/wm/dataset';

const proUrl = import.meta.env.VITE_PRO_URL || 'https://winmale.com';
// 引流归因：开源版所有指向专业版的 CTA 统一带 utm_source
const proUrlUtm = `${proUrl}?utm_source=prism&utm_medium=github`;

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
    // 换账户后旧缓存可能属于上一个 AppId，必须清掉，避免串数据。
    clearAllCaches();
    useProvider(createProvider(credential.value));
    // 换数据源后立即重拉当前标的，避免继续展示旧账户/快照数据。
    if (currentSymbol.value) void selectStock(currentSymbol.value, dataMode.value);
  }

  // ── 数据状态 ──
  const stockList = ref<SymbolBrief[]>([]);
  const currentSymbol = ref('');
  const dataset = ref<ReportDataset | null>(null);
  /** 公司一页纸：估值/股息/成长/行业层级（live 才有） */
  const card = ref<CompanyCard | null>(null);
  /** 行业成分：同业表/行业分位（live 才有） */
  const peers = ref<IndustryMembersPayload | null>(null);

  /**
   * 分析口径数据集：季度模式下流量表统一换成单季视图（DIFFQ_YTD），
   * 概览/质量/风险的引擎模块与三表工作台展示都消费它（FinancialsWorkspace 直接用，
   * 不得再过一遍 singleQuarterView——那会二次差分，见其注释）。
   * 年度模式下与 dataset 相同。
   */
  const analysisDataset = computed<ReportDataset | null>(() => {
    const ds = dataset.value;
    if (!ds) return null;
    if (dataMode.value !== 'quarterly') return ds;
    const reports = singleQuarterView(ds.reports);
    return {
      ...ds,
      reports,
      meta: { ...ds.meta, dataMode: 'quarterly' },
    };
  });

  /** 引擎共享口径（单期/杜邦指标），基于分析口径数据集 */
  const computedDs = computed<ComputedDataset | null>(() =>
    analysisDataset.value ? computeDataset(analysisDataset.value) : null,
  );

  /** 最近一次取数的成本、来源与降级信息（用于页脚透明化展示） */
  const fetchInfo = ref<{
    kind: DataSourceKind | null;
    ecCost: number;
    cached: boolean;
    missing: string[];
    issues: VerifyIssue[];
  }>({
    kind: null,
    ecCost: 0,
    cached: false,
    missing: [],
    issues: [],
  });

  /** 报告头展示用：来源按 dataset 实际来源判断，而不是按 provider 判断。 */
  const sourceLabel = computed(() => {
    const info = fetchInfo.value;
    if (info.kind === 'snapshot') return '内置快照 · 0 EC';
    if (info.kind === 'live') {
      return info.cached ? '接口取数 · 本地缓存 · 0 EC' : `接口取数 · ${info.ecCost.toLocaleString()} EC`;
    }
    return '未取数';
  });
  /** 取数进度（15 张表，给骨架屏用） */
  const progress = ref<FetchProgress | null>(null);

  const industry = ref<IndustryKey>('liquor');

  const loading = ref(false);
  const error = ref('');

  // 分析上下文（引擎共享口径）：消费「分析口径数据集」，季度模式即单季视图
  const analysisCtx = computed<AnalysisContext | null>(() => {
    if (!analysisDataset.value || !computedDs.value) return null;
    return {
      dataset: analysisDataset.value,
      computed: computedDs.value,
      industry: industry.value,
      peerBench: analysisDataset.value.peerBench,
      marketValue: card.value?.mv ?? null,
      dividendYield: card.value?.bonus_rate_ttm ?? null,
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
  /** 年度窗口年数（5/10）；季度口径固定 8 个报告期 */
  const fetchYears = ref<number>(5);

  async function selectStock(symbol: string, mode?: 'annual' | 'quarterly', years?: number) {
    const seq = ++selectSeq;
    if (mode && mode !== dataMode.value) dataMode.value = mode;
    if (years && years !== fetchYears.value) fetchYears.value = years;
    // 立即标记意图：防止与 init() 的自动选中竞态（URL 指定的标的会被首页第一家公司覆盖）
    currentSymbol.value = symbol;
    loading.value = true;
    error.value = '';
    progress.value = null;
    card.value = null;
    peers.value = null;
    try {
      const res = await providerInstance.getDataset(symbol, {
        mode: dataMode.value,
        years: dataMode.value === 'quarterly' ? 8 : fetchYears.value,
        onProgress: (p) => {
          if (seq === selectSeq) progress.value = p;
        },
      });
      if (seq !== selectSeq) return; // 过期结果丢弃
      dataset.value = res.dataset;
      industry.value = res.dataset.industry;
      card.value = res.card ?? null;
      peers.value = res.peers ?? null;
      fetchInfo.value = {
        kind: res.kind,
        ecCost: res.ecCost,
        cached: res.cached,
        missing: res.missing,
        issues: res.issues,
      };
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

  /** 切换年度窗口（5/10 年；实时模式 10 年约多花 3 万 EC，由 UI 预估提示） */
  function switchYears(years: number) {
    if (years === fetchYears.value || !currentSymbol.value) return;
    void selectStock(currentSymbol.value, dataMode.value, years);
  }

  // ── 三表逐行横截面（/compare 渐进加载） ──
  // 默认 0 家 = 0 EC。每多勾一家就要多取一份完整三表，EC 必须可预估、可确认、可看见。
  const compareTargets = ref<Record<string, ReportDataset>>({});
  const compareEc = ref(0);
  const compareLoading = ref<string | null>(null);
  const compareError = ref('');

  /** 年度口径单家取数成本（张数 × 单价的实测值）：5 年 15 张 ≈ 3 万，10 年 30 张 ≈ 6 万 */
  function ecPerCompany(): number {
    return fetchYears.value >= 10 ? 60_000 : 30_000;
  }

  /**
   * 预估勾选这些公司的 EC 成本。
   * 内置样本（快照）走本地，恒为 0；只有需要调接口的标的才计价。
   */
  function estimateCompareEc(symbols: string[]): number {
    if (dataSource.value !== 'live') return 0;
    // 内置样本即使处于实时模式也走本地快照（0 EC），不能按接口价预估——
    // 否则会出现「勾一下五粮液就报 3 万 EC」这种把免费路径算成收费的误导。
    return symbols.filter((s) => !compareTargets.value[s] && !getSample(s)).length * ecPerCompany();
  }

  async function loadCompare(symbol: string) {
    if (compareTargets.value[symbol]) return;
    compareLoading.value = symbol;
    compareError.value = '';
    try {
      const res = await providerInstance.getDataset(symbol, {
        mode: 'annual',
        years: fetchYears.value,
      });
      compareTargets.value = { ...compareTargets.value, [symbol]: res.dataset };
      compareEc.value += res.ecCost ?? 0;
    } catch (e) {
      compareError.value = `${symbol}：${e instanceof Error ? e.message : String(e)}`;
      // 失败的标的从选中里剔除由调用方负责；这里不静默重试（EC 已经花了就别再花一次）
    } finally {
      compareLoading.value = null;
    }
  }

  function clearCompare() {
    compareTargets.value = {};
    compareEc.value = 0;
    compareError.value = '';
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

  return {
    proUrl: proUrlUtm,
    credential,
    dataSource,
    applyCredentials,
    stockList,
    currentSymbol,
    dataset,
    analysisDataset,
    computedDs,
    card,
    peers,
    fetchInfo,
    sourceLabel,
    progress,
    industry,
    loading,
    error,
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
    dataMode,
    fetchYears,
    switchMode,
    switchYears,
    compareTargets,
    compareEc,
    compareLoading,
    compareError,
    ecPerCompany,
    estimateCompareEc,
    loadCompare,
    clearCompare,
  };
});
