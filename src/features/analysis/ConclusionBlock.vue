<script setup lang="ts">
import { computed } from 'vue';
import type { AnalysisContext } from '@/engine';
import { mineChecks } from '@/engine';
import { useAppStore } from '@/store/useApp';

// Zone E · 结论与下一步（DESIGN_SPEC §4.6/§4.7）：结论句 + 核查清单 + 情境化 CTA。
const props = defineProps<{ ctx: AnalysisContext }>();
const store = useAppStore();

const checks = computed(() => mineChecks(props.ctx));
const triggered = computed(() => checks.value.filter((c) => c.status === 'triggered'));
const naChecks = computed(() => checks.value.filter((c) => c.status === 'na'));

const conclusion = computed(() => {
  const t = triggered.value;
  const isLiquor = props.ctx.industry === 'liquor';
  if (t.length === 0)
    return `本次排雷 ${checks.value.length - naChecks.value.length} 项检查全部通过。${
      isLiquor ? '白酒的功课不止报表：' : '除此之外，还有两项不能自动化的功课：'
    }一是毛利率与商业模式的相互印证${isLiquor ? '（高端酒的价盘与渠道利润是毛利真实性的最好旁证）' : ''}，二是管理层诚信记录。`;
  const high = t.filter((c) => c.severity === 'high');
  const mid = t.filter((c) => c.severity === 'mid' || c.severity === 'low');
  const parts: string[] = [];
  if (high.length) parts.push(`高危信号 ${high.map((c) => c.name).join('、')}`);
  if (mid.length) parts.push(`中轻度信号 ${mid.map((c) => c.name).join('、')}`);
  return `发现${parts.join('，以及')}。这些信号不等于造假，但意味着你需要按下方「下一步」逐项核实——排雷的目的不是一票否决，而是把不确定性变成可核查的清单。`;
});

const nextSteps = computed(() => triggered.value.map((c) => c.next).filter((s): s is string => !!s));
</script>

<template>
  <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <h3 class="m-0 text-base font-semibold">结论与下一步</h3>
    <p class="mt-2 text-sm leading-6 text-slate-700">{{ conclusion }}</p>
    <ol v-if="nextSteps.length" class="mt-2 list-decimal space-y-1 pl-5 text-sm leading-6 text-slate-600">
      <li v-for="(s, i) in nextSteps" :key="i">{{ s }}</li>
    </ol>
    <!-- 情境化 CTA（转化意愿最强处，DESIGN_SPEC §4.7） -->
    <div class="mt-4 rounded-lg bg-brandsoft p-4">
      <div class="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span class="text-sm text-slate-600">用真实数据看 {{ ctx.dataset.name }} 的完整专业版体检</span>
        <a
          :href="store.proUrl"
          target="_blank"
          rel="noopener"
          class="rounded-full bg-brand px-5 py-2 text-center text-sm font-medium text-white hover:opacity-90"
        >
          前往专业版 →
        </a>
      </div>
    </div>
  </div>
</template>
