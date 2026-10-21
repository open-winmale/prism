<script setup lang="ts">
import { computed } from 'vue';
import type { AnalysisContext } from '@/engine';
import { qualityScoreOf } from '@/engine';

// Zone C · 体检分构成（DESIGN_SPEC §4.5）：维度行 grid 布局；na 维度灰显 + 「无数据」，权重从分母剔除。
const props = defineProps<{ ctx: AnalysisContext }>();
const quality = computed(() => qualityScoreOf(props.ctx));
const isLiquor = computed(() => props.ctx.industry === 'liquor');

// 归一化权重显示（na 剔除后的实际权重）
const weightSum = computed(() => quality.value.subs.filter((s) => !s.na).reduce((a, s) => a + s.weight, 0) || 1);
const normWeight = (w: number, na: boolean) => (na ? null : Math.round((w / weightSum.value) * 100));

// 进度条色（DESIGN_SPEC §4.5：≥80 绿 / 30–79 品牌 / <30 红）
function barCls(score: number): string {
  return score >= 80 ? 'bg-emerald-400' : score >= 30 ? 'bg-brand' : 'bg-red-400';
}
</script>

<template>
  <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <h3 class="m-0 text-base font-semibold">质量体检 · {{ isLiquor ? '六维' : '七维' }}构成</h3>
    <p class="mt-1 text-xs text-slate-400">
      透明启发式权重（合计 100%），对齐专业版「质量体检包」思路{{ isLiquor ? '；白酒口径：周转/杠杆/应计不具区分度，已换为收现比、合同负债蓄水与销售费用率' : '' }}；连接赢麻了可获专有模型与真实行业分位。
    </p>
    <div class="mt-3 space-y-2">
      <div
        v-for="s in quality.subs"
        :key="s.key"
        class="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[8rem_4rem_1fr_3.5rem_2.5rem] sm:gap-3"
      >
        <span class="text-sm sm:truncate" :class="s.na ? 'text-slate-400' : 'text-slate-600'">
          {{ s.cn }}
          <span class="text-xs text-slate-400 sm:hidden">{{ s.na ? '· 无数据' : `· ${s.text}` }}</span>
        </span>
        <span class="text-right text-xs font-medium sm:hidden" :class="s.na ? 'text-slate-300' : 'text-slate-500'">
          {{ s.na ? '—' : `${s.score}分` }}
        </span>
        <span class="hidden w-16 text-right text-xs text-slate-400 sm:block">{{ s.text }}</span>
        <div class="col-span-2 sm:col-span-1">
          <!-- na：灰斜线感底 + 无数据，不渲染分数条 -->
          <div v-if="s.na" class="flex h-2 w-full items-center rounded-full bg-slate-100" title="数据缺失，未计入总分">
            <span class="mx-auto text-[11px] leading-none text-slate-300">无数据 · 已从总分剔除</span>
          </div>
          <div v-else class="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div class="h-full rounded-full transition-all" :class="barCls(s.score)" :style="{ width: `${s.score}%` }" />
          </div>
        </div>
        <span class="hidden w-14 text-right text-xs font-medium sm:block" :class="s.na ? 'text-slate-300' : 'text-slate-500'">
          {{ s.na ? '—' : `${s.score}分` }}
        </span>
        <span class="hidden w-10 text-right text-xs sm:block" :class="s.na ? 'text-slate-200' : 'text-slate-300'">
          ×{{ normWeight(s.weight, s.na) ?? '—' }}%
        </span>
      </div>
    </div>
    <p v-if="quality.excluded.length" class="mt-2 text-xs text-slate-400">
      ⓘ 「{{ quality.excluded.map((s) => s.cn).join('、') }}」因缺数据未计分：总分按其余维度权重归一化，不被拉低。
    </p>
  </div>
</template>
