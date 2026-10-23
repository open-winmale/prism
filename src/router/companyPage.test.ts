import { describe, expect, it } from 'vitest';
import { companyPageOf, companyPageRedirect } from './companyPage';

describe('单公司研究台路由归一化', () => {
  it('缺失的可选参数（undefined / 空串）补全为总览 URL，不重定向回自身', () => {
    // vue-router 4.4 对缺省的可选参数返回 ''，这是首屏无限重定向事故的根因
    expect(companyPageOf(undefined)).toBe('overview');
    expect(companyPageOf('')).toBe('overview');
    expect(companyPageRedirect('600519', '')).toEqual({ path: '/company/600519/overview', hash: '' });
    expect(companyPageRedirect('600519', undefined)).toEqual({ path: '/company/600519/overview', hash: '' });
  });

  it('六个合法页面放行', () => {
    for (const page of ['overview', 'operating', 'liability', 'profit', 'cashflow', 'valuation']) {
      expect(companyPageRedirect('600519', page)).toBe(true);
    }
  });

  it('旧工作台 URL 换到新页面并保留锚点', () => {
    expect(companyPageRedirect('600519', 'financials', '#cash')).toEqual({
      path: '/company/600519/operating',
      hash: '#cash',
    });
    expect(companyPageRedirect('600519', 'quality')).toEqual({ path: '/company/600519/profit', hash: '' });
    expect(companyPageRedirect('600519', 'peers')).toEqual({ path: '/company/600519/valuation', hash: '' });
    expect(companyPageRedirect('600519', 'tracking')).toEqual({ path: '/company/600519/valuation', hash: '' });
  });

  it('非法页面补全为总览（并去掉非法段）', () => {
    expect(companyPageRedirect('600519', 'nope')).toEqual({ path: '/company/600519/overview' });
  });
});
