<script setup lang="ts">
import { computed } from 'vue';
import type { AnalysisContext } from '@/engine';
import { flowTypeRows, mineChecks, mineVerdict, qualityScoreOf } from '@/engine';

// Zone A · Verdict 头（DESIGN_SPEC §4.3）：只接 props，不取 store。
const props = defineProps<{ ctx: AnalysisContext }>();

const verdict = computed(() => mineVerdict(mineChecks(props.ctx)));
const quality = computed(() => qualityScoreOf(props.ctx));
const flows = computed(() => flowTypeRows(props.ctx));
const latestFlow = computed(() => flows.value[flows.value.length - 1]);
const naCount = computed(() => mineChecks(props.ctx).filter((c) => c.status === 'na').length);

const verdictMeta = computed(() => {
  if (verdict.value === 'danger') return { label: '高危', cls: 'bg-red-500', tip: '发现高危信号，建议核查后再决策' };
  if (verdict.value === 'watch') return { label: '关注', cls: 'bg-amber-500', tip: '无高危，但存在中度信号' };
  return { label: '安全', cls: 'bg-emerald-500', tip: '未触发老唐排雷清单的警戒线' };
});

const ring = computed(() => {
  const r = 52;
  const c = 2 * Math.PI * r;
  return { r, c, dash: (quality.value.score / 100) * c };
});

const scoreSentence = computed(() => {
  const q = quality.value;
  const dimLabel = props.ctx.industry === 'liquor' ? '六维' : '七维';
  if (q.excluded.length > 0) return `${dimLabel}质量中「${q.excluded.map((s) => s.cn).join('、')}」因缺数据未计分，其余维度无显著短板。`;
  if (q.weak.length === 0 && q.strong.length > 0) return `${dimLabel}质量无短板，长板：${q.strong.map((s) => s.cn).join('、')}。`;
  if (q.weak.length === 0) return `${dimLabel}质量无显著短板。`;
  return `质量短板：${q.weak.map((s) => `${s.cn}(${s.score}分)`).join('、')}。`;
});
</script>

<template>
  <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <div class="flex flex-col items-center gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-5">
      <!-- 三态徽章 + 体检分环 -->
      <div class="flex items-center gap-5">
        <div
          class="flex h-8 items-center rounded-full px-4 text-base font-semibold text-white"
          :class="verdictMeta.cls"
        >
          {{ verdictMeta.label }}
        </div>
        <div class="relative h-24 w-24 shrink-0 sm:h-28 sm:w-28">
          <svg viewBox="0 0 120 120" class="h-full w-full -rotate-90" aria-label="质量体检分环">
            <circle cx="60" cy="60" :r="ring.r" fill="none" stroke="#e2e8f0" stroke-width="12" />
            <circle
              cx="60" cy="60" :r="ring.r" fill="none" stroke="#2f6bff" stroke-width="12"
              stroke-linecap="round"
              :stroke-dasharray="`${ring.dash} ${ring.c}`"
            />
          </svg>
          <div class="absolute inset-0 flex flex-col items-center justify-center">
            <div class="text-2xl font-bold text-slate-800">{{ quality.score }}</div>
            <div class="text-xs text-slate-400">{{ quality.grade }}</div>
          </div>
        </div>
      </div>
      <!-- 一句话结论 -->
      <div class="min-w-40 flex-1 self-stretch sm:self-auto">
        <div class="font-semibold text-slate-800">{{ ctx.dataset.name }} · 质地体检</div>
        <p class="mt-1 text-sm leading-6 text-slate-600">
          {{ verdictMeta.tip }}。{{ scoreSentence }}
          <span v-if="latestFlow" class="text-slate-500">
            现金流形态为「{{ latestFlow.type }}」（{{ latestFlow.signature }}）。
          </span>
        </p>
        <div v-if="naCount > 0" class="mt-1 text-xs text-slate-400">
          ⓘ {{ naCount }} 项检查因数据不足未执行（连接赢麻了开放平台可补全）
        </div>
      </div>
    </div>
  </div>
</template>
