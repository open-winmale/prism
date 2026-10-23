import type { ReportDataset } from '@/engine';

// 演示数据：制造业「排雷样例」——刻意构造多项红绿灯信号：
// 应收增速远高于营收、经营现金流长期低于净利润、大存大贷、其他应收款攀升、产销率<100%。
// 用于展示财报排雷模块的预警能力。单位：元。
const yi = (n: number) => n * 1e8;

export const manufacturingSample: ReportDataset = {
  symbol: 'DEMO-000001',
  name: '演示·制造（排雷样例）',
  industry: 'manufacturing',
  meta: { galleryTag: '重资产 · 排雷演示' },
  disclaimer: '演示数据：合成构造，刻意包含多项财务异常，仅用于排雷模块演示，非真实公司。',
  // 同业基准：制造业毛利率中枢约 25%（演示常量；连接赢麻了开放平台可获取实时行业基准）
  peerBench: { gross_margin: 0.25 },
  periods: ['2020-12-31', '2021-12-31', '2022-12-31', '2023-12-31', '2024-12-31'],
  reports: [
    {
      period: '2020-12-31',
      balance: {
        monetary_funds: yi(80), accounts_receivable: yi(10), notes_receivable: 0, receivables_financing: 0,
        prepayments: yi(5), other_receivables: yi(8), inventories: yi(30), other_current_assets: yi(10),
        total_current_assets: yi(143), fixed_assets: yi(120), cip: yi(30), intangible_assets: yi(20), goodwill: 0,
        total_noncurrent_assets: yi(170),         total_assets: yi(313), short_term_loans: yi(60), long_term_loans: yi(40), accounts_payable: yi(15),
        total_liabilities: yi(160), equity_parent: yi(153),
      },
      income: {
        total_revenue: yi(100), operating_cost: yi(70), selling_expense: yi(6), admin_expense: yi(8),
        rd_expense: yi(3), finance_expense: yi(4), operating_profit: yi(9), total_profit: yi(9.5),
        income_tax: yi(2.4), net_profit: yi(7.1), net_profit_parent: yi(6), net_profit_excl_nonrecurring: yi(5.5),
      },
      cashflow: {
        cash_from_sales: yi(95), net_cash_operating: yi(5), capex_cash: yi(30), net_cash_investing: yi(-35),
        net_cash_financing: yi(20), cash_end: yi(80), taxes_paid: yi(3),
      },
    },
    {
      period: '2021-12-31',
      balance: {
        monetary_funds: yi(85), accounts_receivable: yi(20), notes_receivable: 0, receivables_financing: 0,
        prepayments: yi(5), other_receivables: yi(12), inventories: yi(45), other_current_assets: yi(10),
        total_current_assets: yi(177), fixed_assets: yi(122), cip: yi(33), intangible_assets: yi(20), goodwill: 0,
        total_noncurrent_assets: yi(175),         total_assets: yi(352), short_term_loans: yi(60), long_term_loans: yi(40), accounts_payable: yi(18),
        total_liabilities: yi(180), equity_parent: yi(172),
      },
      income: {
        total_revenue: yi(110), operating_cost: yi(76), selling_expense: yi(7), admin_expense: yi(9),
        rd_expense: yi(3.5), finance_expense: yi(5), operating_profit: yi(9.5), total_profit: yi(10),
        income_tax: yi(2.5), net_profit: yi(7.6), net_profit_parent: yi(6.4), net_profit_excl_nonrecurring: yi(5.8),
      },
      cashflow: {
        cash_from_sales: yi(98), net_cash_operating: yi(4), capex_cash: yi(33), net_cash_investing: yi(-38),
        net_cash_financing: yi(22), cash_end: yi(85), taxes_paid: yi(3.2),
      },
    },
    {
      period: '2022-12-31',
      balance: {
        monetary_funds: yi(88), accounts_receivable: yi(40), notes_receivable: 0, receivables_financing: 0,
        prepayments: yi(6), other_receivables: yi(18), inventories: yi(70), other_current_assets: yi(12),
        total_current_assets: yi(234), fixed_assets: yi(125), cip: yi(35), intangible_assets: yi(20), goodwill: 0,
        total_noncurrent_assets: yi(180),         total_assets: yi(414), short_term_loans: yi(60), long_term_loans: yi(40), accounts_payable: yi(20),
        total_liabilities: yi(210), equity_parent: yi(204),
      },
      income: {
        total_revenue: yi(120), operating_cost: yi(82), selling_expense: yi(8), admin_expense: yi(10),
        rd_expense: yi(4), finance_expense: yi(6), operating_profit: yi(10), total_profit: yi(10.5),
        income_tax: yi(2.6), net_profit: yi(8), net_profit_parent: yi(6.8), net_profit_excl_nonrecurring: yi(6.0),
      },
      cashflow: {
        cash_from_sales: yi(100), net_cash_operating: yi(3), capex_cash: yi(36), net_cash_investing: yi(-42),
        net_cash_financing: yi(22), cash_end: yi(88), taxes_paid: yi(3.4),
      },
    },
    {
      period: '2023-12-31',
      balance: {
        monetary_funds: yi(90), accounts_receivable: yi(70), notes_receivable: 0, receivables_financing: 0,
        prepayments: yi(6), other_receivables: yi(25), inventories: yi(100), other_current_assets: yi(12),
        total_current_assets: yi(303), fixed_assets: yi(128), cip: yi(38), intangible_assets: yi(22), goodwill: 0,
        total_noncurrent_assets: yi(188),         total_assets: yi(491), short_term_loans: yi(60), long_term_loans: yi(40), accounts_payable: yi(22),
        total_liabilities: yi(250), equity_parent: yi(241),
      },
      income: {
        total_revenue: yi(125), operating_cost: yi(85), selling_expense: yi(9), admin_expense: yi(11),
        rd_expense: yi(4.5), finance_expense: yi(6.5), operating_profit: yi(9), total_profit: yi(9.5),
        income_tax: yi(2.4), net_profit: yi(7.2), net_profit_parent: yi(6), net_profit_excl_nonrecurring: yi(5.2),
      },
      cashflow: {
        cash_from_sales: yi(102), net_cash_operating: yi(2), capex_cash: yi(40), net_cash_investing: yi(-48),
        net_cash_financing: yi(22), cash_end: yi(90), taxes_paid: yi(3.6),
      },
    },
    {
      period: '2024-12-31',
      balance: {
        monetary_funds: yi(240), accounts_receivable: yi(110), notes_receivable: 0, receivables_financing: 0,
        prepayments: yi(7), other_receivables: yi(35), inventories: yi(140), other_current_assets: yi(12),
        total_current_assets: yi(396), fixed_assets: yi(130), cip: yi(40), intangible_assets: yi(25), goodwill: 0,
        total_noncurrent_assets: yi(195),         total_assets: yi(591), short_term_loans: yi(130), long_term_loans: yi(70), accounts_payable: yi(25),
        total_liabilities: yi(390), equity_parent: yi(201),
      },
      income: {
        total_revenue: yi(130), operating_cost: yi(95), selling_expense: yi(10), admin_expense: yi(12),
        rd_expense: yi(5), finance_expense: yi(7), operating_profit: yi(1), total_profit: yi(1.5),
        income_tax: yi(0.4), net_profit: yi(1.1), net_profit_parent: yi(1), net_profit_excl_nonrecurring: yi(0.6),
      },
      cashflow: {
        cash_from_sales: yi(60), net_cash_operating: yi(-6), capex_cash: yi(45), net_cash_investing: yi(-55),
        net_cash_financing: yi(22), cash_end: yi(240), taxes_paid: yi(3.8),
      },
    },
  ],
  productionSales: [
    { period: '2020-12-31', production: 1000, sales: 1000, unit: '万吨' },
    { period: '2021-12-31', production: 1100, sales: 1050, unit: '万吨' },
    { period: '2022-12-31', production: 1200, sales: 1100, unit: '万吨' },
    { period: '2023-12-31', production: 1250, sales: 1080, unit: '万吨' },
    { period: '2024-12-31', production: 1300, sales: 1050, unit: '万吨' },
  ],
  footnote: [
    {
      code: 'MFNS',
      cn: '货币资金',
      period: '2024-12-31',
      source: 'demo',
      sections: [
        {
          title: '货币资金明细（演示·大存大贷）',
          columns: [
            { key: 'item', cn: '项目' },
            { key: 'c0', cn: '2024' },
            { key: 'c1', cn: '2023' },
          ],
          rows: [
            { item: '银行存款', c0: '240亿', c1: '88亿' },
            { item: '其中：受限/质押资金', c0: '156亿', c1: '58亿' },
            { item: '受限比例', c0: '65%', c1: '66%' },
          ],
        },
      ],
    },
  ],
};
