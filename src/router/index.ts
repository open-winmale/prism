import { createRouter, createWebHashHistory } from 'vue-router';
import ResearchShell from '@/features/research/ResearchShell.vue';
import ComparePage from '@/features/workbench/ComparePage.vue';
import AboutPage from '@/features/home/AboutPage.vue';

export default createRouter({
  history: createWebHashHistory(),
  // 带锚点跳到对应 section；否则回页顶（六域扫描卡 → 分页定位域）
  scrollBehavior(to) {
    if (to.hash) return { el: to.hash, behavior: 'smooth' };
    return { top: 0 };
  },
  routes: [
    // 打开即成品：默认落到样板研究报告，不再经过营销首页
    { path: '/', redirect: '/company/600519' },
    // 单公司研究台：:page 六页（overview/operating/liability/profit/cashflow/valuation）。
    // 旧工作台 URL（financials/quality/peers 等）归一化到新页，避免静默回落造成 URL 与导航不符
    {
      path: '/company/:symbol/:page?',
      name: 'company',
      component: ResearchShell,
      beforeEnter: (to) => {
        const LEGACY: Record<string, string> = {
          financials: 'operating',
          quality: 'profit',
          peers: 'valuation',
          tracking: 'valuation',
          overview: 'overview',
        };
        const page = String(to.params.page ?? 'overview');
        const mapped = LEGACY[page];
        if (mapped && mapped !== page) {
          return { path: `/company/${String(to.params.symbol)}/${mapped}`, hash: to.hash };
        }
        if (!['overview', 'operating', 'liability', 'profit', 'cashflow', 'valuation'].includes(page)) {
          return { path: `/company/${String(to.params.symbol)}` };
        }
        return true;
      },
    },
    { path: '/compare', name: 'compare', component: ComparePage },
    {
      path: '/analyze',
      redirect: (to) =>
        typeof to.query.symbol === 'string' && to.query.symbol
          ? `/company/${to.query.symbol}`
          : '/',
    },
    { path: '/method', name: 'method', component: AboutPage },
    { path: '/about', name: 'about', component: AboutPage },
    // 开发专用图表预览：只在 dev 构建存在，生产路由不包含
    ...(import.meta.env.DEV
      ? [
          {
            path: '/_chart-preview',
            name: 'chart-preview',
            component: () => import('@/features/charts/ChartPreview.vue'),
          },
        ]
      : []),
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});
