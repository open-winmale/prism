import type { Num } from './schema/types';
import { safeAdd, safeDiv, safeSub, safeSum } from './utils';

// 复刻 sys/rptdom/stmt_tree.xs 的 drv 运算（sub/add/div/quick/margin/share/sum/sum_share）
export type Drv =
  | { d: 'sub'; a: string; b: string }
  | { d: 'add'; a: string; a2?: string }
  | { d: 'div'; a: string; b: string }
  | { d: 'quick'; a: string; b: string; m: string }
  | { d: 'margin'; a: string; b: string }
  | { d: 'share'; a: string; b: string }
  | { d: 'sum'; as: string[] }
  | { d: 'sum_all'; as: string[] }
  | { d: 'sum_share'; b: string; as: string[] };

// get: 按字段名取数（来自某期三大报表）
export function evalDrv(drv: Drv, get: (k: string) => Num): Num {
  switch (drv.d) {
    case 'sub':
      return safeSub(get(drv.a), get(drv.b));
    case 'add': {
      const a = get(drv.a);
      const b = drv.a2 != null ? get(drv.a2) : 0;
      return safeAdd(a, b);
    }
    case 'div':
      return safeDiv(get(drv.a), get(drv.b));
    case 'quick':
      return safeDiv(safeSub(get(drv.a), get(drv.m)), get(drv.b));
    case 'margin': {
      // 毛利率口径：(营收 - 成本) / 营收
      const b = get(drv.b);
      const a = get(drv.a);
      if (a == null || b == null || b === 0) return null;
      return (b - a) / b;
    }
    case 'share':
      return safeDiv(get(drv.a), get(drv.b));
    case 'sum': {
      const vals: Num[] = drv.as.map((k) => get(k));
      return safeSum(vals);
    }
    // 严格求和：任一项缺失 → null（用于「现金净增加额」这类恒等式，缺一项就不该出数）
    case 'sum_all': {
      const vals: Num[] = drv.as.map((k) => get(k));
      return vals.some((v) => v == null) ? null : vals.reduce<number>((a, b) => a + (b ?? 0), 0);
    }
    case 'sum_share': {
      const b = get(drv.b);
      const vals: Num[] = drv.as.map((k) => get(k));
      return safeDiv(safeSum(vals), b);
    }
    default:
      return null;
  }
}

// 字段中文名（与 stmt_tree.xs 对齐，展示用）
export const FIELD_CN: Record<string, string> = {
  total_assets: '资产总计',
  monetary_funds: '货币资金',
  trading_fin_assets: '交易性金融资产',
  notes_receivable: '应收票据',
  accounts_receivable: '应收账款',
  receivables_financing: '应收款项融资',
  prepayments: '预付款项',
  other_receivables: '其他应收款',
  inventories: '存货',
  contract_assets: '合同资产',
  other_current_assets: '其他流动资产',
  total_current_assets: '流动资产合计',
  long_term_equity_investment: '长期股权投资',
  investment_property: '投资性房地产',
  fixed_assets: '固定资产',
  cip: '在建工程',
  right_of_use_assets: '使用权资产',
  intangible_assets: '无形资产',
  development_expenditure: '开发支出',
  goodwill: '商誉',
  long_term_deferred_expenses: '长期待摊费用',
  deferred_tax_assets: '递延所得税资产',
  other_noncurrent_assets: '其他非流动资产',
  total_noncurrent_assets: '非流动资产合计',
  short_term_loans: '短期借款',
  noncurrent_liab_1y: '一年内到期非流动负债',
  long_term_loans: '长期借款',
  bonds_payable: '应付债券',
  lease_liabilities: '租赁负债',
  total_current_liabilities: '流动负债合计',
  total_liabilities: '负债合计',
  total_equity: '所有者权益合计',
  equity_parent: '归母权益',
  total_revenue: '营业总收入',
  operating_cost: '营业成本',
  tax_and_surtax: '税金及附加',
  selling_expense: '销售费用',
  admin_expense: '管理费用',
  rd_expense: '研发费用',
  finance_expense: '财务费用',
  operating_profit: '营业利润',
  nonoperating_income: '营业外收入',
  nonoperating_expense: '营业外支出',
  total_profit: '利润总额',
  income_tax: '所得税费用',
  net_profit: '净利润',
  net_profit_parent: '归母净利润',
  net_profit_excl_nonrecurring: '扣非净利润',
  cash_from_sales: '销售收现',
  net_cash_operating: '经营现金流净额',
  capex_cash: '资本开支',
  net_cash_investing: '投资现金流净额',
  net_cash_financing: '筹资现金流净额',
  cash_end: '期末现金',
  taxes_paid: '支付的税费',
};

// 三大报表目录树（精简自 stmt_tree.xs，用于共同比/三表透视展示）
export interface StmtRow {
  k: string;
  cn: string;
  col?: string;
  drv?: Drv;
  pct?: boolean;
  section?: boolean; // 小计/表头行
}

export const STMT_TREE: Record<'balance' | 'income' | 'cashflow', StmtRow[]> = {
  balance: [
    { k: 'TCA', cn: '流动资产合计', col: 'total_current_assets', section: true },
    { k: 'MFNS', cn: '　货币资金', col: 'monetary_funds' },
    { k: 'NRAR', cn: '　应收票据及应收账款', drv: { d: 'add', a: 'notes_receivable', a2: 'accounts_receivable' } },
    { k: 'FRRE', cn: '　应收款项融资', col: 'receivables_financing' },
    { k: 'ADP', cn: '　预付款项', col: 'prepayments' },
    { k: 'ORNET', cn: '　其他应收款', col: 'other_receivables' },
    { k: 'IO', cn: '　存货', col: 'inventories' },
    { k: 'TNA', cn: '非流动资产合计', col: 'total_noncurrent_assets', section: true },
    { k: 'LEIT', cn: '　长期股权投资', col: 'long_term_equity_investment' },
    { k: 'NTLA', cn: '　投资性房地产', col: 'investment_property' },
    { k: 'PPE', cn: '　固定资产', col: 'fixed_assets' },
    { k: 'CIP', cn: '　在建工程', col: 'cip' },
    { k: 'IA', cn: '　无形资产', col: 'intangible_assets' },
    { k: 'GW', cn: '　商誉', col: 'goodwill' },
    { k: 'TA', cn: '资产总计', col: 'total_assets', section: true },
    { k: 'LD', cn: '　流动比率', drv: { d: 'div', a: 'total_current_assets', b: 'total_current_liabilities' } },
    { k: 'SD', cn: '　速动比率', drv: { d: 'quick', a: 'total_current_assets', b: 'total_current_liabilities', m: 'inventories' } },
    { k: 'IBD', cn: '　有息负债', drv: { d: 'sum', as: ['short_term_loans', 'noncurrent_liab_1y', 'long_term_loans', 'bonds_payable', 'lease_liabilities'] } },
    // ── 负债段与股东权益段（2026-10-22 补全）：
    // 此前三表只有资产段，「负债问题、股东权益问题」无从发现突变。
    // 字段在 schema/BS_MAP 全部有映射（contract_liabilities/total_liabilities/share_capital…）。
    { k: 'TCL', cn: '流动负债合计', col: 'total_current_liabilities', section: true },
    { k: 'AP', cn: '　应付票据及应付账款', drv: { d: 'add', a: 'notes_payable', a2: 'accounts_payable' } },
    { k: 'CLC', cn: '　合同负债', col: 'contract_liabilities' },
    { k: 'ARV', cn: '　预收款项（旧准则）', col: 'advance_receipts' },
    { k: 'TL', cn: '负债合计', col: 'total_liabilities', section: true },
    { k: 'SC', cn: '　股本', col: 'share_capital' },
    { k: 'RE', cn: '　未分配利润', col: 'retained_earnings' },
    { k: 'EQP', cn: '　归母股东权益', col: 'equity_parent' },
    { k: 'TE', cn: '所有者权益合计', col: 'total_equity', section: true },
  ],
  income: [
    { k: 'TR', cn: '一、营业总收入', col: 'total_revenue', section: true },
    { k: 'OC', cn: '　营业成本', col: 'operating_cost' },
    { k: 'GM', cn: '　毛利率', drv: { d: 'margin', a: 'operating_cost', b: 'total_revenue' }, pct: true },
    { k: 'SEXE', cn: '　销售费用', col: 'selling_expense' },
    { k: 'MEXE', cn: '　管理费用', col: 'admin_expense' },
    { k: 'RD', cn: '　研发费用', col: 'rd_expense' },
    { k: 'FE', cn: '　财务费用', col: 'finance_expense' },
    { k: 'SEXE_RATE', cn: '　销售费用率', drv: { d: 'share', a: 'selling_expense', b: 'total_revenue' }, pct: true },
    { k: 'MEXE_RATE', cn: '　管理费用率', drv: { d: 'share', a: 'admin_expense', b: 'total_revenue' }, pct: true },
    { k: 'RD_RATE', cn: '　研发费用率', drv: { d: 'share', a: 'rd_expense', b: 'total_revenue' }, pct: true },
    { k: 'COST_TOTAL_RATE', cn: '　三项费用率', drv: { d: 'sum_share', b: 'total_revenue', as: ['selling_expense', 'admin_expense', 'rd_expense', 'finance_expense'] }, pct: true },
    { k: 'OP', cn: '三、营业利润', col: 'operating_profit', section: true },
    { k: 'TP', cn: '四、利润总额', col: 'total_profit', section: true },
    { k: 'TAX', cn: '　所得税费用', col: 'income_tax' },
    { k: 'NP', cn: '五、净利润', col: 'net_profit', section: true },
    { k: 'NPP', cn: '　归母净利润', col: 'net_profit_parent' },
  ],
  cashflow: [
    { k: 'SSIR', cn: '销售商品提供劳务收到的现金', col: 'cash_from_sales' },
    { k: 'TAXPD', cn: '　支付的各项税费', col: 'taxes_paid' },
    { k: 'NCFO', cn: '经营活动现金流量净额', col: 'net_cash_operating', section: true },
    { k: 'CLAR', cn: '购建长期资产支付的现金', col: 'capex_cash' },
    { k: 'NCFI', cn: '投资活动现金流量净额', col: 'net_cash_investing', section: true },
    { k: 'NCFF', cn: '筹资活动现金流量净额', col: 'net_cash_financing', section: true },
    // 现金净增加额 = 经营 + 投资 + 筹资；任一项缺失则 null（此前误取 net_cash_operating，与 NCFO 行完全重复）
    {
      k: 'NCF',
      cn: '现金净增加额',
      drv: { d: 'sum_all', as: ['net_cash_operating', 'net_cash_investing', 'net_cash_financing'] },
    },
    { k: 'CCF', cn: '期末现金及等价物', col: 'cash_end', section: true },
  ],
};

// 把某期报表按目录树展开为带中文名与数值的行（含衍生项），供共同比/三表透视使用
export function expandStatement(
  kind: 'balance' | 'income' | 'cashflow',
  get: (k: string) => Num,
): { k: string; cn: string; value: Num; pct?: boolean; section?: boolean }[] {
  return STMT_TREE[kind].map((r) => {
    const value = r.drv ? evalDrv(r.drv, get) : r.col ? get(r.col) : null;
    return { k: r.k, cn: r.cn, value, pct: r.pct, section: r.section };
  });
}
