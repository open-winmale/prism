import type { AnalysisContext, AnalysisModule, AnalysisResult, ChartSpec, InsightBlock } from './define';
import type { IndustryKey } from '../schema/types';
import { LAOTANG_NOTE_QUALITY } from '../laotang/rules';

// 模块源：../script 资产「基本面.质量体检包」
// 注意：赢麻了质量体检包用的是内部专有权重与行业分位模型，此处为「透明启发式」对齐其多维思路，
// 并非复刻其专有打分；权重与阈值在下方显式声明，便于审阅与调整。

export interface QualitySub {
  key: string;
  cn: string;
  value: number | null; // 原始值（小数比率）
  score: number; // 0-100 子分
  text: string; // 原始值展示文本
  weight: number; // 名义权重（透明声明）
  na: boolean; // 数据缺失：该维度从分母剔除（禁止按 0 分计入）
}

export interface QualityScore {
  score: number; // 0-100 综合分（na 维度权重剔除后归一化）
  grade: string; // 优秀/良好/一般/偏弱
  subs: QualitySub[]; // 维度明细（含 na 标记）
  weak: QualitySub[]; // 子分 < 30 的短板（非 na）
  strong: QualitySub[]; // 子分 ≥ 80 的长板（非 na）
  excluded: QualitySub[]; // 因缺数据被剔除的维度
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

const pct1 = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);

interface DimDef {
  key: string;
  cn: string;
  weight: number;
  value: (ctx: AnalysisContext) => number | null;
  score: (v: number) => number;
  text: (v: number | null) => string;
}

// 白酒六维（IMPLEMENTATION_PLAN.md §3.2）：权益乘数/周转/应计被移出——
// 白酒杠杆极低无区分度、基酒周转天然慢、预收款大时应计失真。M2 补分红率后重分配回七维。
const LIQUOR_DIMS: DimDef[] = [
  { key: 'gm', cn: '毛利率', weight: 0.15, value: (c) => c.computed.metrics[c.computed.metrics.length - 1].gross_margin, score: (v) => Math.round(clamp01((v - 0.1) / 0.6) * 100), text: pct1 },
  { key: 'nm', cn: '净利率', weight: 0.15, value: (c) => c.computed.metrics[c.computed.metrics.length - 1].net_margin_parent, score: (v) => Math.round(clamp01(v / 0.3) * 100), text: pct1 },
  { key: 'roe', cn: 'ROE(杜邦)', weight: 0.2, value: (c) => c.computed.metrics[c.computed.metrics.length - 1].roe_parent, score: (v) => Math.round(clamp01(v / 0.2) * 100), text: pct1 },
  // 收现比：>1 满分，<0.8 低分
  { key: 'sales_cash', cn: '收现比', weight: 0.2, value: (c) => c.computed.metrics[c.computed.metrics.length - 1].sales_cash_ratio, score: (v) => Math.round(clamp01((v - 0.8) / 0.2) * 100), text: pct1 },
  // 合同负债蓄水：/营收 适中偏高为好（0.05 起 0 分，0.25 满分）
  { key: 'contract_liab', cn: '合同负债蓄水', weight: 0.15, value: (c) => c.computed.metrics[c.computed.metrics.length - 1].contract_liab_ratio, score: (v) => Math.round(clamp01((v - 0.05) / 0.2) * 100), text: pct1 },
  // 销售费用率：越低越好（品牌力），>30% 为 0，<=10% 满分
  { key: 'selling', cn: '销售费用率(低=品牌力)', weight: 0.15, value: (c) => c.computed.metrics[c.computed.metrics.length - 1].selling_rate, score: (v) => Math.round(clamp01(1 - (v - 0.1) / 0.2) * 100), text: pct1 },
];

// 通用七维（原版，保留给非白酒行业）
const GENERAL_DIMS: DimDef[] = [
  { key: 'gm', cn: '毛利率', weight: 0.15, value: (c) => c.computed.metrics[c.computed.metrics.length - 1].gross_margin, score: (v) => Math.round(clamp01((v - 0.1) / 0.6) * 100), text: pct1 },
  { key: 'nm', cn: '净利率', weight: 0.15, value: (c) => c.computed.metrics[c.computed.metrics.length - 1].net_margin_parent, score: (v) => Math.round(clamp01(v / 0.3) * 100), text: pct1 },
  { key: 'roe', cn: 'ROE(杜邦)', weight: 0.2, value: (c) => c.computed.metrics[c.computed.metrics.length - 1].roe_parent, score: (v) => Math.round(clamp01(v / 0.2) * 100), text: pct1 },
  { key: 'turn', cn: '总资产周转', weight: 0.1, value: (c) => c.computed.metrics[c.computed.metrics.length - 1].asset_turnover, score: (v) => Math.round(clamp01(v / 1.5) * 100), text: (v) => (v == null ? '—' : v.toFixed(2)) },
  { key: 'lev', cn: '杠杆(权益乘数)', weight: 0.1, value: (c) => c.computed.metrics[c.computed.metrics.length - 1].equity_multiplier, score: (v) => Math.round(clamp01(1 - (v - 1) / 2) * 100), text: (v) => (v == null ? '—' : `${v.toFixed(2)}x`) },
  { key: 'ncf', cn: '盈利含金量', weight: 0.2, value: (c) => c.computed.metrics[c.computed.metrics.length - 1].cfo_to_net_profit, score: (v) => Math.round(clamp01((v - 0.3) / 0.7) * 100), text: pct1 },
  { key: 'accrual', cn: '应计利润占比', weight: 0.1, value: (c) => c.computed.metrics[c.computed.metrics.length - 1].accrual_ta, score: (v) => Math.round(clamp01(1 - v / 0.1) * 100), text: pct1 },
];

function dimsFor(industry: IndustryKey): DimDef[] {
  return industry === 'liquor' ? LIQUOR_DIMS : GENERAL_DIMS;
}

// 质量分（Hero 报告与质量体检模块共用，保证口径一致）
// 硬规则：某维度 na 时，其权重从分母剔除、总分按剩余权重归一化——禁止按 0 分计入。
export function qualityScoreOf(ctx: AnalysisContext): QualityScore {
  const defs = dimsFor(ctx.industry);
  const subs: QualitySub[] = defs.map((d) => {
    const v = d.value(ctx);
    return {
      key: d.key,
      cn: d.cn,
      value: v,
      score: v == null ? 0 : d.score(v),
      text: d.text(v),
      weight: d.weight,
      na: v == null,
    };
  });

  const active = subs.filter((s) => !s.na);
  const weightSum = active.reduce((s, x) => s + x.weight, 0);
  const raw = active.reduce((s, x) => s + x.score * x.weight, 0);
  const score = weightSum > 0 ? Math.round(raw / weightSum) : 0;
  const grade = score >= 80 ? '优秀' : score >= 60 ? '良好' : score >= 40 ? '一般' : '偏弱';

  return {
    score,
    grade,
    subs,
    weak: active.filter((s) => s.score < 30),
    strong: active.filter((s) => s.score >= 80),
    excluded: subs.filter((s) => s.na),
  };
}

export function runQualityCheck(ctx: AnalysisContext): AnalysisResult {
  const q = qualityScoreOf(ctx);
  const isLiquor = ctx.industry === 'liquor';

  const barChart: ChartSpec = {
    type: 'bar',
    title: isLiquor ? '质量六维子分' : '质量七维子分',
    unit: '分',
    categories: q.subs.map((s) => s.cn),
    series: [{ name: '子分(0-100)', data: q.subs.map((s) => s.score) }],
  };

  const tableChart: ChartSpec = {
    type: 'table',
    title: '质量体检明细（最新期）',
    table: {
      columns: [
        { key: 'cn', cn: '维度' },
        { key: 'value', cn: '原始值' },
        { key: 'score', cn: '子分' },
        { key: 'weight', cn: '权重' },
        { key: 'na', cn: '数据' },
      ],
      rows: q.subs.map((s) => ({
        cn: s.cn,
        value: s.na ? '无数据' : s.text,
        score: s.na ? '—（剔除）' : s.score,
        weight: `${Math.round((s.weight / (q.subs.filter((x) => !x.na).reduce((a, x) => a + x.weight, 0) || 1)) * 100)}%`,
        na: s.na ? '缺' : '✓',
      })),
    },
  };

  const blocks: InsightBlock[] = [];

  const excludedNote = q.excluded.length ? `「${q.excluded.map((s) => s.cn).join('、')}」因缺数据已从总分剔除（未按 0 分拉低）。` : '';
  blocks.push({
    id: 'quality_score',
    title: `质量体检得分：${q.score}/100（${q.grade}）`,
    summary:
      q.weak.length === 0
        ? `综合质量分 ${q.score}，判定「${q.grade}」。${isLiquor ? '六维' : '七维'}（${q.subs.filter((s) => !s.na).map((s) => s.cn).join('/')}）整体无显著短板。${excludedNote}`
        : `综合质量分 ${q.score}，判定「${q.grade}」。短板：${q.weak.map((s) => `${s.cn}(${s.score}分)`).join('、')}。${excludedNote}`,
    severity: q.score >= 60 ? 'low' : q.score >= 40 ? 'mid' : 'high',
    charts: [barChart],
    laotang: LAOTANG_NOTE_QUALITY,
  });

  blocks.push({
    id: 'quality_detail',
    title: isLiquor ? '六维明细' : '七维明细',
    summary: '各维度原始值、子分与归一化权重，便于定位质量短板来自盈利、收现还是渠道蓄水。缺数据维度显示「剔除」而非 0 分。',
    charts: [tableChart],
  });

  if (ctx.peerBench?.gross_margin != null && q.subs[0].value != null) {
    const gm = q.subs[0].value!;
    const bench = ctx.peerBench.gross_margin;
    const pct = Math.round(clamp01(gm / (bench * 1.3)) * 100);
    blocks.push({
      id: 'quality_industry',
      title: '同业毛利率分位（参考）',
      summary: `最新毛利率 ${(gm * 100).toFixed(1)}%，相对同业基准 ${(bench * 100).toFixed(0)}% 约处于 ${pct} 分位（演示口径，连接赢麻了可获真实行业分位）。`,
      charts: [],
    });
  }

  return { moduleId: 'qualityCheck', moduleTitle: '质量体检', blocks };
}

export const qualityCheckModule: AnalysisModule = {
  id: 'qualityCheck',
  title: '质量体检',
  desc: '白酒六维（毛利率/净利率/ROE/收现比/合同负债蓄水/销售费用率）合成质量分，一眼看穿公司「成色」。',
  problems: ['assetQuality', 'profitability'],
  industries: [],
  run: runQualityCheck,
};
