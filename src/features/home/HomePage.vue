<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAppStore } from '@/store/useApp';
import SymbolSearch from '@/components/SymbolSearch.vue';
import DataSourceDialog from '@/components/DataSourceDialog.vue';
import AppTopbar from '@/components/ui/AppTopbar.vue';

const router = useRouter();
const store = useAppStore();
const showSettings = ref(false);

onMounted(() => {
  if (!store.stockList.length) store.init();
});

const latest = computed(() => {
  const metrics = store.computedDs?.metrics ?? [];
  return metrics[metrics.length - 1] ?? null;
});

const preview = computed(() => {
  const ds = store.dataset;
  if (!ds) return null;
  return {
    name: ds.name,
    symbol: ds.symbol,
    source: store.sourceLabel,
    roe: latest.value?.roe_parent,
    gross: latest.value?.gross_margin,
    cfoNp: latest.value?.cfo_to_net_profit,
  };
});

function pct(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? '—' : `${(value * 100).toFixed(1)}%`;
}

function open(symbol: string) {
  router.push(`/company/${symbol}/overview`);
}
</script>

<template>
  <div class="wb-shell">
    <AppTopbar>
      <template #actions>
        <button class="wb-btn" @click="showSettings = true">数据源</button>
        <a :href="store.proUrl" target="_blank" rel="noopener" class="wb-btn wb-btn--primary">
          专业版 ↗
        </a>
      </template>
    </AppTopbar>

    <main class="wb-home">
      <section class="wb-home__hero">
        <div class="wb-home__eyebrow">个人投资者的专业版简化版</div>
        <h1 class="wb-home__title">3 分钟上手，5 分钟看懂一家公司</h1>
        <p class="wb-home__sub">
          保留专业版的分析框架与证据链，去掉机构级复杂度。结论先行、每个数字可核查、缺数据不装懂。
        </p>

        <div class="wb-home__search">
          <div class="flex-1">
            <SymbolSearch />
          </div>
          <button class="wb-btn wb-btn--primary" @click="open('600519')">先看一份示例报告 →</button>
        </div>
        <div class="wb-home__steps">
          <span>① 选公司</span>
          <span>② 看结论</span>
          <span>③ 查证据 / 跟踪</span>
          <span class="text-slate-400">无需登录；示例数据 0 EC</span>
        </div>
      </section>

      <section class="wb-home__questions">
        <div class="wb-home__question">
          <h3>利润是真的吗？</h3>
          <p>CFO/净利、应计、应收与存货背离</p>
        </div>
        <div class="wb-home__question">
          <h3>生意好不好？</h3>
          <p>ROE/ROIC、毛利率、费用率与成长质量</p>
        </div>
        <div class="wb-home__question">
          <h3>有没有雷？</h3>
          <p>8–10 项判据，四态结论，证据可回查</p>
        </div>
        <div class="wb-home__question">
          <h3>贵不贵？</h3>
          <p>PE/PB/PS、自身 3 年分位与行业分位</p>
        </div>
      </section>

      <section class="wb-home__preview">
        <div class="wb-home__panel">
          <div class="wb-home__panel-head">
            <span class="wb-home__panel-title">示例报告</span>
            <span class="wb-note">{{ preview?.source ?? '加载中' }}</span>
          </div>
          <div class="wb-home__panel-body">
            <template v-if="preview">
              <div class="flex items-baseline justify-between gap-3">
                <div>
                  <div class="text-[15px] font-semibold">{{ preview.name }}</div>
                  <div class="wb-note">{{ preview.symbol }} · 合并报表 · 示例数据</div>
                </div>
                <button class="wb-btn" @click="open(preview.symbol)">查看完整报告 →</button>
              </div>
              <div class="wb-kpis mt-3" style="grid-template-columns: repeat(3, minmax(0, 1fr))">
                <div class="wb-kpi">
                  <div class="wb-kpi__label">ROE</div>
                  <div class="wb-kpi__value">{{ pct(preview.roe) }}</div>
                </div>
                <div class="wb-kpi">
                  <div class="wb-kpi__label">毛利率</div>
                  <div class="wb-kpi__value">{{ pct(preview.gross) }}</div>
                </div>
                <div class="wb-kpi">
                  <div class="wb-kpi__label">CFO / 净利</div>
                  <div class="wb-kpi__value">{{ preview.cfoNp?.toFixed(2) ?? '—' }}</div>
                </div>
              </div>
              <p class="wb-note mt-3">
                示例用内置快照，0 EC、离线可用。连接开放平台后可查任意 A 股，并显示估值与行业分位。
              </p>
            </template>
            <p v-else class="wb-note">正在加载示例数据…</p>
          </div>
        </div>

        <div class="wb-home__panel">
          <div class="wb-home__panel-head">
            <span class="wb-home__panel-title">热门公司</span>
            <button class="wb-btn wb-btn--ghost" @click="showSettings = true">查任意 A 股 →</button>
          </div>
          <div class="wb-home__panel-body">
            <div class="wb-home__popular">
              <RouterLink to="/company/600519/overview">贵州茅台 600519</RouterLink>
              <RouterLink to="/company/000858/overview">五粮液 000858</RouterLink>
              <RouterLink to="/company/000568/overview">泸州老窖 000568</RouterLink>
            </div>
            <p class="wb-note mt-3">
              示例模式只内置白酒三家。填入自己的开放平台 AppId 后，可搜索任意 A 股非金融公司，并自动获取行业成分与估值。
            </p>
            <div class="wb-callout mt-3">
              <b>为什么需要 AppId？</b>
              <div class="mt-1">
                数据在赢麻了开放平台云端，分析在前端完成。AppId 免费申请，保存在本机浏览器；本站不代持凭证。
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer class="wb-footer">
        <span>财报透视 · 个人版</span>
        <span>基于赢麻了专业版分析框架</span>
        <span>仅供学习，不构成投资建议</span>
      </footer>
    </main>

    <DataSourceDialog :open="showSettings" @close="showSettings = false" />
  </div>
</template>
