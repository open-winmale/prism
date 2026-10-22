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
  /** STMT_TREE 的科目代号，用于取共同比分母与科目释义档案 */
  k?: string;
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

/** 逐期异动标记：|幅度| ≥ 阈值 → up/down，否则 null（缺期恒 null）。
 *  用途：表格条件高亮——让用户在几十期数字里先看见跳变的那一格，而不是逐个扫。 */
export type MoveFlag = 'up' | 'down' | null;

export function flagOf(values: Num[], threshold: number): MoveFlag[] {
  return values.map((v) => {
    if (v == null || !Number.isFinite(v)) return null;
    if (Math.abs(v) < threshold) return null;
    return v > 0 ? 'up' : 'down';
  });
}

/**
 * 各报表口径的共同比分母。
 * 资产负债表 ÷ 总资产；利润表 ÷ 营业总收入；
 * 现金流量表：期末现金是时点值 → ÷ 总资产，其余流量项 → ÷ 营业总收入（收现率 / 资本开支强度口径）。
 *
 * 口径说明（为何不照抄专业版）：专业版 stmt_tree.xs:367/399/416/432/438 用「各段现金流入小计」
 * （NFOI/NFII/NFFI/NCF）作分母，但这些字段不在开源数据模型内（schema/types.ts CashFlowStatement 无流入项）。
 * 此前这里退化成拿「经营活动现金流量净额」当整表分母，后果是：CFO 为负时投资/筹资各项占比全变负数
 * （例：制造样本 2024 年 CFO −6 亿、资本开支 45 亿 → 占比 −750%，语义崩塌）。
 * 改用营业总收入作分母后，各期分母恒正且语义明确：销售收现/营收=收现率、资本开支/营收=资本开支强度。
 */
export function shareDenominator(
  kind: 'balance' | 'income' | 'cashflow',
  report: PeriodReport,
  rowKey?: string,
): Num {
  const get = fieldGetter(report);
  if (kind === 'balance') return get('total_assets');
  if (kind === 'income') return get('total_revenue');
  // 现金流量表：期末现金（时点值）÷ 总资产；其余流量项 ÷ 营业总收入
  if (rowKey === 'CCF') return get('total_assets');
  return get('total_revenue');
}
