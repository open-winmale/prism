import type { Num, PeriodReport } from './schema/types';

// 单季 / TTM 口径推导 —— 对齐 ../script 的 DIFFQ_YTD / TTM_YTD 函数语义。
//
// 中国财报的流量口径：Q1 是单季值；Q2（半年报）/Q3（三季报）/Q4（年报）都是「年初至今累计」。
// 单季 = 本期累计 − 上期累计（同年内）；TTM = 最近 4 个单季之和。
// 铁律：
//   1) 缺任一必要期次 → 结果为 null（绝不拿累计值冒充单季值，否则同比/环比全是错的）
//   2) 资产负债表是时点值，不参与差分，直接取当期
//   3) 跨年差分禁止（Q4→次年 Q1 之间不存在「上期累计」关系）

export type Sampling = NonNullable<PeriodReport['sampling']>;

/** 年度内的序号：Q1=1 … Q4=4 */
export function samplingOrder(s: Sampling): number {
  return Number(s.slice(1));
}

function yearOf(period: string): number {
  return Number(period.slice(0, 4));
}

function num(v: Num | undefined): number | null {
  return v == null ? null : v;
}

function sub(a: number | null, b: number | null): number | null {
  return a == null || b == null ? null : a - b;
}

function sum(values: (number | null)[]): number | null {
  if (values.some((v) => v == null)) return null;
  return values.reduce<number>((s, v) => s + (v ?? 0), 0);
}

/**
 * 单季值推导（DIFFQ_YTD 语义）：
 *   Q1 → 原样（一季报就是单季）；Q2/Q3/Q4 → 本期累计 − 上期累计（同年内）。
 * 找不到上期累计（如数据集只从 Q4 开始）→ 返回 null，不猜。
 */
export function deriveSingleQuarter(
  cur: PeriodReport,
  prev: PeriodReport | null | undefined,
): PeriodReport | null {
  const sampling = cur.sampling ?? 'Q4';
  const order = samplingOrder(sampling);

  if (order === 1) {
    // Q1 就是单季值，balance 直接用（时点），flow 原样
    return { ...cur, sampling };
  }

  // Q2/Q3/Q4：需要同年内上一期的累计值
  if (!prev || yearOf(prev.period) !== yearOf(cur.period) || samplingOrder(prev.sampling ?? 'Q4') !== order - 1) {
    return null;
  }

  const income: Record<string, Num> = {};
  for (const [k, v] of Object.entries(cur.income)) {
    income[k] = sub(num(v), num(prev.income[k as keyof typeof prev.income] as Num | undefined));
  }
  const cashflow: Record<string, Num> = {};
  for (const [k, v] of Object.entries(cur.cashflow)) {
    cashflow[k] = sub(num(v), num(prev.cashflow[k as keyof typeof prev.cashflow] as Num | undefined));
  }

  return {
    period: cur.period,
    sampling,
    balance: cur.balance, // 时点值：不差分
    income: income as PeriodReport['income'],
    cashflow: cashflow as PeriodReport['cashflow'],
  };
}

/**
 * 数据集的「单季视图」：对每个期次推导单季流量表（Q1 原样，Q2-Q4 差分）。
 * 上期缺失的期次（如数据集首期是 Q4）→ 该期返回 null（调用方跳过或标注）。
 */
export function singleQuarterReports(reports: PeriodReport[]): (PeriodReport | null)[] {
  const byKey = new Map(reports.map((r) => [`${yearOf(r.period)}:${r.sampling ?? 'Q4'}`, r]));
  return reports.map((r) => {
    const order = samplingOrder(r.sampling ?? 'Q4');
    if (order === 1) return deriveSingleQuarter(r, null);
    const prev = byKey.get(`${yearOf(r.period)}:${'Q' + (order - 1)}`);
    return deriveSingleQuarter(r, prev);
  });
}

/**
 * TTM（滚动四季和）—— 对齐 script 的 SUMQ(4, DIFFQ_YTD($X)) / TTM_YTD：
 * 对某期计算 TTM = 该期之前（含）的最近 4 个**单季值**之和。
 * 关键口径：不能只取「同 sampling」的期——那会漏掉年内相邻季度（Q2 的 TTM 需要 Q1）。
 * 实现：收集该期及之前所有能推导出的单季值，按时间倒序取前 4 个。
 * 四季不全 → null。
 */
export function ttmFlowAt(reports: PeriodReport[], index: number): PeriodReport | null {
  const target = reports[index];
  if (!target) return null;
  const sq = singleQuarterReports(reports);

  const picked: PeriodReport[] = [];
  for (let i = index; i >= 0 && picked.length < 4; i--) {
    const q = sq[i];
    if (!q) return null; // 区间内任一期推不出单季 → TTM 不可得（不猜）
    picked.push(q);
  }
  if (picked.length < 4) return null;

  const income: Record<string, Num> = {};
  for (const k of Object.keys(target.income)) {
    income[k] = sum(picked.map((q) => num(q.income[k as keyof typeof q.income] as Num | undefined)));
  }
  const cashflow: Record<string, Num> = {};
  for (const k of Object.keys(target.cashflow)) {
    cashflow[k] = sum(picked.map((q) => num(q.cashflow[k as keyof typeof q.cashflow] as Num | undefined)));
  }
  return { period: target.period, sampling: target.sampling ?? 'Q4', balance: target.balance, income: income as PeriodReport['income'], cashflow: cashflow as PeriodReport['cashflow'] };
}

/**
 * 单季同比：今年该单季 vs 去年同季（单季口径，非累计）。
 * 任一侧缺失 → null。
 */
export function singleQuarterYoy(cur: number | null, prevYearSameQuarter: number | null): Num {
  if (cur == null || prevYearSameQuarter == null || prevYearSameQuarter === 0) return null;
  return cur / Math.abs(prevYearSameQuarter) - 1;
}

/**
 * 数据集的「单季视图」：流量表（利润表/现金流量表）全部换成单季口径，资产负债表保持时点值。
 * 单季推不出的期次（窗口首期、缺上期累计）→ 该期流量字段全部 null（显示「—」，不按 0 补）。
 * 用途：季度模式下三表展示与全部引擎模块的统一口径，杜绝「拿累计值当单季值」。
 */
export function singleQuarterView(reports: PeriodReport[]): PeriodReport[] {
  const sq = singleQuarterReports(reports);
  return reports.map((r, i) => {
    const q = sq[i];
    if (q) return q;
    return {
      period: r.period,
      sampling: r.sampling ?? 'Q4',
      balance: r.balance,
      income: nullify(r.income) as PeriodReport['income'],
      cashflow: nullify(r.cashflow) as PeriodReport['cashflow'],
    };
  });
}

function nullify(obj: object): Record<string, Num> {
  const out: Record<string, Num> = {};
  for (const k of Object.keys(obj)) out[k] = null;
  return out;
}
