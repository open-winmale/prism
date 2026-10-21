import type { IndustryKey, ReportDataset } from '@/engine';
import { LIQUOR_SAMPLES, SAMPLES, getSample } from './loader';
import { WmClient } from './wm/client';
import { loadCredentials, toWmCredentials, type CredentialState } from './wm/credentials';
import { fetchDataset, type FetchOptions, type FetchProgress } from './wm/dataset';
import { clearDatasetCache, readCache, writeCache } from './wm/cache';
import type { DiscoverHit, IndustryAggregates, IndustryMember } from './wm/types';

// 数据提供方（双模）。两者出口契约完全一致 —— 引擎与 UI 不感知数据从哪来。
//
//  live     ：用 AppId 调赢麻了开放平台接口，动态选标的、数据随财报更新
//  snapshot ：内置快照（当前 3 家白酒 × 5 年），0 EC、无需配置、离线可用
//
// 公开站点默认不内置 AppId —— 想查任意标的，请在「设置」里填自己申请的 AppId。

export type DataSourceKind = 'live' | 'snapshot';

export interface SymbolBrief {
  symbol: string;
  name: string;
  industry: IndustryKey;
  /** 估值/行情快照（live 模式才有） */
  pe_ttm?: number | null;
  pb?: number | null;
  roe_ttm?: number | null;
  close?: number | null;
  mv?: number | null;
}

export interface DatasetResult {
  dataset: ReportDataset;
  kind: DataSourceKind;
  /** 命中本地缓存（24h TTL）→ 本次 0 EC */
  cached: boolean;
  ecCost: number;
  /** 缺失的「期次-表」，降级而非整页失败 */
  missing: string[];
}

export interface LiquorPool {
  items: SymbolBrief[];
  aggregates: IndustryAggregates;
  /** 是否来自接口（false = 降级到内置静态清单） */
  live: boolean;
}

export interface DataProvider {
  kind: DataSourceKind;
  list(): Promise<SymbolBrief[]>;
  listAll(): Promise<SymbolBrief[]>;
  get(symbol: string): Promise<ReportDataset>;
  getDataset(symbol: string, opts?: FetchOptions): Promise<DatasetResult>;
  /** 标的检索（live 专属） */
  search?(q: string, signal?: AbortSignal): Promise<SymbolBrief[]>;
  /** 白酒行业成分 + 估值中枢（live 专属，失败降级静态清单） */
  liquorPool?(signal?: AbortSignal): Promise<LiquorPool>;
}

// ─────────────────────────────────────────────────────────────
// 内置快照模式
// ─────────────────────────────────────────────────────────────

export class SnapshotProvider implements DataProvider {
  kind = 'snapshot' as const;

  // 首页卡片：真实白酒三家（M1 收窄）
  async list(): Promise<SymbolBrief[]> {
    return LIQUOR_SAMPLES.map((s) => ({ symbol: s.symbol, name: s.name, industry: s.industry }));
  }

  // 含制造业对照样例（分析页下拉可切）
  async listAll(): Promise<SymbolBrief[]> {
    return SAMPLES.map((s) => ({ symbol: s.symbol, name: s.name, industry: s.industry }));
  }

  async get(symbol: string): Promise<ReportDataset> {
    const ds = getSample(symbol);
    if (!ds) throw new Error(`内置快照中没有 ${symbol}。请填入自己的 AppId 以查看任意标的。`);
    return ds;
  }

  async getDataset(symbol: string): Promise<DatasetResult> {
    const ds = await this.get(symbol);
    return { dataset: ds, kind: 'snapshot', cached: false, ecCost: 0, missing: [] };
  }

  async liquorPool(): Promise<LiquorPool> {
    return { items: await this.list(), aggregates: {}, live: false };
  }
}

// ─────────────────────────────────────────────────────────────
// 实时模式（AppId 调接口）
// ─────────────────────────────────────────────────────────────

const POOL_TTL_MS = 24 * 60 * 60 * 1000;
const POOL_LS_KEY = 'report-lens:liquor-pool';

export class LiveProvider implements DataProvider {
  kind = 'live' as const;
  readonly client: WmClient;

  constructor(creds: NonNullable<ReturnType<typeof toWmCredentials>>) {
    this.client = new WmClient(creds);
  }

  async search(q: string, signal?: AbortSignal): Promise<SymbolBrief[]> {
    const hits = await this.client.discover(q, signal);
    return toSymbolBriefs(hits);
  }

  async liquorPool(signal?: AbortSignal): Promise<LiquorPool> {
    // 池子一天内基本不变，先读缓存，避免每次进首页都花 3.8k EC
    const cached = readPoolCache();
    if (cached) return { ...cached, live: true };

    const res = await this.client.runSkill<{
      result?: { items?: IndustryMember[]; aggregates?: IndustryAggregates };
    }>('wm-data', { action: 'members', key: '白酒', kind: 'industry' }, signal);

    const items = (res.data?.result?.items ?? []).map<SymbolBrief>((m) => ({
      symbol: m.symbol,
      name: m.name,
      industry: 'liquor',
      pe_ttm: m.pe_ttm ?? null,
      pb: m.pb ?? null,
      roe_ttm: m.roe_ttm ?? null,
      close: m.close ?? null,
      mv: m.mv ?? null,
    }));
    if (items.length === 0) throw new Error('未取到白酒行业成分');

    const pool: LiquorPool = { items, aggregates: res.data?.result?.aggregates ?? {}, live: true };
    writePoolCache(pool);
    return pool;
  }

  async list(): Promise<SymbolBrief[]> {
    try {
      const pool = await this.liquorPool();
      // 退市标的（如 600696 退市岩石）不进默认卡片列表
      return pool.items.filter((x) => !x.name.includes('退市'));
    } catch {
      // 接口不可用 → 降级内置快照清单，保证首页不空
      return LIQUOR_SAMPLES.map((s) => ({ symbol: s.symbol, name: s.name, industry: s.industry }));
    }
  }

  async listAll(): Promise<SymbolBrief[]> {
    const live = await this.list();
    const known = new Set(live.map((s) => s.symbol));
    const extra = SAMPLES.filter((s) => !known.has(s.symbol)).map<SymbolBrief>((s) => ({
      symbol: s.symbol,
      name: s.name,
      industry: s.industry,
    }));
    return [...live, ...extra];
  }

  async get(symbol: string): Promise<ReportDataset> {
    return (await this.getDataset(symbol)).dataset;
  }

  async getDataset(symbol: string, opts: FetchOptions = {}): Promise<DatasetResult> {
    // 内置样本（制造对照等）直接走快照：0 EC、必然可用，也不该打到接口
    const builtin = getSample(symbol);
    if (builtin) {
      return { dataset: builtin, kind: 'snapshot', cached: false, ecCost: 0, missing: [] };
    }
    const years = opts.years ?? 5;
    const hit = readCache(symbol, years);
    if (hit) {
      return { dataset: hit.dataset, kind: 'live', cached: true, ecCost: 0, missing: [] };
    }
    const onProgress: ((p: FetchProgress) => void) | undefined = opts.onProgress;
    const outcome = await fetchDataset(this.client, symbol, { ...opts, onProgress });
    writeCache(symbol, years, outcome.dataset, outcome.ecCost);
    return {
      dataset: outcome.dataset,
      kind: 'live',
      cached: false,
      ecCost: outcome.ecCost,
      missing: outcome.missing,
    };
  }
}

// ─────────────────────────────────────────────────────────────
// 工具
// ─────────────────────────────────────────────────────────────

function toSymbolBriefs(hits: DiscoverHit[]): SymbolBrief[] {
  return hits
    .filter((h) => h.domain === 'symbol')
    .map((h) => ({ symbol: h.id, name: h.title || h.id, industry: 'liquor' as IndustryKey }));
}

function readPoolCache(): LiquorPool | null {
  try {
    const raw = localStorage.getItem(POOL_LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { pool: LiquorPool; savedAt: number };
    if (!parsed?.pool?.items?.length) return null;
    if (Date.now() - parsed.savedAt > POOL_TTL_MS) return null;
    return parsed.pool;
  } catch {
    return null;
  }
}

function writePoolCache(pool: LiquorPool): void {
  try {
    localStorage.setItem(POOL_LS_KEY, JSON.stringify({ pool, savedAt: Date.now() }));
  } catch {
    /* 配额满：放弃缓存 */
  }
}

/** 清空所有本地缓存（数据集 + 行业池），设置面板手动刷新时用 */
export function clearAllCaches(): void {
  clearDatasetCache();
  try {
    localStorage.removeItem(POOL_LS_KEY);
  } catch {
    /* ignore */
  }
}

/** 依据凭证决定用哪种提供方 */
export function createProvider(creds: CredentialState = loadCredentials()): DataProvider {
  const wm = toWmCredentials(creds);
  if (wm) return new LiveProvider(wm);
  return new SnapshotProvider();
}
