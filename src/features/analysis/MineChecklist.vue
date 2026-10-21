<script setup lang="ts">
import { computed, ref } from 'vue';
import type { AnalysisContext } from '@/engine';
import { mineChecks, type MineCheck } from '@/engine';
import EChart from '@/features/charts/EChart.vue';
import TermTip from '@/components/TermTip.vue';

// Zone B · 老唐排雷清单（DESIGN_SPEC §4.4）：全部展示、可展开、同时只展开一行。
const props = defineProps<{ ctx: AnalysisContext }>();
const checks = computed(() => mineChecks(props.ctx));
const isLiquor = computed(() => props.ctx.industry === 'liquor');

const expanded = ref<string | null>(null);
function toggle(id: string) {
  expanded.value = expanded.value === id ? null : id;
}

// 状态灯字符（可访问性：语义色不单独承载信息，DESIGN_SPEC §9）
function lamp(c: MineCheck): { char: string; cls: string } {
  if (c.status === 'safe') return { char: '✓', cls: 'text-emerald-500' };
  if (c.status === 'triggered') return c.severity === 'high' ? { char: '✗', cls: 'text-red-500' } : { char: '△', cls: 'text-amber-500' };
  return { char: '—', cls: 'text-slate-400' };
}

// 命中清单内术语则包裹 TermTip
const TERMS: Record<string, { term: string; text: string }> = {
  contract_liabilities: { term: '合同负债', text: '经销商提前打款但公司尚未发货的负债——白酒渠道信心的第一领先指标：蓄水池水位稳定是积极信号。' },
  inventory_finished: { term: '库存商品', text: '已完工可销售的成品。白酒排雷只看成品库存，基酒（半成品）储备是竞争力而非风险。' },
  sales_cash_ratio: { term: '收现比', text: '销售商品收到的现金 ÷ 营业总收入。>100% 说明收入基本变成了真钱（先款后货的生意常大于 1）。' },
};
</script>

<template>
  <div class="rounded-xl border border-slate-200 bg-white shadow-sm">
    <div class="flex items-center justify-between border-b border-slate-100 px-5 py-3">
      <h3 class="m-0 text-base font-semibold">老唐排雷清单 · {{ checks.length }} 项</h3>
      <span class="text-xs text-slate-400">点击任意一行看证据与下一步</span>
    </div>
    <div class="divide-y divide-slate-100">
      <div v-for="c in checks" :key="c.id">
        <button
          class="flex w-full cursor-pointer items-start gap-3 px-5 py-3 text-left transition hover:bg-slate-50"
          :aria-expanded="expanded === c.id"
          @click="toggle(c.id)"
        >
          <span class="w-6 shrink-0 pt-0.5 text-center text-base" :class="lamp(c).cls">{{ lamp(c).char }}</span>
          <span class="min-w-0 flex-1">
            <!-- 窄屏：名称换行 + 佐证跟随；桌面：单行 truncate（佐证不再被隐藏） -->
            <span class="block text-sm font-medium text-slate-700 sm:max-w-[14rem] sm:truncate">{{ c.name }}</span>
            <span class="mt-0.5 block text-xs leading-4 text-slate-400">{{ c.evidence }}</span>
          </span>
          <span
            v-if="c.status === 'triggered'"
            class="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-xs"
            :class="c.severity === 'high' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'"
          >
            {{ c.severity === 'high' ? '高危' : c.severity === 'mid' ? '中度' : '轻度' }}
          </span>
          <span v-else-if="c.status === 'na'" class="mt-0.5 shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-400">缺数据</span>
          <span class="mt-0.5 shrink-0 text-xs text-slate-300">{{ expanded === c.id ? '▲' : '▼' }}</span>
        </button>
        <!-- 展开面板：为什么 + 下一步 + 老唐视角 + 证据图（DESIGN_SPEC §4.4） -->
        <div v-if="expanded === c.id" class="space-y-3 bg-slate-50/60 px-5 pb-4 pt-1">
          <p class="m-0 text-sm leading-6 text-slate-700">
            <b>{{ c.status === 'triggered' ? '为什么危险：' : c.status === 'safe' ? '为什么安全：' : '数据缺口：' }}</b>
            {{ c.why }}
          </p>
          <p v-if="c.next" class="m-0 rounded bg-blue-50 px-3 py-2 text-sm text-blue-800">{{ c.next }}</p>
          <p v-if="c.laotang" class="m-0 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">老唐视角：{{ c.laotang }}</p>
          <div v-if="c.id === 'channel_confidence'" class="text-xs text-slate-400">
            <TermTip v-bind="TERMS.contract_liabilities" />
          </div>
          <div v-else-if="c.id === 'inventory_growth' && isLiquor" class="text-xs text-slate-400">
            <TermTip v-bind="TERMS.inventory_finished" />
          </div>
          <EChart v-if="c.chart" :spec="c.chart" />
        </div>
      </div>
    </div>
  </div>
</template>
