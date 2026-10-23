import { describe, expect, it } from 'vitest';
import { buildContext } from '@/engine';
import { dataset as moutai } from '@/data/samples/liquor/600519';
import type { PeriodReport, ReportDataset } from '../schema/types';
import {
  canUseRaw,
  comparableMetrics,
  metricComparisonSpec,
  statementMetricKey,
  statementMetrics,
  type ComparableMetric,
} from './compare';

function annual(
  year: string,
  values: { rev: number; cost: number; np: number; cfo: number; assets: number },
): PeriodReport {
  return {
    period: `${year}-12-31`,
    sampling: 'Q4',
    balance: {
      total_assets: values.assets,
      total_liabilities: values.assets * 0.4,
      inventories: values.assets * 0.1,
    },
    income: {
      total_revenue: values.rev,
      operating_cost: values.cost,
      selling_expense: values.rev * 0.1,
      net_profit: values.np,
      net_profit_parent: values.np,
    },
    cashflow: {
      net_cash_operating: values.cfo,
      cash_from_sales: values.rev * 1.05,
    },
  };
}

function buildDataset(reports: PeriodReport[]): ReportDataset {
  return {
    symbol: 'TEST',
    name: '测试公司',
    industry: 'general',
    periods: reports.map((report) => report.period),
    reports,
  };
}

const DS = buildDataset([
  annual('2021', { rev: 100e8, cost: 40e8, np: 10e8, cfo: 12e8, assets: 200e8 }),
  annual('2022', { rev: 110e8, cost: 44e8, np: 12e8, cfo: 9e8, assets: 220e8 }),
  annual('2023', { rev: 121e8, cost: 48e8, np: 15e8, cfo: 18e8, assets: 240e8 }),
]);
const CTX = buildContext({ dataset: DS, industry: 'general' });

function metricOf(key: string): ComparableMetric {
  const found = comparableMetrics(CTX).find((metric) => metric.key === key);
  if (!found) throw new Error(`missing metric ${key}`);
  return found;
}

describe('指标对比：指标目录与同比', () => {
  it('comparableMetrics 暴露逐期原值与同比', () => {
    const revenue = metricOf('revenue');
    expect(revenue.values).toEqual([100e8, 110e8, 121e8]);
    expect(revenue.growth[0]).toBeNull();
    expect(revenue.growth[1]).toBeCloseTo(0.1, 5);
    expect(revenue.growth[2]).toBeCloseTo(0.1, 5);
  });

  it('季度同比按同季，不拿 Q2 比 Q1', () => {
    const quarterly = buildDataset([
      {
        period: '2024-06-30',
        sampling: 'Q2',
        balance: { total_assets: 200e8 },
        income: { total_revenue: 100e8, operating_cost: 40e8, net_profit_parent: 10e8 },
        cashflow: { net_cash_operating: 12e8 },
      },
      {
        period: '2024-09-30',
        sampling: 'Q3',
        balance: { total_assets: 210e8 },
        income: { total_revenue: 120e8, operating_cost: 48e8, net_profit_parent: 12e8 },
        cashflow: { net_cash_operating: 14e8 },
      },
      {
        period: '2025-06-30',
        sampling: 'Q2',
        balance: { total_assets: 220e8 },
        income: { total_revenue: 130e8, operating_cost: 52e8, net_profit_parent: 13e8 },
        cashflow: { net_cash_operating: 15e8 },
      },
      {
        period: '2025-09-30',
        sampling: 'Q3',
        balance: { total_assets: 230e8 },
        income: { total_revenue: 150e8, operating_cost: 60e8, net_profit_parent: 15e8 },
        cashflow: { net_cash_operating: 17e8 },
      },
    ]);
    const ctx = buildContext({ dataset: quarterly, industry: 'general' });
    const revenue = comparableMetrics(ctx).find((metric) => metric.key === 'revenue');
    expect(revenue?.growth[2]).toBeCloseTo(0.3, 5);
    expect(revenue?.growth[3]).toBeCloseTo(0.25, 5);

    const spec = metricComparisonSpec(quarterly.reports, revenue ? [revenue] : [], 'growth');
    expect(spec.categories).toEqual(['2024Q2', '2024Q3', '2025Q2', '2025Q3']);
    expect(spec.series?.[0].data).toEqual([null, null, 30, 25]);

    const operatingCost = statementMetrics(ctx).find((metric) => metric.key === 'stmt:income:OC');
    expect(operatingCost?.growth[2]).toBeCloseTo(0.3, 5);
  });
});

describe('指标对比：三种模式', () => {
  it('基期=100：各指标首个有效值为 100，参考线 100', () => {
    const spec = metricComparisonSpec(DS.reports, [metricOf('revenue'), metricOf('net_profit_parent')], 'index');
    expect(spec.title).toContain('基期=100');
    expect(spec.series?.[0].data).toEqual([100, 110, 121]);
    expect(spec.refLines?.[0]).toMatchObject({ value: 100, kind: 'median' });
  });

  it('基期为负数：该序列整体留空并写明原因', () => {
    const bad: ComparableMetric = {
      key: 'bad',
      name: '负基期',
      unit: 'ratio',
      values: [-10, 5, 8],
      growth: [null, null, null],
    };
    const spec = metricComparisonSpec(DS.reports, [bad], 'index');
    expect(spec.series?.[0].data).toEqual([null, null, null]);
    expect(spec.note).toContain('基期为 0 或负数');
  });

  it('原值模式：单轴 / 双轴 / 3 种单位降级', () => {
    expect(canUseRaw([metricOf('revenue'), metricOf('net_profit_parent')])).toBe(true);
    expect(canUseRaw([metricOf('revenue'), metricOf('gross_margin')])).toBe(true);
    expect(
      canUseRaw([metricOf('revenue'), metricOf('gross_margin'), metricOf('cfo_to_np')]),
    ).toBe(false);

    const raw = metricComparisonSpec(DS.reports, [metricOf('revenue')], 'raw');
    expect(raw.unit).toBe('亿元');
    expect(raw.series?.[0].data).toEqual([100, 110, 121]);

    const dual = metricComparisonSpec(
      DS.reports,
      [metricOf('revenue'), metricOf('gross_margin')],
      'raw',
    );
    expect(dual.title).toContain('双轴');
    expect(dual.unit).toBe('亿元');
    expect(dual.yLabelRight).toBe('%');
    expect(dual.yFormatRight).toBe('percent');
    expect(dual.series).toHaveLength(2);
    expect(dual.series?.[0].axis).toBe('left');
    expect(dual.series?.[1].axis).toBe('right');
    expect(dual.series?.[1].unit).toBe('%');
    expect(dual.series?.[1].data?.[0]).toBeCloseTo(60, 1);

    const three = metricComparisonSpec(
      DS.reports,
      [metricOf('revenue'), metricOf('gross_margin'), metricOf('cfo_to_np')],
      'raw',
    );
    expect(three.series).toEqual([]);
    expect(three.note).toContain('3 种以上');
  });

  it('指数模式明确标注非原值，序列单位是「指数」', () => {
    const spec = metricComparisonSpec(DS.reports, [metricOf('gross_margin')], 'index');
    expect(spec.title).toContain('非原值');
    expect(spec.unit).toBe('基期=100');
    expect(spec.series?.[0].unit).toBe('指数');
    expect(spec.note).toContain('不是 100%');
  });

  it('图形类型可切换线形 / 柱状', () => {
    expect(metricComparisonSpec(DS.reports, [metricOf('revenue')], 'raw', 'line').type).toBe('line');
    expect(metricComparisonSpec(DS.reports, [metricOf('revenue')], 'raw', 'bar').type).toBe('bar');
  });

  it('缺失保持 null，不按 0 补齐', () => {
    const withHole = buildDataset([
      annual('2021', { rev: 100e8, cost: 40e8, np: 10e8, cfo: 12e8, assets: 200e8 }),
      {
        period: '2022-12-31',
        sampling: 'Q4',
        balance: { total_assets: 220e8 },
        income: { operating_cost: 44e8, net_profit_parent: 12e8 },
        cashflow: {},
      },
      annual('2023', { rev: 121e8, cost: 48e8, np: 15e8, cfo: 18e8, assets: 240e8 }),
    ]);
    const ctx = buildContext({ dataset: withHole, industry: 'general' });
    const revenue = comparableMetrics(ctx).find((metric) => metric.key === 'revenue');
    const spec = metricComparisonSpec(withHole.reports, revenue ? [revenue] : [], 'index');
    expect(spec.series?.[0].data?.[1]).toBeNull();
  });
});

describe('三表任选科目目录', () => {
  it('覆盖三张报表，单位正确，且排除 5 个常用重复行', () => {
    const items = statementMetrics(CTX);
    expect(items.some((metric) => metric.statement === 'income')).toBe(true);
    expect(items.some((metric) => metric.statement === 'balance')).toBe(true);
    expect(items.some((metric) => metric.statement === 'cashflow')).toBe(true);

    const operatingCost = items.find((metric) => metric.key === 'stmt:income:OC');
    expect(operatingCost?.name).toBe('营业成本');
    expect(operatingCost?.unit).toBe('currency');
    expect(operatingCost?.values).toEqual([40e8, 44e8, 48e8]);
    expect(operatingCost?.growth[1]).toBeCloseTo(0.1, 5);

    expect(items.find((metric) => metric.key === 'stmt:balance:LD')?.unit).toBe('ratio');
    expect(items.find((metric) => metric.key === 'stmt:income:SEXE')?.unit).toBe('currency');

    // 5 个常用行不在三表目录里重复出现
    expect(items.find((metric) => metric.key === 'stmt:income:TR')).toBeUndefined();
    expect(items.find((metric) => metric.key === 'stmt:income:GM')).toBeUndefined();
    expect(items.find((metric) => metric.key === 'stmt:income:NPP')).toBeUndefined();
    expect(items.find((metric) => metric.key === 'stmt:balance:TA')).toBeUndefined();
    expect(items.find((metric) => metric.key === 'stmt:cashflow:NCFO')).toBeUndefined();

    // 图例按 name 识别，名称必须唯一
    const names = items.map((metric) => metric.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('statementMetricKey：5 个常用行映射回常用 key，其余保持三表 key', () => {
    expect(statementMetricKey('income', 'TR')).toBe('revenue');
    expect(statementMetricKey('income', 'GM')).toBe('gross_margin');
    expect(statementMetricKey('income', 'NPP')).toBe('net_profit_parent');
    expect(statementMetricKey('balance', 'TA')).toBe('total_assets');
    expect(statementMetricKey('cashflow', 'NCFO')).toBe('cfo');
    expect(statementMetricKey('income', 'OC')).toBe('stmt:income:OC');
  });

  it('三表科目可直接进入原值/基期=100 对比', () => {
    const items = statementMetrics(CTX);
    const operatingCost = items.find((metric) => metric.key === 'stmt:income:OC');
    const netProfit = items.find((metric) => metric.key === 'stmt:income:NP');
    expect(operatingCost && netProfit).toBeTruthy();

    const raw = metricComparisonSpec(DS.reports, [operatingCost!, netProfit!], 'raw');
    expect(raw.unit).toBe('亿元');
    expect(raw.series).toHaveLength(2);
    expect(raw.series?.[0].data).toEqual([40, 44, 48]);
    expect(raw.series?.[1].data).toEqual([10, 12, 15]);

    const indexed = metricComparisonSpec(DS.reports, [operatingCost!], 'index');
    expect(indexed.series?.[0].data).toEqual([100, 110, 120]);
  });

  it('整行无数据的科目保留，让 UI 标「无数据」而不是假装可选', () => {
    const items = statementMetrics(CTX);
    const zeroReceivable = items.find((metric) => metric.key === 'stmt:balance:FRRE');
    expect(zeroReceivable).toBeDefined();
    expect(zeroReceivable?.values.every((value) => value == null)).toBe(true);
  });
});

describe('毛利率口径回归（用户实测）', () => {
  it('茅台毛利率是 91.3%；指数 100 不是毛利率 100%', () => {
    const ctx = buildContext({ dataset: moutai, industry: 'liquor' });
    const gm = comparableMetrics(ctx).find((metric) => metric.key === 'gross_margin');
    expect(gm).toBeDefined();
    if (!gm) throw new Error('missing gross_margin');

    const last = gm.values[gm.values.length - 1];
    expect(last).toBeCloseTo(0.913, 3);

    const raw = metricComparisonSpec(moutai.reports, [gm], 'raw');
    const rawData = raw.series?.[0].data ?? [];
    expect(rawData[rawData.length - 1]).toBeCloseTo(91.3, 1);

    const indexed = metricComparisonSpec(moutai.reports, [gm], 'index');
    expect(indexed.title).toContain('非原值');
    expect(indexed.unit).toBe('基期=100');
    expect(indexed.series?.[0].unit).toBe('指数');
  });
});
