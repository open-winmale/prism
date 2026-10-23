<script setup lang="ts">
import { RouterLink } from 'vue-router';
import {
  buildContext,
  comparableMetrics,
  metricComparisonSpec,
  peerKeyMetrics,
  peerMetricCharts,
} from '@/engine';
import { peerPercentileSpec, peersScatter, type PeerLike } from '@/engine/methods/peersChart';
import { dataset as moutai } from '@/data/samples/liquor/600519';
import { dataset as wuliangye } from '@/data/samples/liquor/000858';
import { dataset as luzhou } from '@/data/samples/liquor/000568';
import { overviewTrendSpecs } from '@/features/workbench/overviewCharts';
import ChartFrame from '@/components/ui/ChartFrame.vue';

// 开发专用预览页：与概览/同业页面共用同一组 ChartSpec，
// 用来看「草图 vs 真实 ECharts」的还原度。只在 import.meta.env.DEV 下挂路由。

const ctx = buildContext({ dataset: moutai, industry: 'liquor' });
const overview = overviewTrendSpecs(ctx);

const compareMetrics = comparableMetrics(ctx);
const compareChosen = compareMetrics.filter((metric) =>
  ['revenue', 'net_profit_parent', 'cfo', 'total_assets'].includes(metric.key),
);
const indexSpec = metricComparisonSpec(ctx.dataset.reports, compareChosen, 'index');
const growthSpec = metricComparisonSpec(ctx.dataset.reports, compareChosen, 'growth');

const PEERS: PeerLike[] = [
  { symbol: '600519', name: '贵州茅台', pe_ttm: 22.5, pb: 7.8, ps_ttm: 10.5, roe_ttm: 0.345, mv: 2.15e12 },
  { symbol: '000858', name: '五粮液', pe_ttm: 18.2, pb: 4.1, ps_ttm: 6.2, roe_ttm: 0.251, mv: 5.2e11 },
  { symbol: '000568', name: '泸州老窖', pe_ttm: 20.1, pb: 6.0, ps_ttm: 8.1, roe_ttm: 0.302, mv: 2.3e11 },
  { symbol: '600809', name: '山西汾酒', pe_ttm: 28.4, pb: 8.5, ps_ttm: 9.4, roe_ttm: 0.38, mv: 2.5e11 },
  { symbol: '002304', name: '洋河股份', pe_ttm: 14.5, pb: 2.6, ps_ttm: 4.0, roe_ttm: 0.152, mv: 1.3e11 },
  { symbol: '000596', name: '古井贡酒', pe_ttm: 30.1, pb: 5.2, ps_ttm: 7.0, roe_ttm: 0.22, mv: 9e10 },
  { symbol: '603369', name: '今世缘', pe_ttm: 19.8, pb: 3.4, ps_ttm: 5.0, roe_ttm: 0.245, mv: 6e10 },
  { symbol: '603198', name: '迎驾贡酒', pe_ttm: 22.0, pb: 4.8, ps_ttm: 6.5, roe_ttm: 0.268, mv: 5e10 },
  { symbol: '600702', name: '舍得酒业', pe_ttm: 35.0, pb: 3.9, ps_ttm: 5.8, roe_ttm: 0.12, mv: 2.8e10 },
  { symbol: '600779', name: '水井坊', pe_ttm: 28.0, pb: 5.5, ps_ttm: 6.8, roe_ttm: 0.14, mv: 2.2e10 },
  { symbol: '603589', name: '口子窖', pe_ttm: 16.0, pb: 2.9, ps_ttm: 4.4, roe_ttm: 0.18, mv: 2.6e10 },
];

const scatter = peersScatter(PEERS, moutai.symbol);
const percentile = peerPercentileSpec(PEERS, moutai.symbol);
const keyMetrics = peerKeyMetrics(moutai, [wuliangye, luzhou], { align: true });
const keyCharts = peerMetricCharts(keyMetrics);
</script>

<template>
  <div class="wb-shell">
    <main class="wb-main" style="max-width: 1200px; margin: 0 auto; width: 100%">
      <div class="wb-section__head" style="margin-top: 0">
        <div>
          <h1 class="wb-section__title" style="font-size: 20px">图表系统预览</h1>
          <div class="wb-section__sub">
            开发专用 · 与概览/同业页共用同一组 ChartSpec；数据为贵州茅台真实样本 + 同业示意横截面
          </div>
        </div>
        <RouterLink to="/" class="wb-btn">返回首页</RouterLink>
      </div>

      <section class="wb-section">
        <div class="wb-section__head">
          <div>
            <h2 class="wb-section__title">核心趋势 · 2×2</h2>
            <div class="wb-section__sub">多指标同图 / 零线 / 100% 门线 / 双线利润率</div>
          </div>
        </div>
        <div class="wb-section__body wb-mini-grid">
          <ChartFrame
            v-for="(item, index) in overview"
            :key="index"
            :spec="item.spec"
            :source="item.source"
            :height="180"
            :downloadable="false"
          />
        </div>
      </section>

      <section class="wb-section">
        <div class="wb-section__head">
          <div>
            <h2 class="wb-section__title">指标对比 · 基期=100 / 同比</h2>
            <div class="wb-section__sub">跨量纲统一基期；同季同比；参考线可见（spec 层能力，工作台按预设编排使用）</div>
          </div>
        </div>
        <div class="wb-section__body wb-grid-2">
          <ChartFrame :spec="indexSpec" source="三表 · 派生" :height="300" />
          <ChartFrame :spec="growthSpec" source="三表 · 派生" :height="300" />
        </div>
      </section>

      <section class="wb-section">
        <div class="wb-section__head">
          <div>
            <h2 class="wb-section__title">同业对比</h2>
            <div class="wb-section__sub">可换轴散点 / 横截面分位 / 关键指标小倍数</div>
          </div>
        </div>
        <div class="wb-section__body wb-grid-2">
          <ChartFrame :spec="scatter.spec" source="开放平台 industry members（示意）" :height="300" />
          <ChartFrame :spec="percentile" source="开放平台 industry members（示意）" :height="300" />
        </div>
        <div class="wb-section__body wb-mini-grid mt-3">
          <ChartFrame
            v-for="(spec, index) in keyCharts"
            :key="index"
            :spec="spec"
            source="三表 · 派生"
            :height="160"
            :downloadable="false"
          />
        </div>
      </section>
    </main>
  </div>
</template>
