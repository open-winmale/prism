import type { AnalysisContext, AnalysisModule, AnalysisResult, InsightBlock } from './define';
import type { Num, PeriodReport } from '../schema/types';
import { fieldGetter } from '../compute';
import { periodLabel } from '../utils';

// 增长来源拆解：回答「资产变大，钱是从哪来的」。
// 口径来源（逐字引用自专业版资产库）：
//   恒等式     script/sys/metric/begin.xs:154   $STM = $SE + $TL + $MIN
//   贡献公式   script/assets/cn/company/导览.这个生意如何.md:59-63
//              $SE_PAR  = PICK($SE)/PICK($STM)  × AR($SE)   → 股东投的钱
//              $TL_PAR  = PICK($TL)/PICK($STM)  × AR($TL)   → 公司借的钱
//              $MIN_PAR = PICK($MIN)/PICK($STM) × AR($MIN)  → 少数股东投的钱
//              $STM_AR  = AR($STM)                          → 总资产年化增长率
// 注意：三项贡献是「年化增速的百分点贡献」，三项之和 = $STM_AR，不是归一到 100% 的占比。
// 在此基础上本模块叠加一条更直观的口径——总资产增量的绝对额构成（瀑布图）：
//   Δ总资产 = Δ负债 + Δ少数股东权益 + Δ留存收益(利润积累) + Δ股本(增发) + Δ其他
// 「其他」= 归母权益增量 − 留存收益增量 − 股本增量，即资本公积 / 库存股 / 其他综合收益等。
// 缺失传播：任一项缺则该项为 null，绝不按 0 补齐（缺失 ≠ 0）。

export interface GrowthDelta {
  key: string;
  label: string;
  value: number | null;
  /** 瀑布图用途：'total' 为首尾两根柱子 */
  role: 'total' | 'delta';
}

export interface GrowthSources {
  /** 观察区间（年数） */
  years: number;
  from: string;
  to: string;
  /** 瀑布图数据：期初总资产 → 各来源增量 → 期末总资产 */
  items: GrowthDelta[];
  /** 总资产增量 */
  totalDelta: number | null;
  /** 专业版口径：年化增速贡献（三项之和 = 总资产年化增速） */
  annualized: {
    taAr: number | null;
    seContrib: number | null;
    tlContrib: number | null;
    minContrib: number | null;
  };
  /** 主导地位判读；equity = 只能判到「归母权益整体」，缺留存收益/股本无法细分 */
  verdict: 'profit' | 'debt' | 'issuance' | 'minority' | 'equity' | 'na';
  /** 少数股东权益是恒等式倒轧出来的（源数据未直接披露） */
  minorityDerived: boolean;
  /** 归母权益能否细分到留存收益 / 股本 */
  equityDetail: boolean;
  missing: string[];
}

function isNum(v: Num | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function deltaOf(key: string, a: PeriodReport, b: PeriodReport): Num {
  const x = fieldGetter(b)(key);
  const y = fieldGetter(a)(key);
  if (x == null || y == null) return null;
  return x - y;
}

/** 年化增速：(末/首)^(1/年数) − 1；首末非正或年数不足 → null */
function annualRate(first: Num, last: Num, years: number): Num {
  if (!isNum(first) || !isNum(last) || first <= 0 || last <= 0 || years <= 0) return null;
  return Math.pow(last / first, 1 / years) - 1;
}

/**
 * 少数股东权益：优先直接取数；缺失时按恒等式倒轧。
 *   TA = TL + TE，TE = 归母权益 + 少数股东权益  ⇒  少数股东权益 = TA − TL − 归母权益
 * 这是会计恒等式的推导，不是估算；但三者任一缺失则放弃（缺失 ≠ 0）。
 */
function minorityAt(report: PeriodReport): { value: Num; derived: boolean } {
  const g = fieldGetter(report);
  const direct = g('minority_interest');
  if (direct != null) return { value: direct, derived: false };
  const ta = g('total_assets');
  const tl = g('total_liabilities');
  const se = g('equity_parent');
  if (ta == null || tl == null || se == null) return { value: null, derived: false };
  return { value: ta - tl - se, derived: true };
}

export function growthSourcesOf(ctx: AnalysisContext): GrowthSources {
  const reports = ctx.dataset.reports;
  const empty: GrowthSources = {
    years: 0,
    from: '—',
    to: '—',
    items: [],
    totalDelta: null,
    annualized: { taAr: null, seContrib: null, tlContrib: null, minContrib: null },
    verdict: 'na',
    minorityDerived: false,
    equityDetail: false,
    missing: ['至少两个报告期'],
  };
  if (reports.length < 2) return empty;

  const first = reports[0];
  const last = reports[reports.length - 1];
  const years = reports.length - 1;
  const missing: string[] = [];

  const taFirst = fieldGetter(first)('total_assets');
  const taLast = fieldGetter(last)('total_assets');
  if (!isNum(taFirst) || !isNum(taLast)) missing.push('总资产');

  const dTl = deltaOf('total_liabilities', first, last);
  const dRe = deltaOf('retained_earnings', first, last);
  const dShare = deltaOf('share_capital', first, last);
  const dSe = deltaOf('equity_parent', first, last);
  if (dTl == null) missing.push('负债合计');
  if (dSe == null) missing.push('归母权益');

  // 少数股东权益：优先直接取数；缺失时用恒等式倒轧（总资产 = 负债 + 归母权益 + 少数股东权益）。
  // 恒等式推导不是估算，但连恒等式输入都缺时只能 null。
  const minA = minorityAt(first);
  const minB = minorityAt(last);
  const minorityDerived = (minA.value != null && minA.derived) || (minB.value != null && minB.derived);
  const dMin = minA.value == null || minB.value == null ? null : minB.value - minA.value;

  // 归母权益能否细分到「利润积累 / 增发 / 其他」——多数样本不披露留存收益与股本
  const equityDetail = dRe != null && dShare != null;
  if (!equityDetail) {
    if (dRe == null) missing.push('未分配利润（归母权益无法细分）');
    if (dShare == null) missing.push('股本（归母权益无法细分）');
  }
  // 「其他」= 归母权益增量 − 留存收益增量 − 股本增量（资本公积 / 库存股 / 其他综合收益等）
  const dOther = equityDetail && dSe != null ? dSe - dRe! - dShare! : null;

  // 专业版口径：年化增速贡献 = 分项占比 × 分项年化增速
  const seA = fieldGetter(first)('equity_parent');
  const seB = fieldGetter(last)('equity_parent');
  const tlA = fieldGetter(first)('total_liabilities');
  const tlB = fieldGetter(last)('total_liabilities');
  const taAr = annualRate(taFirst, taLast, years);
  const arSe = annualRate(seA, seB, years);
  const arTl = annualRate(tlA, tlB, years);
  const arMin = annualRate(minA.value, minB.value, years);
  const seContrib = isNum(seB) && isNum(taLast) && taLast > 0 && isNum(arSe) ? (seB / taLast) * arSe : null;
  const tlContrib = isNum(tlB) && isNum(taLast) && taLast > 0 && isNum(arTl) ? (tlB / taLast) * arTl : null;
  const minContrib =
    isNum(minB.value) && isNum(taLast) && taLast > 0 && isNum(arMin) ? (minB.value / taLast) * arMin : null;

  // 主导判读：比较各来源的绝对增量（增发为负时不算投入）
  const cands: { key: GrowthSources['verdict']; v: number | null }[] = equityDetail
    ? [
        { key: 'debt', v: dTl },
        { key: 'minority', v: dMin },
        { key: 'profit', v: dRe },
        { key: 'issuance', v: dShare != null && dShare > 0 ? dShare : null },
      ]
    : [
        { key: 'debt', v: dTl },
        { key: 'minority', v: dMin },
        { key: 'equity', v: dSe },
      ];
  const positive = cands.filter((c) => c.v != null && c.v > 0).sort((a, b) => Math.abs(b.v!) - Math.abs(a.v!));
  const verdict: GrowthSources['verdict'] = positive.length ? positive[0].key : 'na';

  // 瀑布图：恒等式必须闭合，缺任何一项就整图不出（半张瀑布会让人误读成「只有这些来源」）
  const identityOk = isNum(taFirst) && isNum(taLast) && dTl != null && dSe != null && dMin != null;
  const items: GrowthDelta[] = [];
  if (identityOk) {
    items.push({ key: 'TA0', label: `${periodLabel(first.period)} 总资产`, value: taFirst, role: 'total' });
    items.push({ key: 'TL', label: '公司借的钱（负债）', value: dTl, role: 'delta' });
    items.push({ key: 'MIN', label: '少数股东投的钱', value: dMin, role: 'delta' });
    if (equityDetail && dSe != null) {
      items.push({ key: 'RE', label: '自己赚的（留存收益）', value: dRe, role: 'delta' });
      items.push({ key: 'SHARE', label: '增发（股本）', value: dShare, role: 'delta' });
      items.push({ key: 'OTHER', label: '其他（资本公积等）', value: dOther, role: 'delta' });
    } else {
      items.push({ key: 'SE', label: '股东的钱（含利润积累与增发）', value: dSe, role: 'delta' });
    }
    items.push({ key: 'TA1', label: `${periodLabel(last.period)} 总资产`, value: taLast, role: 'total' });
  }

  return {
    years,
    from: periodLabel(first.period),
    to: periodLabel(last.period),
    items,
    totalDelta: isNum(taFirst) && isNum(taLast) ? taLast - taFirst : null,
    annualized: { taAr, seContrib, tlContrib, minContrib },
    verdict,
    minorityDerived,
    equityDetail,
    missing,
  };
}

function fmtYi(v: number | null): string {
  return v == null ? '—' : `${(v / 1e8).toFixed(0)} 亿`;
}

function pct(v: number | null, digits = 1): string {
  return v == null ? '—' : `${(v * 100).toFixed(digits)}%`;
}

const VERDICT_CN: Record<GrowthSources['verdict'], string> = {
  profit: '利润积累主导 · 内生长',
  debt: '负债扩张主导 · 外生长',
  issuance: '增发融资主导',
  minority: '少数股东投入主导',
  equity: '股东投入主导（含利润积累与增发，未细分）',
  na: '数据不足，无法判定',
};

/** 按 key 取瀑布条的增量；找不到返回 null（缺那根柱子时不强凑） */
function deltaText(g: GrowthSources, key: string): string {
  return fmtYi(g.items.find((i) => i.key === key)?.value ?? null);
}

export function runGrowthSources(ctx: AnalysisContext): AnalysisResult {
  const g = growthSourcesOf(ctx);
  const blocks: InsightBlock[] = [];

  if (!g.items.length) {
    blocks.push({
      id: 'growth_sources_na',
      title: '增长来源：数据不足',
      severity: 'info',
      summary: `无法拆解：缺 ${g.missing.join('、')}。`,
      charts: [],
      details: ['增长来源需要至少两个报告期的总资产、负债、归母权益、未分配利润与股本。'],
    });
    return { moduleId: 'growthSources', moduleTitle: '增长来源', blocks };
  }

  const a = g.annualized;
  blocks.push({
    id: 'growth_sources_waterfall',
    title: `增长来源：${VERDICT_CN[g.verdict]}（${g.from}–${g.to}，${g.years} 年）`,
    severity: g.verdict === 'debt' ? 'mid' : g.verdict === 'profit' ? 'low' : 'info',
    summary:
      `${g.years} 年间总资产增加 ${fmtYi(g.totalDelta)}：` +
      `借的（负债）${deltaText(g, 'TL')}，` +
      `少数股东 ${deltaText(g, 'MIN')}，` +
      (g.equityDetail
        ? `自己赚的（留存收益）${deltaText(g, 'RE')}，增发 ${deltaText(g, 'SHARE')}。`
        : `股东的钱（含利润积累与增发）${deltaText(g, 'SE')}。` +
          '披露口径未提供留存收益与股本，无法把股东的钱拆成「自己赚的」与「增发的」两部分。') +
      (g.verdict === 'debt'
        ? '增长主要由负债驱动——需要确认这些负债换来的资产在产生回报。'
        : g.verdict === 'profit'
          ? '增长主要由利润积累驱动，是靠自身盈利长大，质量最高。'
          : g.verdict === 'issuance'
            ? '增长主要由增发驱动——老股东的利益在被摊薄。'
            : g.verdict === 'minority'
              ? '增长主要由少数股东投入驱动——需留意大股东是否以少数股东形式占用了优质资产。'
              : g.verdict === 'equity'
                ? '增长主要由股东投入驱动，但无法区分是自己赚的还是增发来的——需查附注权益变动表。'
                : ''),
    charts: [
      {
        type: 'waterfall',
        title: '总资产从期初到期末是怎么长出来的',
        unit: '亿元',
        waterfall: {
          categories: g.items.map((i) => i.label),
          // 首尾两根是总数柱（整根落地），中间是增量柱（按正负悬浮）
          values: g.items.map((i) => (i.value == null ? null : +(i.value / 1e8).toFixed(1))),
          isTotal: g.items.map((i) => i.role === 'total'),
        },
      },
      {
        type: 'table',
        title: '各来源增量与年化增速贡献',
        table: {
          columns: [
            { key: 'item', cn: '来源' },
            { key: 'delta', cn: '区间增量' },
            { key: 'ar', cn: '年化增速贡献' },
            { key: 'note', cn: '怎么读' },
          ],
          rows: [
            {
              item: '借的（负债）',
              delta: deltaText(g, 'TL'),
              ar: pct(a.tlContrib, 2),
              note: '外生长；要看借来的钱回报是否覆盖利息',
            },
            {
              item: '少数股东投的',
              delta: deltaText(g, 'MIN'),
              ar: pct(a.minContrib, 2),
              note: '占比过高需查是否把优质子公司的部分股权让了出去',
            },
            ...(g.equityDetail
              ? [
                  {
                    item: '自己赚的（留存收益）',
                    delta: deltaText(g, 'RE'),
                    ar: pct(a.seContrib, 2),
                    note: '利润留在公司里滚存，是内生长的正源',
                  },
                  {
                    item: '增发（股本）',
                    delta: deltaText(g, 'SHARE'),
                    ar: '—',
                    note: '会摊薄每股收益，靠增发撑起来的增长不算本事',
                  },
                  {
                    item: '其他（资本公积等）',
                    delta: deltaText(g, 'OTHER'),
                    ar: '—',
                    note: '含资本公积、库存股、其他综合收益',
                  },
                ]
              : [
                  {
                    item: '股东的钱（未细分）',
                    delta: deltaText(g, 'SE'),
                    ar: pct(a.seContrib, 2),
                    note: '数据口径不含留存收益与股本，无法区分「自己赚的」与「增发的」',
                  },
                ]),
            {
              item: '合计（总资产）',
              delta: fmtYi(g.totalDelta),
              ar: pct(a.taAr, 2),
              note: '分项贡献是「占比 × 自身增速」的线性近似，三项之和约等于总资产年化增速；分项增速差异越大，误差越大',
            },
          ],
        },
      },
    ],
    details: [
      '口径：恒等式 总资产 = 负债 + 归母权益 + 少数股东权益；贡献 = 分项占比 × 分项年化增速。',
      '年化增速贡献是「百分点」口径，三项之和等于总资产年化增速，不是归一到 100% 的百分比。',
      ...(g.minorityDerived
        ? ['少数股东权益源数据未直接披露，按恒等式「总资产 − 负债 − 归母权益」倒轧所得。']
        : []),
      ...(g.equityDetail
        ? ['「其他」项为倒轧值（归母权益增量 − 留存收益增量 − 股本增量），含资本公积与库存股等。']
        : ['归母权益未按留存收益/股本细分：深度拆分需查年报附注的「所有者权益变动表」，属专业版数据域。']),
    ],
  });

  return {
    moduleId: 'growthSources',
    moduleTitle: '增长来源',
    blocks,
    warnings: g.missing.length ? [`增长来源：缺 ${g.missing.join('、')}，对应项显示「—」`] : undefined,
  };
}

export const growthSourcesModule: AnalysisModule = {
  id: 'growthSources',
  title: '增长来源',
  desc: '总资产变大，钱是从哪来的：利润积累 / 负债 / 少数股东 / 增发，叠加年化增速贡献拆解。',
  problems: ['profitability', 'assetQuality'],
  industries: [],
  run: runGrowthSources,
};
