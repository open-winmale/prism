<script setup lang="ts">
import { computed } from 'vue';
import type { AnalysisContext } from '@/engine';
import {
  peerPercentileSpec,
  peersScatter,
  quantile,
} from '@/engine/methods/peersChart';
import type { CompanyCard, IndustryMembersPayload } from '@/data/wm/types';
import ChartFrame from '@/components/ui/ChartFrame.vue';

// 同业面板（概览迷你表之外的完整形态）：KPI 分位 + 散点 + 横截面分位 + 全行业表。
// 简化版原则：散点固定 ROE×PE（最常见的「质 × 价」读法），不提供换轴——
// 想自由组合维度属于专业版数据实验室的范畴。
// 由「同业坐标」区块（估值工作区内嵌）与 /compare 独立页复用；数据来自 store.peers（live），快照下调用方负责降级提示。

const props = defineProps<{
  ctx: AnalysisContext;
  card: CompanyCard | null;
  peers: IndustryMembersPayload | null;
}>();

const items = computed(() =>
  [...(props.peers?.items ?? [])].sort((a, b) => (b.mv ?? 0) - (a.mv ?? 0)),
);

function median(values: (number | null | undefined)[]): number | null {
  const valid = values.filter((v): v is number => v != null && Number.isFinite(v)).sort((a, b) => a - b);
  if (!valid.length) return null;
  const mid = valid.length >> 1;
  return valid.length % 2 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;
}

const medians = computed(() => ({
  pe: median(items.value.map((i) => i.pe_ttm)),
  pb: median(items.value.map((i) => i.pb)),
  ps: median(items.value.map((i) => i.ps_ttm)),
  roe: median(items.value.map((i) => i.roe_ttm)),
  mv: median(items.value.map((i) => i.mv)),
}));

const current = computed(() => items.value.find((item) => item.symbol === props.ctx.dataset.symbol) ?? null);

const rank = computed(() => ({
  pe: quantile('PE', current.value?.pe_ttm, items.value.map((i) => i.pe_ttm), (v) => `${v.toFixed(1)}x`),
  roe: quantile('ROE', current.value?.roe_ttm, items.value.map((i) => i.roe_ttm), (v) => `${(v * 100).toFixed(1)}%`),
}));

const scatter = computed(() =>
  peersScatter(props.peers?.items ?? [], props.ctx.dataset.symbol, {
    xKey: 'pe_ttm',
    yKey: 'roe_ttm',
  }),
);

/** 横截面分位图：本公司 PE/PB/PS/ROE 在同行里的位置，50% 中位线 */
const percentile = computed(() =>
  items.value.length ? peerPercentileSpec(items.value, props.ctx.dataset.symbol) : null,
);

function num(value: number | null | undefined, digits = 1): string {
  return value == null || !Number.isFinite(value) ? '—' : value.toFixed(digits);
}
function pct(value: number | null | undefined, digits = 1): string {
  return value == null || !Number.isFinite(value) ? '—' : `${(value * 100).toFixed(digits)}%`;
}
function yi(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? '—' : (value / 1e8).toFixed(0);
}
</script>

<template>
  <div class="wb-kpis">
    <div class="wb-kpi">
      <div class="wb-kpi__label">当前 PE 分位</div>
      <div class="wb-kpi__value">{{ rank.pe.rank == null ? '—' : pct(rank.pe.rank, 0) }}</div>
      <div class="wb-kpi__meta">当前 {{ rank.pe.display }} · 中位数 {{ num(medians.pe) }}x</div>
    </div>
    <div class="wb-kpi">
      <div class="wb-kpi__label">当前 ROE 分位</div>
      <div class="wb-kpi__value">{{ rank.roe.rank == null ? '—' : pct(rank.roe.rank, 0) }}</div>
      <div class="wb-kpi__meta">当前 {{ rank.roe.display }} · 中位数 {{ pct(medians.roe) }}</div>
    </div>
    <div class="wb-kpi">
      <div class="wb-kpi__label">当前 PB</div>
      <div class="wb-kpi__value">{{ num(current?.pb, 2) }}x</div>
      <div class="wb-kpi__meta">行业中位数 {{ num(medians.pb, 2) }}x</div>
    </div>
    <div class="wb-kpi">
      <div class="wb-kpi__label">当前 PS</div>
      <div class="wb-kpi__value">{{ num(current?.ps_ttm, 2) }}x</div>
      <div class="wb-kpi__meta">行业中位数 {{ num(medians.ps, 2) }}x</div>
    </div>
    <div class="wb-kpi">
      <div class="wb-kpi__label">市值</div>
      <div class="wb-kpi__value">{{ yi(current?.mv) }} <span class="wb-kpi__unit">亿</span></div>
      <div class="wb-kpi__meta">行业中位数 {{ yi(medians.mv) }} 亿</div>
    </div>
  </div>

  <div class="wb-grid-2 mt-5">
    <div>
      <div class="wb-peer-axes">
        <span class="wb-note">横轴 PE(TTM) × 纵轴 ROE(TTM) · 「质 × 价」一图看全 · 样本 n={{ scatter.stats.n }}</span>
      </div>
      <ChartFrame :spec="scatter.spec" source="开放平台 industry members" :height="240" />
    </div>
    <div>
      <div class="wb-section__sub mb-2">本公司横截面分位</div>
      <ChartFrame
        v-if="percentile"
        :spec="percentile"
        source="开放平台 industry members"
        :height="240"
      />
      <p class="wb-note mt-1">50% 中位线 · 分位只表示位置，不判断好坏</p>
    </div>
  </div>

  <div class="wb-table-wrap mt-5">
    <table class="wb-table">
      <thead>
        <tr>
          <th class="is-sticky">公司</th>
          <th class="is-num">市值（亿）</th>
          <th class="is-num">PE(TTM)</th>
          <th class="is-num">PB</th>
          <th class="is-num">PS</th>
          <th class="is-num">ROE</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="item in items"
          :key="item.symbol"
          :class="{ 'is-section': item.symbol === ctx.dataset.symbol }"
        >
          <td class="is-sticky">{{ item.name }}</td>
          <td class="is-num">{{ yi(item.mv) }}</td>
          <td class="is-num">{{ num(item.pe_ttm) }}</td>
          <td class="is-num">{{ num(item.pb, 2) }}</td>
          <td class="is-num">{{ num(item.ps_ttm, 2) }}</td>
          <td class="is-num">{{ pct(item.roe_ttm) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
  <p class="wb-note mt-2">
    数据来源：赢麻了开放平台 industry members。行业分位为当前横截面排名，受样本与行业分类影响；不构成买卖建议。
  </p>
</template>
