<script setup lang="ts">
import type { AnalysisContext } from '@/engine';
import VerdictHeader from './VerdictHeader.vue';
import MineChecklist from './MineChecklist.vue';
import QualityBars from './QualityBars.vue';
import ConclusionBlock from './ConclusionBlock.vue';

// Hero 报告编排层（DESIGN_SPEC §3.3）：只做 Zone 排列与锚点 id 挂载，渲染细节在各 Zone 组件。
defineProps<{ ctx: AnalysisContext }>();
</script>

<template>
  <div class="space-y-4">
    <div id="sec-verdict">
      <VerdictHeader :ctx="ctx" />
    </div>
    <div id="sec-mine">
      <MineChecklist :ctx="ctx" />
    </div>
    <div id="sec-quality">
      <QualityBars :ctx="ctx" />
    </div>
    <div id="sec-conclusion">
      <ConclusionBlock :ctx="ctx" />
    </div>
  </div>
</template>
