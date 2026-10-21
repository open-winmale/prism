import { createRouter, createWebHashHistory } from 'vue-router';
import HomePage from '@/features/home/HomePage.vue';
import WorkbenchPage from '@/features/workbench/WorkbenchPage.vue';
import ComparePage from '@/features/workbench/ComparePage.vue';
import AboutPage from '@/features/home/AboutPage.vue';

export default createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: HomePage },
    { path: '/company/:symbol/:workspace?', name: 'company', component: WorkbenchPage },
    { path: '/compare', name: 'compare', component: ComparePage },
    {
      path: '/analyze',
      redirect: (to) =>
        typeof to.query.symbol === 'string' && to.query.symbol
          ? `/company/${to.query.symbol}/overview`
          : '/',
    },
    { path: '/method', name: 'method', component: AboutPage },
    { path: '/about', name: 'about', component: AboutPage },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});
