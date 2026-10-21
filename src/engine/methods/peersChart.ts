import type { ChartPoint, ChartRefLine, ChartSpec } from '../analysis/define';
import type { Num } from '../schema/types';

// 同业横截面可视化：ROE vs PE 散点、分位条。纯函数，输出 ChartSpec。
// 引擎不依赖数据层：这里只声明结构兼容的最小同业接口（与 data/wm/types IndustryMember 同构）。
// 口径注意：横截面分位 ≠ 自身历史分位；n 过小时结论不稳，调用方应降级提示。

export interface PeerLike {
  symbol: string;
  name: string;
  pe_ttm?: Num | null;
  pb?: Num | null;
  ps_ttm?: Num | null;
  roe_ttm?: Num | null;
  mv?: Num | null;
  close?: Num | null;
  percent?: Num | null;
}

export interface PeerStats {
  n: number;
  medianPe: number | null;
  medianRoe: number | null;
}

function medianOf(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** 值在样本中的横截面分位 [0,1]；样本不足或值为空 → null */
export function rankOf(value: number | null | undefined, sample: (number | null | undefined)[]): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const valid = sample.filter((v): v is number => v != null && Number.isFinite(v));
  if (valid.length < 2) return null;
  return valid.filter((v) => v <= value).length / valid.length;
}

export function peerStats(items: PeerLike[]): PeerStats {
  const pes = items.map((i) => i.pe_ttm).filter((v): v is number => v != null && v > 0);
  const roes = items.map((i) => i.roe_ttm).filter((v): v is number => v != null);
  return {
    n: items.length,
    medianPe: medianOf(pes),
    medianRoe: medianOf(roes),
  };
}

/**
 * ROE vs PE 散点：过滤 PE≤0/缺失与 ROE 缺失的样本（亏损公司 PE 不适用，明示 n 而不是硬画）。
 * 当前公司高亮为独立系列；中位数画十字参考线。
 */
export function peersScatter(
  items: PeerLike[],
  currentSymbol: string,
): { spec: ChartSpec; stats: PeerStats; usable: number } {
  const usable = items.filter((i) => i.pe_ttm != null && i.pe_ttm > 0 && i.roe_ttm != null);
  const stats = peerStats(items);
  const points: ChartPoint[] = usable.map((item) => ({
    name: item.name,
    x: +(item.pe_ttm!).toFixed(2),
    y: +(item.roe_ttm! * 100).toFixed(2),
    highlight: item.symbol === currentSymbol,
  }));

  const refLines: ChartRefLine[] = [];
  if (stats.medianPe != null) refLines.push({ value: +stats.medianPe.toFixed(2), label: `PE 中位数 ${stats.medianPe.toFixed(1)}`, axis: 'x' });
  if (stats.medianRoe != null) refLines.push({ value: +(stats.medianRoe * 100).toFixed(2), label: `ROE 中位数 ${(stats.medianRoe * 100).toFixed(1)}%`, axis: 'y' });

  return {
    spec: {
      type: 'scatter',
      title: 'ROE vs PE（同业横截面）',
      xLabel: 'PE(TTM)',
      yLabel: 'ROE %',
      points,
      refLines,
      note: `样本 ${usable.length}/${items.length} 家（亏损或缺 PE 的公司不适用 PE）`,
    },
    stats,
    usable: usable.length,
  };
}

export interface QuantileBar {
  label: string;
  value: number | null;
  display: string;
  rank: number | null;
  median: number | null;
}

/** 单指标分位条输入：当前值 + 全行业样本 */
export function quantile(
  label: string,
  value: number | null | undefined,
  sample: (number | null | undefined)[],
  fmt: (v: number) => string,
): QuantileBar {
  const valid = sample.filter((v): v is number => v != null && Number.isFinite(v));
  return {
    label,
    value: value == null ? null : value,
    display: value == null ? '—' : fmt(value),
    rank: rankOf(value, sample),
    median: medianOf(valid),
  };
}
