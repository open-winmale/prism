<script setup lang="ts">
import { computed } from 'vue';
import type { AnalysisContext } from '@/engine';
import type { CompanyCard } from '@/data/wm/types';
import { useDomainViews } from '../useDomainViews';
import DomainSection from '../DomainSection.vue';

// 经营·资产页：两个域的完整视图（KPI + 核心图 + 突变信号 + 深度模块），内容直出不折叠。

const props = defineProps<{ ctx: AnalysisContext; card: CompanyCard | null }>();
void props.card;

const views = useDomainViews(computed(() => props.ctx));
const operating = computed(() => views.byDomain('operating'));
const asset = computed(() => views.byDomain('asset'));
</script>

<template>
  <DomainSection :section="operating" :symbol="ctx.dataset.symbol" />
  <DomainSection :section="asset" :symbol="ctx.dataset.symbol" />
</template>
