import type { AnalysisContext, AnalysisModule, AnalysisResult, InsightBlock } from './define';
import type { Num, PeriodReport } from '../schema/types';
import { STMT_TREE, expandStatement, type StmtRow } from '../derivations';
import { fieldGetter } from '../compute';
import { sameQuarterYoyOf, shareDenominator, shareOf, yoyOf } from '../methods/columns';
import { periodLabel } from '../utils';
import { dossierOf } from './itemSemantics';

// 异动扫描：在三表几十期数字里，先把「跳变」挑出来给人看。
// 两条扫描线：
//   1) 同比跳变  —— 该科目本期 vs 上期（季度口径必须是「同季对比」，用 sameQuarterYoyOf）
//   2) 结构跳变  —— 该科目占基项的比重变化了多少个百分点（营收涨 30% 而存货涨 80%，同比看不出来，结构看得出）
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
}

export interface AnomalyOptions {
  /** 同比异动阈值（绝对值）。默认 0.3 */
  yoyThreshold?: number;
  /** 结构占比异动阈值（百分点，绝对值）。默认 0.05 */
  shareThreshold?: number;
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
  const quarterly = options.quarterly ?? false;
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

        // 同一科目同一期：取幅度更显著的那条（用归一化强度比较）
        const yoyStrength = isNum(y) ? Math.abs(y) / (row.pct ? shareT : yoyT) : 0;
        const shareStrength = isNum(s) ? Math.abs(s) / shareT : 0;
        const useYoy = yoyHit && (!shareHit || yoyStrength >= shareStrength);
        const type: AnomalyType = useYoy ? 'yoy' : 'share';
        const delta = (useYoy ? y : s) as number;
        const direction = delta > 0 ? 'up' : 'down';
        const severity: 'high' | 'mid' = useYoy
          ? Math.abs(delta) >= (row.pct ? shareT * 2 : yoyT * 2)
            ? 'high'
            : 'mid'
          : Math.abs(delta) >= shareT * 2
            ? 'high'
            : 'mid';

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
          : `${label} 占${baseNameOf(kind, row.k)} ${pctText(shares[i - 1] ?? 0)} → ${pctText(shares[i] ?? 0)}（${delta > 0 ? '+' : '−'}${Math.abs(delta * 100).toFixed(1)}pct）`;

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
  const signals = anomalySignals(ctx, { quarterly, limit: 12 });
  const blocks: InsightBlock[] = [];

  if (!signals.length) {
    blocks.push({
      id: 'anomaly_none',
      title: '异动扫描：本期未发现显著跳变',
      severity: 'info',
      summary:
        '在默认阈值（同比 ±30%、结构占比 ±5 个百分点）下，三表各科目没有出现跨越阈值的跳变。这不等于没有问题，只是没有突然变化。',
      charts: [],
      details: [
        '扫描的是「变化幅度」，不是「水平高低」：毛利率常年 5% 不会被扫出来，但掉到 3% 会。',
        '阈值可在财报工作台调整；白酒等波动小的行业可以把阈值调低。',
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
      '扫描口径：同比 ±30%（季度口径为同季对比）、结构占比 ±5 个百分点；翻倍及以上记为高危。',
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
