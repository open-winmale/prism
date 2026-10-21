import type { ReportDataset } from '@/engine';

// 数据集缓存（localStorage）。
// 存在的理由：一次全量刷新 = 5 年 × 3 表 ≈ 3 万 EC。年报一年才变一次，
// 缓存 24h 既能吃到新披露，又能把重复访问的 EC 成本降到 0。
// 配额兜底：写入失败（超出 5MB）时按 savedAt 淘汰最旧的条目后重试一次。

const PREFIX = 'report-lens:dataset:';
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export interface CacheEntry {
  dataset: ReportDataset;
  savedAt: number;
  ecCost: number;
}

function key(symbol: string, years: number, mode: 'annual' | 'quarterly' = 'annual'): string {
  return `${PREFIX}${symbol}:${mode}:${years}`;
}

function allKeys(): string[] {
  try {
    return Object.keys(localStorage).filter((k) => k.startsWith(PREFIX));
  } catch {
    return [];
  }
}

export function readCache(
  symbol: string,
  years: number,
  mode: 'annual' | 'quarterly' = 'annual',
  ttlMs = DEFAULT_TTL_MS,
): CacheEntry | null {
  try {
    const raw = localStorage.getItem(key(symbol, years, mode));
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    if (!entry?.dataset || typeof entry.savedAt !== 'number') return null;
    if (Date.now() - entry.savedAt > ttlMs) {
      localStorage.removeItem(key(symbol, years, mode));
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

export function writeCache(
  symbol: string,
  years: number,
  dataset: ReportDataset,
  ecCost: number,
  mode: 'annual' | 'quarterly' = 'annual',
): void {
  const entry: CacheEntry = { dataset, savedAt: Date.now(), ecCost };
  try {
    localStorage.setItem(key(symbol, years, mode), JSON.stringify(entry));
  } catch {
    // 配额满：淘汰最旧的一半再试一次；仍失败则放弃（不影响主流程）
    try {
      const keys = allKeys()
        .map((k) => ({ k, t: safeSavedAt(k) }))
        .sort((a, b) => a.t - b.t);
      keys.slice(0, Math.max(1, Math.ceil(keys.length / 2))).forEach(({ k }) => localStorage.removeItem(k));
      localStorage.setItem(key(symbol, years, mode), JSON.stringify(entry));
    } catch {
      /* 放弃缓存 */
    }
  }
}

function safeSavedAt(k: string): number {
  try {
    const raw = localStorage.getItem(k);
    if (!raw) return 0;
    return Number((JSON.parse(raw) as CacheEntry).savedAt) || 0;
  } catch {
    return 0;
  }
}

export function clearDatasetCache(): void {
  try {
    allKeys().forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}
