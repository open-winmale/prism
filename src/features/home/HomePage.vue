<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAppStore } from '@/store/useApp';
import CompanyPicker from './CompanyPicker.vue';
import SymbolSearch from '@/components/SymbolSearch.vue';

// 首页（DESIGN_SPEC §3.2）：行业固定白酒；精选头部公司卡片直达，
// 其他公司不平铺——走搜索接口按需查（live 模式）。
const router = useRouter();
const store = useAppStore();

onMounted(() => {
  if (!store.stockList.length) store.init();
});

const cards = computed(() =>
  store.stockList.map((s) => {
    const ds = store.dataset?.symbol === s.symbol ? store.dataset : null;
    // meta 在数据集加载后才有；列表卡片用 provider 元信息 + dataset meta（当前公司）兜底
    return {
      symbol: s.symbol,
      name: s.name,
      tags: (ds?.meta?.fragrance ? `${ds.meta.fragrance}·${ds.meta.priceBand ?? ''}` : '').replace(/·$/, ''),
      feature: ds?.meta?.sourceNote ?? undefined,
      sourceReal: store.dataSource === 'live' ? true : null,
    };
  }),
);

function pick(symbol: string) {
  router.push({ path: '/analyze', query: { symbol } });
}
</script>

<template>
  <div class="space-y-8">
    <section class="text-center">
      <h1 class="text-3xl font-medium leading-snug">用一份财报，看懂一家白酒公司</h1>
      <p class="mt-2 text-slate-500">
        财报透视 · 赢麻了开源免费版：老唐排雷清单 + 质地体检 + 渠道蓄水池，图表化呈现，先给结论再给证据。
      </p>
    </section>

    <section class="mx-auto max-w-xl">
      <SymbolSearch />
      <p class="mt-1.5 text-center text-xs text-slate-400">
        {{
          store.dataSource === 'live'
            ? '输入任意白酒公司名称 / 代码，实时拉取财报生成报告'
            : '填入 AppId 后可搜索并查看任意公司（设置 → 数据源）'
        }}
      </p>
    </section>

    <section>
      <h2 class="mb-3 text-lg font-medium">或从精选公司开始</h2>
      <div class="grid gap-3 sm:grid-cols-2">
        <template v-if="cards.length">
          <CompanyPicker
            v-for="c in cards"
            :key="c.symbol"
            :name="c.name"
            :symbol="c.symbol"
            :tags="c.tags"
            :feature="c.feature"
            :source-real="c.sourceReal ?? undefined"
            :selected="store.currentSymbol === c.symbol"
            @select="pick(c.symbol)"
          />
        </template>
        <div v-else class="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-400">加载中…</div>
      </div>
    </section>

    <section class="rounded-xl border border-slate-200 bg-white p-5">
      <h3 class="m-0 text-base font-semibold">方法论</h3>
      <p class="mt-1 text-sm leading-6 text-slate-600">
        排雷规则与质量维度来自老唐《手把手教你读财报》与专业版质量体检包：合同负债蓄水池、收现比、
        基酒与成品库存分口径、现金流八型。所有规则透明声明、每个结论带佐证数字，缺数据明示而非假装通过。
      </p>
      <router-link to="/about" class="text-sm text-brand hover:underline">了解完整方法论 →</router-link>
    </section>

    <section class="rounded-xl bg-brandsoft p-5 text-center">
      <p class="m-0 text-sm text-slate-600">想连接真实财报数据、看完整专业版分析？</p>
      <a
        :href="store.proUrl"
        target="_blank"
        rel="noopener"
        class="mt-3 inline-block rounded-full bg-brand px-8 py-2.5 font-medium text-white hover:opacity-90"
      >
        前往赢麻了专业版 →
      </a>
    </section>
  </div>
</template>
