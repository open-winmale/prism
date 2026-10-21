import type { PeriodReport, ReportDataset } from '@/engine';
import type { WmClient } from './client';
import { detectCashScope, pickAuditOpinion, pickName, toPeriodReport } from './mapper';
import type { FinanceRawPayload, PeriodMeta, RawStatement } from './types';

// 批量组装：期次发现 → 逐期逐表并发拉取 → 归并为一个 ReportDataset。
// 设计取舍：
//   1) 先用 key 视图（一次调用）拿到准确的年度期次表，避免用「当前年 - N」硬猜导致缺期或打空；
//   2) 明细必须走 raw 视图（key/h 视图只有 h_ta/h_tr 等汇总项，没有合同负债/存货/在建工程，
//      而白酒引擎的关键指标全在明细里）；
//   3) 单期单表失败**不炸全量**——降级为缺期并在 outcome.missing 里记录，由 verify 出 warn。

export interface FetchProgress {
  phase: 'periods' | 'statements';
  done: number;
  total: number;
  ecCost: number;
}

export interface FetchOptions {
  /** 年报期数，默认 5 */
  years?: number;
  /** 并发上限，默认 4（避免瞬时打满配额） */
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
}

const STATEMENTS = ['bs', 'is', 'cf'] as const;
type StatementKey = (typeof STATEMENTS)[number];

/** 期次发现：返回最近 n 个年报期次（升序，格式 YYYY-12-31） */
export async function fetchAnnualPeriods(
  client: WmClient,
  symbol: string,
  years: number,
  signal?: AbortSignal,
): Promise<{ periods: string[]; ecCost: number }> {
  // 多要一期，避免最新一期尚未披露时不足数
  const want = Math.max(1, years) + 1;
  const res = await client.runSkill<{ finance?: { periods_meta?: PeriodMeta[] } }>(
    'wm-data',
    { action: 'finance', view: 'key', periods: want, frequency: 'Y', symbol },
    signal,
  );
  const meta = res.data?.finance?.periods_meta ?? [];
  const annual = meta
    .map((m) => ({
      date: (m.report_date || '').slice(0, 10),
      sampling: m.sampling ?? '',
      annual: m.annual ?? Number((m.report_date || '').slice(0, 4)),
    }))
    .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.date))
    // 年报口径：Q4 采样，或日期落在 12-31
    .filter((x) => x.sampling === 'Q4' || x.date.endsWith('-12-31'))
    .sort((a, b) => a.annual - b.annual)
    .map((x) => x.date);
  const periods = annual.slice(-Math.max(1, years));
  return { periods, ecCost: res.ecCost ?? 0 };
}

/** 拉一张单期报表；失败返回 null（由调用方记入 missing） */
async function fetchOne(
  client: WmClient,
  symbol: string,
  period: string,
  stmt: StatementKey,
  signal?: AbortSignal,
): Promise<{ payload: FinanceRawPayload | null; ecCost: number }> {
  const year = Number(period.slice(0, 4));
  const res = await client.runSkill<{ finance?: FinanceRawPayload }>(
    'wm-data',
    { action: 'finance', view: 'raw', sas: `${symbol}:${year}:Q4`, symbol, statement: stmt },
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
  const years = opts.years ?? 5;
  const concurrency = opts.concurrency ?? 4;
  let ecCost = 0;

  const { periods, ecCost: discEc } = await fetchAnnualPeriods(client, symbol, years, opts.signal);
  ecCost += discEc;
  if (periods.length === 0) {
    throw new Error(`未取到 ${symbol} 的年度财报期次，可能是代码不存在或尚未披露年报`);
  }
  opts.onProgress?.({ phase: 'periods', done: periods.length, total: periods.length, ecCost });

  const tasks: { period: string; stmt: StatementKey }[] = [];
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
        const bucket = collected.get(task.period) ?? {};
        bucket[task.stmt] = typeof raw === 'string' ? (JSON.parse(raw) as RawStatement) : (raw as RawStatement);
        collected.set(task.period, bucket);
        if (!companyName) companyName = pickName(payload);
        if (!auditOpinion) auditOpinion = pickAuditOpinion(payload);
        if (task.stmt === 'cf') cashScope = detectCashScope(raw);
      } else {
        missing.push(`${task.period}:${task.stmt}`);
      }
    } catch {
      missing.push(`${task.period}:${task.stmt}`);
    } finally {
      done += 1;
      opts.onProgress?.({ phase: 'statements', done, total, ecCost });
    }
  });

  const reports: PeriodReport[] = periods.map((period) => {
    const bucket = collected.get(period) ?? {};
    return toPeriodReport(period, bucket.bs, bucket.is, bucket.cf);
  });

  const dataset: ReportDataset = {
    symbol,
    name: companyName || symbol,
    industry: 'liquor',
    periods,
    reports,
    meta: {
      sourceNote: `数据源：赢麻了开放平台（合并报表·年度·经审计）${periods[0]?.slice(0, 4)}–${periods[periods.length - 1]?.slice(0, 4)}；单位：元`,
      cashScope,
    },
    disclaimer: `数据来源：赢麻了开放平台（合并报表·年度${auditOpinion ? `·${auditOpinion}` : ''}），仅供学习，不构成投资建议。`,
  };

  return { dataset, ecCost, missing, auditOpinion };
}
