import type { Num, PeriodReport, ReportDataset } from '../schema/types';
import { expandStatement, STMT_TREE } from '../derivations';
import { fieldGetter } from '../compute';
import { shareDenominator } from './columns';

// 三表逐行同业横截面：把同一张报表的同一行，摆到多家公司旁边对比。
//
// 为什么单独做一层：现有 peersChart 只做「KPI 横截面」（PE/PB/ROE 这类比率），
// 而真正的同业对照要回答的是「同一行科目，别人是多少、我排第几、我偏离中位数多远」——
// 这是三表诊断的横截面延伸，且**纯计算、0 新增 EC**（数据由调用方按需取，见 ComparePage）。
//
// 两条硬口径：
//   1. 期间对齐优先取「所有公司都有的最新年份」；凑不齐才退回各公司各自的最新期，并如实标注未对齐。
//      不对齐就比，等于拿 2025 年的茅台去比 2022 年的老窖——数字再准也是错的。
//   2. 缺失 ≠ 0：任何一家该行缺值，这一行的横截面统计（中位数/排名）就把它排除在外，
//      绝不按 0 拉低中位数。缺值公司数会记在 row.missingCount 里。

export type StatementKind = 'balance' | 'income' | 'cashflow';

export interface PeerCompany {
  symbol: string;
  name: string;
  /** 实际参与对比的报告期；未对齐时各家可能不同年 */
  period: string;
  /** 该期是否为年报口径（Q4） */
  annual: boolean;
}

export interface PeerRow {
  k: string;
  cn: string;
  /** 与 STMT_TREE 一致：section=true 为小计/合计行 */
  section: boolean;
  /** 该行是否是比率行（毛利率之类），比率行的横截面比较用原值而非共同比 */
  pct: boolean;
  /** 各家原值（元），顺序同 table.companies；缺为 null */
  values: Num[];
  /** 各家共同比（小数）；比率行为 null */
  shares: Num[];
  /** 本公司（第 0 家）在该行的排名：1 = 最大；值为 null 或该行不参与排名时为 null */
  rank: number | null;
  /** 参与比较的公司数（排除缺值） */
  n: number;
  /** 横截面中位数（元） */
  median: Num;
  /** 本公司相对中位数的偏离（倍数）：(mine − median) / |median|；median 为 0 或缺失 → null */
  gap: Num;
  /** 本公司是否偏离中位数超过阈值（绝对值） */
  outlier: boolean;
}

export interface PeerCompareTable {
  kind: StatementKind;
  /** 对齐后使用的年份；未对齐时为 '各自最新' */
  alignedYear: string;
  /** false = 各公司用的是不同年份，结论要打折 */
  aligned: boolean;
  companies: PeerCompany[];
  rows: PeerRow[];
  /** 完全没有可比数据的原因（如某家公司该年没数据） */
  warnings: string[];
}

function isNum(v: Num | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function medianOf(vals: number[]): Num {
  if (!vals.length) return null;
  const sorted = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * 期间对齐：取所有公司都有的最新年份。
 * 只认年报（sampling 缺省视为 Q4）——拿季报累计值和年报比是口径错位。
 */
function pickPeriod(
  datasets: ReportDataset[],
  align: boolean,
): { index: number[]; aligned: boolean; year: string; warnings: string[] } {
  const warnings: string[] = [];
  const annualIdx = datasets.map((ds) =>
    ds.reports.reduce<number[]>((acc, r, i) => {
      if ((r.sampling ?? 'Q4') === 'Q4') acc.push(i);
      return acc;
    }, []),
  );
  if (annualIdx.some((idx) => idx.length === 0)) {
    warnings.push('至少一家公司没有年报期次，无法做年度横截面');
  }

  // 各家各自的最新年报
  const latest = annualIdx.map((idx) => (idx.length ? idx[idx.length - 1] : -1));
  if (latest.includes(-1)) {
    return { index: latest.map((i) => (i < 0 ? 0 : i)), aligned: false, year: '各自最新', warnings };
  }
  if (!align) {
    return { index: latest, aligned: false, year: '各自最新', warnings };
  }

  // 找共同年份：从最新往回退，直到每家都有
  const yearsOf = (ds: ReportDataset, idx: number[]) => idx.map((i) => ds.reports[i].period.slice(0, 4));
  const sets = datasets.map((ds, i) => new Set(yearsOf(ds, annualIdx[i])));
  const candidate = [...(sets[0] ?? new Set<string>())].sort().reverse();
  const common = candidate.find((y) => sets.every((s) => s.has(y)));

  if (!common) {
    warnings.push('各家年报期次没有交集，退回各公司各自的最新年报（年份不同，结论要打折）');
    return { index: latest, aligned: false, year: '各自最新', warnings };
  }
  const index = datasets.map((ds, i) => {
    const hit = annualIdx[i].find((idx) => ds.reports[idx].period.slice(0, 4) === common);
    return hit ?? latest[i];
  });
  return { index, aligned: true, year: common, warnings };
}

export interface PeerCompareOptions {
  /** 期间对齐 true = 只用各家都有的最新年份；false = 各自最新期 */
  align?: boolean;
  /** 偏离中位数多少算异常（倍数差）；默认 0.5（即 ±50%） */
  outlierGap?: number;
}

/**
 * 生成三表逐行横截面。
 * @param main 本公司（永远排在第 0 列）
 * @param others 同行数据集，顺序即列顺序
 */
export function peerStatementTable(
  kind: StatementKind,
  main: ReportDataset,
  others: ReportDataset[],
  opts: PeerCompareOptions = {},
): PeerCompareTable {
  const align = opts.align ?? true;
  const outlierGap = opts.outlierGap ?? 0.5;
  const datasets = [main, ...others];
  const { index, aligned, year, warnings } = pickPeriod(datasets, align);

  const reports: PeriodReport[] = datasets.map((ds, i) => ds.reports[Math.min(index[i], ds.reports.length - 1)]);
  const companies: PeerCompany[] = datasets.map((ds, i) => ({
    symbol: ds.symbol,
    name: ds.name,
    period: reports[i].period,
    annual: (reports[i].sampling ?? 'Q4') === 'Q4',
  }));

  const matrix = reports.map((r) => expandStatement(kind, fieldGetter(r)));
  const template = STMT_TREE[kind];

  const rows: PeerRow[] = template.map((row, ri) => {
    const values = matrix.map((period) => period[ri]?.value ?? null);
    const shares = values.map((v, i) => {
      if (v == null || row.pct) return null;
      const den = shareDenominator(kind, reports[i], row.k);
      return den == null || den === 0 ? null : v / den;
    });

    // 排名：按原值从大到小（缺值不参与）。比率行（pct）也按原值排。
    const present = values.map((v, i) => ({ v, i })).filter((x): x is { v: number; i: number } => isNum(x.v));
    const sorted = [...present].sort((a, b) => b.v - a.v);
    const mineIdx = sorted.findIndex((x) => x.i === 0);
    const median = medianOf(present.map((x) => x.v));
    const mine = values[0];
    const gap = isNum(mine) && isNum(median) && median !== 0 ? (mine - median) / Math.abs(median) : null;

    return {
      k: row.k,
      cn: row.cn,
      section: !!row.section,
      pct: !!row.pct,
      values,
      shares,
      rank: mineIdx >= 0 ? mineIdx + 1 : null,
      n: present.length,
      median,
      gap,
      outlier: gap != null ? Math.abs(gap) >= outlierGap : false,
    };
  });

  return {
    kind,
    alignedYear: year,
    aligned,
    companies,
    rows,
    warnings,
  };
}

/** 金额格式化：内部「元」→ 展示「亿元」 */
export function yi(v: Num, digits = 1): string {
  if (v == null) return '—';
  return (v / 1e8).toFixed(digits);
}
