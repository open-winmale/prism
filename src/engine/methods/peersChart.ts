import type { ChartPoint, ChartRefLine, ChartSpec } from '../analysis/define';
import type { Num } from '../schema/types';

// 同业横截面可视化：可换轴散点、横截面分位、自身历史分位 vs 行业分位。纯函数，输出 ChartSpec。
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

/** 估值卡的最小结构（CompanyCard 可直接传入） */
export interface CardLike {
  symbol?: string;
  name?: string;
  pe_ttm?: Num | null;
  pb_ttm?: Num | null;
  pct_pe_3y?: Num | null;
  pct_pb_3y?: Num | null;
}

export type PeerMetricKey = 'pe_ttm' | 'pb' | 'ps_ttm' | 'roe_ttm' | 'mv';

export interface PeerMetricDef {
  key: PeerMetricKey;
  label: string;
  unit: string;
  digits: number;
  kind: 'multiple' | 'percent' | 'value';
  /** 展示缩放：ROE 小数 → %，市值元 → 亿元 */
  scale?: number;
}

export const PEER_METRICS: PeerMetricDef[] = [
  { key: 'pe_ttm', label: 'PE(TTM)', unit: 'x', digits: 1, kind: 'multiple' },
  { key: 'pb', label: 'PB', unit: 'x', digits: 2, kind: 'multiple' },
  { key: 'ps_ttm', label: 'PS(TTM)', unit: 'x', digits: 2, kind: 'multiple' },
  { key: 'roe_ttm', label: 'ROE', unit: '%', digits: 1, kind: 'percent', scale: 100 },
  { key: 'mv', label: '市值', unit: '亿', digits: 0, kind: 'value', scale: 1e-8 },
];

export function peerMetricDef(key: PeerMetricKey): PeerMetricDef {
  return PEER_METRICS.find((metric) => metric.key === key) ?? PEER_METRICS[0];
}

/** 取某公司的指标展示值；PE/PB/PS ≤0 或缺失视为不可用 */
export function peerMetricValue(item: PeerLike, def: PeerMetricDef): number | null {
  const raw = item[def.key];
  if (raw == null || !Number.isFinite(raw)) return null;
  const scaled = raw * (def.scale ?? 1);
  if (def.kind === 'multiple' && scaled <= 0) return null;
  return scaled;
}

function axisLabel(def: PeerMetricDef): string {
  return `${def.label}(${def.unit})`;
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

export interface PeersScatterOptions {
  xKey?: PeerMetricKey;
  yKey?: PeerMetricKey;
}

export interface PeersScatterResult {
  spec: ChartSpec;
  stats: PeerStats;
  usable: number;
  xKey: PeerMetricKey;
  yKey: PeerMetricKey;
}

/**
 * 同业散点：默认 ROE vs PE，X/Y 可换成 PB/PS/ROE/市值。
 * 过滤缺失与 PE≤0（亏损公司 PE 不适用），中位数十字线画在当前轴对应的指标上。
 */
export function peersScatter(
  items: PeerLike[],
  currentSymbol: string,
  opts: PeersScatterOptions = {},
): PeersScatterResult {
  const xKey = opts.xKey ?? 'pe_ttm';
  const yKey = opts.yKey ?? 'roe_ttm';
  const xDef = peerMetricDef(xKey);
  const yDef = peerMetricDef(yKey);

  const usable = items.filter(
    (item) => peerMetricValue(item, xDef) != null && peerMetricValue(item, yDef) != null,
  );
  const stats = peerStats(items);
  const points: ChartPoint[] = usable.map((item) => ({
    name: item.name,
    x: Number(peerMetricValue(item, xDef)!.toFixed(xDef.digits)),
    y: Number(peerMetricValue(item, yDef)!.toFixed(yDef.digits)),
    highlight: item.symbol === currentSymbol,
  }));

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const medianX = medianOf(xs);
  const medianY = medianOf(ys);
  const refLines: ChartRefLine[] = [];
  if (medianX != null) {
    refLines.push({
      value: Number(medianX.toFixed(xDef.digits)),
      label: `${xDef.label} 中位数 ${medianX.toFixed(xDef.digits)}`,
      axis: 'x',
      kind: 'median',
    });
  }
  if (medianY != null) {
    refLines.push({
      value: Number(medianY.toFixed(yDef.digits)),
      label: `${yDef.label} 中位数 ${medianY.toFixed(yDef.digits)}`,
      axis: 'y',
      kind: 'median',
    });
  }

  return {
    spec: {
      type: 'scatter',
      title: `${yDef.label} vs ${xDef.label}（同业横截面）`,
      xLabel: axisLabel(xDef),
      yLabel: axisLabel(yDef),
      points,
      refLines,
      note: `样本 ${usable.length}/${items.length} 家；缺失或不适用的样本不参与（如亏损公司的 PE）。`,
    },
    stats,
    usable: usable.length,
    xKey,
    yKey,
  };
}

/**
 * 本公司横截面分位：PE/PB/PS/ROE 四个指标在当前同行里的位置。
 * 只表达「排在哪」，不判断好坏——PE 低可能是便宜，也可能是市场不认可。
 */
export function peerPercentileSpec(items: PeerLike[], currentSymbol: string): ChartSpec {
  const current = items.find((item) => item.symbol === currentSymbol) ?? null;
  const defs: PeerMetricDef[] = PEER_METRICS.filter((metric) => metric.kind !== 'value');
  const values = defs.map((def) => {
    const sample = items.map((item) => peerMetricValue(item, def));
    const mine = current ? peerMetricValue(current, def) : null;
    const rank = rankOf(mine, sample);
    return rank == null ? null : Number((rank * 100).toFixed(1));
  });

  return {
    type: 'horizontalBar',
    title: '本公司横截面分位',
    unit: '%',
    yFormat: 'percent',
    categories: defs.map((def) => def.label),
    series: [{ name: '横截面分位', data: values }],
    refLines: [{ value: 50, label: '中位数 50%', axis: 'x', kind: 'median' }],
    note: `横截面分位，不是自身历史分位；n=${items.length}。分位只表示当前排名位置，不判断估值高低。`,
    legend: false,
  };
}

/**
 * 自身 3 年分位 vs 行业横截面分位：把「和自己过去比」与「和同行比」并列。
 * 两者口径不同，必须在图注里说清楚；缺哪边就留空，不互相冒充。
 */
export function selfVsIndustrySpec(
  card: CardLike | null,
  items: PeerLike[],
  currentSymbol: string,
): ChartSpec | null {
  if (!card) return null;
  const current = items.find((item) => item.symbol === currentSymbol)
    ?? items.find((item) => card.name != null && item.name === card.name)
    ?? null;
  const peSample = items.map((item) => peerMetricValue(item, peerMetricDef('pe_ttm')));
  const pbSample = items.map((item) => peerMetricValue(item, peerMetricDef('pb')));

  const selfPe = card.pct_pe_3y == null ? null : Number((card.pct_pe_3y * 100).toFixed(1));
  const selfPb = card.pct_pb_3y == null ? null : Number((card.pct_pb_3y * 100).toFixed(1));
  const industryPe = rankOf(current?.pe_ttm ?? null, peSample);
  const industryPb = rankOf(current?.pb ?? null, pbSample);
  const industryValues = [
    industryPe == null ? null : Number((industryPe * 100).toFixed(1)),
    industryPb == null ? null : Number((industryPb * 100).toFixed(1)),
  ];

  if (selfPe == null && selfPb == null && industryValues.every((value) => value == null)) {
    return null;
  }

  return {
    type: 'groupedBar',
    title: '自身 3 年分位 vs 行业横截面分位',
    unit: '%',
    yFormat: 'percent',
    categories: ['PE', 'PB'],
    series: [
      { name: '自身 3 年分位', data: [selfPe, selfPb], color: '#1d4ed8' },
      { name: '行业横截面分位', data: industryValues, color: '#94a3b8' },
    ],
    refLines: [{ value: 50, label: '中位 50%', kind: 'median' }],
    note: `自身分位比的是自己过去 3 年；行业分位比的是当前同行横截面（n=${items.length}）。两者口径不同，不能混为一谈。`,
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
