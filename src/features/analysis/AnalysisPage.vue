<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { ProblemId } from '@/engine';
import { useAppStore } from '@/store/useApp';
import ModuleResult from './ModuleResult.vue';
import ReportHero from './ReportHero.vue';
import ReportNav from '@/components/ReportNav.vue';
import CtaBanner from '@/components/CtaBanner.vue';
import SymbolSearch from '@/components/SymbolSearch.vue';
import DataSourceDialog from '@/components/DataSourceDialog.vue';

const route = useRoute();
const store = useAppStore();

const showMore = ref(false);
const showSettings = ref(false);
const activeAnchor = ref('verdict');

// Hero 章节锚点（DESIGN_SPEC §3.3 / §4.2）
const SECTIONS = [
  { id: 'verdict', label: '判定' },
  { id: 'mine', label: '排雷' },
  { id: 'quality', label: '质地' },
  { id: 'conclusion', label: '结论' },
];

// problem → 默认锚点（首页带 problem 进来时落到对应章节）
const ANCHOR_OF_PROBLEM: Record<ProblemId, string> = {
  risk: 'mine',
  profitability: 'quality',
  assetQuality: 'quality',
  operations: 'quality',
};

function syncFromQuery() {
  const symbol = route.query.symbol as string | undefined;
  // 动态选标的：不再要求 symbol 预置在列表里，任意代码都尝试拉取（快照模式下会给出明确提示）
  if (symbol && symbol !== store.currentSymbol) {
    void store.selectStock(symbol);
  }
  const p = route.query.problem as ProblemId | undefined;
  if (p) {
    store.setProblem(p);
    activeAnchor.value = ANCHOR_OF_PROBLEM[p] ?? 'verdict';
  }
}
onMounted(() => {
  syncFromQuery();
  store.loadExtraSamples();
});
watch(() => route.query, syncFromQuery);

// 切换数据源（填/清除 AppId）后重新加载，让新凭证立即生效
watch(
  () => store.dataSource,
  async () => {
    await store.init();
    store.loadExtraSamples();
  },
);

const isHero = computed(() => store.view === 'report' && store.ctxReady);

// 数据来源标签（DESIGN_SPEC §4.1：示例数据用 amber，辨识度强化）
const meta = computed(() => store.dataset?.meta);
</script>

<template>
  <div v-if="store.error" class="rounded bg-red-50 p-3 text-sm text-red-600">{{ store.error }}</div>
  <div v-else-if="store.loading" class="text-slate-400">加载中…</div>
  <div v-else class="grid gap-4 lg:grid-cols-[260px_1fr]">
    <aside class="space-y-3">
      <!-- 两级导航：报告（Hero）置顶 + 更多维度折叠 -->
      <div class="rounded-xl border border-slate-200 bg-white p-3">
        <button
          class="mb-1 block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold transition"
          :class="store.view === 'report' ? 'bg-brandsoft text-brand' : 'text-slate-600 hover:bg-slate-50'"
          @click="store.setView('report')"
        >
          🛡 排雷体检报告
          <span class="ml-1 text-xs font-normal text-slate-400">推荐先看</span>
        </button>

        <button
          class="flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-slate-500 transition hover:bg-slate-50"
          @click="showMore = !showMore"
        >
          <span>更多维度（{{ store.secondaryModules.length }}）</span>
          <span class="text-xs">{{ showMore ? '▲' : '▼' }}</span>
        </button>
        <div v-show="showMore" class="mt-1 space-y-0.5">
          <button
            v-for="m in store.secondaryModules"
            :key="m.id"
            class="block w-full cursor-pointer rounded-lg px-3 py-1.5 pl-6 text-left text-sm transition"
            :class="store.view === m.id ? 'bg-brandsoft font-medium text-brand' : 'text-slate-600 hover:bg-slate-50'"
            @click="store.setView(m.id)"
          >
            {{ m.title }}
          </button>
        </div>
      </div>
      <CtaBanner />
    </aside>

    <section class="space-y-3">
      <!-- 动态选标的：搜索框（需 AppId）+ 数据源设置入口 -->
      <div class="flex items-center gap-2">
        <SymbolSearch />
        <button
          class="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-500 transition hover:bg-slate-50"
          @click="showSettings = true"
        >
          {{
            store.dataSource === 'live'
              ? store.credential.source === 'env'
                ? '⚙ 环境变量凭证'
                : '⚙ 已连接口'
              : '⚙ 接数据源'
          }}
        </button>
      </div>

      <!-- 章节锚点条（Hero 视图时显示） -->
      <ReportNav v-if="isHero" :sections="SECTIONS" :active="activeAnchor" @select="activeAnchor = $event" />

      <!-- 公司条：名称/代码 · 期间 · 香型 · 数据来源标签（真实=emerald / 示例=amber 强化辨识） -->
      <div class="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div class="min-w-0">
          <div class="font-semibold">
            {{ store.dataset?.name }}
            <span class="ml-1 text-xs font-normal text-slate-400">{{ store.currentSymbol }}</span>
          </div>
          <div class="text-xs text-slate-400">
            {{ store.dataset?.periods[0]?.slice(0, 4) }}–{{
              store.dataset?.periods[store.dataset.periods.length - 1]?.slice(0, 4)
            }}
            <template v-if="meta?.fragrance"> · {{ meta.fragrance }}<template v-if="meta?.priceBand"> · {{ meta.priceBand }}</template></template>
            <span class="ml-1 rounded bg-emerald-50 px-1 text-emerald-600" v-if="store.dataSource === 'live'">
              实时接口<template v-if="store.fetchInfo.cached"> · 本地缓存</template>
            </span>
            <span class="ml-1 rounded bg-amber-50 px-1 text-amber-600" v-else>内置快照</span>
          </div>
        </div>
        <select
          :value="store.currentSymbol"
          class="rounded-lg border border-slate-200 px-2 py-1.5 text-sm sm:w-auto"
          @change="store.selectStock(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="s in [...store.stockList, ...store.extraSymbols]" :key="s.symbol" :value="s.symbol">
            {{ s.name }}{{ s.industry === 'manufacturing' ? '（对照）' : '' }}
          </option>
        </select>
      </div>

      <p v-if="store.dataset?.disclaimer" class="rounded bg-slate-50 px-3 py-2 text-xs text-slate-500">
        ⓘ {{ store.dataset.disclaimer }}
      </p>
      <p v-if="store.fetchInfo.missing.length" class="rounded bg-amber-50 px-3 py-2 text-xs text-amber-700">
        ⚠ 有 {{ store.fetchInfo.missing.length }} 张报表未取到（{{ store.fetchInfo.missing.slice(0, 3).join('、')
        }}<template v-if="store.fetchInfo.missing.length > 3"> 等</template>），相关结论已按缺数据降级处理。
      </p>

      <!-- 默认：Hero 报告；否则次级维度单图视图 -->
      <ReportHero v-if="isHero" :ctx="store.analysisCtx!" />
      <ModuleResult v-else-if="store.lastResult" :result="store.lastResult" />
      <div v-else class="text-slate-400">选择左侧模块开始分析…</div>
    </section>

    <DataSourceDialog :open="showSettings" @close="showSettings = false" />
  </div>
</template>
