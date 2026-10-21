import type { AnalysisContext, AnalysisModule, AnalysisResult, ChartSpec, InsightBlock } from './define';
import type { IndustryKey, Num, PeriodReport } from '../schema/types';
import { fieldGetter } from '../compute';
import { LAOTANG_MINING_RULES } from '../laotang/rules';
import { periodLabel, safeDiv, safeSum, yoy } from '../utils';
import { sameQuarterYoyOf } from '../methods/columns';
import { compareBars } from '../methods/horizontal';
import { trendLine } from '../methods/trend';

export type MineSeverity = 'high' | 'mid' | 'low';
export type MineStatus = 'triggered' | 'safe' | 'na';

// 单项排雷检查的完整档案：不止「触发/安全」，还要说清为什么危险/为什么安全、下一步核查什么。
// Hero 报告与排雷模块共用这份数据，保证两处口径一致。
export interface MineCheck {
  id: string;
  name: string;
  severity: MineSeverity;
  status: MineStatus;
  evidence: string; // 关键佐证（一句话数字）
  why?: string; // 触发=为什么危险；安全=为什么安全；na=缺什么数据
  next?: string; // 触发时：下一步核查什么
  laotang?: string; // 老唐原理
  chart?: ChartSpec; // 触发时的证据图
  /** 对应的三表科目字段：供「在财报中查看」证据回链 */
  field?: string;
}

// 行业阈值表（IMPLEMENTATION_PLAN.md §3.1）——
// 规则相同、阈值与文案分行业，避免「制造业标尺误判白酒」。
interface MineThresholds {
  arRatioGate: number; // 应收/营收 比重门槛
  arBeatYears: number; // 应收增速跑赢营收的最少年数
  arSeverity: MineSeverity; // 触发等级（白酒降为 low：先款后货几乎无应收）
  arSafeNote?: string; // 行业化安全文案补充
  invMode: 'total' | 'finished'; // 存货检查用总额还是成品口径（白酒=基酒是竞争力，只查成品）
  invRatioGate: number;
  invRatioGateFallback?: number; // 成品拆分缺失时回退总额口径的阈值（白酒：总额含基酒，需放宽）
  invBeatYears: number;
  invSeverity: MineSeverity;
  cfoWindowYears: number; // CFO/净利润 滑动窗口（白酒=3 年均值，平滑预收款扰动）
  cfoGate: number;
  cfoSalesCashExempt: boolean; // 收现比 >1 时豁免（白酒特有：预收款使单年 CFO 剧烈波动但收现极好）
  gmMode: 'bench' | 'self'; // 毛利率畸高：对同业基准（通用）还是对自身 5 年均值（白酒：90% 毛利是护城河）
  gmDeviation: number;
  cipNote?: string;
}

const GENERAL_T: MineThresholds = {
  arRatioGate: 0.15,
  arBeatYears: 2,
  arSeverity: 'high',
  invMode: 'total',
  invRatioGate: 0.5,
  invBeatYears: 2,
  invSeverity: 'high',
  cfoWindowYears: 1,
  cfoGate: 0.8,
  cfoSalesCashExempt: false,
  gmMode: 'bench',
  gmDeviation: 0.1,
};

const LIQUOR_T: MineThresholds = {
  arRatioGate: 0.3,
  arBeatYears: 2,
  arSeverity: 'low',
  arSafeNote: '（白酒先款后货，正常应收极低）',
  invMode: 'finished',
  invRatioGate: 0.25,
  invRatioGateFallback: 0.6, // 无成品拆分时回退总额：茅台存货/营收~30% 且大头是基酒，0.25 会误报
  invBeatYears: 2,
  invSeverity: 'high',
  cfoWindowYears: 3,
  cfoGate: 0.8,
  cfoSalesCashExempt: true,
  gmMode: 'self',
  gmDeviation: 0.05,
  cipNote: '白酒扩产周期 2–3 年属正常节奏，重点看是否长期挂账不转固。',
};

function thresholdsFor(industry: IndustryKey): MineThresholds {
  return industry === 'liquor' ? LIQUOR_T : GENERAL_T;
}

const lt = (id: string): string | undefined => LAOTANG_MINING_RULES.find((r) => r.id === id)?.principle;

function pick(report: PeriodReport, field: string): Num {
  return fieldGetter(report)(field);
}

function arr(ctx: AnalysisContext, field: string): Num[] {
  return ctx.dataset.reports.map((r) => pick(r, field));
}

function yoyArr(values: Num[]): Num[] {
  return values.map((v, i) => (i === 0 ? null : yoy(v, values[i - 1])));
}

function pct(v: Num, digits = 0): string {
  return v == null ? '—' : `${(v * 100).toFixed(digits)}%`;
}

function isNum(v: Num | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function naCheck(
  id: string,
  name: string,
  severity: MineSeverity,
  evidence: string,
  why: string,
  field?: string,
): MineCheck {
  return { id, name, severity, status: 'na', evidence, why, field };
}

function yoyPairs(a: Num[], b: Num[]): number {
  return a.slice(1).filter((v, i) => isNum(v) && isNum(b[i + 1])).length;
}

const beatYears = (a: Num[], b: Num[]): number =>
  a.slice(1).filter((v, i) => v != null && b[i + 1] != null && (v as number) > (b[i + 1] as number)).length;

// 9 项老唐排雷检查（口径与老唐《手把手教你读财报》排雷清单一致）
// 阈值与严重度按 ctx.industry 行业化：白酒用 LIQUOR_T，其余用通用制造业标尺。
export function mineChecks(ctx: AnalysisContext): MineCheck[] {
  const T = thresholdsFor(ctx.industry);
  // 季度模式（单季视图）：同比必须是「同季对比」，相邻期对比是环比，会被季节效应污染。
  const quarterly = ctx.dataset.meta?.dataMode === 'quarterly';
  const yoySeries = (values: Num[]): Num[] =>
    quarterly ? sameQuarterYoyOf(ctx.dataset.reports, values) : yoyArr(values);
  const beatUnit = quarterly ? '期' : '年';
  const labels = ctx.computed.periods.map((period, i) => {
    if (!quarterly) return periodLabel(period);
    const sampling = ctx.dataset.reports[i]?.sampling ?? 'Q4';
    return `${period}Q${sampling.slice(1)}`;
  });
  const revenue = arr(ctx, 'total_revenue');
  const ar = arr(ctx, 'accounts_receivable').map((v, i) =>
    safeSum([v, arr(ctx, 'notes_receivable')[i], arr(ctx, 'receivables_financing')[i]]),
  );
  const inventory = arr(ctx, 'inventories');
  const npp = arr(ctx, 'net_profit_parent');
  const cfo = arr(ctx, 'net_cash_operating');
  const orec = arr(ctx, 'other_receivables');
  const ta = arr(ctx, 'total_assets');
  const monetary = arr(ctx, 'monetary_funds');
  const ibd = ctx.computed.metrics.map((x) => x.interest_bearing_debt);
  const goodwill = arr(ctx, 'goodwill');
  const ep = arr(ctx, 'equity_parent');
  const cip = arr(ctx, 'cip');
  const fa = arr(ctx, 'fixed_assets');
  const last = labels.length - 1;
  const checks: MineCheck[] = [];

  // 1) 应收增速持续高于营收增速（且应收/营收达到可观比重，避免误伤低应收优质公司）
  {
    const arYoy = yoySeries(ar);
    const revYoy = yoySeries(revenue);
    const pairs = yoyPairs(arYoy, revYoy);
    if (!isNum(ar[last]) || !isNum(revenue[last])) {
      checks.push(
        naCheck(
          'ar_growth',
          '应收增速持续高于营收增速',
          T.arSeverity,
          '缺应收/营收数据',
          '无法判断应收是否持续跑赢营收：需要应收与营收数据。',
        ),
      );
    } else {
      const arRatio = ar[last] / revenue[last];
      if (arRatio <= T.arRatioGate) {
        checks.push({
          id: 'ar_growth', field: 'accounts_receivable',
          name: '应收增速持续高于营收增速',
          severity: T.arSeverity,
          status: 'safe',
          evidence: `最新应收/营收=${pct(arRatio)}，低于 ${pct(T.arRatioGate)} 门槛`,
          why: `应收/营收仅 ${pct(arRatio)}，应收规模很小，不存在靠放宽信用虚增收入的结构性风险${T.arSafeNote ?? ''}。`,
          laotang: lt('ar_growth'),
        });
      } else if (pairs < T.arBeatYears) {
        checks.push(
          naCheck(
            'ar_growth',
            '应收增速持续高于营收增速',
            T.arSeverity,
            `应收/营收=${pct(arRatio)}，但有效同比仅 ${pairs} 年`,
            `应收占比已高于 ${pct(T.arRatioGate)} 门槛，但历史期不足 ${T.arBeatYears} 年，无法判断是否持续跑赢营收。`,
          ),
        );
      } else {
        const beat = beatYears(arYoy, revYoy);
        const triggered = beat >= T.arBeatYears && arRatio > T.arRatioGate;
        checks.push({
          id: 'ar_growth', field: 'accounts_receivable',
          name: '应收增速持续高于营收增速',
          severity: T.arSeverity,
          status: triggered ? 'triggered' : 'safe',
          evidence: `最新应收/营收=${pct(arRatio)}；应收增速跑赢营收 ${beat} ${beatUnit}`,
          why: triggered
            ? '应收账款增速连续多年跑赢营收，收入可能并未真正变现——存在渠道压货或放宽信用政策虚增收入的嫌疑。'
            : `应收/营收 ${pct(arRatio)}，且回款增速未持续跑赢营收——收入基本都收回了钱${T.arSafeNote ?? ''}。`,
          next: triggered ? '下一步：看附注「应收账款」账龄与前五大欠款方，核对期后回款情况。' : undefined,
          laotang: lt('ar_growth'),
          chart: triggered
            ? compareBars(
                labels,
                [
                  { name: '应收增速', data: arYoy.map((v) => (v == null ? null : v * 100)) },
                  { name: '营收增速', data: revYoy.map((v) => (v == null ? null : v * 100)) },
                ],
                { title: '应收 vs 营收 同比', unit: '%' },
              )
            : undefined,
        });
      }
    }
  }

  // 2) 存货增速持续高于营收增速（且存货/营收达到可观比重）
  // 白酒版：改查「库存商品/营收」——基酒储存 3–5 年是竞争力而非风险；基酒增长单独输出中性提示。
  {
    const revYoy = yoyArr(revenue);

    const finishedInv = arr(ctx, 'inventory_finished');
    const hasFinished = finishedInv.some(isNum);
    const useFinished = T.invMode === 'finished' && hasFinished;
    const gate = useFinished ? T.invRatioGate : (T.invRatioGateFallback ?? T.invRatioGate);
    const target = useFinished ? finishedInv : inventory;
    const targetYoy = yoySeries(target);
    const pairs = yoyPairs(targetYoy, revYoy);

    if (!isNum(target[last]) || !isNum(revenue[last])) {
      checks.push(
        naCheck(
          'inventory_growth',
          useFinished ? '成品库存增速持续高于营收增速' : '存货增速持续高于营收增速',
          T.invSeverity,
          `缺${useFinished ? '库存商品' : '存货'}/营收数据`,
          '无法判断存货是否持续跑赢营收：需要存货与营收数据。',
        ),
      );
    } else {
      const targetRatio = target[last] / revenue[last];
      if (targetRatio <= gate) {
        const wip = arr(ctx, 'inventory_wip');
        const hasWip = wip.some(isNum);
        const wipNote =
          ctx.industry === 'liquor' && hasWip && useFinished
            ? ` 半成品（基酒）${((wip[last] ?? 0) / 1e8).toFixed(0)} 亿不计入排雷——基酒储备是白酒产能与品质护城河。`
            : '';
        checks.push({
          id: 'inventory_growth', field: 'inventories',
          name: useFinished ? '成品库存增速持续高于营收增速' : '存货增速持续高于营收增速',
          severity: T.invSeverity,
          status: 'safe',
          evidence: `${useFinished ? '库存商品' : '存货'}/营收=${pct(targetRatio)}，低于 ${pct(gate)} 门槛${
            useFinished
              ? '（基酒口径已排除）'
              : ctx.industry === 'liquor'
                ? '（总额口径：含基酒储备，阈放宽至 ' + pct(gate) + '）'
                : ''
          }`,
          why: `${useFinished ? '库存商品' : '存货'}/营收 ${pct(targetRatio)}，备货规模与销售节奏匹配（白酒等长周期储备行业请结合产业特性理解）。${wipNote}`,
          laotang: lt('inventory_growth'),
        });
      } else if (pairs < T.invBeatYears) {
        checks.push(
          naCheck(
            'inventory_growth',
            useFinished ? '成品库存增速持续高于营收增速' : '存货增速持续高于营收增速',
            T.invSeverity,
            `${useFinished ? '库存商品' : '存货'}/营收=${pct(targetRatio)}，但有效同比仅 ${pairs} 年`,
            `存货占比已高于 ${pct(gate)} 门槛，但历史期不足 ${T.invBeatYears} 年，无法判断是否持续跑赢营收。`,
          ),
        );
      } else {
        const beat = beatYears(targetYoy, revYoy);
        const triggered = beat >= T.invBeatYears && targetRatio > gate;

        const wip = arr(ctx, 'inventory_wip');
        const hasWip = wip.some(isNum);
        const wipNote =
          ctx.industry === 'liquor' && hasWip && useFinished
            ? ` 半成品（基酒）${((wip[last] ?? 0) / 1e8).toFixed(0)} 亿不计入排雷——基酒储备是白酒产能与品质护城河，增长属中性偏正面。`
            : '';

        checks.push({
          id: 'inventory_growth', field: 'inventories',
          name: useFinished ? '成品库存增速持续高于营收增速' : '存货增速持续高于营收增速',
          severity: T.invSeverity,
          status: triggered ? 'triggered' : 'safe',
          evidence: useFinished
            ? `最新库存商品/营收=${pct(targetRatio)}（基酒口径已排除）；成品增速跑赢营收 ${beat} ${beatUnit}`
            : `最新存货/营收=${pct(targetRatio)}${ctx.industry === 'liquor' ? '（总额口径：含基酒储备，阈放宽至 ' + pct(gate) + '）' : ''}；存货增速跑赢营收 ${beat} ${beatUnit}`,
          why: triggered
            ? useFinished
              ? '成品库存增速连续高于营收且占比可观——终端动销可能跟不上出货节奏，渠道压货或滞销风险需排查。'
              : '存货增速连续高于营收且体量可观，产品可能滞销或虚增库存——需区分「藏利润」还是「埋雷」。'
            : `${useFinished ? '库存商品' : '存货'}/营收 ${pct(targetRatio)}，备货规模与销售节奏匹配（白酒等长周期储备行业请结合产业特性理解）。${wipNote}`,
          next: triggered ? '下一步：看存货附注构成（库存商品 vs 基酒/原材料）与跌价准备计提是否充分。' : undefined,
          laotang: lt('inventory_growth'),
          chart: triggered
            ? compareBars(
                labels,
                [
                  { name: useFinished ? '库存商品增速' : '存货增速', data: targetYoy.map((v) => (v == null ? null : v * 100)) },
                  { name: '营收增速', data: revYoy.map((v) => (v == null ? null : v * 100)) },
                ],
                { title: `${useFinished ? '库存商品' : '存货'} vs 营收 同比`, unit: '%' },
              )
            : undefined,
        });
      }
    }
  }

  // 3) 经营现金流长期低于净利润
  // 白酒版：3 年滑动均值判定 + 收现比>1 豁免——预收款使单年 CFO 剧烈波动，但收现质量极好。
  {
    const ratio = cfo.map((v, i) => safeDiv(v, npp[i]));
    const valid = ratio.slice(1).filter(isNum);
    const need = Math.min(T.cfoWindowYears, 1);
    if (!isNum(cfo[last]) || !isNum(npp[last]) || valid.length < need) {
      checks.push(
        naCheck(
          'cfo_vs_profit',
          '经营现金流长期低于净利润',
          'high',
          `缺经营现金流/归母净利或历史期不足（有效 ${valid.length} 年）`,
          '无法判断利润含金量：需要经营现金流与归母净利润数据。',
        ),
      );
    } else {
      const window = Math.min(T.cfoWindowYears, valid.length);
      const recent = valid.slice(-window);
      const avgRatio = recent.reduce((s, v) => s + v, 0) / recent.length;
      const salesCash = ctx.computed.metrics.map((x) => x.sales_cash_ratio);
      const salesCashLatest = isNum(salesCash[last]) ? salesCash[last] : null;
      const salesCashExempt = T.cfoSalesCashExempt && avgRatio < T.cfoGate && (salesCashLatest ?? 0) > 1.0;
      const below = ratio.slice(1).filter((v): v is number => isNum(v) && v < T.cfoGate);
      const triggered = avgRatio < T.cfoGate && !salesCashExempt;
      const windowLabel = T.cfoWindowYears > 1 ? `近 ${window} 年均值` : '最新值';
      checks.push({
        id: 'cfo_vs_profit', field: 'net_cash_operating',
        name: '经营现金流长期低于净利润',
        severity: 'high',
        status: triggered ? 'triggered' : 'safe',
        evidence: `经营现金流/归母净利润：${windowLabel}=${pct(avgRatio)}（阈 ${pct(T.cfoGate)}）${salesCashExempt ? `；收现比 ${pct(salesCashLatest)} >100% 豁免` : `；近 ${below.length} 年低于 ${pct(T.cfoGate)}`}`,
        why: triggered
          ? '净利润的「含金量」不足：账面利润没有同步变成现金，需警惕应收/存货占用或利润调节。'
          : salesCashExempt
            ? `单年 CFO 受预收款节奏扰动低于净利润，但${windowLabel} ${pct(avgRatio)} 且收现比 ${pct(salesCashLatest)}——收进来的都是真钱，利润含金量无忧。`
            : `近年经营现金流/净利润均值 ${pct(avgRatio)}——利润基本都变成了真金白银。`,
        next: triggered ? '下一步：对比应收+存货的增量与现金流缺口，查「销售收现比」趋势是否同步恶化。' : undefined,
        laotang: lt('cfo_vs_profit'),
        chart: triggered
          ? trendLine(labels, [{ name: '经营现金流/归母净利润', values: ratio.map((v) => (v == null ? null : v * 100)) }], {
              title: '利润含金量（>100% 为佳）',
              unit: '%',
              refLines: [{ value: T.cfoGate * 100, label: `警戒线 ${pct(T.cfoGate)}` }],
            })
          : undefined,
      });
    }
  }

  // 4) 其他应收款异常庞大
  {
    const ratio = orec.map((v, i) => safeDiv(v, ta[i]));
    if (!isNum(orec[last]) || !isNum(ta[last])) {
      checks.push(
        naCheck(
          'other_receivables',
          '其他应收款异常庞大',
          'high',
          '缺其他应收款/总资产数据',
          '无法判断其他应收款是否异常：需要其他应收款与总资产数据。',
        ),
      );
    } else {
      const validRatios = ratio.filter(isNum);
      const maxRatio = Math.max(...validRatios);
      const triggered = maxRatio > 0.05;
      checks.push({
        id: 'other_receivables', field: 'other_receivables',
        name: '其他应收款异常庞大',
        severity: 'high',
        status: triggered ? 'triggered' : 'safe',
        evidence: `其他应收款/总资产峰值=${pct(maxRatio)}（警戒线 5%）`,
        why: triggered
          ? '其他应收款是「装不下只好藏着」的科目，占比偏高常指向大股东资金占用或关联方往来，是排雷重点。'
          : `其他应收款/总资产峰值仅 ${pct(maxRatio)}，远低于 5% 警戒线——大股东占款风险低。`,
        next: triggered ? '下一步：看其他应收款明细与前几名往来方，确认是否与大股东及其关联方相关。' : undefined,
        laotang: lt('other_receivables'),
        chart: triggered
          ? trendLine(labels, [{ name: '其他应收款/总资产', values: ratio.map((v) => (v == null ? null : v * 100)) }], {
              title: '其他应收款占比',
              unit: '%',
            })
          : undefined,
      });
    }
  }

  // 5) 大存大贷
  {
    const ibdLast = ibd[last];
    if (!isNum(monetary[last]) || !isNum(ibdLast) || !isNum(ta[last])) {
      checks.push(
        naCheck(
          'big_deposit_big_loan',
          '大存大贷',
          'mid',
          '缺货币资金/有息负债/总资产数据',
          '无法判断是否存在「账上有钱还高息举债」：需要货币资金、有息负债与总资产数据。',
        ),
      );
    } else {
      const ibdRatio = ibdLast / ta[last];
      const triggered = monetary[last] > ibdLast && ibdRatio > 0.3;
      checks.push({
        id: 'big_deposit_big_loan', field: 'monetary_funds',
        name: '大存大贷',
        severity: 'mid',
        status: triggered ? 'triggered' : 'safe',
        evidence: `货币资金 ${(monetary[last] / 1e8).toFixed(0)} 亿 vs 有息负债 ${(ibdLast / 1e8).toFixed(0)} 亿；有息负债/总资产=${pct(ibdRatio)}`,
        why: triggered
          ? '账上货币资金充裕却同时背负高额有息负债、长年付息——资金真实性与受限情况存疑（康美、康得新皆此相）。'
          : `有息负债/总资产 ${pct(ibdRatio)}，不存在「账上有钱还高息举债」的矛盾结构。`,
        next: triggered ? '下一步：看货币资金附注的受限/质押比例与利息收入是否与存款规模匹配。' : undefined,
        laotang: lt('big_deposit_big_loan'),
        chart: triggered
          ? compareBars(
              labels,
              [
                { name: '货币资金', data: monetary.map((v) => (v == null ? null : v / 1e8)) },
                { name: '有息负债', data: ibd.map((v) => (v == null ? null : v / 1e8)) },
              ],
              { title: '大存大贷对比（亿元）', unit: '亿' },
            )
          : undefined,
      });
    }
  }

  // 6) 商誉占净资产过高
  {
    if (!isNum(goodwill[last]) || !isNum(ep[last])) {
      checks.push(
        naCheck(
          'goodwill',
          '商誉占净资产过高',
          'mid',
          '缺商誉/归母权益数据',
          '无法判断商誉减值风险：需要商誉与归母权益数据（源字段缺失时不按 0 处理）。',
        ),
      );
    } else {
      const ratio = goodwill[last] / ep[last];
      const triggered = ratio > 0.3;
      checks.push({
        id: 'goodwill', field: 'goodwill',
        name: '商誉占净资产过高',
        severity: 'mid',
        status: triggered ? 'triggered' : 'safe',
        evidence: `最新商誉/归母权益=${pct(ratio)}（警戒线 30%）`,
        why: triggered
          ? '商誉是并购溢价而非真实资产，占比过高意味着一旦标的业绩不达标，巨额减值将直接吞噬利润。'
          : `商誉/归母权益仅 ${pct(ratio)}，商誉减值对净资产的潜在冲击小。`,
        next: triggered ? '下一步：看并购标的业绩承诺完成率与年报商誉减值测试的关键假设。' : undefined,
        laotang: lt('goodwill'),
        chart: triggered
          ? trendLine(labels, [{ name: '商誉/归母权益', values: goodwill.map((v, i) => (v == null || ep[i] == null ? null : (v / ep[i]!) * 100)) }], {
              title: '商誉占净资产',
              unit: '%',
            })
          : undefined,
      });
    }
  }

  // 7) 净利润依赖非经常性损益
  {
    const excl = arr(ctx, 'net_profit_excl_nonrecurring');
    const exclLast = excl[last];
    if (!isNum(exclLast) || !isNum(npp[last])) {
      checks.push(
        naCheck(
          'nonrecurring',
          '净利润主要靠非经常性损益',
          'mid',
          '缺少「扣非净利润」或最新归母净利润数据',
          '无法拆分利润的主业成色：需要扣非净利润与归母净利润数据。',
        ),
      );
    } else {
      const ratio = npp.map((v, i) => (excl[i] != null && v ? (v - excl[i]!) / v : null));
      const latest = (npp[last] - exclLast) / npp[last];
      const triggered = latest > 0.3;
      checks.push({
        id: 'nonrecurring', field: 'net_profit_excl_nonrecurring',
        name: '净利润主要靠非经常性损益',
        severity: 'mid',
        status: triggered ? 'triggered' : 'safe',
        evidence: `最新非经常性损益/归母净利润=${pct(latest)}（警戒线 30%）`,
        why: triggered
          ? '利润主要靠卖资产、政府补贴或投资收益撑着，主业盈利能力存疑，这种「盈利」不可持续。'
          : `非经常性损益占净利润仅 ${pct(latest)}，利润主要来自主业。`,
        next: triggered ? '下一步：拆非经常性损益明细（政府补助/资产处置/公允价值变动），评估可持续性。' : undefined,
        laotang: lt('nonrecurring'),
        chart: triggered
          ? trendLine(labels, [{ name: '非经常性损益/净利润', values: ratio.map((v) => (v == null ? null : v * 100)) }], {
              title: '非经常性损益占比',
              unit: '%',
            })
          : undefined,
      });
    }
  }

  // 8) 毛利率畸高且无护城河
  // 通用：对同业基准 +10pct；白酒：对自身 5 年均值偏离 >5pct 且无产品结构解释（90% 毛利是护城河）。
  {
    const gm = ctx.computed.metrics.map((x) => x.gross_margin);
    if (!isNum(gm[last])) {
      checks.push(
        naCheck(
          'gross_margin_anomaly',
          T.gmMode === 'self' ? '毛利率显著偏离自身均值' : '毛利率畸高且无护城河',
          'mid',
          '缺少最新毛利率数据',
          '无法判断毛利率是否异常：需要营收与营业成本数据。',
        ),
      );
    } else if (T.gmMode === 'self') {
      const valid = gm.filter(isNum);
      const selfAvg = valid.length >= 2 ? valid.reduce((s, v) => s + v, 0) / valid.length : null;
      if (selfAvg != null) {
        const latest = gm[last];
        const dev = latest - selfAvg;
        const triggered = Math.abs(dev) > T.gmDeviation;
        checks.push({
          id: 'gross_margin_anomaly', field: 'total_revenue',
          name: '毛利率显著偏离自身均值',
          severity: 'mid',
          status: triggered ? 'triggered' : 'safe',
          evidence: `最新毛利率 ${pct(latest, 1)} vs 自身 ${valid.length} 年均值 ${pct(selfAvg, 1)}（偏离 ${(dev * 100).toFixed(1)}pct）`,
          why: triggered
            ? dev > 0
              ? `毛利率骤升 ${pct(dev, 1)}pct：高端白酒 90% 上下的毛利是护城河，但骤变需解释——是否产品结构（及非标/直销占比）突变或成本结转异常。`
              : `毛利率骤降 ${pct(-dev, 1)}pct：可能是产品结构下移/促销加大，需结合量价与渠道数据核实。`
            : `毛利率 ${pct(latest, 1)} 与自身均值 ${pct(selfAvg, 1)} 基本一致——高端白酒的超高毛利是品牌护城河，稳定本身就是信号。`,
          next: triggered ? '下一步：拆分产品结构收入（高端/系列酒）与直销渠道占比，解释毛利率变动来源。' : undefined,
          laotang: lt('gross_margin_anomaly'),
          chart: triggered
            ? trendLine(
                labels,
                [
                  { name: '毛利率', values: gm.map((v) => (v == null ? null : v * 100)) },
                  { name: '自身均值', values: gm.map(() => selfAvg * 100) },
                ],
                { title: '毛利率 vs 自身均值', unit: '%' },
              )
            : undefined,
        });
      } else {
        checks.push({
          id: 'gross_margin_anomaly', field: 'total_revenue',
          name: '毛利率显著偏离自身均值',
          severity: 'mid',
          status: 'na',
          evidence: '缺少毛利率数据',
          why: '无法计算自身均值基准。',
        });
      }
    } else if (ctx.peerBench?.gross_margin != null) {
      const bench = ctx.peerBench.gross_margin;
      const latest = gm[last];
      const triggered = latest > bench + T.gmDeviation;
      checks.push({
        id: 'gross_margin_anomaly', field: 'total_revenue',
        name: '毛利率畸高且无护城河',
        severity: 'mid',
        status: triggered ? 'triggered' : 'safe',
        evidence: `最新毛利率 ${pct(latest, 1)} vs 同业基准 ${pct(bench)}`,
        why: triggered
          ? '毛利率明显高于同业却无品牌/技术/牌照护城河支撑，需警惕收入确认或成本结转的人为调节。'
          : `毛利率 ${pct(latest, 1)} 与同业基准 ${pct(bench)} 未显著偏离，未见异常。`,
        laotang: lt('gross_margin_anomaly'),
        chart: triggered
          ? trendLine(
              labels,
              [
                { name: `${ctx.dataset.name}毛利率`, values: gm.map((v) => (v == null ? null : v * 100)) },
                { name: '同业基准', values: gm.map(() => bench * 100) },
              ],
              { title: '毛利率 vs 同业', unit: '%' },
            )
          : undefined,
      });
    } else {
      checks.push({
        id: 'gross_margin_anomaly', field: 'total_revenue',
        name: '毛利率畸高且无护城河',
        severity: 'mid',
        status: 'na',
        evidence: '缺少同业毛利率基准',
        why: '毛利率是否「畸高」必须有同业参照（连接赢麻了开放平台可获取行业基准）。',
      });
    }
  }

  // 9) 在建工程长期不转固
  {
    if (!isNum(cip[last]) || !isNum(fa[last]) || fa[last] === 0) {
      checks.push(
        naCheck(
          'cip_stuck',
          '在建工程长期不转固',
          'low',
          '缺在建工程/固定资产数据',
          '无法判断在建工程是否长期挂账：需要在建工程与固定资产数据。',
        ),
      );
    } else {
      const ratio = cip[last] / fa[last];
      const triggered = ratio > 0.3;
      checks.push({
        id: 'cip_stuck', field: 'cip',
        name: '在建工程长期不转固',
        severity: 'low',
        status: triggered ? 'triggered' : 'safe',
        evidence: `最新在建工程/固定资产=${pct(ratio)}（警戒线 30%）`,
        why: triggered
          ? `在建工程不转固可规避折旧、美化利润；长期挂账且金额巨大，需警惕费用藏进工程里。${T.cipNote ?? ''}`
          : `在建工程/固定资产仅 ${pct(ratio)}，转固节奏正常，折旧计提完整。${T.cipNote ? `白酒扩产周期 2–3 年属正常节奏。` : ''}`,
        next: triggered ? '下一步：看在建工程附注的工程进度与转固时间表，查利息资本化是否过度。' : undefined,
        laotang: lt('cip_stuck'),
        chart: triggered
          ? trendLine(labels, [{ name: '在建工程/固定资产', values: cip.map((v, i) => (v == null || fa[i] == null ? null : (v / fa[i]!) * 100)) }], {
              title: '在建工程占固定资产',
              unit: '%',
            })
          : undefined,
      });
    }
  }

  // 10) 渠道信心（白酒专属）：合同负债/营收 连续 2 年环比降 >20% → mid
  // 白酒第一领先指标：经销商打款意愿。字段/派生指标 M1 已就绪，缺失时输出 na。
  if (ctx.industry === 'liquor') {
    const clRatio = ctx.computed.metrics.map((x) => x.contract_liab_ratio);
    const valid = clRatio.filter(isNum);
    if (!isNum(clRatio[last]) || valid.length < 2) {
      checks.push(
        naCheck(
          'channel_confidence',
          '渠道信心（合同负债蓄水池）',
          'mid',
          valid.length === 0 ? '缺少合同负债/预收款项数据' : `合同负债历史期不足（有效 ${valid.length} 期）`,
          '合同负债是白酒第一领先指标——经销商提前打款的意愿直接反映渠道信心；数据不足时不做判断。',
        ),
      );
    } else {
      let dropStreak = 0;
      let maxDrop = 0;
      for (let i = 1; i < clRatio.length; i++) {
        const cur = clRatio[i];
        const prev = clRatio[i - 1];
        if (!isNum(cur) || !isNum(prev) || prev === 0) continue;
        const drop = 1 - cur / prev;
        if (drop > 0.2) {
          dropStreak++;
          maxDrop = Math.max(maxDrop, drop);
        } else {
          dropStreak = 0;
        }
      }
      const triggered = dropStreak >= 2;
      checks.push({
        id: 'channel_confidence', field: 'contract_liabilities',
        name: '渠道信心（合同负债蓄水池）',
        severity: 'mid',
        status: triggered ? 'triggered' : 'safe',
        evidence: `合同负债/营收最新 ${pct(clRatio[last])}；连续缩水超 20% 的期数 ${dropStreak} 期（最大降幅 ${pct(maxDrop)}）`,
        why: triggered
          ? '合同负债占营收比例连续两期大幅下滑——经销商打款意愿减弱，渠道信心退潮往往领先于收入降速，需排查终端动销与批价。'
          : `合同负债/营收 ${pct(clRatio[last])}，蓄水池水位稳定——经销商提前打款意愿未减弱，渠道信心充足。`,
        next: triggered ? '下一步：查合同负债附注季节奏（Q4/Q1 打款）、批价走势与经销商大会政策，判断是需求走弱还是主动控货。' : undefined,
        laotang: '预收款是白酒公司调节利润的「蓄水池」，也是观察渠道景气度的第一窗口——水位骤降要警惕，蓄水提升是积极的领先信号。',
        chart: triggered
          ? trendLine(labels, [{ name: '合同负债/营收', values: clRatio.map((v) => (v == null ? null : v * 100)) }], {
              title: '渠道蓄水池水位',
              unit: '%',
            })
          : undefined,
      });
    }
  }

  return checks;
}

// 综合判定：verdict + 数据完整度。Hero 报告头直接使用。
export type MineVerdict = 'safe' | 'watch' | 'danger' | 'insufficient';

export function mineVerdict(checks: MineCheck[]): MineVerdict {
  const triggered = checks.filter((c) => c.status === 'triggered');
  if (triggered.some((c) => c.severity === 'high')) return 'danger';
  const na = checks.filter((c) => c.status === 'na').length;
  // 缺数据不等于安全：na 达到 3 项或 30% 时，结论只能是「数据不足」。
  if (na >= 3 || (checks.length > 0 && na / checks.length >= 0.3)) return 'insufficient';
  if (triggered.some((c) => c.severity === 'mid')) return 'watch';
  return 'safe';
}

export function runMineDetect(ctx: AnalysisContext): AnalysisResult {
  const checks = mineChecks(ctx);
  const counts = { high: 0, mid: 0, low: 0, na: 0 };
  for (const c of checks) {
    if (c.status === 'triggered') counts[c.severity]++;
    if (c.status === 'na') counts.na++;
  }

  const verdict = mineVerdict(checks);
  const naNote = counts.na > 0 ? ` 另有 ${counts.na} 项因数据不足未执行，不能据此判定安全。` : '';
  const overview: InsightBlock = {
    id: 'overview',
    title: '排雷总览',
    severity: counts.high > 0 ? 'high' : counts.mid > 0 ? 'mid' : 'info',
    summary:
      counts.high > 0
        ? `发现 ${counts.high} 项高危信号、${counts.mid} 项中度信号，建议重点核查后再决策。${naNote}`
        : counts.mid > 0
          ? `无高危信号，但存在 ${counts.mid} 项中度信号，需结合附注进一步确认。${naNote}`
          : verdict === 'insufficient'
            ? `数据不足：${counts.na} 项检查无法执行，不能判定为安全。`
            : `未触发主要排雷规则；${counts.na > 0 ? `${counts.na} 项因数据不足未执行。` : '各项检查均有数据支撑。'}`,
    charts: [
      {
        type: 'table',
        title: '排雷清单',
        table: {
          columns: [
            { key: 'name', cn: '检查项' },
            { key: 'severity', cn: '等级' },
            { key: 'status', cn: '结论' },
            { key: 'evidence', cn: '佐证' },
          ],
          rows: checks.map((c) => ({
            name: c.name,
            severity: c.severity === 'high' ? '高危' : c.severity === 'mid' ? '中度' : '轻度',
            status: c.status === 'triggered' ? '⚠ 触发' : c.status === 'safe' ? '✓ 安全' : '— 数据不足',
            evidence: c.evidence,
          })),
        },
      },
    ],
    laotang: LAOTANG_MINING_RULES[0].principle,
  };

  const blocks: InsightBlock[] = checks
    .filter((c) => c.status === 'triggered')
    .map((c) => ({
      id: c.id,
      title: `${c.severity === 'high' ? '⚠' : '△'} ${c.name}`,
      severity: c.severity,
      summary: c.why ?? '',
      charts: c.chart ? [c.chart] : [],
      details: c.next ? [c.next] : undefined,
      laotang: c.laotang,
    }));

  const warnings: string[] = [];
  for (const c of checks) if (c.status === 'na') warnings.push(`${c.name}：${c.why ?? '数据不足，未执行。'}`);

  return {
    moduleId: 'mineDetect',
    moduleTitle: '财报排雷',
    blocks: [overview, ...blocks],
    warnings: warnings.length ? warnings : undefined,
  };
}

export const mineDetectModule: AnalysisModule = {
  id: 'mineDetect',
  title: '财报排雷',
  desc: '用老唐排雷清单扫描应收、存货、现金流、商誉、其他应收、大存大贷等红绿灯。',
  problems: ['risk'],
  industries: [],
  run: runMineDetect,
};
