import type { Num, PeriodReport } from './schema/types';

// 安全除法：分母为 0 / null / 营收缺失 时返回 null，避免 NaN 污染图表
export function safeDiv(a: Num, b: Num): Num {
  if (a == null || b == null || b === 0) return null;
  return a / b;
}

export function safeSub(a: Num, b: Num): Num {
  if (a == null || b == null) return null;
  return a - b;
}

export function safeAdd(a: Num, b: Num): Num {
  if (a == null && b == null) return null;
  if (a == null) return b;
  if (b == null) return a;
  return a + b;
}

export function safeSum(values: Num[]): Num {
  let s = 0;
  let any = false;
  for (const v of values) {
    if (v != null) {
      s += v;
      any = true;
    }
  }
  return any ? s : null;
}

// 转百分比（0.35 -> 35），用于毛利率、费用率等展示
export function toPct(v: Num, digits = 1): Num {
  return v == null ? null : Math.round(v * 1000) / 10 ** (digits + 1) * 10 ** digits / 10 ** digits;
}

// 0.3521 -> 35.2
export function asPercent(v: Num): Num {
  return v == null ? null : v * 100;
}

/**
 * 同比（本年 / 上年 − 1）。
 * 基期为 0 或为负 → null：同比只有在基期为正、且两期同号时才有意义。
 * 例如现金净增加额由 −20 亿变 +196 亿，算出来是 −1070%，这个数字没有任何解释力，
 * 只会让人误以为暴跌。宁可显示「—」并让人去看绝对额。
 */
export function yoy(curr: Num, prev: Num): Num {
  if (curr == null || prev == null || prev <= 0) return null;
  return curr / prev - 1;
}

// 简单平均值（用于杜邦分母：平均总资产 / 平均归母权益）
export function avg(a: Num, b: Num): Num {
  if (a == null && b == null) return null;
  if (a == null) return b;
  if (b == null) return a;
  return (a + b) / 2;
}

// 数值格式化（展示层用）：亿元
export function fmtYi(v: Num, digits = 2): string {
  if (v == null) return '—';
  const yi = v / 1e8;
  return `${yi.toFixed(digits)} 亿`;
}

export function fmtPct(v: Num, digits = 1): string {
  if (v == null) return '—';
  return `${(v * 100).toFixed(digits)}%`;
}

export function fmtNum(v: Num, digits = 2): string {
  if (v == null) return '—';
  return v.toFixed(digits);
}

// 把 period('2023-12-31') 转成展示标签 '2023'
export function periodLabel(period: string): string {
  return period.slice(0, 4);
}

/** 图表类目标签：年报用年份，季报带 Q 标记（避免四根柱都叫 2024） */
export function reportLabel(report: PeriodReport): string {
  const sampling = report.sampling ?? 'Q4';
  return sampling === 'Q4' ? report.period.slice(0, 4) : `${report.period.slice(0, 4)}${sampling}`;
}
