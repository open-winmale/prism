import { describe, expect, it } from 'vitest';
import { mapStatement, num, parseRaw, pickAuditOpinion, pickName, toPeriodReport } from './mapper';
import type { FinanceRawPayload } from './types';

// 映射层铁律：**源字段缺失一律为 null，绝不填 0**。
// 引擎侧 contract_liab_ratio 等派生指标依赖 null 传播来表达「无法判定」，
// 一旦这里把缺失填成 0，报告就会把「没数据」说成「没有合同负债」——性质完全相反。

const BS_SAMPLE = {
  reportDate: '2025-12-31 00:00:00',
  securityNameAbbr: '贵州茅台',
  quoteName: '贵州茅台',
  opinionType: '标准无保留意见',
  contractLiab: 8006739780.94,
  inventory: 61427421796.18,
  constructioninProgress: 2471886030.58,
  totalAsset: 303834844021.44,
  totalLiab: 49875590112.37,
  totalEquity: 253959253909.07,
  equityAttributabletoParentCompanyShareholders: 244637811032.18,
  accountsReceivable: 2609048.49,
  // 「应收票据及应收账款」是合并字段，不能与 accountsReceivable 相加；映射必须用 billsReceivable。
  billsReceivable: 123,
  noteAccountsReceivable: 456,
  financeReceivable: 3000,
  goodwill: 789,
  longTermLoans: 1000,
  bondPayable: 2000,
  shortTermLoans: 5000,
  unassignRpofit: 4000,
  advanceReceivable: null, // 缺失
};

describe('num()', () => {
  it('数字原样返回', () => expect(num(42)).toBe(42));
  it('null / undefined / 空串 → null', () => {
    expect(num(null)).toBeNull();
    expect(num(undefined)).toBeNull();
    expect(num('')).toBeNull();
    expect(num('   ')).toBeNull();
  });
  it('NaN / Infinity / 非数字串 → null（不是 0）', () => {
    expect(num(Number.NaN)).toBeNull();
    expect(num(Number.POSITIVE_INFINITY)).toBeNull();
    expect(num('abc')).toBeNull();
  });
  it('数字字符串按数字解析，但绝不为缺失返回 0', () => {
    expect(num('123.5')).toBe(123.5);
    expect(num(undefined)).not.toBe(0);
  });
});

describe('parseRaw()', () => {
  it('对象直接返回', () => {
    expect(parseRaw({ a: 1 })).toEqual({ a: 1 });
  });
  it('JSON 字符串解析为对象', () => {
    expect(parseRaw('{"a":1}')).toEqual({ a: 1 });
  });
  it('非法输入 → 空对象（不抛异常）', () => {
    expect(parseRaw(undefined)).toEqual({});
    expect(parseRaw('not json')).toEqual({});
  });
});

describe('mapStatement()', () => {
  it('资产负债表：字段名按映射表转换', () => {
    const bs = mapStatement('balance', BS_SAMPLE);
    expect(bs.contract_liabilities).toBeCloseTo(8006739780.94, 2);
    expect(bs.inventories).toBeCloseTo(61427421796.18, 2);
    expect(bs.cip).toBeCloseTo(2471886030.58, 2);
    expect(bs.total_assets).toBeCloseTo(303834844021.44, 2);
  });

  it('应收账款只取 billsReceivable，不把合并字段 noteAccountsReceivable 重复计入', () => {
    const bs = mapStatement('balance', BS_SAMPLE);
    expect(bs.notes_receivable).toBe(123);
    expect(bs.accounts_receivable).toBe(2609048.49);
    expect(bs.receivables_financing).toBe(3000);
  });

  it('补充字段：商誉/长借/债券/未分配利润/短期借款', () => {
    const bs = mapStatement('balance', BS_SAMPLE);
    expect(bs.goodwill).toBe(789);
    expect(bs.long_term_loans).toBe(1000);
    expect(bs.bonds_payable).toBe(2000);
    expect(bs.short_term_loans).toBe(5000);
    expect(bs.retained_earnings).toBe(4000);
  });

  it('映射表内但源缺失 → null 而非 0', () => {
    const bs = mapStatement('balance', BS_SAMPLE);
    expect(bs.advance_receipts).toBeNull();
    expect(bs.advance_receipts).not.toBe(0);
  });

  it('接口不提供存货三明细拆分 → 相关字段为 undefined（引擎按「缺数据」处理，不误判为 0）', () => {
    const bs = mapStatement('balance', BS_SAMPLE);
    // raw 视图只有存货总额 inventory，没有原材料/半成品(基酒)/库存商品拆分
    expect(bs.inventory_wip).toBeUndefined();
    expect(bs.inventory_finished).toBeUndefined();
    // 存货总额本身正常映射
    expect(bs.inventories).toBeCloseTo(61427421796.18, 2);
  });

  it('空对象 → 全 null，不出现 0', () => {
    const cf = mapStatement('cashflow', {});
    expect(cf.net_cash_operating).toBeNull();
    expect(cf.capex_cash).toBeNull();
    expect(Object.values(cf).every((v) => v === null)).toBe(true);
  });

  it('利润表与现金流量表按各自映射表转换', () => {
    const is = mapStatement('income', {
      totalOperatingIncome: 100,
      operateCost: 20,
      parentNetProfit: 50,
      deductParentNetProfit: 45,
      feInterestExpense: 3,
    });
    expect(is.total_revenue).toBe(100);
    expect(is.operating_cost).toBe(20);
    expect(is.net_profit_parent).toBe(50);
    expect(is.net_profit_excl_nonrecurring).toBe(45);
    expect(is.interest_expense).toBe(3);

    const cf = mapStatement('cashflow', { salesServices: 120, constructLongAsset: 8 });
    expect(cf.cash_from_sales).toBe(120);
    expect(cf.capex_cash).toBe(8);
  });
});

describe('toPeriodReport()', () => {
  it('三表齐全时各归其位', () => {
    const r = toPeriodReport('2025-12-31', BS_SAMPLE, { totalOperatingIncome: 1 }, { salesServices: 2 });
    expect(r.period).toBe('2025-12-31');
    expect(r.balance.total_assets).toBeCloseTo(303834844021.44, 2);
    expect(r.income.total_revenue).toBe(1);
    expect(r.cashflow.cash_from_sales).toBe(2);
  });

  it('缺某张表 → 空对象（由 verify 出 warn，不污染为 0）', () => {
    const r = toPeriodReport('2025-12-31', BS_SAMPLE, undefined, undefined);
    expect(r.income).toEqual({});
    expect(r.cashflow).toEqual({});
  });
});

describe('pickName / pickAuditOpinion', () => {
  const payload: FinanceRawPayload = { raw: BS_SAMPLE, statement: 'bs' };

  it('优先取 securityNameAbbr', () => {
    expect(pickName(payload, 'fallback')).toBe('贵州茅台');
  });
  it('都没有时回落 fallback', () => {
    expect(pickName({ raw: {} }, '600519')).toBe('600519');
  });
  it('审计意见可取出，缺失为 undefined', () => {
    expect(pickAuditOpinion(payload)).toBe('标准无保留意见');
    expect(pickAuditOpinion({ raw: {} })).toBeUndefined();
  });
});
