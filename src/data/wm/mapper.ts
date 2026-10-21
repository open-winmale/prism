import type { BalanceSheet, CashFlowStatement, IncomeStatement, Num, PeriodReport } from '@/engine';
import type { FinanceRawPayload, RawStatement } from './types';

// raw 视图字段 → 本项目模型的映射表。
// 字段来源：赢麻了开放平台 wm-data finance view=raw（2026-10-21 实测，单表 88~90 字段）。
// 铁律：**源字段缺失一律映射为 null，绝不填 0**——缺失与「金额为 0」是两回事，
// 引擎侧多个派生指标（如 contract_liab_ratio）依赖 null 传播来表达「无法判定」。

type NumMap<T> = { [K in keyof T]?: string };

export const BS_MAP: NumMap<BalanceSheet> = {
  monetary_funds: 'monetaryfunds',
  trading_fin_assets: 'tradingFinancialAsset',
  // 用「应收票据」而不是「应收票据及应收账款」：后者已含应收账款，再与 accounts_receivable 相加会重复计算。
  notes_receivable: 'billsReceivable',
  accounts_receivable: 'accountsReceivable',
  receivables_financing: 'financeReceivable',
  prepayments: 'prepayment',
  other_receivables: 'totalOtherReceivable',
  inventories: 'inventory',
  contract_assets: 'contractAsset',
  other_current_assets: 'otherCurrentAsset',
  total_current_assets: 'totalCurrentAsset',
  long_term_equity_investment: 'longEquityInvest',
  investment_property: 'investRealestate',
  fixed_assets: 'fixedAsset',
  cip: 'constructioninProgress',
  right_of_use_assets: 'userightAsset',
  intangible_assets: 'intangibleAsset',
  development_expenditure: 'developmentExpenditure',
  goodwill: 'goodwill',
  long_term_deferred_expenses: 'longTermDeferredExpense',
  deferred_tax_assets: 'deferTaxAsset',
  other_noncurrent_assets: 'otherNoncurrentAsset',
  total_noncurrent_assets: 'totalNoncurrentAsset',
  total_assets: 'totalAsset',
  short_term_loans: 'shortTermLoans',
  noncurrent_liab_1y: 'noncurrentLiab1year',
  long_term_loans: 'longTermLoans',
  bonds_payable: 'bondPayable',
  lease_liabilities: 'leaseLiab',
  accounts_payable: 'accountsPayable',
  notes_payable: 'notePayable',
  contract_liabilities: 'contractLiab',
  advance_receipts: 'advanceReceivable',
  total_current_liabilities: 'totalCurrentLiab',
  total_liabilities: 'totalLiab',
  share_capital: 'shareCapital',
  total_equity: 'totalEquity',
  equity_parent: 'equityAttributabletoParentCompanyShareholders',
  minority_interest: 'minorityEquity',
  retained_earnings: 'unassignRpofit',
};

export const IS_MAP: NumMap<IncomeStatement> = {
  total_revenue: 'totalOperatingIncome',
  operating_cost: 'operateCost',
  total_operating_cost: 'totalOperatingCost',
  tax_and_surtax: 'businessTaxesandSurcharges',
  selling_expense: 'saleExpense',
  admin_expense: 'manageExpense',
  rd_expense: 'researchandDevelopmentExpense',
  finance_expense: 'financeExpense',
  interest_expense: 'feInterestExpense',
  operating_profit: 'operateProfit',
  investment_income: 'investmentIncome',
  nonoperating_income: 'nonbusinessIncome',
  nonoperating_expense: 'nonbusinessExpense',
  total_profit: 'totalProfit',
  income_tax: 'incomeTax',
  net_profit: 'netProfit',
  net_profit_parent: 'parentNetProfit',
  net_profit_excl_nonrecurring: 'deductParentNetProfit',
};

export const CF_MAP: NumMap<CashFlowStatement> = {
  cash_from_sales: 'salesServices',
  net_cash_operating: 'netCashFlowfromOperatingActivities',
  capex_cash: 'constructLongAsset',
  net_cash_investing: 'netCashFlowfromInvestingActivities',
  net_cash_financing: 'netCashFlowfromFinancingActivities',
  cash_end: 'endingCashandCashEquivalents',
  taxes_paid: 'payAllTax',
};

/** 只接受有限数字；缺失/空串/NaN/Infinity 一律 null */
export function num(v: unknown): Num {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function mapBy<T extends object>(src: RawStatement, table: NumMap<T>): T {
  const out: Record<string, Num> = {};
  for (const [target, sourceKey] of Object.entries(table)) {
    if (!sourceKey) continue;
    out[target] = num(src[sourceKey as string]);
  }
  return out as unknown as T;
}

/** raw 字段可能是 JSON 字符串（服务端有时二次序列化），统一解析为对象 */
export function parseRaw(raw: unknown): RawStatement {
  if (raw && typeof raw === 'object') return raw as RawStatement;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object') return parsed as RawStatement;
    } catch {
      return {};
    }
  }
  return {};
}

/** 单期 raw（一张表）→ 对应报表片段 */
export function mapStatement<K extends 'balance' | 'income' | 'cashflow'>(
  kind: K,
  raw: unknown,
): Pick<PeriodReport, K>[K] {
  const src = parseRaw(raw);
  if (kind === 'balance') return mapBy<BalanceSheet>(src, BS_MAP) as Pick<PeriodReport, K>[K];
  if (kind === 'income') return mapBy<IncomeStatement>(src, IS_MAP) as Pick<PeriodReport, K>[K];
  return mapBy<CashFlowStatement>(src, CF_MAP) as Pick<PeriodReport, K>[K];
}

/** 归并三张单期表为一条 PeriodReport（缺哪张给空对象，由 verify 出 warn） */
export function toPeriodReport(
  period: string,
  bs?: unknown,
  is?: unknown,
  cf?: unknown,
): PeriodReport {
  return {
    period,
    balance: bs === undefined ? {} : mapStatement('balance', bs),
    income: is === undefined ? {} : mapStatement('income', is),
    cashflow: cf === undefined ? {} : mapStatement('cashflow', cf),
  };
}

/** 从 raw 里取公司名（多来源兜底） */
export function pickName(payload: FinanceRawPayload | null, fallback = ''): string {
  const src = payload?.raw ? parseRaw(payload.raw) : {};
  const cand = [src.securityNameAbbr, src.quoteName, src.securityName].find(
    (v): v is string => typeof v === 'string' && v.trim() !== '',
  );
  return cand || fallback;
}

/** 审计意见（用于报告头部标注「经审计」与意见类型） */
export function pickAuditOpinion(payload: FinanceRawPayload | null): string | undefined {
  const src = payload?.raw ? parseRaw(payload.raw) : {};
  const v = src.opinionType;
  return typeof v === 'string' && v.trim() ? v : undefined;
}

/**
 * 识别「含集团财务公司」的现金口径。
 * 茅台、五粮液等设有财务公司的白酒企业，现金流量表的期末现金包含存放中央银行款项与存放同业款项，
 * 而这两项不在资产负债表的「货币资金」里 —— 导致两者相差 1 倍以上。
 * 这是**口径差异而非数据错误**，校验器据此给出准确说明，避免对每家公司都误报。
 */
export function detectCashScope(cfRaw: unknown): 'standard' | 'finance-subsidiary' {
  const src = parseRaw(cfRaw);
  const signature = ['pbcInterbankAdd', 'depositInterbankAdd', 'loanAdvanceAdd', 'lendFund'];
  return signature.some((k) => num(src[k]) !== null && num(src[k]) !== 0)
    ? 'finance-subsidiary'
    : 'standard';
}
