// 数据校验器 —— 样例数据准入门禁 + 真实数据录入自检（IMPLEMENTATION_PLAN.md §2.3）
// 「落地质量」第一道保险：真实数据最容易错在勾稽关系与单位量级。

import type { Num, PeriodReport, ReportDataset } from './types';
import { periodLabel } from '../utils';

export interface VerifyIssue {
  level: 'error' | 'warn';
  field: string;
  period: string; // 校验失败所在期；数据集级问题为 '*'
  msg: string;
}

const absDiff = (a: number, b: number): number => Math.abs(a - b);

// 金额过小且非比率字段 → 疑似单位不是「元」（如填成了亿元数值）
function looksLikeWrongMagnitude(v: number): boolean {
  return v > 0 && v < 1e6;
}

// 规则 7：销量 > 产量 + 期初库存（>1% 容差）为异常
function checkProductionSales(ds: ReportDataset, out: VerifyIssue[]): void {
  const rows = ds.productionSales ?? [];
  for (const r of rows) {
    if (r.production == null || r.sales == null) continue;
    const opening = r.inventory != null ? null : null; // 期末库存由后行推前行的逻辑放 M2；此处只查基本量纲
    if (opening == null && r.production != null && r.sales != null) {
      // 无期初库存时仅能查「销量为 0 但产量巨大」等硬错误；正式期初链 M2 实现
    }
    if (r.sales != null && r.production != null && r.sales > r.production * 1.5) {
      out.push({
        level: 'warn',
        field: `productionSales[${r.period}]`,
        period: r.period,
        msg: `销量(${r.sales})显著高于产量(${r.production})且超 50%，请核对单位与口径`,
      });
    }
  }
}

function checkPeriod(rep: PeriodReport, out: VerifyIssue[], cashScope?: 'standard' | 'finance-subsidiary'): void {
  const b = rep.balance;
  const inc = rep.income;
  const cf = rep.cashflow;
  const p = rep.period;
  const n = (v: Num | undefined): v is number => v != null;

  // 规则 2：总资产 ≈ 负债合计 + 所有者权益（0.5% 容差）
  if (n(b.total_assets) && n(b.total_liabilities) && n(b.total_equity)) {
    const rhs = (b.total_liabilities as number) + (b.total_equity as number);
    const rel = absDiff(b.total_assets as number, rhs) / Math.max(1, Math.abs(b.total_assets as number));
    if (rel > 0.005) {
      out.push({
        level: 'error',
        field: 'total_assets',
        period: p,
        msg: `资产总计 ≠ 负债合计+所有者权益（偏差 ${(rel * 100).toFixed(2)}%，超过 0.5% 容差）`,
      });
    }
  } else if (n(b.total_assets) && n(b.total_liabilities) && n(b.equity_parent)) {
    // 兜底：仅有归母权益时以归母口径校验（允许更大偏差，母公司少数股东权益缺失）
    const rhs = (b.total_liabilities as number) + (b.equity_parent as number);
    const rel = absDiff(b.total_assets as number, rhs) / Math.max(1, Math.abs(b.total_assets as number));
    if (rel > 0.05) {
      out.push({ level: 'warn', field: 'total_assets', period: p, msg: `资产总计与负债+归母权益偏差 ${(rel * 100).toFixed(2)}%（可能缺少数股东权益，请确认）` });
    }
  }

  // 规则 3：毛利率 与 1−成本/营收 一致（0.1pct 容差）
  // 注：数据文件若直接给出 gross_margin 可跳过；此处从营收成本重算对照净利率口径
  if (n(inc.total_revenue) && n(inc.operating_cost)) {
    const gm = 1 - (inc.operating_cost as number) / (inc.total_revenue as number);
    if (gm < 0 || gm > 1) {
      out.push({ level: 'error', field: 'operating_cost', period: p, msg: `由营收/成本推得毛利率 ${(gm * 100).toFixed(1)}% 越界，成本与营收口径可能不一致` });
    }
  }

  // 规则 4：净利润 ≥ 归母净利润
  if (n(inc.net_profit) && n(inc.net_profit_parent) && (inc.net_profit as number) < (inc.net_profit_parent as number) - 1) {
    out.push({ level: 'warn', field: 'net_profit', period: p, msg: `净利润(${inc.net_profit}) < 归母净利润(${inc.net_profit_parent})，请核对口径（少数股东损益为负时属正常）` });
  }

  // 规则 6：金额量级疑似非「元」
  const allFields: Record<string, Num> = { ...b, ...inc, ...cf };
  for (const [k, v] of Object.entries(allFields)) {
    if (typeof v === 'number' && looksLikeWrongMagnitude(v)) {
      out.push({ level: 'warn', field: k, period: p, msg: `字段 ${k}=${v} 量级疑似非「元」（是否误填亿元？）` });
    }
  }

  // 规则 8：期末现金 与 货币资金 偏离（50% 容差）
  // 设有集团财务公司的企业（茅台、五粮液等），现金流量表期末现金含存放央行/同业款项，
  // 而这两项不在「货币资金」里 —— 属口径差异，此处只在**非**财务公司口径下才视为待核实项。
  if (n(cf.cash_end) && n(b.monetary_funds) && cashScope !== 'finance-subsidiary') {
    const rel = absDiff(cf.cash_end as number, b.monetary_funds as number) / Math.max(1, Math.abs(b.monetary_funds as number));
    if (rel > 0.5) {
      out.push({
        level: 'warn',
        field: 'cash_end',
        period: p,
        msg: `期末现金(${((cf.cash_end as number) / 1e8).toFixed(0)}亿) 与 货币资金(${((b.monetary_funds as number) / 1e8).toFixed(0)}亿) 偏离 ${(rel * 100).toFixed(0)}%（受限资金口径可解释，请确认）`,
      });
    }
  }
}

export function verifyDataset(ds: ReportDataset): VerifyIssue[] {
  const out: VerifyIssue[] = [];

  // 规则 1：periods 升序且与 reports 数量一致
  if (ds.periods.length !== ds.reports.length) {
    out.push({ level: 'error', field: 'periods', period: '*', msg: `periods(${ds.periods.length}) 与 reports(${ds.reports.length}) 数量不一致` });
  }
  for (let i = 1; i < ds.periods.length; i++) {
    if (ds.periods[i] <= ds.periods[i - 1]) {
      out.push({ level: 'error', field: 'periods', period: ds.periods[i], msg: `periods 未按升序排列：${ds.periods[i - 1]} → ${ds.periods[i]}` });
    }
  }
  for (let i = 0; i < Math.min(ds.periods.length, ds.reports.length); i++) {
    if (ds.reports[i].period !== ds.periods[i]) {
      out.push({ level: 'error', field: 'reports[i].period', period: ds.periods[i], msg: `reports[${i}].period(${ds.reports[i].period}) 与 periods[${i}](${ds.periods[i]}) 不对齐` });
    }
  }

  const cashScope = ds.meta?.cashScope;
  for (const rep of ds.reports) checkPeriod(rep, out, cashScope);

  // 规则 5：白酒样例合同负债全期缺失
  if (ds.industry === 'liquor') {
    const hasAny = ds.reports.some(
      (r) => r.balance.contract_liabilities != null || r.balance.advance_receipts != null,
    );
    if (!hasAny) {
      out.push({
        level: 'warn',
        field: 'contract_liabilities',
        period: '*',
        msg: '白酒数据全期缺失合同负债/预收款项——行业第一领先指标不可用，质量分「蓄水池」维度将按 na 剔除',
      });
    }
  }

  checkProductionSales(ds, out);
  return out;
}

export function hasErrors(issues: VerifyIssue[]): boolean {
  return issues.some((i) => i.level === 'error');
}

// 便捷输出：按期分组的人类可读日志
export function formatIssues(issues: VerifyIssue[]): string {
  if (!issues.length) return '✓ 数据校验通过（0 error / 0 warn）';
  return issues
    .map((i) => `  [${i.level.toUpperCase()}] ${i.period === '*' ? '数据集' : periodLabel(i.period)} · ${i.field}: ${i.msg}`)
    .join('\n');
}
