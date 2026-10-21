import type { AnalysisContext, AnalysisModule, AnalysisResult, InsightBlock } from './define';
import type { Num, PeriodReport } from '../schema/types';
import { fieldGetter } from '../compute';

// 质量模型：Altman Z / Piotroski F9 / Sloan 应计 / SGR / ROIC−WACC
// 目的不是给公司「定罪」，而是把「财务安全、经营改善、增长是否透支、资本回报是否覆盖资金成本」
// 变成可复核的检查项。缺输入一律 null / 不计分，不猜。
// 来源：Altman (1968)、Piotroski (2000)、Sloan (1996)、ROIC/WACC 标准口径。

function isNum(v: Num | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function last<T>(items: T[]): T | undefined {
  return items[items.length - 1];
}

function prev<T>(items: T[]): T | undefined {
  return items[items.length - 2];
}

function latestTwoReports(ctx: AnalysisContext): { cur: PeriodReport; prev: PeriodReport | null } | null {
  const cur = last(ctx.dataset.reports);
  if (!cur) return null;
  return { cur, prev: prev(ctx.dataset.reports) ?? null };
}

interface AltmanResult {
  z: number | null;
  zone: 'safe' | 'grey' | 'distress' | 'na';
  x1: number | null;
  x2: number | null;
  x3: number | null;
  x4: number | null;
  x5: number | null;
  missing: string[];
}

function altman(ctx: AnalysisContext, report: PeriodReport | null): AltmanResult {
  const missing: string[] = [];
  if (!report) return { z: null, zone: 'na', x1: null, x2: null, x3: null, x4: null, x5: null, missing: ['报表'] };
  const g = fieldGetter(report);
  const ta = g('total_assets');
  const tl = g('total_liabilities');
  const tca = g('total_current_assets');
  const tcl = g('total_current_liabilities');
  const re = g('retained_earnings');
  const ebit = g('operating_profit');
  const rev = g('total_revenue');
  const mv = ctx.marketValue;

  if (!isNum(ta) || ta <= 0) missing.push('总资产');
  if (!isNum(tl) || tl <= 0) missing.push('总负债');
  if (!isNum(tca)) missing.push('流动资产');
  if (!isNum(tcl)) missing.push('流动负债');
  if (!isNum(re)) missing.push('未分配利润');
  if (!isNum(ebit)) missing.push('营业利润');
  if (!isNum(rev)) missing.push('营业总收入');
  if (!isNum(mv) || mv <= 0) missing.push('总市值');

  if (missing.length) {
    return { z: null, zone: 'na', x1: null, x2: null, x3: null, x4: null, x5: null, missing };
  }
  if (
    !isNum(ta) ||
    !isNum(tl) ||
    !isNum(tca) ||
    !isNum(tcl) ||
    !isNum(re) ||
    !isNum(ebit) ||
    !isNum(rev) ||
    !isNum(mv)
  ) {
    return { z: null, zone: 'na', x1: null, x2: null, x3: null, x4: null, x5: null, missing };
  }

  const x1 = (tca - tcl) / ta;
  const x2 = re / ta;
  const x3 = ebit / ta;
  const x4 = mv / tl;
  const x5 = rev / ta;
  const z = 1.2 * x1 + 1.4 * x2 + 3.3 * x3 + 0.6 * x4 + 1.0 * x5;
  const zone = z >= 2.99 ? 'safe' : z >= 1.81 ? 'grey' : 'distress';
  return { z, zone, x1, x2, x3, x4, x5, missing: [] };
}

interface PiotroskiItem {
  key: string;
  label: string;
  pass: boolean | null;
  evidence: string;
}

interface PiotroskiResult {
  score: number;
  checked: number;
  items: PiotroskiItem[];
}

function piotroski(cur: PeriodReport | null, prev: PeriodReport | null): PiotroskiResult | null {
  if (!cur) return null;
  const g = fieldGetter(cur);
  const p = prev ? fieldGetter(prev) : null;
  const ta = g('total_assets');
  const taPrev = p ? p('total_assets') : null;
  const np = g('net_profit_parent');
  const npPrev = p ? p('net_profit_parent') : null;
  const cfo = g('net_cash_operating');
  const tl = g('total_liabilities');
  const tlPrev = p ? p('total_liabilities') : null;
  const tca = g('total_current_assets');
  const tcl = g('total_current_liabilities');
  const tcaPrev = p ? p('total_current_assets') : null;
  const tclPrev = p ? p('total_current_liabilities') : null;
  const share = g('share_capital');
  const sharePrev = p ? p('share_capital') : null;
  const gm = isNum(g('total_revenue')) && isNum(g('operating_cost')) ? 1 - g('operating_cost')! / g('total_revenue')! : null;
  const gmPrev =
    p && isNum(p('total_revenue')) && isNum(p('operating_cost'))
      ? 1 - p('operating_cost')! / p('total_revenue')!
      : null;
  const turnover = isNum(ta) && ta > 0 && isNum(g('total_revenue')) ? g('total_revenue')! / ta : null;
  const turnoverPrev = isNum(taPrev) && taPrev > 0 && p && isNum(p('total_revenue')) ? p('total_revenue')! / taPrev : null;

  const roa = isNum(np) && isNum(ta) && ta > 0 ? np / ta : null;
  const roaPrev = isNum(npPrev) && isNum(taPrev) && taPrev > 0 ? npPrev / taPrev : null;
  const leverage = isNum(tl) && isNum(ta) && ta > 0 ? tl / ta : null;
  const leveragePrev = isNum(tlPrev) && isNum(taPrev) && taPrev > 0 ? tlPrev / taPrev : null;
  const currentRatio =
    isNum(tca) && isNum(tcl) && tcl > 0 ? tca / tcl : null;
  const currentRatioPrev =
    isNum(tcaPrev) && isNum(tclPrev) && tclPrev > 0 ? tcaPrev / tclPrev : null;

  const items: PiotroskiItem[] = [
    {
      key: 'roa_pos',
      label: 'ROA > 0',
      pass: roa == null ? null : roa > 0,
      evidence: roa == null ? '缺归母净利/总资产' : `${(roa * 100).toFixed(2)}%`,
    },
    {
      key: 'cfo_pos',
      label: '经营现金流 > 0',
      pass: isNum(cfo) ? cfo > 0 : null,
      evidence: isNum(cfo) ? `${(cfo / 1e8).toFixed(1)} 亿` : '缺经营现金流',
    },
    {
      key: 'roa_up',
      label: 'ROA 同比改善',
      pass: roa == null || roaPrev == null ? null : roa > roaPrev,
      evidence: roa == null || roaPrev == null ? '缺两期 ROA' : `${(roaPrev * 100).toFixed(2)}% → ${(roa * 100).toFixed(2)}%`,
    },
    {
      key: 'accrual',
      label: 'CFO > 归母净利（应计为负）',
      pass: isNum(cfo) && isNum(np) ? cfo > np : null,
      evidence: isNum(cfo) && isNum(np) ? `CFO ${(cfo / 1e8).toFixed(1)} 亿 vs 净利 ${(np / 1e8).toFixed(1)} 亿` : '缺 CFO/净利',
    },
    {
      key: 'leverage_down',
      label: '杠杆下降',
      pass: leverage == null || leveragePrev == null ? null : leverage < leveragePrev,
      evidence:
        leverage == null || leveragePrev == null
          ? '缺两期资产负债率'
          : `${(leveragePrev * 100).toFixed(1)}% → ${(leverage * 100).toFixed(1)}%`,
    },
    {
      key: 'current_up',
      label: '流动比率改善',
      pass: currentRatio == null || currentRatioPrev == null ? null : currentRatio > currentRatioPrev,
      evidence:
        currentRatio == null || currentRatioPrev == null
          ? '缺两期流动资产/负债'
          : `${currentRatioPrev.toFixed(2)} → ${currentRatio.toFixed(2)}`,
    },
    {
      key: 'no_issue',
      label: '未增发股本',
      pass: isNum(share) && isNum(sharePrev) ? share <= sharePrev : null,
      evidence: isNum(share) && isNum(sharePrev) ? `${(sharePrev / 1e8).toFixed(2)} 亿 → ${(share / 1e8).toFixed(2)} 亿` : '缺两期股本',
    },
    {
      key: 'gm_up',
      label: '毛利率改善',
      pass: gm == null || gmPrev == null ? null : gm > gmPrev,
      evidence: gm == null || gmPrev == null ? '缺两期毛利率' : `${(gmPrev * 100).toFixed(1)}% → ${(gm * 100).toFixed(1)}%`,
    },
    {
      key: 'turnover_up',
      label: '资产周转改善',
      pass: turnover == null || turnoverPrev == null ? null : turnover > turnoverPrev,
      evidence:
        turnover == null || turnoverPrev == null
          ? '缺两期营收/总资产'
          : `${turnoverPrev.toFixed(2)} → ${turnover.toFixed(2)}`,
    },
  ];

  const checked = items.filter((item) => item.pass != null).length;
  const score = items.filter((item) => item.pass === true).length;
  return { score, checked, items };
}

interface GrowthCapitalResult {
  sgr: number | null;
  actualGrowth: number | null;
  roic: number | null;
  wacc: number;
  spread: number | null;
  accrual: number | null;
  missing: string[];
}

function growthCapital(ctx: AnalysisContext, cur: PeriodReport | null, prevReport: PeriodReport | null): GrowthCapitalResult {
  const missing: string[] = [];
  const roe = last(ctx.computed.metrics)?.roe_parent ?? null;
  const accrual = last(ctx.computed.metrics)?.accrual_ta ?? null;
  const np = cur?.income.net_profit_parent ?? null;
  const mv = ctx.marketValue;
  const yieldRate = ctx.dividendYield;
  let sgr: number | null = null;
  if (isNum(roe) && isNum(np) && np > 0 && isNum(mv) && isNum(yieldRate)) {
    const payout = Math.min(1, Math.max(0, (yieldRate * mv) / np));
    sgr = roe * (1 - payout);
  } else {
    missing.push('SGR（需 ROE + 市值 + 股息率 + 归母净利）');
  }

  const rev = cur?.income.total_revenue ?? null;
  const revPrev = prevReport?.income.total_revenue ?? null;
  const actualGrowth = isNum(rev) && isNum(revPrev) && revPrev !== 0 ? rev / revPrev - 1 : null;
  if (actualGrowth == null) missing.push('营收同比');

  const g = cur ? fieldGetter(cur) : null;
  if (!g) {
    missing.push('报表');
    return { sgr, actualGrowth, roic: null, wacc: 0.05, spread: null, accrual, missing };
  }
  const ebit = g('operating_profit');
  const tax = g('income_tax');
  const pretax = g('total_profit');
  const tl = g('total_liabilities');
  const te = g('total_equity') ?? g('equity_parent');
  const cash = g('monetary_funds');
  let roic: number | null = null;
  if (isNum(ebit) && isNum(tax) && isNum(pretax) && pretax !== 0 && isNum(tl) && isNum(te) && isNum(cash)) {
    const taxRate = tax / pretax;
    const invested = tl + te - cash;
    if (invested > 0) roic = (ebit * (1 - taxRate)) / invested;
  }
  if (roic == null) missing.push('ROIC（需 EBIT/税/有息投入资本）');
  return { sgr, actualGrowth, roic, wacc: 0.05, spread: roic == null ? null : roic - 0.05, accrual, missing };
}

export function altmanZ(ctx: AnalysisContext): AltmanResult {
  return altman(ctx, latestTwoReports(ctx)?.cur ?? null);
}

export function piotroskiF(ctx: AnalysisContext): PiotroskiResult | null {
  const pair = latestTwoReports(ctx);
  return piotroski(pair?.cur ?? null, pair?.prev ?? null);
}

export function growthCapitalOf(ctx: AnalysisContext): GrowthCapitalResult {
  const pair = latestTwoReports(ctx);
  return growthCapital(ctx, pair?.cur ?? null, pair?.prev ?? null);
}

export function runQualityModels(ctx: AnalysisContext): AnalysisResult {
  const alt = altmanZ(ctx);
  const pio = piotroskiF(ctx);
  const gc = growthCapitalOf(ctx);
  const blocks: InsightBlock[] = [];
  const warnings: string[] = [];

  const altmanSeverity = alt.zone === 'distress' ? 'high' : alt.zone === 'grey' ? 'mid' : 'low';
  blocks.push({
    id: 'altman',
    title: `Altman Z-Score${alt.z == null ? '：数据不足' : ` ${alt.z.toFixed(2)}（${alt.zone === 'safe' ? '安全区' : alt.zone === 'grey' ? '灰色区' : '困境区'}）`}`,
    severity: alt.z == null ? 'info' : altmanSeverity,
    summary:
      alt.z == null
        ? `无法计算：缺 ${alt.missing.join('、')}。`
        : `Z=${alt.z.toFixed(2)}。分区：>2.99 安全、1.81–2.99 灰色、<1.81 困境。A 股使用原版制造业系数，仅作筛查参考，不是违约概率。`,
    charts: [
      {
        type: 'table',
        title: 'Altman 五因子',
        table: {
          columns: [
            { key: 'factor', cn: '因子' },
            { key: 'value', cn: '数值' },
            { key: 'meaning', cn: '含义' },
          ],
          rows: [
            { factor: 'X1 营运资本/总资产', value: fmt(alt.x1, 3), meaning: '短期流动性' },
            { factor: 'X2 留存收益/总资产', value: fmt(alt.x2, 3), meaning: '累计盈利' },
            { factor: 'X3 EBIT/总资产', value: fmt(alt.x3, 3), meaning: '经营盈利能力' },
            { factor: 'X4 市值/总负债', value: fmt(alt.x4, 3), meaning: '市场信心/杠杆' },
            { factor: 'X5 营收/总资产', value: fmt(alt.x5, 3), meaning: '资产周转' },
          ],
        },
      },
    ],
    details: [
      'Altman Z 对制造业最有效；银行、保险、地产、互联网平台不宜直接套用。',
      '市值缺失时（示例快照）不计算，不用账面权益替代。',
    ],
  });

  blocks.push({
    id: 'piotroski',
    title: pio ? `Piotroski F-Score：${pio.score}/${pio.checked}（已核查 ${pio.checked}/9 项）` : 'Piotroski F-Score：数据不足',
    severity: pio == null ? 'info' : pio.score <= 3 ? 'mid' : pio.score >= 7 ? 'low' : 'info',
    summary: pio
      ? `F-Score 衡量基本面改善：9 项中通过 ${pio.score} 项，${pio.checked} 项有数据。得分低不等于造假，得分高也不等于便宜；它是「经营是否在变好」的检查表。`
      : '缺两期报表，无法计算。',
    charts: pio
      ? [
          {
            type: 'table',
            title: 'Piotroski 九项',
            table: {
              columns: [
                { key: 'label', cn: '检查项' },
                { key: 'pass', cn: '结果' },
                { key: 'evidence', cn: '证据' },
              ],
              rows: pio.items.map((item) => ({
                label: item.label,
                pass: item.pass == null ? '数据不足' : item.pass ? '✓' : '✗',
                evidence: item.evidence,
              })),
            },
          },
        ]
      : [],
    details: ['Piotroski 原始样本偏制造业；对轻资产/金融企业只作参考。'],
  });

  blocks.push({
    id: 'growth_capital',
    title: '增长与资本回报',
    severity: gc.roic != null && gc.spread != null && gc.spread < 0 ? 'mid' : 'info',
    summary:
      `SGR（可持续增长率）${gc.sgr == null ? '数据不足' : pct(gc.sgr)}，实际营收增速 ${gc.actualGrowth == null ? '数据不足' : pct(gc.actualGrowth)}。` +
      `ROIC ${gc.roic == null ? '数据不足' : pct(gc.roic)}，WACC 基准 5%，利差 ${gc.spread == null ? '—' : `${(gc.spread * 100).toFixed(1)}pct`}。` +
      `Sloan 应计 ${gc.accrual == null ? '数据不足' : pct(gc.accrual, 2)}（负值更优）。`,
    charts: [
      {
        type: 'table',
        title: '增长质量与资本回报',
        table: {
          columns: [
            { key: 'metric', cn: '指标' },
            { key: 'value', cn: '当前' },
            { key: 'note', cn: '怎么读' },
          ],
          rows: [
            {
              metric: 'SGR = ROE × 留存率',
              value: gc.sgr == null ? '—' : pct(gc.sgr),
              note: '公司靠自身利润能支撑的增长速度；实际增速长期高于 SGR 往往依赖外部融资',
            },
            {
              metric: '实际营收增速',
              value: gc.actualGrowth == null ? '—' : pct(gc.actualGrowth),
              note: '与 SGR 对照，判断增长是否透支资产负债表',
            },
            {
              metric: 'ROIC',
              value: gc.roic == null ? '—' : pct(gc.roic),
              note: '投入资本回报率；低于 WACC 时，增长可能在毁灭价值',
            },
            {
              metric: 'ROIC − WACC',
              value: gc.spread == null ? '—' : `${(gc.spread * 100).toFixed(1)}pct`,
              note: 'WACC 采用 5% 固定基准（产品设定，不是公司真实资本成本）',
            },
            {
              metric: 'Sloan 应计/总资产',
              value: gc.accrual == null ? '—' : pct(gc.accrual, 2),
              note: '应计越高，利润越依赖会计估计；负值通常更健康',
            },
          ],
        },
      },
    ],
    details: ['WACC 固定 5% 是产品假设，用于半差法筛查；不能替代公司真实资本成本。'],
  });

  if (alt.missing.length) warnings.push(`Altman：缺 ${alt.missing.join('、')}`);
  if (gc.missing.length) warnings.push(`增长/回报：缺 ${gc.missing.join('、')}`);

  return {
    moduleId: 'qualityModels',
    moduleTitle: '质量模型',
    blocks,
    warnings: warnings.length ? warnings : undefined,
  };
}

function fmt(v: number | null, digits: number): string {
  return v == null ? '—' : v.toFixed(digits);
}

function pct(v: number, digits = 1): string {
  return `${(v * 100).toFixed(digits)}%`;
}

export const qualityModelsModule: AnalysisModule = {
  id: 'qualityModels',
  title: '质量模型',
  desc: 'Altman Z、Piotroski F9、Sloan 应计、SGR、ROIC−WACC：把财务安全与增长质量做成可复核的检查表。',
  problems: ['risk', 'profitability'],
  industries: [],
  run: runQualityModels,
};
