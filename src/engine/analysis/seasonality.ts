import type { AnalysisContext, AnalysisModule, AnalysisResult, ChartSpec, InsightBlock } from './define';
import { singleQuarterReports } from '../quarter';


// 季节性分析 —— 对齐 script「基本面.季节性分析」+ DIFFQ_YTD 语义：
// 用单季值（累计差分推导）看营收/利润的季节分布。
// 深层信息：
//   1) 白酒 Q1（春节备货）占比高是常态——看「单季占比」而非绝对值，才能识别真异常；
//   2) 同比要用**单季 vs 去年同季**（累计同比会把季节效应和增长混在一起）；
//   3) 某季占比突然偏离历史区间 = 需求/渠道行为变化的前兆。

interface QuarterPoint {
  year: number;
  q: 1 | 2 | 3 | 4;
  rev: number | null;
  npp: number | null;
}

export function seasonalityOf(ctx: AnalysisContext): { points: QuarterPoint[]; skipped: number } {
  const reports = ctx.dataset.reports;
  const points: QuarterPoint[] = [];
  let skipped = 0;

  // 季度模式：ctx.dataset 已是单季视图（store 的 analysisDataset）。
  // 绝不能再做一次 DIFFQ——单季值再差分会得到「环比的差」，全是垃圾。直接取流量值。
  if (ctx.dataset.meta?.dataMode === 'quarterly') {
    for (const r of reports) {
      const rev = r.income.total_revenue;
      const npp = r.income.net_profit_parent;
      if (rev == null && npp == null) {
        skipped += 1;
        continue;
      }
      points.push({
        year: Number(r.period.slice(0, 4)),
        q: Number((r.sampling ?? 'Q4').slice(1)) as 1 | 2 | 3 | 4,
        rev: rev ?? null,
        npp: npp ?? null,
      });
    }
    return { points, skipped };
  }

  // 年度模式：报表是累计值，按 DIFFQ_YTD 推导单季
  const sqs = singleQuarterReports(reports);
  sqs.forEach((sq, i) => {
    const r = reports[i];
    if (!sq) {
      skipped += 1;
      return;
    }
    const q = Number((r.sampling ?? 'Q4').slice(1)) as 1 | 2 | 3 | 4;
    points.push({
      year: Number(r.period.slice(0, 4)),
      q,
      rev: sq.income.total_revenue as number | null,
      npp: sq.income.net_profit_parent as number | null,
    });
  });
  return { points, skipped };
}

export function runSeasonality(ctx: AnalysisContext): AnalysisResult {
  const { points, skipped } = seasonalityOf(ctx);
  const blocks: InsightBlock[] = [];

  if (points.length < 4) {
    return {
      moduleId: 'seasonality',
      moduleTitle: '季节性分析',
      blocks: [
        {
          id: 'seasonality_na',
          title: '季度数据不足',
          summary: `需要至少 4 个可推导的单季值（当前 ${points.length} 个${
            skipped ? `，另有 ${skipped} 期因缺上期累计无法推导` : ''
          }）。补齐季度报告期后本模块可用。`,
          charts: [],
        },
      ],
      warnings: skipped ? [`有 ${skipped} 期因缺上期累计无法推导单季值（数据集首期通常是年报）`] : undefined,
    };
  }

  // 单季营收序列
  const labels = points.map((p) => `${p.year}Q${p.q}`);
  const revSeries = points.map((p) => p.rev);
  const nppSeries = points.map((p) => p.npp);

  // 年内季节占比（有完整四季的年份）
  const byYear = new Map<number, QuarterPoint[]>();
  for (const p of points) {
    byYear.set(p.year, [...(byYear.get(p.year) ?? []), p]);
  }
  const fullYears = [...byYear.entries()].filter(([, ps]) => new Set(ps.map((x) => x.q)).size === 4);

  // 季节占比矩阵（年 × 季）——用热力图而不是分组柱：
  // 柱子要横向比较四组才看得出位移，热力图一眼就能看到哪一格偏离了常态。
  const seasonShare: ChartSpec | null =
    fullYears.length >= 2
      ? {
          type: 'heatmap',
          title: '各年单季营收占比（%）——季节分布是否稳定',
          heatmap: {
            rows: fullYears.map(([year]) => `${year}年`),
            cols: ['Q1', 'Q2', 'Q3', 'Q4'],
            values: fullYears.flatMap(([, ps]) => {
              const total = ps.reduce((s, x) => s + (x.rev ?? 0), 0);
              return ([1, 2, 3, 4] as const).map((q) => {
                const p = ps.find((x) => x.q === q);
                return p?.rev != null && total > 0 ? p.rev / total : null;
              });
            }),
            visualMin: 0,
            visualMax: 0.45,
          },
        }
      : null;

  // 头条：最新单季 vs 去年同季（真正的单季同比）
  const last = points[points.length - 1];
  const prevSame = points.find((p) => p.year === last.year - 1 && p.q === last.q);
  const yi = (v: number | null): string => (v == null ? '—' : (v / 1e8).toFixed(1)); // 元 → 亿元
  let headline: InsightBlock;
  if (prevSame?.rev != null && last.rev != null) {
    const yoy = last.rev / Math.abs(prevSame.rev) - 1;
    const nppYoy = last.npp != null && prevSame.npp ? last.npp / Math.abs(prevSame.npp) - 1 : null;
    headline = {
      id: 'latest_quarter_yoy',
      title: `最新单季（${last.year}Q${last.q}）：营收单季同比 ${(yoy * 100).toFixed(1)}%`,
      severity: yoy >= -0.05 ? 'low' : yoy >= -0.2 ? 'mid' : 'high',
      summary:
        `本季度营收 ${yi(last.rev)} 亿（去年同期 ${yi(prevSame.rev)} 亿）。` +
        (nppYoy != null ? `单季归母净利同比 ${(nppYoy * 100).toFixed(1)}%。` : '') +
        `注意这里是「单季 vs 去年同季」的可比口径；若用累计值同比，季节效应会污染增长结论。` +
        (yoy < -0.1 ? '单季同比显著下滑时，优先查：渠道库存（合同负债是否同步收缩）、终端动销、产品结构。' : ''),
      charts: [
        {
          type: 'groupedBar',
          title: '单季营收 vs 去年同季（亿元）',
          unit: '亿元',
          categories: [`Q${last.q}`],
          series: [
            { name: `${last.year - 1}`, data: [prevSame.rev == null ? null : Number((prevSame.rev / 1e8).toFixed(1))] },
            { name: `${last.year}`, data: [last.rev == null ? null : Number((last.rev / 1e8).toFixed(1))] },
          ],
        },
      ],
    };
  } else {
    headline = {
      id: 'latest_quarter_yoy',
      title: '最新单季缺去年同期数据',
      summary: `最新可推导单季为 ${last.year}Q${last.q}，但去年同期单季不可得（数据集季度覆盖不足），无法计算单季同比。`,
      charts: [],
    };
  }
  blocks.push(headline);

  // 单季营收与净利趋势（统一换算为亿元展示；原始单位为元）
  const toYi = (arr: (number | null)[]): (number | null)[] => arr.map((v) => (v == null ? null : Number((v / 1e8).toFixed(1))));
  blocks.push({
    id: 'quarterly_trend',
    title: '单季营收 / 归母净利（单季口径，非累计）',
    summary:
      '单季值由「本期累计 − 上期累计」推导（Q1 一季报本身就是单季）。' +
      '曲线的锯齿形态就是季节性本身：白酒春节备货使 Q1 明显高于其他季度属常态。看趋势要看「与去年同季比」，不能看绝对高低。',
    charts: [
      {
        type: 'bar',
        title: '单季营收（亿元）',
        unit: '亿元',
        categories: labels,
        series: [{ name: '单季营收', data: toYi(revSeries) }],
      },
      {
        type: 'bar',
        title: '单季归母净利（亿元）',
        unit: '亿元',
        categories: labels,
        series: [{ name: '单季归母净利', data: toYi(nppSeries) }],
      },
    ],
    details: [
      '累计值 vs 单季值：半年报/年报披露的是年初至今累计，直接拿两期累计相除算「同比」会把上年同期累计也卷进来，增长结论会被季节效应污染。',
      '本模块所有数字都是单季口径，可直接跨季比较。',
    ],
  });

  if (seasonShare)
    blocks.push({
      id: 'season_share',
      title: '季节分布（Q1 春节效应是否稳定）',
      summary:
        '每一行是一年、每一列是一个季度，颜色越深该季占全年营收的比重越高。' +
        'Q1 占比高是白酒春节备货的常态；同一列颜色逐年变化，才说明季节结构在漂移。' +
        '某季占比偏离历史区间 5 个百分点以上 = 渠道或需求行为变化的前兆，值得追查。',
      charts: [seasonShare],
    });

  return {
    moduleId: 'seasonality',
    moduleTitle: '季节性分析',
    blocks,
    warnings: skipped ? [`有 ${skipped} 期因缺上期累计无法推导单季值`] : undefined,
  };
}

export const seasonalityModule: AnalysisModule = {
  id: 'seasonality',
  title: '季节性分析',
  desc: '单季口径（累计差分推导）看营收/利润的季节分布与单季同比——识别春节效应与渠道行为变化。',
  problems: ['operations'],
  industries: [],
  run: runSeasonality,
};
