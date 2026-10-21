// 财务数据模型 —— 字段名与 ../script/sys/rptdom/stmt_tree.xs 的 col 一一对应，
// 保证「复用 ../script 资产」时可逐字段追溯。单位为「元」（前端展示层统一换算为亿元）。

export type Num = number | null;

export interface BalanceSheet {
  // 流动资产
  monetary_funds?: Num; // 货币资金
  trading_fin_assets?: Num; // 交易性金融资产
  notes_receivable?: Num; // 应收票据
  accounts_receivable?: Num; // 应收账款
  receivables_financing?: Num; // 应收款项融资
  prepayments?: Num; // 预付款项
  other_receivables?: Num; // 其他应收款
  inventories?: Num; // 存货
  inventory_raw?: Num; // 存货-原材料
  inventory_wip?: Num; // 存货-半成品（白酒即基酒）
  inventory_finished?: Num; // 存货-库存商品（成品）
  contract_assets?: Num; // 合同资产
  other_current_assets?: Num; // 其他流动资产
  total_current_assets?: Num; // 流动资产合计
  // 非流动资产
  long_term_equity_investment?: Num; // 长期股权投资
  investment_property?: Num; // 投资性房地产
  fixed_assets?: Num; // 固定资产
  cip?: Num; // 在建工程
  right_of_use_assets?: Num; // 使用权资产
  intangible_assets?: Num; // 无形资产
  development_expenditure?: Num; // 开发支出
  goodwill?: Num; // 商誉
  long_term_deferred_expenses?: Num; // 长期待摊费用
  deferred_tax_assets?: Num; // 递延所得税资产
  other_noncurrent_assets?: Num; // 其他非流动资产
  total_noncurrent_assets?: Num; // 非流动资产合计
  total_assets?: Num; // 资产总计
  // 负债
  short_term_loans?: Num; // 短期借款
  noncurrent_liab_1y?: Num; // 一年内到期的非流动负债
  long_term_loans?: Num; // 长期借款
  bonds_payable?: Num; // 应付债券
  lease_liabilities?: Num; // 租赁负债
  accounts_payable?: Num; // 应付账款
  contract_liabilities?: Num; // 合同负债（白酒=经销商预付款，行业第一领先指标）
  advance_receipts?: Num; // 预收款项（旧准则列示，缺合同负债时兜底）
  total_current_liabilities?: Num; // 流动负债合计
  total_liabilities?: Num; // 负债合计
  // 权益
  total_equity?: Num; // 所有者权益合计
  equity_parent?: Num; // 归属于母公司股东的权益
}

export interface IncomeStatement {
  total_revenue?: Num; // 营业总收入
  operating_cost?: Num; // 营业成本
  tax_and_surtax?: Num; // 税金及附加
  selling_expense?: Num; // 销售费用
  admin_expense?: Num; // 管理费用
  rd_expense?: Num; // 研发费用
  finance_expense?: Num; // 财务费用
  operating_profit?: Num; // 营业利润
  nonoperating_income?: Num; // 营业外收入
  nonoperating_expense?: Num; // 营业外支出
  total_profit?: Num; // 利润总额
  income_tax?: Num; // 所得税费用
  net_profit?: Num; // 净利润
  net_profit_parent?: Num; // 归母净利润
  net_profit_excl_nonrecurring?: Num; // 扣非净利润
}

export interface CashFlowStatement {
  cash_from_sales?: Num; // 销售商品、提供劳务收到的现金
  net_cash_operating?: Num; // 经营活动现金流量净额
  capex_cash?: Num; // 购建固定资产等支付的现金
  net_cash_investing?: Num; // 投资活动现金流量净额
  net_cash_financing?: Num; // 筹资活动现金流量净额
  cash_end?: Num; // 期末现金及等价物
  taxes_paid?: Num; // 支付的各项税费
}

export interface PeriodReport {
  period: string; // 如 '2023-12-31'
  balance: BalanceSheet;
  income: IncomeStatement;
  cashflow: CashFlowStatement;
}

export interface FootnoteSection {
  title: string;
  columns: { key: string; cn: string }[];
  rows: Record<string, string | number | null>[];
}

// 附注分析单元 —— 对应 sys/rptdom/note_*.xs 的 note_index / notes_for
export interface FootnoteItem {
  code: string; // 专业版代码，如 IO=存货、MFNS=货币资金
  cn: string;
  period: string;
  source: string; // 'sina' | 'pdf'
  sections: FootnoteSection[];
}

export type IndustryKey =
  | 'liquor'
  | 'manufacturing'
  | 'cyclical'
  | 'realestate'
  | 'tech'
  | 'general';

// 产销量（不在三大报表内，来自附注/行业数据；可选）
export interface ProductionSalesRow {
  period: string; // 年份，如 '2023'
  product?: string; // 产品（多产品时）
  tier?: 'high' | 'mid' | 'low' | 'total'; // 价格带（高端/中端/低端/合计）
  production?: Num; // 产量
  sales?: Num; // 销量
  revenue?: Num; // 该口径收入（元）——量价拆解必需
  unitPrice?: Num; // 吨价（元/吨），可由 revenue/sales 派生
  inventory?: Num; // 期末库存
  unit?: string; // 单位，如 '万吨'
}

export interface ReportDataset {
  symbol: string;
  name: string;
  industry: IndustryKey;
  periods: string[]; // 升序
  reports: PeriodReport[]; // 与 periods 对齐
  footnote?: FootnoteItem[]; // 可选：附注明细
  productionSales?: ProductionSalesRow[]; // 可选：产销量
  disclaimer?: string; // 数据来源说明（示例/真实）
  // 同业基准（可选，来自赢麻了后端或内置行业常量），键为指标名，如 gross_margin
  peerBench?: Record<string, number>;
  // 公司画像（白酒）：香型/价格带/数据来源说明
  meta?: { fragrance?: string; priceBand?: string; sourceNote?: string };
  // 产品结构收入（M2 量价拆解用，M1 先定义 schema）
  segmentRevenue?: { period: string; tier: string; revenue: Num; grossMargin?: Num }[];
}
