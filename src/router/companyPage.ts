// 单公司研究台的路由归一化：可选参数 :page? 缺失时 vue-router 给的是空字符串，
// 不能用 ?? 兜底（否则「/company/600519」会被当成非法页反复重定向，首屏空白）。

export const COMPANY_PAGES = [
  'overview',
  'operating',
  'liability',
  'profit',
  'cashflow',
  'valuation',
] as const;

/** 旧工作台 URL → 新六页 */
const LEGACY: Record<string, string> = {
  financials: 'operating',
  quality: 'profit',
  peers: 'valuation',
  tracking: 'valuation',
};

export interface CompanyPageRedirect {
  path: string;
  hash?: string;
}

export function companyPageOf(rawPage: unknown): string {
  return typeof rawPage === 'string' && rawPage ? rawPage : 'overview';
}

/** beforeEnter 的纯逻辑：合法页放行，旧页换到新页，缺省/非法页补全为总览。 */
export function companyPageRedirect(
  symbol: unknown,
  rawPage: unknown,
  hash = '',
): true | CompanyPageRedirect {
  const raw = typeof rawPage === 'string' ? rawPage : '';
  const base = `/company/${String(symbol)}`;
  const mapped = LEGACY[raw];
  if (mapped && mapped !== raw) return { path: `${base}/${mapped}`, hash };
  const page = raw || 'overview';
  if (!(COMPANY_PAGES as readonly string[]).includes(page)) return { path: `${base}/overview` };
  // 缺省页补全成显式 URL，保证「左栏高亮 / 分享链接 / 旧链接」都是同一个规范地址
  if (!raw) return { path: `${base}/overview`, hash };
  return true;
}
