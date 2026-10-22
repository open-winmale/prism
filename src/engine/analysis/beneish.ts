import type { AnalysisContext, AnalysisModule, AnalysisResult, InsightBlock } from './define';
import type { Num, PeriodReport } from '../schema/types';
import { fieldGetter } from '../compute';
import { periodLabel } from '../utils';

// Beneish M-Score：8 因子盈余操纵侦测。
//
// 为什么开源版要做：专业版资产库全仓检索 0 命中（无口径可抄），
// 而 8 个因子里有 7 个可以只用连续两期三表 + 现金流量表算出来——
// 这是「三表诊断」边界内的最高密度深度，且 0 新增 EC。
//
// 公式（Beneish 1999, "The Detection of Earnings Manipulation"）：
//   M = −4.84 + 0.920·DSRI + 0.528·GMI + 0.404·AQI + 0.892·SGI
//            + 0.115·DEPI − 0.172·SGAI + 4.679·TATA − 0.327·LVGI
//   M > −2.22 → 疑似操纵（原论文判定位）；M > −1.78 → 高危（更严的门线）
//
// 中性基准的推导（本模块瀑布图的起点，不是拍脑袋）：
//   令全部指数型因子 = 1、TATA = 0（即「所有比率都与上期一致、没有应计」），
//   M₀ = −4.84 + 0.920 + 0.528 + 0.404 + 0.892 + 0.115 − 0.172 + 0 − 0.327 = −2.48
//   −2.48 < −2.22，说明「一切如常」的公司本就该落在门线下方——这是公式的自洽性校验。
//   因此瀑布图从 −2.48 出发，每根柱子是该因子对 M 的偏离贡献 coef×(value − neutral)。
//
// 缺失传播：任一因子缺数据 → 按中性值代入并计入 missing，**missing ≥ 3 时整体置 na**。
//   DEPI（折旧率）在开源版数据源里没有「折旧摊销」字段，恒为缺失，这是已知且必须明示的缺口。

export type BeneishKey = 'DSRI' | 'GMI' | 'AQI' | 'SGI' | 'DEPI' | 'SGAI' | 'LVGI' | 'TATA';

export interface BeneishFactor {
  key: BeneishKey;
  cn: string;
  /** 因子含义（说人话） */
  meaning: string;
  /** 因子值；null = 缺数据（按中性代入，不参与判读） */
  value: number | null;
  /** 中性基准：指数型因子为 1，TATA 为 0 */
  neutral: number;
  coef: number;
  /** 对 M 的偏离贡献 = coef × (value − neutral)；缺数据时为 0 */
  contribution: number;
  /** 该因子值怎么读（缺数据时说明为何缺） */
  read: string;
  missing: boolean;
}

export interface BeneishScore {
  /** 当期 / 基期 */
  period: string;
  base: string;
  /** M 值；数据不足时为 null */
  m: number | null;
  /** 中性基准 M₀ = −2.48 */
  baseline: number;
  factors: BeneishFactor[];
  missingCount: number;
  verdict: 'high' | 'watch' | 'ok' | 'na';
  missing: string[];
}

/** 门线：M > −2.22 疑似；M > −1.78 高危 */
export const BENEISH_WATCH = -2.22;
export const BENEISH_HIGH = -1.78;
export const BENEISH_BASELINE = -2.48;

const COEF: Record<BeneishKey, number> = {
  DSRI: 0.92,
  GMI: 0.528,
  AQI: 0.404,
  SGI: 0.892,
  DEPI: 0.115,
  SGAI: -0.172,
  TATA: 4.679,
  LVGI: -0.327,
};

const MEANING: Record<BeneishKey, string> = {
  DSRI: '应收账款增速是否跑赢营收（回款变慢 → 可能在放宽信用政策冲收入）',
  GMI: '毛利率是否下滑（恶化 → 竞争力下降或成本被挪走）',
  AQI: '非实物资产占比是否上升（虚资产变多 → 资产质量变差）',
  SGI: '营收增速（高增长公司更有动机也更有空间去平滑利润）',
  DEPI: '折旧率是否下降（放慢折旧 → 少提费用、虚增利润）',
  SGAI: '销售管理费用率是否上升（费用失控或收入含金量下降）',
  LVGI: '杠杆是否上升（借钱续命会增加粉饰报表的动机）',
  TATA: '应计总额 =（净利润 − 经营现金流）/ 总资产（利润没有现金支撑的程度）',
};

const UP_TEXT: Record<BeneishKey, string> = {
  DSRI: '应收跑赢营收，回款在变慢',
  GMI: '毛利率下滑（本期毛利率低于上期）',
  AQI: '非实物资产占比上升，资产变「虚」',
  SGI: '营收在增长（高增长本身会抬高 M，读分时扣掉）',
  DEPI: '折旧放慢，少提费用',
  SGAI: '销管费用率上升',
  LVGI: '杠杆上升',
  TATA: '',
};

const DOWN_TEXT: Record<BeneishKey, string> = {
  DSRI: '应收增速慢于营收，回款改善',
  GMI: '毛利率改善',
  AQI: '非实物资产占比下降',
  SGI: '营收在收缩',
  DEPI: '折旧加快',
  SGAI: '销管费用率下降',
  LVGI: '杠杆下降',
  TATA: '',
};

/**
 * 单因子判读文案。
 * DSRI 有一条业务模式例外：白酒等「先款后货」公司应收常年接近 0，
 * 此时 DSRI 会被压到极低并把 M 大幅拉低——这是真实的，但也意味着该因子几乎不携带信息，
 * 必须如实说明，不能让「应收占比低」伪装成「回款改善」这种因果解读。
 */
function readOf(key: BeneishKey, v: number | null, ar: { arCur: Num; arPrev: Num }): string {
  if (key === 'TATA') {
    if (v == null) return '缺数据，按中性值 0 代入';
    if (v > 0.05) return `${(v * 100).toFixed(2)}%｜利润里应计部分偏重，现金支撑弱`;
    if (v < 0) return `${(v * 100).toFixed(2)}%｜经营现金流好于净利润，含金量高`;
    return `${(v * 100).toFixed(2)}%｜利润与现金流基本匹配`;
  }
  if (key === 'DEPI' && v == null) {
    return '三表数据源未提供折旧摊销字段，按中性值 1 代入';
  }
  if (key === 'DSRI' && v != null && isNum(ar.arCur) && isNum(ar.arPrev)) {
    if (ar.arCur < 0.005 && ar.arPrev < 0.005) {
      return `${v.toFixed(2)}｜应收占营收常年低于 0.5%（先款后货模式），该因子几乎不携带信息`;
    }
  }
  return readIndex(v, UP_TEXT[key], DOWN_TEXT[key]);
}

function isNum(v: Num | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function div(a: Num, b: Num): Num {
  if (!isNum(a) || !isNum(b) || b === 0) return null;
  return a / b;
}

/** 年报口径：季度数据算同比是指标错位，只认年报（sampling 缺省视为 Q4） */
function annualOnly(reports: PeriodReport[]): PeriodReport[] {
  return reports.filter((r) => (r.sampling ?? 'Q4') === 'Q4');
}

/**
 * 指数型因子判读。
 * 注意方向：八个因子的中性值都是 1，且**值 > 1 一律指向「往坏的方向」**——
 *   DSRI↑ 应收跑赢营收 · GMI↑（= 毛利率_t−1/毛利率_t）本期毛利率更低 · AQI↑ 虚资产占比升
 *   SGI↑ 高增长抬高动机 · DEPI↑（= 折旧率_t−1/折旧率_t）本期折旧更慢 · SGAI↑ 销管费用率升 · LVGI↑ 杠杆升
 * 所以这里不存在「反向因子」，不需要 invert 参数——历史上曾把 GMI/DEPI 当作反向，
 * 会把「毛利率下滑 1.19 倍」读成「毛利率改善」，是方向性错误。
 */
function readIndex(v: number | null, upText: string, downText: string): string {
  if (v == null) return '缺数据，按中性值 1 代入';
  if (v > 1.02) return `${v.toFixed(2)}｜${upText}`;
  if (v < 0.98) return `${v.toFixed(2)}｜${downText}`;
  return `${v.toFixed(2)}｜与上期基本一致`;
}

export function beneishOf(ctx: AnalysisContext): BeneishScore {
  const na = (missing: string[]): BeneishScore => ({
    period: '—',
    base: '—',
    m: null,
    baseline: BENEISH_BASELINE,
    factors: [],
    missingCount: missing.length,
    verdict: 'na',
    missing,
  });

  const annual = annualOnly(ctx.dataset.reports);
  if (annual.length < 2) return na(['至少两个年报报告期']);

  const prev = annual[annual.length - 2];
  const cur = annual[annual.length - 1];
  const gp = fieldGetter(prev);
  const gc = fieldGetter(cur);
  const missing: string[] = [];

  // ── DSRI = (AR_t / Rev_t) / (AR_{t−1} / Rev_{t−1}) ──
  const arCur = gc('accounts_receivable');
  const arPrev = gp('accounts_receivable');
  const revCur = gc('total_revenue');
  const revPrev = gp('total_revenue');
  const DSRI = div(div(arCur, revCur) ?? null, div(arPrev, revPrev) ?? null);
  if (DSRI == null) missing.push('应收账款 / 营业总收入');

  // ── GMI = 毛利率_{t−1} / 毛利率_t ──
  const gmCur = div(revCur != null && isNum(gc('operating_cost')) ? revCur - (gc('operating_cost') ?? 0) : null, revCur);
  const gmPrev = div(
    revPrev != null && isNum(gp('operating_cost')) ? revPrev - (gp('operating_cost') ?? 0) : null,
    revPrev,
  );
  const GMI = div(gmPrev ?? null, gmCur ?? null);
  if (GMI == null) missing.push('营业成本 / 营业总收入');

  // ── AQI = [1 − (流动资产 + 固定资产)/总资产]_t / 同口径_{t−1} ──
  const softCur =
    isNum(gc('total_current_assets')) && isNum(gc('fixed_assets')) && isNum(gc('total_assets'))
      ? 1 - ((gc('total_current_assets') ?? 0) + (gc('fixed_assets') ?? 0)) / (gc('total_assets') ?? 1)
      : null;
  const softPrev =
    isNum(gp('total_current_assets')) && isNum(gp('fixed_assets')) && isNum(gp('total_assets'))
      ? 1 - ((gp('total_current_assets') ?? 0) + (gp('fixed_assets') ?? 0)) / (gp('total_assets') ?? 1)
      : null;
  const AQI = div(softCur, softPrev);
  if (AQI == null) missing.push('流动资产 / 固定资产 / 总资产');

  // ── SGI = Rev_t / Rev_{t−1} ──
  const SGI = div(revCur, revPrev);
  if (SGI == null) missing.push('营业总收入');

  // ── DEPI ──
  // 开源版三表数据源没有「折旧摊销」字段（既不在利润表也不在现金流量表明细里），
  // 按缺失 ≠ 0 的铁律不估算，恒为 null 并按中性值 1 代入，且在 UI 明示。
  const DEPI: Num = null;
  missing.push('折旧摊销（三表数据源未提供该字段）');

  // ── SGAI = (销售+管理费用率)_t / 同口径_{t−1} ──
  const sgaCur = isNum(gc('selling_expense')) || isNum(gc('admin_expense'))
    ? (gc('selling_expense') ?? 0) + (gc('admin_expense') ?? 0)
    : null;
  const sgaPrev = isNum(gp('selling_expense')) || isNum(gp('admin_expense'))
    ? (gp('selling_expense') ?? 0) + (gp('admin_expense') ?? 0)
    : null;
  const SGAI = div(div(sgaCur, revCur) ?? null, div(sgaPrev, revPrev) ?? null);
  if (SGAI == null) missing.push('销售费用 / 管理费用');

  // ── LVGI = (负债/资产)_t / 同口径_{t−1} ──
  const levCur = div(gc('total_liabilities'), gc('total_assets'));
  const levPrev = div(gp('total_liabilities'), gp('total_assets'));
  const LVGI = div(levCur ?? null, levPrev ?? null);
  if (LVGI == null) missing.push('负债合计 / 总资产');

  // ── TATA = (净利润 − 经营现金流净额) / 总资产_t ──
  const np = gc('net_profit');
  const cfo = gc('net_cash_operating');
  const ta = gc('total_assets');
  const TATA = isNum(np) && isNum(cfo) && isNum(ta) && ta !== 0 ? (np - cfo) / ta : null;
  if (TATA == null) missing.push('净利润 / 经营现金流净额 / 总资产');

  // 指数型因子允许「部分缺失」：只要 DSRI/GMI 等核心因子在，仍给出分数并标注
  const raws: { key: BeneishKey; value: Num; neutral: number }[] = [
    { key: 'DSRI', value: DSRI, neutral: 1 },
    { key: 'GMI', value: GMI, neutral: 1 },
    { key: 'AQI', value: AQI, neutral: 1 },
    { key: 'SGI', value: SGI, neutral: 1 },
    { key: 'DEPI', value: DEPI, neutral: 1 },
    { key: 'SGAI', value: SGAI, neutral: 1 },
    { key: 'LVGI', value: LVGI, neutral: 1 },
    { key: 'TATA', value: TATA, neutral: 0 },
  ];

  const missingCount = raws.filter((r) => r.value == null).length;
  if (missingCount >= 3) return na(missing);

  const factors: BeneishFactor[] = raws.map((r) => {
    const v = r.value;
    const contribution = v == null ? 0 : COEF[r.key] * (v - r.neutral);
    return {
      key: r.key,
      cn: r.key,
      meaning: MEANING[r.key],
      value: v,
      neutral: r.neutral,
      coef: COEF[r.key],
      contribution,
      read: readOf(r.key, v, {
        arCur: div(arCur, revCur),
        arPrev: div(arPrev, revPrev),
      }),
      missing: v == null,
    };
  });

  const m = BENEISH_BASELINE + factors.reduce((s, f) => s + f.contribution, 0);
  const verdict: BeneishScore['verdict'] = m > BENEISH_HIGH ? 'high' : m > BENEISH_WATCH ? 'watch' : 'ok';

  return {
    period: periodLabel(cur.period),
    base: periodLabel(prev.period),
    m,
    baseline: BENEISH_BASELINE,
    factors,
    missingCount,
    verdict,
    missing,
  };
}

function fmtM(v: number | null): string {
  return v == null ? '—' : v.toFixed(2);
}

const VERDICT_CN: Record<BeneishScore['verdict'], string> = {
  high: '高危：8 因子综合指向盈余操纵嫌疑',
  watch: '需关注：越过 −2.22 门线',
  ok: '未见操纵嫌疑',
  na: '数据不足，无法打分',
};

export function runBeneish(ctx: AnalysisContext): AnalysisResult {
  const b = beneishOf(ctx);
  const blocks: InsightBlock[] = [];

  if (b.verdict === 'na') {
    blocks.push({
      id: 'beneish_na',
      title: 'Beneish M-Score（盈余操纵侦测）',
      severity: 'info',
      summary: `需要连续两个年报期与完整的应收/营收/成本/费用/杠杆字段才能打分，当前缺：${b.missing.join('、')}。缺数据不等于安全，这里不给分。`,
      charts: [],
      details: [
        'M-Score 是 8 因子加权综合分，任一项缺失都要如实标注，不能按 0 补齐——补齐会人为压低分数。',
        'DEPI（折旧率因子）在开源版三表数据源里没有折旧摊销字段，恒为缺失，所有标的都会看到这一条。',
      ],
    });
    return { moduleId: 'beneish', moduleTitle: 'Beneish M-Score', blocks, warnings: b.missing };
  }

  // 瀑布图：从「一切如常」的中性基准出发，看每个因子把分数推高了多少
  const cats = ['中性基准\n(一切如常)', ...b.factors.map((f) => f.key), 'M-Score'];
  const values: (number | null)[] = [
    b.baseline,
    ...b.factors.map((f) => (f.missing ? null : Number(f.contribution.toFixed(3)))),
    Number((b.m ?? 0).toFixed(2)),
  ];
  const isTotal = [true, ...b.factors.map(() => false), true];

  blocks.push({
    id: 'beneish_score',
    title: `Beneish M-Score：${fmtM(b.m)}（${VERDICT_CN[b.verdict]}）`,
    severity: b.verdict === 'high' ? 'high' : b.verdict === 'watch' ? 'mid' : 'low',
    summary:
      `以 ${b.base} 为基期、${b.period} 为当期计算，M = ${fmtM(b.m)}。` +
      `门线：>${BENEISH_WATCH} 疑似操纵，>${BENEISH_HIGH} 高危。` +
      (b.verdict === 'high'
        ? '这个分数意味着八个因子里有多项同时指向「报表被修饰过」，务必回到附注与同行对照去逐项落实。'
        : b.verdict === 'watch'
          ? '越过了原论文的 −2.22 判定位，属于「值得追查」而不是「已经定罪」。'
          : '落在门线下方，八因子整体没有指向盈余操纵。'),
    charts: [
      {
        type: 'waterfall',
        title: '各因子把 M 推高了多少（从「一切如常」的 −2.48 出发）',
        unit: '分',
        refLines: [
          { value: BENEISH_WATCH, label: `疑似线 ${BENEISH_WATCH}` },
          { value: BENEISH_HIGH, label: `高危线 ${BENEISH_HIGH}` },
        ],
        waterfall: { categories: cats, values, isTotal },
      },
    ],
    details: [
      '起点不是 0 而是 −2.48：把所有指数型因子设为 1、应计提为 0（即「一切与上期一致」）时公式给出的分值，它本就该低于 −2.22 门线。',
      '柱子读法：红色把分数往上推（增大嫌疑），绿色把分数往下压（减小嫌疑）。',
      `本期有 ${b.missingCount} 个因子缺数据，已按中性值代入${b.missing.length ? `：${b.missing.join('、')}` : ''}。`,
    ],
  });

  blocks.push({
    id: 'beneish_factors',
    title: '8 个因子逐项拆解',
    summary: '单看一个因子没有意义——M-Score 的价值在于八项同时偏离。下表把每项的偏离方向与权重摊开。',
    charts: [
      {
        type: 'table',
        title: '因子明细',
        table: {
          columns: [
            { key: 'key', cn: '因子' },
            { key: 'meaning', cn: '在测什么' },
            { key: 'value', cn: '本期值' },
            { key: 'weight', cn: '权重' },
            { key: 'contrib', cn: '对 M 的贡献' },
            { key: 'read', cn: '怎么读' },
          ],
          rows: b.factors.map((f) => ({
            key: f.key,
            meaning: f.meaning,
            value: f.value == null ? `—（中性 ${f.neutral}）` : f.value.toFixed(3),
            weight: f.coef.toFixed(3),
            contrib: f.missing ? '—' : `${f.contribution > 0 ? '+' : ''}${f.contribution.toFixed(3)}`,
            read: f.read,
          })),
        },
      },
    ],
    details: [
      '指数型因子（DSRI/GMI/AQI/SGI/DEPI/SGAI/LVGI）的中性值是 1：与上期完全一致。TATA 的中性值是 0：利润与经营现金流完全匹配。',
      'SGI 权重高达 0.892，高增长公司会因为「增长」本身拿到更高的 M——这是模型的已知偏向，读分数时要扣掉增长的影响。',
      'TATA 权重 4.679 是八项里最高的：利润与现金流的背离是模型最看重的单一信号。',
    ],
    laotang: 'M-Score 是「嫌疑筛查」不是「定罪」。老唐的排雷清单里，任何一项异常都要求回到原始报表找解释——分数高只说明该去翻附注了，不说明公司造假。',
  });

  return {
    moduleId: 'beneish',
    moduleTitle: 'Beneish M-Score',
    blocks,
    warnings: b.missing.length ? [`${b.missingCount} 个因子缺数据已按中性值代入：${b.missing.join('、')}`] : undefined,
  };
}

export const beneishModule: AnalysisModule = {
  id: 'beneish',
  title: 'Beneish M-Score · 盈余操纵侦测',
  desc: '8 因子加权综合分，从应收/毛利/资产结构/费用/杠杆/应计六个方向筛查报表被修饰的嫌疑。',
  problems: ['risk', 'assetQuality'],
  industries: [],
  run: runBeneish,
};
