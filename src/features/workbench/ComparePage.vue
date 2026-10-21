<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { useAppStore } from '@/store/useApp';
import AppTopbar from '@/components/ui/AppTopbar.vue';
import PeerPanels from '@/components/ui/PeerPanels.vue';
import SymbolSearch from '@/components/SymbolSearch.vue';
import DataSourceDialog from '@/components/DataSourceDialog.vue';
import { ref } from 'vue';

// /compare 独立对比页：行业组跟随当前公司（store.peers），供深链分享与横截面总览。
// 快照模式显式降级引导；live 模式复用 PeerPanels（KPI 分位 + 散点 + 分位条 + 全行业表）。

const store = useAppStore();
const showSettings = ref(false);

const hasPeers = computed(() => (store.peers?.items?.length ?? 0) > 0 && !!store.analysisCtx);

onMounted(() => {
  if (!store.stockList.length) void store.init();
});
</script>

<template>
  <div class="wb-shell">
    <AppTopbar>
      <template #search>
        <SymbolSearch />
      </template>
      <template #actions>
        <button class="wb-btn" @click="showSettings = true">数据源</button>
        <a :href="store.proUrl" target="_blank" rel="noopener" class="wb-btn wb-btn--primary">专业版 ↗</a>
      </template>
    </AppTopbar>

    <main class="wb-main" style="max-width: 1200px; margin: 0 auto; width: 100%">
      <section class="wb-section" style="margin-top: 0">
        <div class="wb-section__head">
          <div>
            <h2 class="wb-section__title">同业对比</h2>
            <div class="wb-section__sub">
              行业组跟随当前公司（{{ store.dataset?.name ?? '未选择' }}）
              <template v-if="store.peers?.name"> · {{ store.peers.name }} {{ store.peers.count ?? 0 }} 家</template>
              · 横截面分位，不是历史分位
            </div>
          </div>
          <RouterLink
            v-if="store.currentSymbol"
            :to="`/company/${store.currentSymbol}/peers`"
            class="wb-btn"
          >
            回到当前公司 →
          </RouterLink>
        </div>
        <div class="wb-section__body">
          <div v-if="store.loading" class="wb-note">加载中…</div>
          <div v-else-if="!hasPeers" class="wb-callout">
            <p class="m-0">
              快照模式没有行业成分，无法横比。两种方式开启：
            </p>
            <ol class="mt-2 mb-0 pl-5">
              <li>
                免费申请开放平台 AppId 并填入「数据源」，自动获取任意 A 股公司的申万行业组（约 3.4k EC / 24h 缓存）。
                <button class="wb-btn ml-1" @click="showSettings = true">填入 AppId →</button>
              </li>
              <li>先看示例公司（内置快照）的完整报告：<RouterLink to="/company/600519/overview" class="text-brand">贵州茅台 →</RouterLink></li>
            </ol>
          </div>
          <PeerPanels v-else :ctx="store.analysisCtx!" :card="store.card" :peers="store.peers" />
        </div>
      </section>

      <footer class="wb-footer">
        <span>数据来源：{{ store.sourceLabel }}</span>
        <span>仅供学习，不构成投资建议</span>
      </footer>
    </main>

    <DataSourceDialog :open="showSettings" @close="showSettings = false" />
  </div>
</template>
