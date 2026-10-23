<script setup lang="ts">
import { computed } from 'vue';
import type { AnalysisContext } from '@/engine';
import type { CompanyCard } from '@/data/wm/types';
import { useDomainViews } from '../useDomainViews';
import DomainSection from '../DomainSection.vue';

// 负债·权益页：负债域 + 股东权益域的完整视图。

const props = defineProps<{ ctx: AnalysisContext; card: CompanyCard | null }>();
void props.card;

const views = useDomainViews(computed(() => props.ctx));
const liability = computed(() => views.byDomain('liability'));
const equity = computed(() => views.byDomain('equity'));
</script>

<template>
  <DomainSection :section="liability" :symbol="ctx.dataset.symbol" />
  <DomainSection :section="equity" :symbol="ctx.dataset.symbol" />
</template>
