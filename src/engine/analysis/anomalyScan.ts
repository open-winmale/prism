import type { AnalysisContext, AnalysisModule, AnalysisResult, InsightBlock } from './define';
import type { Num, PeriodReport } from '../schema/types';
import { STMT_TREE, expandStatement, type StmtRow } from '../derivations';
import { fieldGetter } from '../compute';
import { sameQuarterYoyOf, shareDenominator, shareOf, yoyOf } from '../methods/columns';
import { periodLabel } from '../utils';
import { dossierOf } from './itemSemantics';
import { domainOf, type DomainId } from '../schema/problems';
import { industryTemplate } from '../schema/industry';

// 异动扫描：在三表几十期数字里，先把「跳变」挑出来给人看。
// 三条扫描线：
//   1) 同比跳变  —— 该科目本期 vs 上期（季度口径必须是「同季对比」，用 sameQuarterYoyOf）
//   2) 结构跳变  —— 该科目占基项的比重变化了多少个百分点（营收涨 30% 而存货涨 80%，同比看不出来，结构看得出）
//   3) 重要性门槛 —— 占比太小的科目不构成有意义的突变：0.3% 的科目翻倍也改变不了大局，
//      按行业模版的 minShare（默认 1%）过滤，避免小数点级噪音刷屏。
// 缺数据一律不产生信号（缺失 ≠ 0，更不等于异常）。

export type AnomalyKind = 'balance' | 'income' | 'cashflow';
export type AnomalyType = 'yoy' | 'share';
export type AnomalyTone = 'bad' | 'good' | 'neutral';

export interface AnomalySignal {
  id: string;
  kind: AnomalyKind;
  type: AnomalyType;
  itemKey: string;
  itemName: string;
  /** 期间标签（年 或 年+季） */
  period: string;
  /** 幅度：同比为小数（0.42 = +42%）；结构为百分点（0.05 = 5pct） */
  delta: number;
  direction: 'up' | 'down';
  severity: 'high' | 'mid';
  /** 好坏判读：由科目语义 + 方向推出，用于条件高亮 */
  tone: AnomalyTone;
  from: number | null;
  to: number | null;
  evidence: string;
  why: string;
  next: string;
  /** 所属问题域（经营/资产/负债/股东权益/利润/现金流），用于按域归组 */
  domain: DomainId;
  /** 行业附注：行业模版对该科目在该行业语境下的针对性解读（未命中则缺省） */
  note?: string;
  /** 该科目占基项比重的完整历史序列（画「该科目趋势 vs 基项增速」对比图用） */
  shareSeries: (number | null)[];
}

// ── 关联指标：每个科目突变时应对照着看的主指标（同比口径） ──
// 原则：突变是否孤立？科目自己涨不算事，和营收/总资产/净利的方向背离才是问题。
const RELATED_YOY: Record<string, { key: string; name: string; kind: AnomalyKind }[]> = {
  // 资产/负债科目 → 对照营收（增长是否同步）
  MFNS: [{ key: 'TR', name: '营业总收入', kind: 'income' }],
  NRAR: [{ key: 'TR', name: '营业总收入', kind: 'income' }],
  FRRE: [{ key: 'TR', name: '营业总收入', kind: 'income' }],
  ADP: [{ key: 'OC', name: '营业成本', kind: 'income' }],
  ORNET: [{ key: 'TR', name: '营业总收入', kind: 'income' }],
  IO: [{ key: 'TR', name: '营业总收入', kind: 'income' }],
  LEIT: [{ key: 'NP', name: '净利润', kind: 'income' }],
  PPE: [{ key: 'TR', name: '营业总收入', kind: 'income' }],
  CIP: [{ key: 'TR', name: '营业总收入', kind: 'income' }],
  GW: [{ key: 'NPP', name: '归母净利润', kind: 'income' }],
  AP: [{ key: 'OC', name: '营业成本', kind: 'income' }],
  CLC: [{ key: 'TR', name: '营业总收入', kind: 'income' }],
  ARV: [{ key: 'TR', name: '营业总收入', kind: 'income' }],
  IBD: [{ key: 'FE', name: '财务费用', kind: 'income' }],
  SC: [{ key: 'NPP', name: '归母净利润', kind: 'income' }],
  RE: [{ key: 'NPP', name: '归母净利润', kind: 'income' }],
  EQP: [{ key: 'NPP', name: '归母净利润', kind: 'income' }],
  TE: [{ key: 'NPP', name: '归母净利润', kind: 'income' }],
  // 利润表科目 → 对照营收（费用/成本相对收入的变化才有意义）
  OC: [{ key: 'TR', name: '营业总收入', kind: 'income' }],
  SEXE: [{ key: 'TR', name: '营业总收入', kind: 'income' }],
  MEXE: [{ key: 'TR', name: '营业总收入', kind: 'income' }],
  RD: [{ key: 'TR', name: '营业总收入', kind: 'income' }],
  FE: [{ key: 'IBD', name: '有息负债', kind: 'balance' }],
  TAX: [{ key: 'TP', name: '利润总额', kind: 'income' }],
  NPP: [{ key: 'TR', name: '营业总收入', kind: 'income' }],
  // 现金流科目 → 对照净利与营收（含金量背离是核心信号）
  SSIR: [{ key: 'TR', name: '营业总收入', kind: 'income' }],
  NCFO: [{ key: 'NPP', name: '归母净利润', kind: 'income' }],
  CLAR: [{ key: 'NCFO', name: '经营现金流', kind: 'cashflow' }],
  NCFI: [{ key: 'CIP', name: '在建工程', kind: 'balance' }],
  NCFF: [{ key: 'IBD', name: '有息负债', kind: 'balance' }],
};

function relatedOf(rowKey: string): { key: string; name: string; kind: AnomalyKind }[] {
  return RELATED_YOY[rowKey] ?? [{ key: 'TR', name: '营业总收入', kind: 'income' }];
}

export { relatedOf };

export interface AnomalyOptions {
  /** 同比异动阈值（绝对值）。默认 0.3 */
  yoyThreshold?: number;
  /** 结构占比异动阈值（百分点，绝对值）。默认 0.05 */
  shareThreshold?: number;
  /**
   * 重要性下限（小数）：金额行当期占基项比重低于此值不报突变（比率行不适用）。
   * 默认 0.01 = 1%；占比在 1~3 倍下限之间的命中强制降为 mid（幅度再大也改变不了大局）。
   */
  minShare?: number;
  /** 行业键：命中行业模版的科目附注时挂到信号的 note 上 */
  industry?: string;
  /** 季度口径（单季视图）：同比必须走同季对比，否则被季节效应污染 */
  quarterly?: boolean;
  /** 只看这些科目（STMT_TREE 的 k）；缺省全扫 */
  keys?: string[];
  /** 返回条数上限（按严重度+幅度排序后截断） */
  limit?: number;
}

const KINDS: AnomalyKind[] = ['income', 'balance', 'cashflow'];
const SEVERITY_ORDER: Record<string, number> = { high: 0, mid: 1 };

function isNum(v: Num | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function valueOf(kind: AnomalyKind, row: StmtRow, report: PeriodReport): Num {
  const matrix = expandStatement(kind, fieldGetter(report));
  const idx = STMT_TREE[kind].findIndex((r) => r.k === row.k);
  return idx >= 0 ? (matrix[idx]?.value ?? null) : null;
}

function baseNameOf(kind: AnomalyKind, rowKey: string): string {
  if (kind === 'balance') return '总资产';
  if (kind === 'income') return '营业总收入';
  return rowKey === 'CCF' ? '总资产' : '营业总收入';
}

/** 基项数值（重要性门槛的分母）：资产负债表=总资产，其余=营业总收入（期末现金同总资产） */
function baseValueOf(kind: AnomalyKind, report: PeriodReport): Num {
  const get = fieldGetter(report);
  if (kind === 'balance') return get('total_assets');
  if (kind === 'income') return get('total_revenue');
  return get('total_revenue');
}

/**
 * 比率行的重要性：反推「比率背后科目」占基项的比重。
 * 费用率/毛利率的突变重要性 = 背后费用/成本科目占总营收的比重：
 *   - 费用率行（_RATE、GM 除外）：rate 本身 = 科目 ÷ 营收，占比即 rate；
 *   - 毛利率 GM：成本占营收 ≈ 1 − GM；
 *   - 研发费用率 0.1% → 背后科目只占营收 0.1% → 被重要性门槛拦下（基数小，不构成有意义的突变）。
 */
function ratioBackingShareOf(kind: AnomalyKind, rowKey: string, report: PeriodReport): Num {
  const get = fieldGetter(report);
  // 分母口径：收入类比率对营收
  const rate = get('total_revenue');
  if (rowKey === 'GM') {
    const cost = get('operating_cost');
    return isNum(cost) && isNum(rate) && rate > 0 ? cost / rate : null;
  }
  // 各费用率：直接取该费用的金额行 ÷ 营收（比「乘回比率」更直接且精度无损）
  const map: Record<string, string> = {
    SEXE_RATE: 'selling_expense',
    MEXE_RATE: 'admin_expense',
    RD_RATE: 'rd_expense',
    COST_TOTAL_RATE: 'selling_expense', // 合计费用率的占比按最大单项近似——保守降级，不放大
  };
  const field = map[rowKey];
  if (!field) return null;
  const amount = get(field as never);
  return isNum(amount) && isNum(rate) && rate > 0 ? amount / rate : null;
  void kind;
}

function yi(v: number | null): string {
  return v == null ? '—' : `${(v / 1e8).toFixed(1)} 亿`;
}

function pctText(v: number, digits = 1): string {
  return `${(v * 100).toFixed(digits)}%`;
}

/** 比率行（费用率等）数值本身很小，1 位小数会把 0.07% 和 0.15% 都显示成 0.1%，必须用 2 位 */
function rateText(v: number): string {
  return `${(v * 100).toFixed(2)}%`;
}

/**
 * 扫描三表全部科目的异动。
 * 每个「科目 × 期间」最多产出一条信号（同比与结构同时超阈值时取更强的那条，避免同一件事报两遍）。
 */
export function anomalySignals(ctx: AnalysisContext, options: AnomalyOptions = {}): AnomalySignal[] {
  const yoyT = options.yoyThreshold ?? 0.3;
  const shareT = options.shareThreshold ?? 0.05;
  const minShare = options.minShare ?? 0.01;
  const quarterly = options.quarterly ?? false;
  const tpl = options.industry ? industryTemplate(options.industry as never) : null;
  const reports = ctx.dataset.reports;
  if (reports.length < 2) return [];

  const out: AnomalySignal[] = [];

  for (const kind of KINDS) {
    for (const row of STMT_TREE[kind]) {
      if (row.section) continue; // 小计行是合计本身，不重复报
      if (options.keys && !options.keys.includes(row.k)) continue;

      const values = reports.map((r) => valueOf(kind, row, r));
      const yoys = quarterly ? sameQuarterYoyOf(reports, values) : yoyOf(values);
      const shares = shareOf(
        values,
        reports.map((r) => shareDenominator(kind, r, row.k)),
      );

      for (let i = 1; i < reports.length; i++) {
        const cur = values[i];
        const prev = values[i - 1];
        const y = yoys[i];
        // 比率行（毛利率/费用率）本身就是比例，直接取两期之差 = 变化了多少个百分点
        const s = row.pct ? (isNum(cur) && isNum(prev) ? cur - prev : null) : shares[i] == null || shares[i - 1] == null ? null : shares[i]! - shares[i - 1]!;

        // 同比只在同号区间内有意义：跨越正负的金额（如现金净增加额由正转负）
        // 算出来的百分比是负数且幅度失真，不能作为异动依据，改看结构占比。
        const yoyUsable =
          row.pct || (isNum(y) && isNum(prev) && isNum(cur) && prev > 0 && cur > 0);
        const yoyHit = yoyUsable && isNum(y) && Math.abs(y) >= (row.pct ? shareT : yoyT);
        const shareHit = isNum(s) && Math.abs(s) >= shareT;
        if (!yoyHit && !shareHit) continue;

        // ── 重要性门槛（2026-10-22，2026-10-23 强化）：占比太小 = 基数小，不构成有意义的突变 ──
        // 金额行必须同时过两道门：
        //   门 1（占比）：当期占基项（总资产/总收入）比重 < minShare 直接跳过——
        //              0.3% 的科目哪怕翻倍，也改变不了公司的大局；
        //   门 2（绝对额增量）：本期相对上期的变化额占总资产/总收入比重 < minShare 也跳过——
        //              1.2 亿 → 1.5 亿的科目即使占比过线，3000 万的增量也改变不了大局。
        // 比率行（毛利率/费用率）不豁免：比率背后的科目占比同样要过门——
        // 研发费用率 0.1% 的「跳变」背后是占总营收 0.1% 的科目，重要性必须按背后科目衡量
        //（比率行以费用率×营收 反推科目占比，与基项同口径：费用/收入类比率对营收，资产类比率对总资产）。
        const shareNow = row.pct
          ? // 比率行：反推背后科目占基项的比重（毛利率→成本占营收≈1−GM；费用率→费用占营收=rate 本身）
            ratioBackingShareOf(kind, row.k, reports[i])
          : shares[i];
        if (isNum(shareNow) && shareNow < minShare) continue;
        const deltaAmount = isNum(cur) && isNum(prev) ? Math.abs(cur - prev) : null;
        const base = baseValueOf(kind, reports[i]);
        const deltaShare = isNum(deltaAmount) && isNum(base) && base > 0 ? deltaAmount / base : null;
        if (!row.pct && isNum(deltaShare) && deltaShare < minShare) continue;
        // 占比在下限的 1~3 倍之间：跳变再猛也强制降为 mid（重要性封顶）
        const smallShare =
          (isNum(shareNow) && shareNow < minShare * 3) || (isNum(deltaShare) && deltaShare < minShare * 3);

        // 同一科目同一期：取幅度更显著的那条（用归一化强度比较）
        const yoyStrength = isNum(y) ? Math.abs(y) / (row.pct ? shareT : yoyT) : 0;
        const shareStrength = isNum(s) ? Math.abs(s) / shareT : 0;
        const useYoy = yoyHit && (!shareHit || yoyStrength >= shareStrength);
        const type: AnomalyType = useYoy ? 'yoy' : 'share';
        const delta = (useYoy ? y : s) as number;
        const direction = delta > 0 ? 'up' : 'down';
        const severityRaw: 'high' | 'mid' = useYoy
          ? Math.abs(delta) >= (row.pct ? shareT * 2 : yoyT * 2)
            ? 'high'
            : 'mid'
          : Math.abs(delta) >= shareT * 2
            ? 'high'
            : 'mid';
        const severity: 'high' | 'mid' = smallShare ? 'mid' : severityRaw;

        const d = dossierOf(row.k);
        const tone: AnomalyTone =
          (direction === 'up' && d.upIsBad) || (direction === 'down' && d.downIsBad)
            ? 'bad'
            : (direction === 'up' && d.downIsBad) || (direction === 'down' && d.upIsBad)
              ? 'good'
              : 'neutral';

        const label = row.cn.replace(/^\u3000+/, '');
        const hasQuarter = reports[i].sampling && reports[i].sampling !== 'Q4';
        const periodText = hasQuarter
          ? `${periodLabel(reports[i].period)}Q${(reports[i].sampling ?? 'Q4').slice(1)}`
          : periodLabel(reports[i].period);

        // 单位后缀必须跟着口径走：比率行的「同比」是百分比，「结构位移」才是百分点。
        // 混用会把「费用率涨了 87%」写成「涨了 87 个百分点」。
        const evidence = useYoy
          ? row.pct
            ? `${label} ${rateText(prev ?? 0)} → ${rateText(cur ?? 0)}（${delta > 0 ? '+' : '−'}${Math.abs(delta * 100).toFixed(1)}%）`
            : `${label} ${yi(prev)} → ${yi(cur)}（${delta > 0 ? '+' : '−'}${Math.abs(delta * 100).toFixed(1)}%）`
          : `${label} ${baseNameOf(kind, row.k)}占比 ${pctText(shares[i - 1] ?? 0)} → ${pctText(shares[i] ?? 0)}（${delta > 0 ? '+' : '−'}${Math.abs(delta * 100).toFixed(1)}pct）`;

        // 行业附注：科目级行业解读命中时挂上，让「为什么值得看」带上行业语境
        const note = tpl?.itemNotes[row.k];

        out.push({
          id: `${row.k}-${reports[i].period}-${type}`,
          kind,
          type,
          itemKey: row.k,
          itemName: label,
          period: periodText,
          delta,
          direction,
          severity,
          tone,
          from: prev,
          to: cur,
          evidence,
          why: d.why,
          next: d.next,
          domain: domainOf(row.k, kind),
          note,
          shareSeries: row.pct ? values : (shares as (number | null)[]),
        });
      }
    }
  }

  out.sort((a, b) => {
    const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (s !== 0) return s;
    return Math.abs(b.delta) - Math.abs(a.delta);
  });
  return options.limit ? out.slice(0, options.limit) : out;
}

function kindCn(kind: AnomalyKind): string {
  return kind === 'balance' ? '资产负债表' : kind === 'income' ? '利润表' : '现金流量表';
}

export function runAnomalyScan(ctx: AnalysisContext): AnalysisResult {
  const quarterly = (ctx.dataset.meta as { dataMode?: string } | undefined)?.dataMode === 'quarterly';
  // 阈值与重要性下限统一走行业模版（不再让模块用硬编码默认值）
  const tpl = industryTemplate(ctx.industry);
  const signals = anomalySignals(ctx, {
    quarterly,
    limit: 12,
    yoyThreshold: tpl.yoyThreshold,
    shareThreshold: tpl.shareThreshold,
    minShare: tpl.minShare,
    industry: ctx.industry,
  });
  const blocks: InsightBlock[] = [];

  if (!signals.length) {
    blocks.push({
      id: 'anomaly_none',
      title: '异动扫描：本期未发现显著跳变',
      severity: 'info',
      summary:
        `在行业模版阈值（同比 ±${Math.round(tpl.yoyThreshold * 100)}%、结构占比 ±${Math.round(tpl.shareThreshold * 100)} 个百分点、重要性下限 ${Math.round(tpl.minShare * 100)}%）下，` +
        '三表各科目没有出现跨越阈值且足够重要的跳变。这不等于没有问题，只是没有突然变化。',
      charts: [],
      details: [
        '扫描的是「变化幅度」，不是「水平高低」：毛利率常年 5% 不会被扫出来，但掉到 3% 会。',
        '占比过小的科目不报突变（重要性下限过滤）：0.3% 的科目翻倍也改变不了大局。',
        `当前行业模版：${ctx.industry}；阈值与附注都由模版预设，不做用户配置。`,
      ],
    });
    return { moduleId: 'anomalyScan', moduleTitle: '异动扫描', blocks };
  }

  const high = signals.filter((s) => s.severity === 'high').length;
  blocks.push({
    id: 'anomaly_list',
    title: `异动扫描：${signals.length} 项跳变（高危 ${high} 项）`,
    severity: high ? 'high' : 'mid',
    summary:
      '按跳变幅度排序的科目清单。同比看「自己变了没有」，结构占比看「在盘子里的分量变了没有」——' +
      '后者能抓到营收涨 30% 而存货涨 80% 这类同比看不出来的问题。',
    charts: [
      {
        type: 'table',
        title: '异动清单',
        table: {
          columns: [
            { key: 'period', cn: '期间' },
            { key: 'item', cn: '科目' },
            { key: 'evidence', cn: '证据' },
            { key: 'tone', cn: '判读' },
            { key: 'where', cn: '所在表' },
          ],
          rows: signals.map((s) => ({
            period: s.period,
            item: s.itemName,
            evidence: s.evidence,
            tone: s.tone === 'bad' ? '需警惕' : s.tone === 'good' ? '偏正面' : '需结合上下文',
            where: kindCn(s.kind),
          })),
        },
      },
    ],
    details: [
      `扫描口径：同比 ±${Math.round(tpl.yoyThreshold * 100)}%（季度口径为同季对比）、结构占比 ±${Math.round(tpl.shareThreshold * 100)} 个百分点；翻倍及以上记为高危。`,
      '重要性下限：占总资产/营收比重低于 1% 的科目不报突变，本期增量不足 1% 也不报（基数小，翻倍也改变不了大局）；1%~3% 之间强制降级。',
      '同比只在两期同号且基期为正时计算：现金净增加额这类会跨越正负的科目不给出百分比，改看结构占比或绝对额。',
      '颜色只表达升降方向，不表达好坏——存货涨 80% 和收现涨 80% 是两回事，右侧「判读」列才区分好坏。',
      '异动不等于造假——它只标记「这里变了」，原因要靠附注与同行对照去解释。',
    ],
  });

  return { moduleId: 'anomalyScan', moduleTitle: '异动扫描', blocks };
}

export const anomalyScanModule: AnalysisModule = {
  id: 'anomalyScan',
  title: '异动扫描',
  desc: '在三表几十期数字里先把跳变挑出来：同比 ±30%、结构占比 ±5 个百分点，并给出为什么值得看与下一步查什么。',
  problems: ['risk', 'profitability', 'operations'],
  industries: [],
  run: runAnomalyScan,
};
