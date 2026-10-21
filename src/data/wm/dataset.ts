import type { PeriodReport, ReportDataset } from '@/engine';
import { formatIssues, hasErrors, verifyDataset, type VerifyIssue } from '@/engine';
import type { WmClient } from './client';
import { detectCashScope, pickAuditOpinion, pickName, toPeriodReport } from './mapper';
import type { FinanceRawPayload, PeriodMeta, RawStatement } from './types';

// 批量组装：期次发现 → 逐期逐表并发拉取 → 归并为一个 ReportDataset。
// 设计取舍：
//   1) 先用 key 视图（一次调用）拿到准确的期次表，避免用「当前年 - N」硬猜导致缺期或打空；
//   2) 明细必须走 raw 视图（key/h 视图只有 h_ta/h_tr 等汇总项，没有合同负债/存货/在建工程）；
//   3) 单期单表失败**不炸全量**——降级为缺期并在 outcome.missing 里记录；
//   4) 两种口径：
//      - annual：最近 N 个年报（Q4）。年报经审计，用于「跟自己比」的年度趋势。
//      - quarterly：最近 N 个季度报告期（Q1/Q2/Q3/Q4 混合）。注意 Q2/Q3/Q4 raw 是
//        「年初至今累计」，引擎侧用 singleQuarterReports 差分推导单季值——绝对不能把
//        累计值当单季值做同比/环比。

export interface FetchProgress {
  phase: 'periods' | 'statements';
  done: number;
  total: number;
  ecCost: number;
}

export type FetchMode = 'annual' | 'quarterly';

export interface FetchOptions {
  /** annual: 年报期数（默认 5）；quarterly: 季度报告期数（默认 8） */
  years?: number;
  /** 口径：annual（默认，经审计年报）| quarterly（最近 N 个季报期，累计值由引擎推导单季） */
  mode?: FetchMode;
  /** 并发上限，默认 4 */
  concurrency?: number;
  signal?: AbortSignal;
  onProgress?: (p: FetchProgress) => void;
}

export interface FetchOutcome {
  dataset: ReportDataset;
  ecCost: number;
  /** 缺失的「期次-表」，如 ['2021-12-31:cf'] */
  missing: string[];
  auditOpinion?: string;
  /** 数据校验结果：error 阻断渲染，warn 在报告头提示 */
  issues: VerifyIssue[];
}

const STATEMENTS = ['bs', 'is', 'cf'] as const;
type StatementKey = (typeof STATEMENTS)[number];

interface DiscoveredPeriod {
  date: string; // YYYY-MM-DD
  sampling: 'Q1' | 'Q2' | 'Q3' | 'Q4';
}

function parseSampling(s: string | undefined): 'Q1' | 'Q2' | 'Q3' | 'Q4' {
  return s === 'Q1' || s === 'Q2' || s === 'Q3' ? s : 'Q4';
}

/** 期次发现：annual=最近 n 个年报；quarterly=最近 n 个报告期（含 Q1/Q2/Q3） */
export async function fetchPeriods(
  client: WmClient,
  symbol: string,
  opts: { mode: FetchMode; count: number },
  signal?: AbortSignal,
): Promise<{ periods: DiscoveredPeriod[]; ecCost: number }> {
  // 多要几期，容错最新一期尚未披露
  const want = opts.count + 4;
  const res = await client.runSkill<{ finance?: { periods_meta?: PeriodMeta[] } }>(
    'wm-data',
    { action: 'finance', view: 'key', periods: want, frequency: opts.mode === 'annual' ? 'Y' : undefined, symbol },
    signal,
  );
  const meta = res.data?.finance?.periods_meta ?? [];
  const all = meta
    .map((m) => ({
      date: (m.report_date || '').slice(0, 10),
      sampling: parseSampling(m.sampling),
      annual: m.annual ?? Number((m.report_date || '').slice(0, 4)),
      order: Number((m.report_date || '').slice(0, 4)) * 10 + Number((m.report_date || '').slice(5, 7)),
    }))
    .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.date));

  let picked: DiscoveredPeriod[];
  if (opts.mode === 'annual') {
    picked = all
      .filter((x) => x.sampling === 'Q4')
      .sort((a, b) => a.annual - b.annual)
      .slice(-opts.count)
      .map((x) => ({ date: x.date, sampling: x.sampling }));
  } else {
    // quarterly：按报告期自然序取最近 n 个（Q1/Q2/Q3/Q4 混合）
    picked = all
      .sort((a, b) => a.order - b.order)
      .slice(-opts.count)
      .map((x) => ({ date: x.date, sampling: x.sampling }));
  }
  return { periods: picked, ecCost: res.ecCost ?? 0 };
}

/** 兼容旧签名：年报期次发现 */
export async function fetchAnnualPeriods(
  client: WmClient,
  symbol: string,
  years: number,
  signal?: AbortSignal,
): Promise<{ periods: string[]; ecCost: number }> {
  const { periods, ecCost } = await fetchPeriods(client, symbol, { mode: 'annual', count: years }, signal);
  return { periods: periods.map((p) => p.date), ecCost };
}

/** 拉一张单期报表；失败返回 null（由调用方记入 missing） */
async function fetchOne(
  client: WmClient,
  symbol: string,
  period: DiscoveredPeriod,
  stmt: StatementKey,
  signal?: AbortSignal,
): Promise<{ payload: FinanceRawPayload | null; ecCost: number }> {
  const year = Number(period.date.slice(0, 4));
  const res = await client.runSkill<{ finance?: FinanceRawPayload }>(
    'wm-data',
    { action: 'finance', view: 'raw', sas: `${symbol}:${year}:${period.sampling}`, symbol, statement: stmt },
    signal,
  );
  return { payload: res.data?.finance ?? null, ecCost: res.ecCost ?? 0 };
}

async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = Array.from({ length: items.length }) as R[];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

/** 拉取并组装一份完整数据集 */
export async function fetchDataset(
  client: WmClient,
  symbol: string,
  opts: FetchOptions = {},
): Promise<FetchOutcome> {
  const mode = opts.mode ?? 'annual';
  const count = opts.years ?? (mode === 'quarterly' ? 8 : 5);
  const concurrency = opts.concurrency ?? 4;
  let ecCost = 0;

  const { periods, ecCost: discEc } = await fetchPeriods(client, symbol, { mode, count }, opts.signal);
  ecCost += discEc;
  if (periods.length === 0) {
    throw new Error(`未取到 ${symbol} 的${mode === 'annual' ? '年度' : '季度'}财报期次，可能是代码不存在或尚未披露`);
  }
  opts.onProgress?.({ phase: 'periods', done: periods.length, total: periods.length, ecCost });

  const tasks: { period: DiscoveredPeriod; stmt: StatementKey }[] = [];
  for (const period of periods) {
    for (const stmt of STATEMENTS) tasks.push({ period, stmt });
  }

  const total = tasks.length;
  let done = 0;
  const missing: string[] = [];
  const collected = new Map<string, Partial<Record<StatementKey, RawStatement | undefined>>>();
  let auditOpinion: string | undefined;
  let companyName = '';
  let cashScope: 'standard' | 'finance-subsidiary' = 'standard';

  await pool(tasks, concurrency, async (task) => {
    try {
      const { payload, ecCost: ec } = await fetchOne(client, symbol, task.period, task.stmt, opts.signal);
      ecCost += ec;
      const raw = payload?.raw;
      if (raw) {
        const bucket = collected.get(task.period.date) ?? {};
        bucket[task.stmt] = typeof raw === 'string' ? (JSON.parse(raw) as RawStatement) : (raw as RawStatement);
        collected.set(task.period.date, bucket);
        if (!companyName) companyName = pickName(payload);
        if (!auditOpinion) auditOpinion = pickAuditOpinion(payload);
        if (task.stmt === 'cf') cashScope = detectCashScope(raw);
      } else {
        missing.push(`${task.period.date}:${task.stmt}`);
      }
    } catch {
      missing.push(`${task.period.date}:${task.stmt}`);
    } finally {
      done += 1;
      opts.onProgress?.({ phase: 'statements', done, total, ecCost });
    }
  });

  // 期次升序（引擎的同比/环比/TTM 都假设升序）
  const sorted = [...periods].sort((a, b) => a.date.localeCompare(b.date));
  const reports: PeriodReport[] = sorted.map((period) => {
    const bucket = collected.get(period.date) ?? {};
    const rep = toPeriodReport(period.date, bucket.bs, bucket.is, bucket.cf);
    rep.sampling = period.sampling;
    return rep;
  });

  const dateLabels = sorted.map((p) => p.date);
  const modeLabel = mode === 'annual' ? '年度报（经审计）' : '季度报告期（Q2+ 为累计值，单季由引擎推导）';
  const dataset: ReportDataset = {
    symbol,
    name: companyName || symbol,
    industry: 'liquor',
    periods: dateLabels,
    reports,
    meta: {
      sourceNote: `数据源：赢麻了开放平台（合并报表·${modeLabel}）${dateLabels[0]?.slice(0, 4)}–${dateLabels[dateLabels.length - 1]?.slice(0, 4)}；单位：元`,
      cashScope,
      auditOpinion,
      dataMode: mode,
    },
    disclaimer: `数据来源：赢麻了开放平台（合并报表${auditOpinion ? `·${auditOpinion}` : ''}），仅供学习，不构成投资建议。`,
  };

  const issues = verifyDataset(dataset);
  if (hasErrors(issues)) {
    throw new Error(`数据校验未通过，已阻断渲染：\n${formatIssues(issues)}`);
  }

  return { dataset, ecCost, missing, auditOpinion, issues };
}
