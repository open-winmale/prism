import { describe, expect, it } from 'vitest';
import { verifyDataset, hasErrors, formatIssues, computeDataset, mineChecks, mineVerdict } from '@/engine';
import { WmClient } from './client';
import { fetchDataset, fetchAnnualPeriods } from './dataset';
import type { WmCredentials } from './types';

// ⚠️ 真实接口集成测试 —— **默认跳过**，只在显式提供凭证且 WM_E2E=1 时运行：
//   WM_E2E=1 WINMALE_CLIENT_ID=xxx WINMALE_API_KEY=yyy npx vitest run src/data/wm/live.integration.test.ts
// 目的：验证接口契约没有漂移（路径、字段映射、期次发现、勾稽校验）。
// 会消耗真实 EC，CI 里绝不执行。

const ENABLED = process.env.WM_E2E === '1';
// 凭证来源（兼容两套命名）：script.env 的 OPEN_PLATFORM_* 或 skillhub 的 WINMALE_*，默认直连 api.winmale.com
const CLIENT_ID = process.env.WINMALE_CLIENT_ID ?? process.env.OPEN_PLATFORM_CLIENT_ID ?? '';
const CLIENT_SECRET =
  process.env.WINMALE_CLIENT_SECRET ??
  process.env.WINMALE_API_KEY ??
  process.env.OPEN_PLATFORM_CLIENT_SECRET ??
  '';
const API_BASE =
  process.env.WINMALE_API_BASE ?? process.env.OPEN_PLATFORM_BASE_URL ?? 'https://api.winmale.com';

const CREDS: WmCredentials = { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, apiBase: API_BASE };

describe.skipIf(!ENABLED || !CLIENT_ID || !CLIENT_SECRET)('真实接口集成（WM_E2E）', () => {
  const client = new WmClient(CREDS);

  it('期次发现：拿到最近 5 个年度期次，升序且以 12-31 结尾', async () => {
    const { periods } = await fetchAnnualPeriods(client, '600519', 5);
    expect(periods).toHaveLength(5);
    for (const p of periods) expect(p.endsWith('-12-31')).toBe(true);
    expect(periods).toEqual([...periods].sort());
    expect(Number(periods[4].slice(0, 4))).toBeGreaterThan(Number(periods[0].slice(0, 4)));
  }, 60_000);

  it('全量组装：茅台 5 年三表，勾稽 0 error、合同负债有值', async () => {
    const out = await fetchDataset(client, '600519', { years: 5 });

    expect(out.missing).toEqual([]);
    expect(out.dataset.name).toContain('茅台');
    expect(out.ecCost).toBeGreaterThan(0);

    const issues = verifyDataset(out.dataset);
    expect(hasErrors(issues)).toBe(false);
    if (issues.length) console.log(formatIssues(issues));

    // 白酒第一领先指标：合同负债必须整期有值
    for (const r of out.dataset.reports) {
      expect(r.balance.contract_liabilities).not.toBeNull();
      expect(r.balance.contract_liabilities!).toBeGreaterThan(0);
    }

    // 毛利率落在白酒合理带
    const m = computeDataset(out.dataset).metrics;
    for (const x of m) {
      expect(x.gross_margin!).toBeGreaterThan(0.5);
      expect(x.gross_margin!).toBeLessThan(0.98);
    }
  }, 180_000);

  it('排雷判定：真实茅台不触发高危（引擎行业化生效）', async () => {
    const out = await fetchDataset(client, '600519', { years: 5 });
    const cd = computeDataset(out.dataset);
    const ctx = {
      dataset: out.dataset,
      computed: cd,
      industry: out.dataset.industry,
      peerBench: out.dataset.peerBench,
    };
    const checks = mineChecks(ctx);
    const high = checks.filter((c) => c.status === 'triggered' && c.severity === 'high');
    expect(high).toEqual([]);
    expect(mineVerdict(checks)).toBe('safe');
  }, 180_000);

  it('标的检索：按名称能搜到代码', async () => {
    const hits = await client.discover('贵州茅台');
    const sym = hits.find((h) => h.domain === 'symbol');
    expect(sym?.id).toBe('600519');
  }, 60_000);

  it('白酒行业成分：≥15 家且带估值中枢', async () => {
    const res = await client.runSkill<{
      result?: { items?: { symbol: string; name: string }[]; aggregates?: { pe_ttm?: number } };
    }>('wm-data', { action: 'members', key: '白酒', kind: 'industry' });
    const items = res.data?.result?.items ?? [];
    expect(items.length).toBeGreaterThanOrEqual(15);
    expect(items.some((x) => x.symbol === '600519')).toBe(true);
    expect(res.data?.result?.aggregates?.pe_ttm).toBeGreaterThan(0);
  }, 60_000);
});
