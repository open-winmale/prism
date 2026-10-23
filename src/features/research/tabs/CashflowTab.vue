<script setup lang="ts">
import { computed } from 'vue';
import type { AnalysisContext } from '@/engine';
import type { CompanyCard } from '@/data/wm/types';
import { useDomainViews } from '../useDomainViews';
import DomainSection from '../DomainSection.vue';

// 现金流页：现金流域完整视图（含金量 + CCC + 八型，季度口径自动换季节性）。

const props = defineProps<{ ctx: AnalysisContext; card: CompanyCard | null }>();
void props.card;

const views = useDomainViews(computed(() => props.ctx));
const cashflow = computed(() => views.byDomain('cashflow'));
</script>

<template>
  <DomainSection :section="cashflow" :symbol="ctx.dataset.symbol" />
</template>
