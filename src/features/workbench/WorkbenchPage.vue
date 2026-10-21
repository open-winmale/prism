<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { useAppStore } from '@/store/useApp';
import AppTopbar from '@/components/ui/AppTopbar.vue';
import CompanyHeader from '@/components/ui/CompanyHeader.vue';
import WorkspaceNav from '@/components/ui/WorkspaceNav.vue';
import SymbolSearch from '@/components/SymbolSearch.vue';
import DataSourceDialog from '@/components/DataSourceDialog.vue';
import OverviewWorkspace from './OverviewWorkspace.vue';
import FinancialsWorkspace from './FinancialsWorkspace.vue';
import QualityWorkspace from './QualityWorkspace.vue';
import PeersWorkspace from './PeersWorkspace.vue';
import ValuationWorkspace from './ValuationWorkspace.vue';
import RiskWorkspace from './RiskWorkspace.vue';
import TrackingWorkspace from './TrackingWorkspace.vue';

const route = useRoute();
const store = useAppStore();
const showSettings = ref(false);
const shareCopied = ref(false);

async function copyLink() {
  try {
    await navigator.clipboard.writeText(window.location.href);
    shareCopied.value = true;
    window.setTimeout(() => (shareCopied.value = false), 1500);
  } catch {
    /* 剪贴板不可用（非安全上下文/权限）→ 静默；用户仍可从地址栏复制 */
  }
}
const HINT_KEY = 'report-lens:workbench-hint';
const showHint = ref(true);
try {
  showHint.value = localStorage.getItem(HINT_KEY) !== '1';
} catch {
  /* localStorage 不可用时每次显示，不影响主流程 */
}
function dismissHint() {
  showHint.value = false;
  try {
    localStorage.setItem(HINT_KEY, '1');
  } catch {
    /* ignore */
  }
}

const symbol = computed(() => String(route.params.symbol ?? ''));
const workspace = computed(() => String(route.params.workspace ?? 'overview'));
const validWorkspaces = new Set([
  'overview',
  'financials',
  'quality',
  'peers',
  'valuation',
  'risk',
  'tracking',
]);
const active = computed(() => (validWorkspaces.has(workspace.value) ? workspace.value : 'overview'));

function ensure() {
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
        <button class="wb-btn" @click="copyLink">{{ shareCopied ? '已复制 ✓' : '分享' }}</button>
        <button class="wb-btn" @click="showSettings = true">数据源</button>
        <a :href="store.proUrl" target="_blank" rel="noopener" class="wb-btn wb-btn--primary">
          专业版 ↗
        </a>
      </template>
    </AppTopbar>

    <div class="wb-body">
      <aside class="wb-sidebar">
        <WorkspaceNav :symbol="symbol" :active="active" mode="desktop" />
        <div class="wb-sidebar__foot">
          <div>{{ store.sourceLabel }}</div>
          <div v-if="store.peers?.name">{{ store.peers.name }} · {{ store.peers.count ?? 0 }} 家</div>
          <div class="mt-2">
            <RouterLink to="/method" class="hover:text-brand">方法论与数据来源 →</RouterLink>
          </div>
        </div>
      </aside>

      <main class="wb-main">
        <div v-if="store.error" class="wb-error" role="alert">
          {{ store.error }}
          <button class="wb-btn ml-3" @click="ensure">重试</button>
        </div>

        <template v-else-if="store.loading || !store.ctxReady">
          <div class="wb-skeleton" style="width: 220px; height: 26px" />
          <div class="wb-skeleton mt-3" style="width: 420px; height: 16px" />
          <div class="wb-skeleton mt-6" style="width: 100%; height: 92px" />
          <div class="wb-skeleton mt-4" style="width: 100%; height: 120px" />
          <div class="wb-skeleton mt-4" style="width: 100%; height: 260px" />
          <p class="wb-note mt-3">
            正在取数：{{ store.progress ? `${store.progress.done}/${store.progress.total} 张报表` : '准备中' }}
            · 首次约 30–40 秒
          </p>
        </template>

        <template v-else>
          <CompanyHeader :ctx="store.analysisCtx!" />

          <div v-if="showHint" class="wb-callout mt-3 flex flex-wrap items-center justify-between gap-3">
            <span>这份报告怎么看：先看结论 → 再看五维 → 最后看跟踪清单。每个结论都能展开到证据。</span>
            <button class="wb-btn" @click="dismissHint">知道了</button>
          </div>

          <OverviewWorkspace
            v-if="active === 'overview'"
            :ctx="store.analysisCtx!"
            :card="store.card"
            :peers="store.peers"
          />
          <FinancialsWorkspace v-else-if="active === 'financials'" :ctx="store.analysisCtx!" />
          <QualityWorkspace v-else-if="active === 'quality'" :ctx="store.analysisCtx!" />
          <PeersWorkspace
            v-else-if="active === 'peers'"
            :ctx="store.analysisCtx!"
            :card="store.card"
            :peers="store.peers"
          />
          <ValuationWorkspace v-else-if="active === 'valuation'" :card="store.card" :peers="store.peers" />
          <RiskWorkspace v-else-if="active === 'risk'" :ctx="store.analysisCtx!" />
          <TrackingWorkspace v-else-if="active === 'tracking'" :ctx="store.analysisCtx!" :card="store.card" />

          <footer class="wb-footer">
            <span>数据来源：{{ store.sourceLabel }}</span>
            <span v-if="store.fetchInfo.missing.length">缺 {{ store.fetchInfo.missing.length }} 张报表</span>
            <span v-if="store.fetchInfo.issues.length">
              校验提示 {{ store.fetchInfo.issues.length }} 项
            </span>
            <span>仅供学习，不构成投资建议</span>
          </footer>
        </template>
      </main>
    </div>

    <WorkspaceNav :symbol="symbol" :active="active" mode="mobile" />

    <DataSourceDialog :open="showSettings" @close="showSettings = false" />
  </div>
</template>
