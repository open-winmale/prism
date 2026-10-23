import type { AnalysisContext, ChartSpec, ChartValueFormat } from '../analysis/define';
import type { Num, PeriodReport } from '../schema/types';
import { STMT_TREE } from '../derivations';
import { reportLabel } from '../utils';
import { lineItemValues, sameQuarterYoyOf, yoyOf } from './columns';

// 指标对比：把「同一家公司、多个指标」放到一张图里。
//
// 三条硬口径：
//   1. 量纲不同不硬塞同一根轴——统一走「基期=100」，或用同比%（都是无单位变化率）。
//   2. 季度同比必须同季（sameQuarterYoyOf），不能拿 Q2 比 Q1。
//   3. 基期为 0/负数时无法指数化：该序列整体留空并写明原因，绝不按 0 补齐。
//
// 指标来源两层：
//   - comparableMetrics：10 个常用派生指标（营收/净利/CFO/ROE/毛利率…），供概览预置图与默认选择；
//   - statementMetrics：三张报表的全部科目（含小计/合计/比率行），供「任选指标」。
//     两者都产出同一个 ComparableMetric，图表层无需区分来源。

export type MetricUnit = 'currency' | 'percent' | 'ratio';
export type CompareMode = 'index' | 'growth' | 'raw';
export type StatementKey = 'income' | 'balance' | 'cashflow';

export const STATEMENT_LABELS: Record<StatementKey, string> = {
  income: '利润表',
  balance: '资产负债表',
  cashflow: '现金流量表',
};

export interface ComparableMetric {
  key: string;
  name: string;
  unit: MetricUnit;
  /** 逐期原值（元 / 小数 / 倍数） */
  values: Num[];
  /** 逐期同比（小数）；季度口径为同季同比 */
  growth: Num[];
  /** 三表科目来源；常用派生指标为 undefined */
  statement?: StatementKey;
  /** 小计/合计行（如「三、营业利润」） */
  section?: boolean;
}

function isQuarterly(ctx: AnalysisContext): boolean {
  return ctx.dataset.reports.some((report) => (report.sampling ?? 'Q4') !== 'Q4');
}

function growthOf(ctx: AnalysisContext, values: Num[]): Num[] {
  return isQuarterly(ctx) ? sameQuarterYoyOf(ctx.dataset.reports, values) : yoyOf(values);
}

/** 常用指标目录：货币类、百分比类、比率类，覆盖概览最常看的 10 个维度 */
export function comparableMetrics(ctx: AnalysisContext): ComparableMetric[] {
  const reports = ctx.dataset.reports;
  const metrics = ctx.computed.metrics;

  const defs: { key: string; name: string; unit: MetricUnit; values: Num[] }[] = [
    { key: 'revenue', name: '营业总收入', unit: 'currency', values: reports.map((r) => r.income.total_revenue ?? null) },
    { key: 'net_profit_parent', name: '归母净利润', unit: 'currency', values: reports.map((r) => r.income.net_profit_parent ?? null) },
    { key: 'cfo', name: '经营现金流净额', unit: 'currency', values: reports.map((r) => r.cashflow.net_cash_operating ?? null) },
    { key: 'total_assets', name: '总资产', unit: 'currency', values: reports.map((r) => r.balance.total_assets ?? null) },
    { key: 'gross_margin', name: '毛利率', unit: 'percent', values: metrics.map((m) => m.gross_margin) },
    { key: 'net_margin', name: '归母净利率', unit: 'percent', values: metrics.map((m) => m.net_margin_parent) },
    { key: 'roe', name: '归母 ROE', unit: 'percent', values: metrics.map((m) => m.roe_parent) },
    { key: 'debt_ratio', name: '资产负债率', unit: 'percent', values: metrics.map((m) => m.debt_to_assets) },
    { key: 'cfo_to_np', name: 'CFO/归母净利', unit: 'ratio', values: metrics.map((m) => m.cfo_to_net_profit) },
    { key: 'inventory_turnover', name: '存货周转率', unit: 'ratio', values: metrics.map((m) => m.inventory_turnover) },
  ];

  return defs.map((def) => ({ ...def, growth: growthOf(ctx, def.values) }));
}

/**
 * 常用指标已经覆盖的三表行：从「三表科目」里排除，避免同一科目出现两次。
 * 图例按 name 识别，同名序列会互相覆盖，所以这里必须去重。
 */
const CURATED_STMT_KEYS: Record<StatementKey, string[]> = {
  income: ['TR', 'GM', 'NPP'],
  balance: ['TA'],
  cashflow: ['NCFO'],
};

/** 三表行 → 对比目录 key（5 个常用行落到常用指标 key） */
const CURATED_KEY_BY_STMT: Record<string, string> = {
  'income:TR': 'revenue',
  'income:GM': 'gross_margin',
  'income:NPP': 'net_profit_parent',
  'balance:TA': 'total_assets',
  'cashflow:NCFO': 'cfo',
};

export function statementMetricKey(statement: StatementKey, rowKey: string): string {
  return CURATED_KEY_BY_STMT[`${statement}:${rowKey}`] ?? `stmt:${statement}:${rowKey}`;
}

/**
 * 三张报表的全部可选科目（含小计/合计行与比率行）。
 * - 单位：pct 行为百分比；流动/速动比率为倍数；其余金额为元。
 * - 缺失保持 null；整行都缺的科目仍保留（选择器里标记「无数据」并禁用）。
 * - 不含常用指标已覆盖的 5 行（TR/GM/NPP/TA/NCFO），它们去「常用指标」选。
 */
export function statementMetrics(ctx: AnalysisContext): ComparableMetric[] {
  const reports = ctx.dataset.reports;
  const out: ComparableMetric[] = [];
  const statements: StatementKey[] = ['income', 'balance', 'cashflow'];

  for (const statement of statements) {
    const excluded = new Set(CURATED_STMT_KEYS[statement]);
    for (const row of STMT_TREE[statement]) {
      if (excluded.has(row.k)) continue;
      const values = lineItemValues(reports, row);
      const unit: MetricUnit = row.pct ? 'percent' : row.k === 'LD' || row.k === 'SD' ? 'ratio' : 'currency';
      out.push({
        key: `stmt:${statement}:${row.k}`,
        name: row.cn.trim(),
        unit,
        values,
        growth: growthOf(ctx, values),
        statement,
        section: Boolean(row.section),
      });
    }
  }

  return out;
}

/** 原值模式：最多两种单位（单轴或双轴）；三种以上请用基期=100/同比 */
export function canUseRaw(metrics: ComparableMetric[]): boolean {
  if (!metrics.length) return false;
  return unitOrderOf(metrics).length <= 2;
}

function unitOrderOf(metrics: ComparableMetric[]): MetricUnit[] {
  const out: MetricUnit[] = [];
  for (const metric of metrics) {
    if (!out.includes(metric.unit)) out.push(metric.unit);
  }
  return out;
}

function round(value: number | null, digits: number): number | null {
  return value == null || !Number.isFinite(value) ? null : Number(value.toFixed(digits));
}

function rawScale(unit: MetricUnit): { divisor: number; digits: number; label: string; format?: ChartValueFormat } {
  if (unit === 'currency') return { divisor: 1e8, digits: 1, label: '亿元' };
  if (unit === 'percent') return { divisor: 1, digits: 1, label: '%', format: 'percent' };
  return { divisor: 1, digits: 2, label: '倍', format: 'ratio' };
}

function rawValue(value: Num, unit: MetricUnit): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const scale = rawScale(unit);
  const divided = value / scale.divisor;
  // 百分比数据内部是小数，展示时 ×100
  return round(unit === 'percent' ? divided * 100 : divided, scale.digits);
}

export type ChartKind = 'line' | 'bar';

/**
 * 生成对比图。
 * index：各指标首个有效正值 = 100（跨量纲同一把尺子；指数不是百分比）。
 * growth：同比 %，季度走同季。
 * raw：最多两种单位；一种单轴，两种左右双轴，货币换算亿元。
 */
export function metricComparisonSpec(
  reports: PeriodReport[],
  metrics: ComparableMetric[],
  mode: CompareMode,
  chartKind: ChartKind = 'line',
): ChartSpec {
  const labels = reports.map(reportLabel);
  const usable = metrics.filter((metric) => metric.values.some((value) => value != null));

  if (!usable.length) {
    return {
      type: chartKind,
      title: '指标对比',
      categories: labels,
      series: [],
      note: '所选指标暂无数据。',
    };
  }

  if (mode === 'growth') {
    return {
      type: chartKind,
      title: '指标对比 · 同比',
      unit: '%',
      yFormat: 'percent',
      categories: labels,
      refLines: [{ value: 0, label: '0%', kind: 'zero' }],
      note: '逐期同比；季度口径按同季对比。首期无同比，保持缺失。',
      series: usable.map((metric) => ({
        name: metric.name,
        data: metric.growth.map((value) => round(value == null ? null : value * 100, 1)),
        unit: '%',
      })),
    };
  }

  if (mode === 'raw') {
    const units = unitOrderOf(usable);

    if (units.length > 2) {
      return {
        type: chartKind,
        title: '指标对比 · 原值',
        categories: labels,
        series: [],
        note: '所选指标有 3 种以上单位，不能放在两根轴上；请切换「基期=100」或「同比」。',
      };
    }

    if (units.length === 2) {
      const [leftUnit, rightUnit] = units;
      const left = rawScale(leftUnit);
      const right = rawScale(rightUnit);
      return {
        type: chartKind,
        title: '指标对比 · 原值（双轴）',
        unit: left.label,
        yFormat: left.format,
        yLabelRight: right.label,
        yFormatRight: right.format,
        categories: labels,
        note: `双轴：左 ${left.label} · 右 ${right.label}；每个序列保留自己的单位。`,
        series: usable.map((metric) => ({
          name: metric.name,
          data: metric.values.map((value) => rawValue(value, metric.unit)),
          axis: metric.unit === rightUnit ? ('right' as const) : ('left' as const),
          unit: rawScale(metric.unit).label,
        })),
      };
    }

    const unit = units[0];
    const scale = rawScale(unit);
    return {
      type: chartKind,
      title: '指标对比 · 原值',
      unit: scale.label,
      yFormat: scale.format,
      categories: labels,
      note:
        unit === 'currency'
          ? '原值统一换算亿元。'
          : unit === 'percent'
            ? '百分比原值；不是指数。'
            : '倍数为原值。',
      series: usable.map((metric) => ({
        name: metric.name,
        data: metric.values.map((value) => rawValue(value, metric.unit)),
        unit: scale.label,
      })),
    };
  }

  let hasInvalidBase = false;
  const series = usable.map((metric) => {
    const first = metric.values.find((value) => value != null);
    if (first == null || first <= 0) {
      hasInvalidBase = true;
      return { name: metric.name, data: metric.values.map(() => null) };
    }
    return {
      name: metric.name,
      data: metric.values.map((value) => round(value == null ? null : (value / first) * 100, 1)),
    };
  });

  return {
    type: chartKind,
    title: '指标对比 · 基期=100（非原值）',
    unit: '基期=100',
    categories: labels,
    refLines: [{ value: 100, label: '基期 100', kind: 'median' }],
    note: hasInvalidBase
      ? '部分指标基期为 0 或负数，无法指数化，已留空（不按 0 补齐）。其余指标以各自首个有效值为 100；指数不是百分比。'
      : '各指标以首个有效值为 100；只比较相对变化，不比较绝对规模。指数 100 表示与基期持平，不是 100%。',
    series: series.map((item) => ({ ...item, unit: '指数' })),
  };
}
