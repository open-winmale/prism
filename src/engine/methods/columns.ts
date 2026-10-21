import type { Drv } from '../derivations';
import { evalDrv } from '../derivations';
import type { Num, PeriodReport } from '../schema/types';
import { fieldGetter } from '../compute';
import { yoy } from '../utils';

// 列组计算：三表工作台「原值 + 同比/占比」双子列与科目下钻的纯函数层。
// 铁律：缺失传播 null，绝不按 0 补齐——「没数据」和「0」是两回事。

/** 逐期同比（首期 / 上期缺失 → null） */
export function yoyOf(values: Num[]): Num[] {
  return values.map((v, i) => (i === 0 ? null : yoy(v, values[i - 1])));
}

/**
 * 同季同比：单季口径下与「去年同季」比，而不是与相邻期比（Q1→Q2 是环比，拿来做同比会被季节效应污染）。
 * 找不到同季上期（窗口不足两年 / sampling 缺失）→ null。
 */
export function sameQuarterYoyOf(reports: PeriodReport[], values: Num[]): Num[] {
  return values.map((v, i) => {
    const cur = reports[i];
    if (v == null || !cur) return null;
    const sampling = cur.sampling ?? 'Q4';
    const year = Number(cur.period.slice(0, 4));
    const j = reports.findIndex(
      (r) => (r.sampling ?? 'Q4') === sampling && Number(r.period.slice(0, 4)) === year - 1,
    );
    if (j < 0) return null;
    return yoy(v, values[j]);
  });
}

/** 逐期占比（分母缺失/为 0 → null） */
export function shareOf(values: Num[], denominators: Num[]): Num[] {
  return values.map((v, i) => {
    const d = denominators[i];
    if (v == null || d == null || d === 0) return null;
    return v / d;
  });
}

/** 下钻行定义：直接科目列或派生行（与 STMT_TREE 的行定义同构） */
export interface LineItemDef {
  cn: string;
  col?: string;
  drv?: Drv;
  pct?: boolean;
}

/** 按行取多年序列：col 行直取，drv 行按期求值（派生行缺失也走 null 传播） */
export function lineItemValues(reports: PeriodReport[], row: LineItemDef): Num[] {
  return reports.map((r) => {
    const get = fieldGetter(r);
    if (row.drv) return evalDrv(row.drv, get);
    if (row.col) return get(row.col);
    return null;
  });
}

/** 各报表口径的占比分母：资产负债表 ÷ 总资产，利润表 ÷ 营业总收入，现金流量表 ÷ 经营现金流净额 */
export function shareDenominator(kind: 'balance' | 'income' | 'cashflow', report: PeriodReport): Num {
  const get = fieldGetter(report);
  if (kind === 'balance') return get('total_assets');
  if (kind === 'income') return get('total_revenue');
  return get('net_cash_operating');
}
