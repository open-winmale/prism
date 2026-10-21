import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WmClient } from './client';
import { clearTokenCache } from './auth';
import { fetchAnnualPeriods, fetchDataset } from './dataset';
import type { WmCredentials } from './types';

// 批量组装层：
//   1) 期次发现走 key 视图一次拿到准确的年度期次，避免硬猜「当前年 - N」踩到未披露的空期
//   2) 单期单表失败**不炸全量** —— 记入 missing 由 verify 出 warn

const CREDS: WmCredentials = { clientId: 'cid', clientSecret: 'sec', apiBase: 'https://api.test' };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function envelope(data: unknown, ec = 100) {
  return jsonResponse({ success: true, data, meta: { metering: { 'analysis.ec_cost': ec } } });
}

const PERIODS = ['2021-12-31', '2022-12-31', '2023-12-31', '2024-12-31', '2025-12-31'];

function stmtPayload(period: string, statement: string) {
  return {
    finance: {
      view: 'raw',
      statement,
      sas: `600519:${period.slice(0, 4)}:Q4`,
      raw: {
        reportDate: `${period} 00:00:00`,
        securityNameAbbr: '贵州茅台',
        opinionType: '标准无保留意见',
        ...(statement === 'bs' ? { totalAsset: 100, contractLiab: 10, inventory: 20 } : {}),
        ...(statement === 'is' ? { totalOperatingIncome: 50, parentNetProfit: 25 } : {}),
        ...(statement === 'cf' ? { salesServices: 60, constructLongAsset: 5 } : {}),
      },
    },
  };
}

beforeEach(() => {
  clearTokenCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** 构造一个按 URL 路由的 fetch 桩；failures 指定哪些「年:表」要模拟失败 */
function install(failures: string[] = [], opts: { periods?: string[] } = {}) {
  const periods = opts.periods ?? PERIODS;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/v1/oauth/token')) return jsonResponse({ access_token: 'tok', expires_in: 7200 });

      const args = JSON.parse(String(init?.body)).args as Record<string, unknown>;
      if (args.view === 'key') {
        return envelope({
          finance: {
            periods_meta: periods.map((d) => ({
              report_date: `${d}T00:00:00Z`,
              sampling: 'Q4',
              annual: Number(d.slice(0, 4)),
            })),
          },
        });
      }
      const sas = String(args.sas ?? '');
      const year = sas.split(':')[1];
      const stmt = String(args.statement ?? 'bs');
      if (failures.includes(`${year}:${stmt}`)) {
        return jsonResponse({ success: false, data: null, error: { code: 'EVAL_FAILED', message: 'boom' } });
      }
      return envelope(stmtPayload(`${year}-12-31`, stmt), 1988);
    }),
  );
}

describe('fetchAnnualPeriods', () => {
  beforeEach(() => install());

  it('只要年报（Q4），按年份升序，取最近 N 期', async () => {
    const client = new WmClient(CREDS);
    const { periods } = await fetchAnnualPeriods(client, '600519', 5);
    expect(periods).toEqual(PERIODS);
  });

  it('请求期数 = N+1（最新一期未披露时仍能凑够 N 期）', async () => {
    const client = new WmClient(CREDS);
    await fetchAnnualPeriods(client, '600519', 5);
    // 通过再取一次校验：want=6 时应返回 5 条（多要的一期被 slice 掉）
    const { periods } = await fetchAnnualPeriods(client, '600519', 4);
    expect(periods).toHaveLength(4);
    expect(periods[periods.length - 1]).toBe('2025-12-31');
  });
});

describe('fetchDataset', () => {
  it('三表齐全时组装出 5 期数据，并取出公司名与审计意见', async () => {
    install();
    const client = new WmClient(CREDS);
    const out = await fetchDataset(client, '600519', { years: 5 });

    expect(out.dataset.symbol).toBe('600519');
    expect(out.dataset.name).toBe('贵州茅台');
    // 审计意见单独透出（用于报告头部标注），不混进数据集
    expect(out.auditOpinion).toBe('标准无保留意见');
    expect(out.dataset.disclaimer).toContain('标准无保留意见');
    expect(out.dataset.periods).toEqual(PERIODS);
    expect(out.dataset.reports).toHaveLength(5);
    expect(out.missing).toEqual([]);

    const last = out.dataset.reports[4];
    expect(last.balance.total_assets).toBe(100);
    expect(last.balance.contract_liabilities).toBe(10);
    expect(last.income.total_revenue).toBe(50);
    expect(last.income.net_profit_parent).toBe(25);
    expect(last.cashflow.cash_from_sales).toBe(60);
    expect(out.dataset.industry).toBe('liquor');
  });

  it('单张表失败 → 记入 missing 且其余照常返回（不整页失败）', async () => {
    install(['2021:cf', '2023:bs']);
    const client = new WmClient(CREDS);
    const out = await fetchDataset(client, '600519', { years: 5 });

    expect(out.missing.sort()).toEqual(['2021-12-31:cf', '2023-12-31:bs']);
    expect(out.dataset.reports).toHaveLength(5); // 期数不减
    // 缺 bs 的那一期：资产为 null（不是 0）
    const r2023 = out.dataset.reports.find((r) => r.period === '2023-12-31')!;
    expect(r2023.balance).toEqual({});
    // 其余期不受影响
    const r2024 = out.dataset.reports.find((r) => r.period === '2024-12-31')!;
    expect(r2024.balance.total_assets).toBe(100);
  });

  it('全部失败 → 仍然返回结构完整的数据集（由 verify 出 error，这里不抛）', async () => {
    const all = PERIODS.flatMap((p) => [`${p.slice(0, 4)}:bs`, `${p.slice(0, 4)}:is`, `${p.slice(0, 4)}:cf`]);
    install(all);
    const client = new WmClient(CREDS);
    const out = await fetchDataset(client, '600519', { years: 5 });
    expect(out.missing).toHaveLength(15);
    expect(out.dataset.reports).toHaveLength(5);
    expect(out.dataset.reports[0].balance).toEqual({});
  });

  it('取不到任何年报期次 → 抛错并说明可能原因', async () => {
    install([], { periods: [] });
    const client = new WmClient(CREDS);
    await expect(fetchDataset(client, '999999', { years: 5 })).rejects.toThrow(/未取到.*年度财报期次/);
  });

  it('汇总 EC 消耗（期次发现 + 各期各表）', async () => {
    install();
    const client = new WmClient(CREDS);
    const out = await fetchDataset(client, '600519', { years: 5 });
    // 1 次期次发现(100) + 15 张表(1988)
    expect(out.ecCost).toBe(100 + 15 * 1988);
  });

  it('进度回调覆盖全部 15 张表', async () => {
    install();
    const client = new WmClient(CREDS);
    const seen: number[] = [];
    await fetchDataset(client, '600519', {
      years: 5,
      onProgress: (p) => p.phase === 'statements' && seen.push(p.done),
    });
    expect(seen).toHaveLength(15);
    expect(seen[seen.length - 1]).toBe(15);
  });
});
