import type { ReportDataset } from '@/engine';

// 演示数据：白酒行业（结构参考贵州茅台，非精确财报，仅用于展示引擎）。
// 单位：元。毛利率~91%、低负债、收现质量好、几乎没有应收——典型优质生意画像。
const yi = (n: number) => n * 1e8;

export const maotaiSample: ReportDataset = {
  symbol: 'DEMO-600519',
  name: '演示·白酒龙头',
  industry: 'liquor',
  disclaimer: '演示数据：结构参考白酒行业龙头，非真实财报，请以官方披露为准。连接赢麻了开放平台可获取真实数据。',
  meta: { fragrance: '酱香', priceBand: '超高端', sourceNote: '结构参考白酒龙头：毛利率~91%、先款后货、合同负债蓄水池稳定' },
  periods: ['2020-12-31', '2021-12-31', '2022-12-31', '2023-12-31', '2024-12-31'],
  reports: [
    {
      period: '2020-12-31',
      balance: {
        monetary_funds: yi(1498), accounts_receivable: 0, notes_receivable: 0, receivables_financing: 0,
        prepayments: yi(9), other_receivables: yi(0.3), inventories: yi(288), other_current_assets: yi(15),
        total_current_assets: yi(1810), fixed_assets: yi(162), cip: yi(21), intangible_assets: yi(5),
        deferred_tax_assets: yi(1), other_noncurrent_assets: yi(4), total_noncurrent_assets: yi(193),
        total_assets: yi(2003), short_term_loans: 0, long_term_loans: 0, accounts_payable: yi(18), contract_liabilities: yi(91), total_liabilities: yi(456),
        equity_parent: yi(1547),
      },
      income: {
        total_revenue: yi(980), operating_cost: yi(90), selling_expense: yi(25.5), admin_expense: yi(67.9),
        rd_expense: 0, finance_expense: yi(-18), operating_profit: yi(814), total_profit: yi(816),
        income_tax: yi(204), net_profit: yi(612), net_profit_parent: yi(466), net_profit_excl_nonrecurring: yi(466),
      },
      cashflow: {
        cash_from_sales: yi(1060), net_cash_operating: yi(530), capex_cash: yi(21), net_cash_investing: yi(-30),
        net_cash_financing: yi(-390), cash_end: yi(1498), taxes_paid: yi(410),
      },
    },
    {
      period: '2021-12-31',
      balance: {
        monetary_funds: yi(1862), accounts_receivable: 0, notes_receivable: 0, receivables_financing: 0,
        prepayments: yi(11), other_receivables: yi(0.4), inventories: yi(334), other_current_assets: yi(18),
        total_current_assets: yi(2225), fixed_assets: yi(175), cip: yi(22), intangible_assets: yi(6),
        deferred_tax_assets: yi(1.5), other_noncurrent_assets: yi(5), total_noncurrent_assets: yi(210),
        total_assets: yi(2435), short_term_loans: 0, long_term_loans: 0, accounts_payable: yi(20), contract_liabilities: yi(101), total_liabilities: yi(520),
        equity_parent: yi(1915),
      },
      income: {
        total_revenue: yi(1095), operating_cost: yi(101), selling_expense: yi(27), admin_expense: yi(72),
        rd_expense: 0, finance_expense: yi(-19), operating_profit: yi(914), total_profit: yi(916),
        income_tax: yi(229), net_profit: yi(687), net_profit_parent: yi(525), net_profit_excl_nonrecurring: yi(525),
      },
      cashflow: {
        cash_from_sales: yi(1190), net_cash_operating: yi(605), capex_cash: yi(22), net_cash_investing: yi(-35),
        net_cash_financing: yi(-450), cash_end: yi(1862), taxes_paid: yi(460),
      },
    },
    {
      period: '2022-12-31',
      balance: {
        monetary_funds: yi(2163), accounts_receivable: 0, notes_receivable: 0, receivables_financing: 0,
        prepayments: yi(13), other_receivables: yi(0.5), inventories: yi(388), other_current_assets: yi(20),
        total_current_assets: yi(2585), fixed_assets: yi(190), cip: yi(22), intangible_assets: yi(7),
        deferred_tax_assets: yi(2), other_noncurrent_assets: yi(6), total_noncurrent_assets: yi(227),
        total_assets: yi(2812), short_term_loans: 0, long_term_loans: 0, accounts_payable: yi(23), contract_liabilities: yi(115), total_liabilities: yi(580),
        equity_parent: yi(2232),
      },
      income: {
        total_revenue: yi(1241), operating_cost: yi(114), selling_expense: yi(30), admin_expense: yi(80),
        rd_expense: 0, finance_expense: yi(-20), operating_profit: yi(1037), total_profit: yi(1039),
        income_tax: yi(260), net_profit: yi(779), net_profit_parent: yi(627), net_profit_excl_nonrecurring: yi(627),
      },
      cashflow: {
        cash_from_sales: yi(1345), net_cash_operating: yi(685), capex_cash: yi(23), net_cash_investing: yi(-40),
        net_cash_financing: yi(-510), cash_end: yi(2163), taxes_paid: yi(525),
      },
    },
    {
      period: '2023-12-31',
      balance: {
        monetary_funds: yi(2640), accounts_receivable: 0, notes_receivable: 0, receivables_financing: 0,
        prepayments: yi(15), other_receivables: yi(0.6), inventories: yi(462), other_current_assets: yi(24),
        total_current_assets: yi(3142), fixed_assets: yi(205), cip: yi(21), intangible_assets: yi(8),
        deferred_tax_assets: yi(2.5), other_noncurrent_assets: yi(7), total_noncurrent_assets: yi(244),
        total_assets: yi(3386), short_term_loans: 0, long_term_loans: 0, accounts_payable: yi(26), contract_liabilities: yi(137), total_liabilities: yi(660),
        equity_parent: yi(2726),
      },
      income: {
        total_revenue: yi(1477), operating_cost: yi(135), selling_expense: yi(34), admin_expense: yi(88),
        rd_expense: 0, finance_expense: yi(-22), operating_profit: yi(1238), total_profit: yi(1240),
        income_tax: yi(310), net_profit: yi(930), net_profit_parent: yi(747), net_profit_excl_nonrecurring: yi(747),
      },
      cashflow: {
        cash_from_sales: yi(1595), net_cash_operating: yi(810), capex_cash: yi(26), net_cash_investing: yi(-48),
        net_cash_financing: yi(-600), cash_end: yi(2640), taxes_paid: yi(620),
      },
    },
    {
      period: '2024-12-31',
      balance: {
        monetary_funds: yi(3060), accounts_receivable: 0, notes_receivable: 0, receivables_financing: 0,
        prepayments: yi(17), other_receivables: yi(0.7), inventories: yi(520), other_current_assets: yi(28),
        total_current_assets: yi(3626), fixed_assets: yi(218), cip: yi(20), intangible_assets: yi(9),
        deferred_tax_assets: yi(3), other_noncurrent_assets: yi(8), total_noncurrent_assets: yi(258),
        total_assets: yi(3884), short_term_loans: 0, long_term_loans: 0, accounts_payable: yi(30), contract_liabilities: yi(160), total_liabilities: yi(720),
        equity_parent: yi(3164),
      },
      income: {
        total_revenue: yi(1741), operating_cost: yi(158), selling_expense: yi(38), admin_expense: yi(95),
        rd_expense: 0, finance_expense: yi(-24), operating_profit: yi(1454), total_profit: yi(1456),
        income_tax: yi(364), net_profit: yi(1092), net_profit_parent: yi(862), net_profit_excl_nonrecurring: yi(862),
      },
      cashflow: {
        cash_from_sales: yi(1870), net_cash_operating: yi(945), capex_cash: yi(30), net_cash_investing: yi(-55),
        net_cash_financing: yi(-690), cash_end: yi(3060), taxes_paid: yi(720),
      },
    },
  ],
  footnote: [
    {
      code: 'MFNS',
      cn: '货币资金',
      period: '2024-12-31',
      source: 'demo',
      sections: [
        {
          title: '货币资金明细（演示）',
          columns: [
            { key: 'item', cn: '项目' },
            { key: 'c0', cn: '2024' },
            { key: 'c1', cn: '2023' },
          ],
          rows: [
            { item: '库存现金', c0: '12万', c1: '11万' },
            { item: '银行存款', c0: '3058亿', c1: '2638亿' },
            { item: '其他货币资金（含受限)', c0: '2.1亿', c1: '1.8亿' },
            { item: '其中：受限资金', c0: '2.1亿', c1: '1.8亿' },
          ],
        },
      ],
    },
  ],
};
