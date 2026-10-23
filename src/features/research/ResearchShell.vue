<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { useAppStore } from '@/store/useApp';
import AppTopbar from '@/components/ui/AppTopbar.vue';
import CompanyHeader from '@/components/ui/CompanyHeader.vue';
import SymbolSearch from '@/components/SymbolSearch.vue';
import DataSourceDialog from '@/components/DataSourceDialog.vue';
import SampleGallery from '@/features/workbench/SampleGallery.vue';
import MobilePageNav from './MobilePageNav.vue';
import ResearchPage from './ResearchPage.vue';
import { companyPageOf } from '@/router/companyPage';

// 单公司研究台（2026-10-23 多页化）：
// 六个页面（总览 / 经营·资产 / 负债·权益 / 利润 / 现金流 / 估值·风险），路由驱动：
//   /company/:symbol            → 总览
//   /company/:symbol/:page      → 对应分页（operating|liability|profit|cashflow|valuation）
// 左栏 = 页面级导航（切换页面，不再同页锚点）；顶栏保留年报/季报口径切换。
// 信息负担拆解：每页 2–4 个 section，关键信息直出不折叠。

const PAGES = [
  { id: 'overview', label: '总览', index: '01' },
  { id: 'operating', label: '经营·资产', index: '02' },
  { id: 'liability', label: '负债·权益', index: '03' },
  { id: 'profit', label: '利润', index: '04' },
  { id: 'cashflow', label: '现金流', index: '05' },
  { id: 'valuation', label: '估值·风险', index: '06' },
] as const;

const route = useRoute();
const router = useRouter();
const store = useAppStore();
const showSettings = ref(false);

const symbol = computed(() => String(route.params.symbol ?? ''));
const pageParam = computed(() => companyPageOf(route.params.page));
const activePage = computed(() => {
  const hit = PAGES.find((p) => p.id === pageParam.value);
  return hit ? hit.id : 'overview';
});
const activeMeta = computed(() => PAGES.find((p) => p.id === activePage.value) ?? PAGES[0]);

function switchPage(id: string): void {
  void router.push(`/company/${symbol.value}/${id}`);
  window.scrollTo({ top: 0 });
}

function ensure(): void {
  if (!store.stockList.length) void store.init();
  if (symbol.value && symbol.value !== store.currentSymbol) {
    void store.selectStock(symbol.value);
  }
}

onMounted(ensure);
watch(() => [symbol.value, store.stockList.length], ensure);
</script>

<template>
  <div class="wb-shell">
    <AppTopbar>
      <template #search>
        <SymbolSearch />
      </template>
      <template #actions>
        <div class="wb-seg" role="group" aria-label="口径">
          <button :class="{ 'is-on': store.dataMode === 'annual' }" @click="store.switchMode('annual')">年报</button>
          <button :class="{ 'is-on': store.dataMode === 'quarterly' }" @click="store.switchMode('quarterly')">季报</button>
        </div>
        <button
          class="wb-btn wb-source-btn"
          :title="`数据源与 AppId 设置 · ${store.sourceLabel}`"
          aria-label="数据源与 AppId 设置"
          @click="showSettings = true"
        >
          <span class="wb-source-btn__label">数据源</span>
          <span class="wb-source-btn__state">{{ store.sourceShortLabel }}</span>
        </button>
        <a :href="store.proUrl" target="_blank" rel="noopener" class="wb-btn wb-btn--primary">专业版 ↗</a>
      </template>
    </AppTopbar>

    <!-- 移动端页面导航（桌面由 CSS 隐藏） -->
    <MobilePageNav :items="[...PAGES]" :active="activePage" @switch="switchPage" />

    <div class="wb-body">
      <aside class="wb-sidebar">
        <nav class="wb-nav" aria-label="研究页面">
          <div class="wb-nav__label">研究页面</div>
          <button
            v-for="item in PAGES"
            :key="item.id"
            type="button"
            class="wb-nav__item"
            :class="{ 'is-active': item.id === activePage }"
            @click="switchPage(item.id)"
          >
            <span class="wb-nav__index">{{ item.index }}</span>
            <span>{{ item.label }}</span>
          </button>
        </nav>
        <div class="wb-sidebar__foot">
          <div>{{ store.sourceLabel }}</div>
          <div v-if="store.peers?.name">{{ store.peers.name }} · {{ store.peers.count ?? 0 }} 家</div>
          <div class="mt-2">
            <button type="button" class="wb-sidelink" @click="showSettings = true">
              设置 AppId / 实时数据 →
            </button>
          </div>
          <div class="mt-1">
            <RouterLink to="/method" class="hover:text-brand">方法论与数据来源 →</RouterLink>
          </div>
        </div>
      </aside>

      <main class="wb-main">
        <SampleGallery />

        <div v-if="store.error" class="wb-error" role="alert">
          {{ store.error }}
          <button class="wb-btn ml-3" @click="ensure">重试</button>
        </div>

        <template v-else-if="store.loading || !store.ctxReady">
          <div class="wb-skeleton" style="width: 220px; height: 26px" />
          <div class="wb-skeleton mt-3" style="width: 420px; height: 16px" />
          <div class="wb-skeleton mt-6" style="width: 100%; height: 92px" />
          <p class="wb-note mt-3">
            正在取数：{{ store.progress ? `${store.progress.done}/${store.progress.total} 张报表` : '准备中' }}
            · 首次约 30–40 秒
          </p>
        </template>

        <template v-else>
          <CompanyHeader :ctx="store.analysisCtx!" />

          <!-- 页标题条：当前页面在整套研究里的位置 -->
          <div class="wb-pagehead">
            <span class="wb-pagehead__index">{{ activeMeta.index }}</span>
            <strong>{{ activeMeta.label }}</strong>
            <span class="wb-note">· {{ symbol }} · {{ store.dataMode === 'quarterly' ? '季报口径' : '年报口径' }}</span>
          </div>

          <ResearchPage :ctx="store.analysisCtx!" :card="store.card" :tab="activePage" />

          <footer class="wb-footer">
            <span>数据来源：{{ store.sourceLabel }}</span>
            <span v-if="store.fetchInfo.missing.length">缺 {{ store.fetchInfo.missing.length }} 张报表</span>
            <span>仅供学习，不构成投资建议</span>
            <RouterLink to="/method" class="hover:text-brand">方法论 →</RouterLink>
          </footer>
        </template>
      </main>
    </div>

    <DataSourceDialog :open="showSettings" @close="showSettings = false" />
  </div>
</template>

<style scoped>
.wb-pagehead {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 10px 0 2px;
  font-size: 15px;
}
.wb-pagehead__index {
  font-size: 11px;
  color: rgb(var(--wb-muted));
  font-variant-numeric: tabular-nums;
}
</style>
