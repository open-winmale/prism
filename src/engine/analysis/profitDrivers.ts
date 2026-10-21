import type { AnalysisContext, AnalysisModule, AnalysisResult, InsightBlock } from './define';
import { LAOTANG_DUPONT_NOTE } from '../laotang/rules';
import { trendLine } from '../methods/trend';
import { periodLabel } from '../utils';

// 盈利驱动分解 —— 对齐 script「盈利能力页 + 困境反转包」：
// 回答「高 ROE 是靠产品（净利率）、效率（周转）还是杠杆」+ 各驱动力的**边际方向**（拐点信号）。
// 深层信息：ROE 水平本身不稀缺，稀缺的是「驱动结构稳定 + 方向向上」。

interface DriverTrend {
  years: string[];
  roe: (number | null)[];
  margin: (number | null)[];
  turnover: (number | null)[];
  leverage: (number | null)[];
}

function collectTrend(ctx: AnalysisContext): DriverTrend {
  const m = ctx.computed.metrics;
  return {
    years: ctx.computed.periods.map(periodLabel),
    roe: m.map((x) => x.roe_parent),
    margin: m.map((x) => x.net_margin_parent_dupont),
    turnover: m.map((x) => x.asset_turnover),
    leverage: m.map((x) => x.equity_multiplier_dupont),
  };
}

/** 方向判定：与上期比较；不足两期 → null */
function direction(arr: (number | null)[]): 'up' | 'down' | 'flat' | null {
  const n = arr.length;
  if (n < 2) return null;
  const a = arr[n - 2];
  const b = arr[n - 1];
  if (a == null || b == null) return null;
  const delta = b - a;
  if (Math.abs(delta) < a * 0.02) return 'flat';
  return delta > 0 ? 'up' : 'down';
}

const DIR_CN: Record<Exclude<ReturnType<typeof direction>, null>, string> = {
  up: '改善 ↑',
  down: '恶化 ↓',
  flat: '平稳 →',
};

export function runProfitDrivers(ctx: AnalysisContext): AnalysisResult {
  const t = collectTrend(ctx);
  const last = t.roe.length - 1;
  const roe = t.roe[last];
  const margin = t.margin[last];
  const turnover = t.turnover[last];
  const leverage = t.leverage[last];

  // 归因：三分量里谁对 ROE 贡献最大（乘法分解，用对数份额近似直观化）
  const drivers = [
    { key: 'margin', cn: '产品盈利（净利率）', value: margin, dir: direction(t.margin), unit: '%' as const },
    { key: 'turnover', cn: '运营效率（资产周转）', value: turnover, dir: direction(t.turnover), unit: '次' as const },
    { key: 'leverage', cn: '财务杠杆（权益乘数）', value: leverage, dir: direction(t.leverage), unit: 'x' as const },
  ].filter((d) => d.value != null);

  // 白酒等高毛利行业通常是「产品驱动」；识别主导驱动
  const dominant = drivers.reduce<typeof drivers[0] | null>(
    (best, d) => (best == null ? d : d.value! > best.value! ? d : best),
    null,
  );

  const blocks: InsightBlock[] = [];

  // 头条：ROE 驱动结构
  const dirText = drivers.map((d) => `${d.cn} ${DIR_CN[d.dir ?? 'flat']}`).join('，');
  blocks.push({
    id: 'driver_structure',
    title: `ROE ${(roe == null ? 0 : roe * 100).toFixed(1)}% 由谁驱动：${dominant?.cn ?? '—'}`,
    severity: (roe ?? 0) >= 0.15 ? 'low' : (roe ?? 0) >= 0.08 ? 'mid' : 'high',
    summary:
      `最新期净利率 ${(margin == null ? 0 : margin * 100).toFixed(1)}%、总资产周转 ${turnover?.toFixed(2) ?? '—'} 次、权益乘数 ${leverage?.toFixed(2) ?? '—'} 倍。` +
      `边际方向：${dirText}。` +
      (dominant?.dir === 'down'
        ? `注意：主导驱动「${dominant.cn}」正在恶化，ROE 的可持续性存疑——这是比 ROE 水平本身更重要的信号。`
        : dominant?.dir === 'up'
          ? `主导驱动「${dominant.cn}」仍在改善，盈利能力处于上行通道。`
          : `各驱动力基本平稳，ROE 结构稳定。`),
    charts: [
      trendLine(t.years, [
        { name: 'ROE(归母·杜邦)%', values: t.roe.map((v) => (v == null ? null : v * 100)) },
        { name: '净利率%', values: t.margin.map((v) => (v == null ? null : v * 100)) },
      ], { title: 'ROE 与净利率', unit: '%' }),
    ],
    details: [
      '判断口诀：净利率驱动=靠产品（最好），周转驱动=靠效率（次之），杠杆驱动=靠借钱（最差）。',
      '看边际方向比看水平更重要：连续两年恶化的主导驱动，往往领先于 ROE 见顶。',
    ],
    laotang: LAOTANG_DUPONT_NOTE,
  });

  // 拐点侦测：净利率连续变化
  const marginDirs = t.margin.map((_, i) => {
    if (i === 0) return null;
    const a = t.margin[i - 1];
    const b = t.margin[i];
    if (a == null || b == null) return null;
    return b - a;
  });
  const recentDeltas = marginDirs.slice(-3).filter((v): v is number => v != null);
  const allDown = recentDeltas.length >= 2 && recentDeltas.every((d) => d < 0);
  const allUp = recentDeltas.length >= 2 && recentDeltas.every((d) => d > 0);
  if (allDown || allUp) {
    blocks.push({
      id: 'margin_inflection',
      title: allDown ? '⚠ 盈利能力拐点：净利率连续下行' : '✓ 盈利能力拐点：净利率连续上行',
      severity: allDown ? 'mid' : 'info',
      summary: allDown
        ? `净利率已连续 ${recentDeltas.length} 年下滑（${recentDeltas.map((d) => (d * 100).toFixed(1) + 'pct').join('、')}）。对高毛利公司，这通常意味着竞争加剧或提价能力见顶——需要去验证产品端的量价结构。`
        : `净利率连续 ${recentDeltas.length} 年改善，盈利能力处于扩张期。`,
      charts: [
        trendLine(t.years, [{ name: '净利率%', values: t.margin.map((v) => (v == null ? null : v * 100)) }], {
          title: '净利率趋势',
          unit: '%',
        }),
      ],
    });
  }

  return { moduleId: 'profitDrivers', moduleTitle: '盈利驱动分解', blocks };
}

export const profitDriversModule: AnalysisModule = {
  id: 'profitDrivers',
  title: '盈利驱动分解',
  desc: 'ROE 三因子归因 + 边际方向（拐点侦测）：回答「高 ROE 靠产品、效率还是杠杆，方向向上还是向下」。',
  problems: ['profitability'],
  industries: [],
  run: runProfitDrivers,
};
