import type { Num, PeriodReport, ReportDataset } from './schema/types';
import { avg, safeDiv, safeSub, safeSum } from './utils';

// 把三大报表合并成一个可按字段名取数的 getter（字段名在 schema 中全局唯一）
export function fieldGetter(report: PeriodReport): (k: string) => Num {
  const all = { ...report.balance, ...report.income, ...report.cashflow } as Record<string, Num>;
  return (k: string) => (k in all ? all[k] : null);
}

// 单期、仅依赖本期数据的指标
export interface PeriodMetrics {
  // 利润表
  gross_margin: Num; // 毛利率
  selling_rate: Num;
  admin_rate: Num;
  rd_rate: Num;
  finance_rate: Num;
  three_expense_rate: Num; // 销售+管理+研发
  operating_margin: Num; // 营业利润率
  effective_tax_rate: Num; // 有效税率
  net_margin_parent: Num; // 归母净利率
  // 资产负债表
  current_ratio: Num; // 流动比率
  quick_ratio: Num; // 速动比率
  net_working_capital: Num; // 净营运资本
  interest_bearing_debt: Num; // 有息负债
  debt_to_assets: Num; // 资产负债率
  equity_multiplier: Num; // 权益乘数（资产/归母权益）
  goodwill_to_equity: Num; // 商誉/归母权益
  other_receivables_to_assets: Num; // 其他应收/总资产
  // 现金流
  cfo_to_net_profit: Num; // 经营现金流/归母净利润
  capex: Num;
  // 杜邦（需相邻期均值，放在 withAvg 中补算）
  net_margin_parent_dupont: Num;
  asset_turnover: Num; // 总资产周转率
  equity_multiplier_dupont: Num;
  roe_parent: Num; // 归母 ROE（杜邦）
  // 周转
  inventory_turnover: Num; // 存货周转（成本/平均存货）
  ar_turnover: Num; // 应收周转
  ap_turnover: Num; // 应付周转（成本/平均应付）
  fa_turnover: Num; // 固定资产周转
  // 现金流质量 / 质量体检
  fcf: Num; // 自由现金流 = 经营现金流 - 资本开支
  accrual_ta: Num; // 应计利润/总资产 = (归母净利 - 经营现金流) / 总资产
  ncf_to_op_profit: Num; // 经营现金流 / 营业利润
  // 白酒专属
  contract_liab_ratio: Num; // 合同负债(或预收款)/营业总收入 —— 蓄水池指标
  sales_cash_ratio: Num; // 销售商品收到现金/营业总收入 —— 收现比
  finished_inv_ratio: Num; // 库存商品/营业总收入 —— 成品滞销排雷（基酒不计入）
}

function periodBaseMetrics(report: PeriodReport): PeriodMetrics {
  const g = fieldGetter(report);
  const rev = g('total_revenue');
  const cost = g('operating_cost');
  const npp = g('net_profit_parent');
  const ta = g('total_assets');
  const tca = g('total_current_assets');
  const tcl = g('total_current_liabilities');
  const inv = g('inventories');
  const ep = g('equity_parent');
  const tl = g('total_liabilities');
  const gw = g('goodwill');
  const orec = g('other_receivables');
  const ncro = g('net_cash_operating');
  const capex = g('capex_cash');
  const oprofit = g('operating_profit');
  const cfs = g('cash_from_sales');

  // 白酒蓄水池口径：优先合同负债（新准则），缺失时回退预收款项（旧准则）
  const contractLiab = g('contract_liabilities') ?? g('advance_receipts');

  const interestBearingDebt = safeSum([
    g('short_term_loans'),
    g('noncurrent_liab_1y'),
    g('long_term_loans'),
    g('bonds_payable'),
    g('lease_liabilities'),
  ]);

  const gross = rev != null && cost != null && rev !== 0 ? (rev - cost) / rev : null;

  return {
    gross_margin: gross,
    selling_rate: safeDiv(g('selling_expense'), rev),
    admin_rate: safeDiv(g('admin_expense'), rev),
    rd_rate: safeDiv(g('rd_expense'), rev),
    finance_rate: safeDiv(g('finance_expense'), rev),
    three_expense_rate: safeDiv(
      safeSum([g('selling_expense'), g('admin_expense'), g('rd_expense'), g('finance_expense')]),
      rev,
    ),
    operating_margin: safeDiv(g('operating_profit'), rev),
    effective_tax_rate: safeDiv(g('income_tax'), g('total_profit')),
    net_margin_parent: safeDiv(npp, rev),
    current_ratio: safeDiv(tca, tcl),
    quick_ratio: safeDiv(safeSub(tca, inv), tcl),
    net_working_capital: safeSub(tca, tcl),
    interest_bearing_debt: interestBearingDebt,
    debt_to_assets: safeDiv(tl, ta),
    equity_multiplier: safeDiv(ta, ep),
    goodwill_to_equity: safeDiv(gw, ep),
    other_receivables_to_assets: safeDiv(orec, ta),
    cfo_to_net_profit: safeDiv(ncro, npp),
    capex: capex,
    // 自由现金流 = 经营现金流净额 - 购建固定资产等支付的现金（资本开支）
    fcf: safeSub(ncro, capex),
    // 应计利润/总资产：正数越大代表利润越「纸面」（净利润高于经营现金流的部分）
    accrual_ta: safeDiv(safeSub(npp, ncro), ta),
    // 经营现金流 / 营业利润：收现质量，越接近 1 越好
    ncf_to_op_profit: safeDiv(ncro, oprofit),
    // 白酒专属：合同负债(或预收)/营收、收现比、成品库存/营收。
    // 硬约束：任一输入缺失时结果必须是 null（禁止把缺失当 0/安全）
    contract_liab_ratio: safeDiv(contractLiab, rev),
    sales_cash_ratio: safeDiv(cfs, rev),
    finished_inv_ratio: safeDiv(g('inventory_finished'), rev),
    net_margin_parent_dupont: safeDiv(npp, rev),
    asset_turnover: null,
    equity_multiplier_dupont: null,
    roe_parent: null,
    inventory_turnover: null,
    ar_turnover: null,
    ap_turnover: null,
    fa_turnover: null,
  };
}

// 用相邻期均值补算周转率与杜邦（首期无前值则用当期值）
function withAvg(cur: PeriodReport, prev: PeriodReport | null, m: PeriodMetrics): PeriodMetrics {
  const gc = fieldGetter(cur);
  const gp = prev ? fieldGetter(prev) : null;
  const rev = gc('total_revenue');
  const cost = gc('operating_cost');
  const npp = gc('net_profit_parent');
  const ta = gc('total_assets');
  const ep = gc('equity_parent');
  const inv = gc('inventories');
  const ar = safeSum([gc('accounts_receivable'), gc('notes_receivable'), gc('receivables_financing')]);
  const ap = gc('accounts_payable');
  const fa = gc('fixed_assets');

  const avgTA = avg(ta, gp ? gp('total_assets') : null);
  const avgEP = avg(ep, gp ? gp('equity_parent') : null);
  const avgInv = avg(inv, gp ? gp('inventories') : null);
  const avgAR = avg(ar, gp ? safeSum([gp('accounts_receivable'), gp('notes_receivable'), gp('receivables_financing')]) : null);
  const avgAP = avg(ap, gp ? gp('accounts_payable') : null);
  const avgFA = avg(fa, gp ? gp('fixed_assets') : null);

  const asset_turnover = safeDiv(rev, avgTA);
  const equity_multiplier_dupont = safeDiv(avgTA, avgEP);
  const net_margin = safeDiv(npp, rev);
  const roe_parent =
    net_margin != null && asset_turnover != null && equity_multiplier_dupont != null
      ? net_margin * asset_turnover * equity_multiplier_dupont
      : null;

  return {
    ...m,
    asset_turnover,
    equity_multiplier_dupont,
    roe_parent,
    inventory_turnover: safeDiv(cost, avgInv),
    ar_turnover: safeDiv(rev, avgAR),
    ap_turnover: safeDiv(cost, avgAP),
    fa_turnover: safeDiv(rev, avgFA),
  };
}

export interface ComputedDataset {
  dataset: ReportDataset;
  periods: string[];
  metrics: PeriodMetrics[];
}

export function computeDataset(ds: ReportDataset): ComputedDataset {
  const reports = ds.reports;
  const base = reports.map(periodBaseMetrics);
  const metrics = base.map((m, i) => withAvg(reports[i], i > 0 ? reports[i - 1] : null, m));
  return { dataset: ds, periods: ds.periods, metrics };
}
