<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { peerKeyMetrics, peerMetricCharts } from '@/engine';
import { useAppStore } from '@/store/useApp';
import AppTopbar from '@/components/ui/AppTopbar.vue';
import ChartFrame from '@/components/ui/ChartFrame.vue';
import PeerPanels from '@/components/ui/PeerPanels.vue';
import PeerStatementTable from '@/components/ui/PeerStatementTable.vue';
import SymbolSearch from '@/components/SymbolSearch.vue';
import DataSourceDialog from '@/components/DataSourceDialog.vue';

// /compare 独立对比页：行业组跟随当前公司（store.peers），供深链分享与横截面总览。
// 快照模式显式降级引导；live 模式复用 PeerPanels（KPI 分位 + 散点 + 分位条 + 全行业表）。
//
// 三表逐行横截面是本页的「深水区」：勾一家就多取一份完整三表，
// 所以默认 0 家（0 EC），勾选时必须先看到 EC 预估并显式确认——
// 这是本项目「任何功能的第一个设计问题是花多少 EC」的落地。

const store = useAppStore();
const showSettings = ref(false);

/** 最多同时对比的同行数：既控 EC，也保证表格在一屏内可读 */
const MAX_PEERS = 3;

const hasPeers = computed(() => (store.peers?.items?.length ?? 0) > 0 && !!store.analysisCtx);

/** 候选公司：快照模式给内置样本（0 EC），live 模式给行业成分 */
const candidates = computed(() => {
  const cur = store.currentSymbol;
  const seen = new Set<string>([cur]);
  const out: { symbol: string; name: string }[] = [];
  const push = (s: string, n: string) => {
    if (seen.has(s)) return;
    seen.add(s);
    out.push({ symbol: s, name: n });
  };
  if (store.peers?.items?.length) {
    for (const it of store.peers.items) push(it.symbol, it.name ?? it.symbol);
  } else {
    for (const s of store.stockList) push(s.symbol, s.name ?? s.symbol);
    for (const s of store.extraSymbols) push(s.symbol, s.name ?? s.symbol);
  }
  return out.slice(0, 12);
});

const selected = ref<string[]>([]);
const outlierGap = ref(0.5);
const confirming = ref(false);

const nameOf = (symbol: string) => candidates.value.find((c) => c.symbol === symbol)?.name ?? symbol;

/** 已加载成功的同行数据集 */
const loadedOthers = computed(() =>
  selected.value.map((s) => store.compareTargets[s]).filter((d): d is NonNullable<typeof d> => !!d),
);

const pendingCount = computed(() => selected.value.filter((s) => !store.compareTargets[s]).length);
const ecEstimate = computed(() => store.estimateCompareEc(selected.value));
const isSnapshot = computed(() => store.dataSource !== 'live');

/** 关键经营指标对照：只消费用户已加载的同行三表，0 额外 EC */
const keyMetrics = computed(() => {
  if (!store.dataset || !loadedOthers.value.length) return null;
  return peerKeyMetrics(store.dataset, loadedOthers.value);
});
const keyCharts = computed(() => (keyMetrics.value ? peerMetricCharts(keyMetrics.value) : []));

function toggle(symbol: string) {
  if (selected.value.includes(symbol)) {
    selected.value = selected.value.filter((s) => s !== symbol);
    return;
  }
  if (selected.value.length >= MAX_PEERS) return;
  selected.value = [...selected.value, symbol];
}

/**
 * 加载所选公司。统一用按钮触发而不是勾选即取数——避免「随手点一下就花掉几万 EC」。
 * 0 EC 的场景（快照 / 本次已加载）直接执行；只有预估真的要花钱时才先弹一次确认。
 */
async function applySelection() {
  if (ecEstimate.value > 0 && !confirming.value) {
    confirming.value = true;
    return;
  }
  confirming.value = false;
  for (const s of selected.value) await store.loadCompare(s);
}

onMounted(() => {
  if (!store.stockList.length) void store.init();
  void store.loadExtraSamples();
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
              <!-- 口径要说准：实时模式下没取到成分 ≠ 快照模式没有成分，两者的补救动作完全不同 -->
              {{
                isSnapshot
                  ? '快照模式没有行业成分，无法横比。两种方式开启：'
                  : '实时模式也未取到行业成分（该行业可能暂无成分数据，或本次取数未成功）。可以：'
              }}
            </p>
            <ol class="mt-2 mb-0 pl-5">
              <li v-if="isSnapshot">
                免费申请开放平台 AppId 并填入「数据源」，自动获取任意 A 股公司的申万行业组（约 3.4k EC / 24h 缓存）。
                <button class="wb-btn ml-1" @click="showSettings = true">填入 AppId →</button>
              </li>
              <li v-else>
                先进入某家公司的分析页完成一次取数，行业成分会随之返回；再用下方「三表逐行对比」勾选具体同行做横截面。
              </li>
              <li>先看示例公司（内置快照）的完整报告：<RouterLink to="/company/600519/overview" class="text-brand">贵州茅台 →</RouterLink></li>
            </ol>
          </div>
          <PeerPanels v-else :ctx="store.analysisCtx!" :card="store.card" :peers="store.peers" />
        </div>
      </section>

      <!-- 三表逐行横截面：默认 0 家 = 0 EC，勾选前先看 EC 预估 -->
      <section v-if="store.dataset" class="wb-section">
        <div class="wb-section__head">
          <div>
            <h2 class="wb-section__title">三表逐行对比</h2>
            <div class="wb-section__sub">
              同一行科目摆到多家公司旁边 · 默认不勾选（0 EC）· 最多 {{ MAX_PEERS }} 家
            </div>
          </div>
        </div>
        <div class="wb-section__body">
          <div class="wb-filters mb-3">
            <span class="wb-filters__label">对比对象</span>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="c in candidates"
                :key="c.symbol"
                class="wb-toggle"
                :class="{ 'is-on': selected.includes(c.symbol) }"
                :aria-pressed="selected.includes(c.symbol)"
                :disabled="!selected.includes(c.symbol) && selected.length >= MAX_PEERS"
                @click="toggle(c.symbol)"
              >
                <span class="wb-toggle__box" />{{ c.name }}
              </button>
            </div>
            <p class="wb-filters__note">
              内置样本走本地快照，勾选不花 EC；其余标的每家约
              {{ store.ecPerCompany().toLocaleString() }} EC（24h 缓存命中则实际为 0）。
              {{ isSnapshot ? '当前为快照模式，所有标的均为内置样本。' : '' }}
              当前勾选 {{ selected.length }} 家 · 待取数 {{ pendingCount }} 家 ·
              <strong>预计 {{ ecEstimate.toLocaleString() }} EC</strong>
            </p>
          </div>

          <div v-if="confirming" class="wb-callout is-warn mb-3">
            <p class="m-0">
              即将为 {{ pendingCount }} 家公司各取一份完整三表，预计
              <strong>{{ ecEstimate.toLocaleString() }} EC</strong>（24h 内缓存命中则实际为 0）。
              确认后开始取数，过程中可看到进度。
            </p>
            <div class="mt-2 flex gap-2">
              <button class="wb-btn wb-btn--primary" @click="applySelection">确认取数</button>
              <button class="wb-btn" @click="confirming = false">取消</button>
            </div>
          </div>

          <div v-if="store.compareLoading" class="wb-note mb-3">
            正在取 {{ nameOf(store.compareLoading) }} 的三表…
          </div>
          <p v-if="store.compareError" class="wb-callout is-warn mb-3">{{ store.compareError }}</p>

          <!-- 关键指标对照：期间对齐后的横向柱，本公司高亮 + 中位数线 -->
          <div v-if="keyCharts.length" class="mb-5">
            <div class="wb-section__head" style="margin-bottom: 8px">
              <div>
                <h3 class="wb-section__title" style="font-size: 13px">关键指标对照</h3>
                <div class="wb-section__sub">
                  {{
                    keyMetrics?.aligned
                      ? `期间对齐 ${keyMetrics.alignedYear}`
                      : '未对齐（各公司最新年报，结论要打折）'
                  }}
                  · 本公司高亮 · 灰色虚线为中位数 · n={{ keyMetrics?.companies.length }}
                </div>
              </div>
            </div>
            <div class="wb-mini-grid">
              <ChartFrame
                v-for="(spec, index) in keyCharts"
                :key="index"
                :spec="spec"
                source="三表 · 派生"
                :height="160"
                :downloadable="false"
              />
            </div>
            <p v-if="keyMetrics && !keyMetrics.aligned && keyMetrics.warnings.length" class="wb-callout is-warn mt-2">
              {{ keyMetrics.warnings.join('；') }}
            </p>
          </div>

          <div v-if="selected.length === 0" class="wb-callout">
            勾选上方公司开始对比。默认不勾选——横截面是深水区，不该默认替你花 EC。
          </div>
          <PeerStatementTable
            v-else-if="store.dataset && loadedOthers.length"
            v-model:outlier-gap="outlierGap"
            :main="store.dataset"
            :others="loadedOthers"
          />
          <div v-else class="wb-callout">
            已勾选 {{ selected.length }} 家，尚无已加载数据。
            <button class="wb-btn ml-1" @click="applySelection">开始加载</button>
          </div>
        </div>
      </section>

      <footer class="wb-footer">
        <span>数据来源：{{ store.sourceLabel }}</span>
        <span>横截面累计 {{ store.compareEc.toLocaleString() }} EC</span>
        <span>仅供学习，不构成投资建议</span>
      </footer>
    </main>

    <DataSourceDialog :open="showSettings" @close="showSettings = false" />
  </div>
</template>
