import type {
  AnalysisContext,
  AnalysisResult,
  AnomalySignal,
  ChartSpec,
  DomainId,
} from '@/engine';
import { sameQuarterYoyOf, yoyOf } from '@/engine/methods/columns';

// 六大问题域的页面编排：每个域 = 模版附注 + KPI 行 + 突变信号 + 一张核心图 +（可选）方法模块。
// 这是「每个行业一个模版 × 固定检查方法」在页面层的落点：
// 域的取舍、KPI 的选择、图怎么画，全部由数据支撑（三表可算），不暴露配置给用户。

export type InsightResultAlias = AnalysisResult;

export interface DomainKpi {
  label: string;
  value: number | null;
  /** 展示格式 */
  format: 'pct' | 'x' | 'yi' | 'raw';
  meta?: string;
  spark: (number | null)[];
  formula: string;
}

export interface DomainChart {
  spec: ChartSpec;
  source: string;
}

export interface DomainSectionView {
  id: DomainId;
  name: string;
  question: string;
  /** 行业域附注（行业模版 domains 命中） */
  note?: string;
  kpis: DomainKpi[];
  /** 该域的突变信号（已按问题域过滤、按严重度排序，取前 4） */
  signals: AnomalySignal[];
  chart: DomainChart | null;
  /** 追加图表（如增长来源瀑布等由方法模块携带，走 insights；这里放域内第二张图） */
  charts: DomainChart[];
  /** 该域的方法模块结果（回灌引擎深度：每域挂满对应 run* 模块） */
  insights: InsightResultAlias[];
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function div(a: number | null, b: number | null): number | null {
  return a == null || b == null || b === 0 ? null : a / b;
}

function seriesOf(reports: AnalysisContext['dataset']['reports'], pick: (r: (typeof reports)[number]) => unknown): (number | null)[] {
  return reports.map((r) => num(pick(r)));
}

function ratioSeries(reports: AnalysisContext['dataset']['reports'], a: (r: (typeof reports)[number]) => unknown, b: (r: (typeof reports)[number]) => unknown): (number | null)[] {
  return reports.map((r) => div(num(a(r)), num(b(r))));
}

/** 百分比刻度：自适应小数位（研发费用率 0.06%~0.13% 需 2~3 位，toFixed(1) 会塌成直线） */
function pctSeries(xs: (number | null)[]): (number | null)[] {
  const finite = xs.filter((v): v is number => v != null && Number.isFinite(v)).map((v) => v * 100);
  const maxAbs = finite.length ? Math.max(...finite.map(Math.abs)) : 0;
  const digits = maxAbs < 0.5 ? 3 : maxAbs < 5 ? 2 : 1;
  return xs.map((v) => (v == null ? null : +(v * 100).toFixed(digits)));
}

/** 股数序列 → 亿股（share_capital 量纲是「股」，绝不能按金额折「亿元」） */
function yiSharesSeries(xs: (number | null)[]): (number | null)[] {
  return xs.map((v) => (v == null ? null : +(v / 1e8).toFixed(2)));
}

/** 金额刻度（亿元）：自适应小数位 */
function yiSeries(xs: (number | null)[]): (number | null)[] {
  const finite = xs.filter((v): v is number => v != null && Number.isFinite(v)).map((v) => v / 1e8);
  const maxAbs = finite.length ? Math.max(...finite.map(Math.abs)) : 0;
  const digits = maxAbs < 10 ? 2 : maxAbs < 100 ? 1 : 0;
  return xs.map((v) => (v == null ? null : +(v / 1e8).toFixed(digits)));
}

function periodLabels(ctx: AnalysisContext): string[] {
  return ctx.dataset.reports.map((r) => (r.sampling && r.sampling !== 'Q4' ? `${r.period.slice(0, 4)}Q${r.sampling.slice(1)}` : r.period.slice(0, 4)));
}

function kpi(label: string, value: number | null, format: DomainKpi['format'], spark: (number | null)[], formula: string, meta?: string): DomainKpi {
  return { label, value, format, spark, formula, meta };
}

// ── 各域 KPI 与核心图（全部由三表派生，0 额外 EC） ──

function operatingView(ctx: AnalysisContext, signals: AnomalySignal[], note?: string, insights: InsightResultAlias[] = []): DomainSectionView {
  const rs = ctx.dataset.reports;
  const arRatio = ratioSeries(rs, (r) => (num(r.balance.accounts_receivable) ?? 0) + (num(r.balance.notes_receivable) ?? 0), (r) => r.income.total_revenue);
  const invRatio = ratioSeries(rs, (r) => r.balance.inventories, (r) => r.income.total_revenue);
  const clcRatio = ratioSeries(rs, (r) => r.balance.contract_liabilities ?? r.balance.advance_receipts, (r) => r.income.total_revenue);
  const cashRatio = ratioSeries(rs, (r) => r.cashflow.cash_from_sales, (r) => r.income.total_revenue);
  const latestIdx = rs.length - 1;
  return {
    id: 'operating',
    name: '经营',
    question: '生意运转顺畅吗？营运资金被谁占用？',
    note,
    signals,
    kpis: [
      kpi('应收 / 营收', arRatio[latestIdx] ?? null, 'pct', pctSeries(arRatio), '（应收票据 + 应收账款）÷ 营业总收入；越低说明下游占款越少'),
      kpi('存货 / 营收', invRatio[latestIdx] ?? null, 'pct', pctSeries(invRatio), '存货 ÷ 营业总收入；抬升 = 滞销或囤货'),
      kpi('合同负债 / 营收', clcRatio[latestIdx] ?? null, 'pct', pctSeries(clcRatio), '合同负债（缺则用预收）÷ 营业总收入；先款后货生意的需求蓄水池'),
      kpi('收现比', cashRatio[latestIdx] ?? null, 'x', cashRatio, '销售收现 ÷ 营业总收入；≈1.1（含增值税）为健康'),
    ],
    chart: {
      spec: {
        type: 'line',
        title: '营运资金占营收',
        unit: '%',
        yFormat: 'percent',
        categories: periodLabels(ctx),
        series: [
          { name: '应收/营收', data: pctSeries(arRatio) },
          { name: '存货/营收', data: pctSeries(invRatio) },
          { name: '合同负债/营收', data: pctSeries(clcRatio) },
        ],
        note: '应收与存货抬升 = 被下游占用；合同负债抬升 = 预收在增加（需求前瞻）。',
      },
      source: '三表 · 派生',
    },
    charts: [],
    insights,
  };
}

function assetView(ctx: AnalysisContext, signals: AnomalySignal[], note?: string, insights: InsightResultAlias[] = []): DomainSectionView {
  const rs = ctx.dataset.reports;
  const cashShare = ratioSeries(rs, (r) => r.balance.monetary_funds, (r) => r.balance.total_assets);
  const ppeShare = ratioSeries(rs, (r) => r.balance.fixed_assets, (r) => r.balance.total_assets);
  const invShare = ratioSeries(rs, (r) => r.balance.inventories, (r) => r.balance.total_assets);
  const gwShare = ratioSeries(rs, (r) => r.balance.goodwill, (r) => r.balance.total_equity);
  const latestIdx = rs.length - 1;
  return {
    id: 'asset',
    name: '资产',
    question: '家底压在哪？资产质量实不实？',
    note,
    signals,
    kpis: [
      kpi('货币资金 / 总资产', cashShare[latestIdx] ?? null, 'pct', pctSeries(cashShare), '货币资金 ÷ 资产总计；现金家底厚度'),
      kpi('固定资产 / 总资产', ppeShare[latestIdx] ?? null, 'pct', pctSeries(ppeShare), '固定资产 ÷ 资产总计；重资产程度与折旧刚性'),
      kpi('商誉 / 净资产', gwShare[latestIdx] ?? null, 'pct', pctSeries(gwShare), '商誉 ÷ 所有者权益；>20% 需查并购业绩承诺'),
    ],
    chart: {
      spec: {
        type: 'line',
        title: '资产结构占比',
        unit: '%',
        yFormat: 'percent',
        categories: periodLabels(ctx),
        series: [
          { name: '货币资金', data: pctSeries(cashShare) },
          { name: '存货', data: pctSeries(invShare) },
          { name: '固定资产', data: pctSeries(ppeShare) },
        ],
        note: '钱压在现金、库存还是产能，决定资产的质量与弹性。',
      },
      source: '三表 · 派生',
    },
    charts: [],
    insights,
  };
}

function liabilityView(ctx: AnalysisContext, signals: AnomalySignal[], note?: string, insights: InsightResultAlias[] = []): DomainSectionView {
  const rs = ctx.dataset.reports;
  const debtRatio = ratioSeries(rs, (r) => r.balance.total_liabilities, (r) => r.balance.total_assets);
  const ibdRatio = ratioSeries(
    rs,
    (r) =>
      (num(r.balance.short_term_loans) ?? 0) +
      (num(r.balance.noncurrent_liab_1y) ?? 0) +
      (num(r.balance.long_term_loans) ?? 0) +
      (num(r.balance.bonds_payable) ?? 0) +
      (num(r.balance.lease_liabilities) ?? 0),
    (r) => r.balance.total_assets,
  );
  const currentRatio = ratioSeries(rs, (r) => r.balance.total_current_assets, (r) => r.balance.total_current_liabilities);
  const latestIdx = rs.length - 1;
  return {
    id: 'liability',
    name: '负债',
    question: '欠的钱压不压得住？杠杆安不安全？',
    note,
    signals,
    kpis: [
      kpi('资产负债率', debtRatio[latestIdx] ?? null, 'pct', pctSeries(debtRatio), '负债合计 ÷ 资产总计；区分有息与无息占款再判读'),
      kpi('有息负债率', ibdRatio[latestIdx] ?? null, 'pct', pctSeries(ibdRatio), '（短借 + 一年内到期 + 长借 + 应付债券 + 租赁负债）÷ 总资产'),
      kpi('流动比率', currentRatio[latestIdx] ?? null, 'x', currentRatio, '流动资产 ÷ 流动负债；<1 短期资金链紧张'),
    ],
    chart: {
      spec: {
        type: 'line',
        title: '杠杆水平',
        unit: '%',
        yFormat: 'percent',
        categories: periodLabels(ctx),
        series: [
          { name: '资产负债率', data: pctSeries(debtRatio) },
          { name: '有息负债率', data: pctSeries(ibdRatio) },
        ],
        note: '两条线的裂口 = 无息经营占款（应付/预收），裂口大说明杠杆主要来自产业链话语权。',
      },
      source: '三表 · 派生',
    },
    charts: [],
    insights,
  };
}

function equityView(ctx: AnalysisContext, signals: AnomalySignal[], note?: string, insights: InsightResultAlias[] = []): DomainSectionView {
  const rs = ctx.dataset.reports;
  const share = seriesOf(rs, (r) => r.balance.share_capital);
  const retained = seriesOf(rs, (r) => r.balance.retained_earnings);
  const equityParent = seriesOf(rs, (r) => r.balance.equity_parent ?? r.balance.total_equity);
  const roe = ctx.computed.metrics.map((m) => m.roe_parent);
  const latestIdx = rs.length - 1;
  const first = share.find((v) => v != null);
  const last = share[latestIdx] ?? null;
  return {
    id: 'equity',
    name: '股东权益',
    question: '股本有没有被稀释？利润有没有留下来？',
    note,
    signals,
    kpis: [
      kpi('ROE（归母）', roe[latestIdx] ?? null, 'pct', pctSeries(roe), '归母净利润 ÷ 归母股东权益；净资产的回报效率'),
      kpi('未分配利润', retained[latestIdx] != null ? retained[latestIdx]! / 1e8 : null, 'yi', yiSeries(retained), '历年留存利润（亿元）；转负 = 累积亏损吞噬家底'),
      kpi('股本区间变动', first != null && last != null && first > 0 ? last / first - 1 : null, 'pct', yiSharesSeries(share), '区间首 → 末总股本变动（spark 为股本规模，亿股）；>10% 需查增发/送转'),
      kpi('归母净资产', equityParent[latestIdx] != null ? equityParent[latestIdx]! / 1e8 : null, 'yi', yiSeries(equityParent), '归属母公司股东的净资产（亿元）；ROE 的分母'),
    ],
    chart: {
      spec: {
        type: 'bar',
        title: '股东权益构成',
        unit: '亿元 / 亿股',
        categories: periodLabels(ctx),
        series: [
          { name: '未分配利润（亿）', as: 'bar', data: yiSeries(retained) },
          { name: '归母净资产（亿）', as: 'line', data: yiSeries(equityParent) },
          { name: '股本（亿股）', as: 'bar', data: yiSharesSeries(share) },
        ],
        note: '净资产靠利润积累（未分配利润涨）还是靠增发（股本涨），决定回报质量。注意：股本单位是亿股，与金额柱不可直接比大小。',
      },
      source: '三表 · 派生',
    },
    charts: [],
    insights,
  };
}

function profitView(ctx: AnalysisContext, signals: AnomalySignal[], note?: string, insights: InsightResultAlias[] = []): DomainSectionView {
  const metrics = ctx.computed.metrics;
  const labels = periodLabels(ctx);
  const revenue = seriesOf(ctx.dataset.reports, (r) => r.income.total_revenue);
  const npParent = seriesOf(ctx.dataset.reports, (r) => r.income.net_profit_parent);
/** 营收同比：年度相邻比；季报单季序列走同季对比（相邻比是环比） */
  const revGrowth: (number | null)[] = ctx.dataset.reports.some((r) => r.sampling && r.sampling !== 'Q4')
    ? sameQuarterYoyOf(ctx.dataset.reports, revenue)
    : yoyOf(revenue);
  const latestIdx = metrics.length - 1;
  return {
    id: 'profit',
    name: '利润',
    question: '赚不赚钱？量价与费用发生了什么？',
    note,
    signals,
    kpis: [
      kpi('营收同比', revGrowth[latestIdx] ?? null, 'pct', pctSeries(revGrowth), '本期 ÷ 上期 − 1；季度口径为同季对比'),
      kpi('毛利率', metrics[latestIdx]?.gross_margin ?? null, 'pct', pctSeries(metrics.map((m) => m.gross_margin)), '(营业总收入 − 营业成本) ÷ 营业总收入；议价权刻度'),
      kpi('归母净利率', metrics[latestIdx]?.net_margin_parent ?? null, 'pct', pctSeries(metrics.map((m) => m.net_margin_parent)), '归母净利润 ÷ 营业总收入'),
      kpi('归母净利润', npParent[latestIdx] != null ? npParent[latestIdx]! / 1e8 : null, 'yi', yiSeries(npParent), '归属母公司股东的净利润（亿元）'),
    ],
    chart: {
      spec: {
        type: 'bar',
        title: '规模与利润率',
        unit: '亿元 / %',
        categories: labels,
        series: [
          { name: '营业总收入', as: 'bar', data: yiSeries(revenue) },
          { name: '归母净利润', as: 'line', data: yiSeries(npParent) },
          { name: '毛利率', as: 'line', data: pctSeries(metrics.map((m) => m.gross_margin)) },
        ],
        note: '柱看规模，线看利润与毛利率方向；毛利与营收背离时优先查成本与产品结构。',
      },
      source: '利润表 · 派生',
    },
    charts: [],
    insights,
  };
}

function cashflowView(ctx: AnalysisContext, signals: AnomalySignal[], note?: string, insights: InsightResultAlias[] = []): DomainSectionView {
  const rs = ctx.dataset.reports;
  const metrics = ctx.computed.metrics;
  const cfo = seriesOf(rs, (r) => r.cashflow.net_cash_operating);
  const capex = seriesOf(rs, (r) => r.cashflow.capex_cash);
  const fcf = cfo.map((v, i) => (v == null ? null : v - (capex[i] ?? 0)));
  const cfoNp = metrics.map((m) => m.cfo_to_net_profit);
  const latestIdx = rs.length - 1;
  return {
    id: 'cashflow',
    name: '现金流',
    question: '利润是不是真金白银？钱从哪来到哪去？',
    note,
    signals,
    kpis: [
      kpi('CFO / 归母净利', cfoNp[latestIdx] ?? null, 'x', cfoNp, '经营现金流净额 ÷ 归母净利润；≥1 利润落袋'),
      kpi('自由现金流 FCF', fcf[latestIdx] != null ? fcf[latestIdx]! / 1e8 : null, 'yi', yiSeries(fcf), 'CFO − 购建长期资产现金（亿元）'),
      kpi('收现比', div(num(rs[latestIdx]?.cashflow.cash_from_sales), num(rs[latestIdx]?.income.total_revenue)), 'x', ratioSeries(rs, (r) => r.cashflow.cash_from_sales, (r) => r.income.total_revenue), '销售收现 ÷ 营业总收入'),
    ],
    chart: {
      spec: {
        type: 'bar',
        title: '现金流含金量',
        unit: '亿元 / %',
        categories: periodLabels(ctx),
        series: [
          { name: '经营现金流', as: 'bar', data: yiSeries(cfo) },
          { name: '自由现金流', as: 'bar', data: yiSeries(fcf) },
          { name: 'CFO/归母净利', as: 'line', data: cfoNp },
        ],
        note: 'CFO 长期覆盖净利（线在 1 上方）才是真金白银；FCF 转负 = 在透支扩张。',
      },
      source: '现金流量表 · 派生',
    },
    charts: [],
    insights,
  };
}

/** 组装全部六域视图：突变按域过滤、阈值/附注走行业模版 */
export function domainSectionViews(ctx: AnalysisContext, signals: AnomalySignal[], tpl: { domains: Partial<Record<DomainId, string>> }, insights: Partial<Record<DomainId, InsightResultAlias[]>> = {}): DomainSectionView[] {
  const byDomain = new Map<DomainId, AnomalySignal[]>();
  for (const s of signals) {
    const list = byDomain.get(s.domain) ?? [];
    list.push(s);
    byDomain.set(s.domain, list);
  }
  const pick = (id: DomainId): AnomalySignal[] => (byDomain.get(id) ?? []).slice(0, 4);
  const note = (id: DomainId): string | undefined => tpl.domains[id];
  const ins = (id: DomainId): InsightResultAlias[] => insights[id] ?? [];
  return [
    operatingView(ctx, pick('operating'), note('operating'), ins('operating')),
    assetView(ctx, pick('asset'), note('asset'), ins('asset')),
    liabilityView(ctx, pick('liability'), note('liability'), ins('liability')),
    equityView(ctx, pick('equity'), note('equity'), ins('equity')),
    profitView(ctx, pick('profit'), note('profit'), ins('profit')),
    cashflowView(ctx, pick('cashflow'), note('cashflow'), ins('cashflow')),
  ];
}
