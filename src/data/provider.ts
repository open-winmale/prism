import type { IndustryKey, ReportDataset } from '@/engine';
import { formatIssues, hasErrors, verifyDataset, type VerifyIssue } from '@/engine';
import { LIQUOR_SAMPLES, SAMPLES, getSample } from './loader';
import { WmClient } from './wm/client';
import { loadCredentials, toWmCredentials, type CredentialState } from './wm/credentials';
import { fetchDataset, type FetchOptions, type FetchProgress } from './wm/dataset';
import { clearDatasetCache, readCache, writeCache } from './wm/cache';
import type { DiscoverHit, CompanyCard, IndustryAggregates, IndustryMembersPayload } from './wm/types';

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
  /** 数据校验结果：error 已在 provider 内阻断，warn 供 UI 展示 */
  issues: VerifyIssue[];
  /** 公司一页纸：估值/股息/成长/行业层级（live 才有；失败为 null） */
  card?: CompanyCard | null;
  /** 行业成分：同业表/行业分位（live 才有；失败为 null） */
  peers?: IndustryMembersPayload | null;
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

/** 所有数据集在交给 UI 前必须过校验器：error 阻断，warn 透传。 */
function verifyOrThrow(dataset: ReportDataset): VerifyIssue[] {
  const issues = verifyDataset(dataset);
  if (hasErrors(issues)) {
    throw new Error(`数据校验未通过，已阻断渲染：\n${formatIssues(issues)}`);
  }
  return issues;
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
    return {
      dataset: ds,
      kind: 'snapshot',
      cached: false,
      ecCost: 0,
      missing: [],
      issues: verifyOrThrow(ds),
      card: null,
      peers: null,
    };
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
    // 池子一天内基本不变，先读缓存，避免每次进首页都花 3.4k EC
    const cached = readPoolCache();
    if (cached) return { ...cached, live: true };

    const { data } = await this.client.fetchIndustryMembers('白酒', 'industry', signal);
    const items = (data?.items ?? []).map<SymbolBrief>((m) => ({
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

    const pool: LiquorPool = { items, aggregates: data?.aggregates ?? {}, live: true };
    writePoolCache(pool);
    return pool;
  }

  async list(): Promise<SymbolBrief[]> {
    // 首页精选：只放头部几家（名字稳定，无需取数）。
    // 全行业清单不必平铺——找其他公司走 discover 搜索接口（search）；
    // 完整白酒池（含估值中枢）留给 M3 同业对比，需要时再调 liquorPool()。
    return LIQUOR_SAMPLES.map((s) => ({ symbol: s.symbol, name: s.name, industry: s.industry }));
  }

  async listAll(): Promise<SymbolBrief[]> {
    // 首页精选 + 内置对照样本；实时模式不再拉全行业清单（首页不需要平铺）
    const featured = await this.list();
    const known = new Set(featured.map((s) => s.symbol));
    const extra = SAMPLES.filter((s) => !known.has(s.symbol)).map<SymbolBrief>((s) => ({
      symbol: s.symbol,
      name: s.name,
      industry: s.industry,
    }));
    return [...featured, ...extra];
  }

  async get(symbol: string): Promise<ReportDataset> {
    return (await this.getDataset(symbol)).dataset;
  }

  async getDataset(symbol: string, opts: FetchOptions = {}): Promise<DatasetResult> {
    const mode = opts.mode ?? 'annual';
    // 内置样本（白酒三家 + 制造对照）只在年度口径下走快照：0 EC、必然可用。
    // 季度口径必须走接口——快照没有季度期次，也没有「切换口径」的意义。
    const builtin = getSample(symbol);
    if (builtin && mode === 'annual') {
      return {
        dataset: builtin,
        kind: 'snapshot',
        cached: false,
        ecCost: 0,
        missing: [],
        issues: verifyOrThrow(builtin),
        card: null,
        peers: null,
      };
    }
    const count = opts.years ?? (mode === 'quarterly' ? 8 : 5);
    const hit = readCache(symbol, count, mode);
    if (hit) {
      return {
        dataset: hit.dataset,
        kind: 'live',
        cached: true,
        ecCost: 0,
        missing: hit.missing ?? [],
        issues: verifyOrThrow(hit.dataset),
        card: hit.card ?? null,
        peers: hit.peers ?? null,
      };
    }
    const onProgress: ((p: FetchProgress) => void) | undefined = opts.onProgress;
    const outcome = await fetchDataset(this.client, symbol, { ...opts, mode, years: count, onProgress });

    // 估值/同业是「增强层」：失败不阻断三表报告，但必须在 issues 里明示。
    let card: CompanyCard | null = null;
    let peers: IndustryMembersPayload | null = null;
    let marketEc = 0;
    try {
      const cardRes = await this.client.fetchCard(symbol, opts.signal);
      card = cardRes.card ?? null;
      marketEc += cardRes.ecCost;
    } catch {
      /* 降级：估值/行业分位不可用 */
    }
    if (card?.industry_l3) {
      try {
        const peerRes = await this.client.fetchIndustryMembers(card.industry_l3, 'industry', opts.signal);
        peers = peerRes.data;
        marketEc += peerRes.ecCost;
      } catch {
        /* 降级：同业表不可用 */
      }
    }

    const issues = [...outcome.issues];
    if (!card) {
      issues.push({
        level: 'warn',
        field: 'card',
        period: '*',
        msg: '公司一页纸未取到，估值/股息/行业分位不可用',
      });
    }
    if (!peers) {
      issues.push({
        level: 'warn',
        field: 'members',
        period: '*',
        msg: '行业成分未取到，同业对比不可用',
      });
    }

    const ecCost = outcome.ecCost + marketEc;
    writeCache(symbol, count, outcome.dataset, ecCost, mode, {
      card,
      peers,
      missing: outcome.missing,
    });
    return {
      dataset: outcome.dataset,
      kind: 'live',
      cached: false,
      ecCost,
      missing: outcome.missing,
      issues,
      card,
      peers,
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
