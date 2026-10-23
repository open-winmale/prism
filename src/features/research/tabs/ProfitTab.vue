<script setup lang="ts">
import { computed } from 'vue';
import type { AnalysisContext } from '@/engine';
import type { CompanyCard } from '@/data/wm/types';
import { useDomainViews } from '../useDomainViews';
import DomainSection from '../DomainSection.vue';
import StatementAppendix from '../StatementAppendix.vue';

// 利润页：利润域完整视图 + 三表附录（利润表场景最常用，就近放）。

const props = defineProps<{ ctx: AnalysisContext; card: CompanyCard | null }>();
void props.card;

const views = useDomainViews(computed(() => props.ctx));
const profit = computed(() => views.byDomain('profit'));
</script>

<template>
  <DomainSection :section="profit" :symbol="ctx.dataset.symbol" />
  <StatementAppendix :ctx="ctx" />
</template>
