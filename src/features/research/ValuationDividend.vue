<script setup lang="ts">
import { computed } from 'vue';
import type { AnalysisContext } from '@/engine';
import type { CompanyCard } from '@/data/wm/types';
import ChartFrame from '@/components/ui/ChartFrame.vue';
import { trendLine } from '@/engine/methods/trend';

// 估值 + 分红 + 股本：估值只回答「贵不贵」；分红/股本回答「回报与稀释」。
// 开源版数据边界诚实标注：分红率序列与逐笔方案属专业版域。

const props = defineProps<{
  ctx: AnalysisContext;
  card: CompanyCard | null;
}>();

function num(v: number | null | undefined, digits = 1): string {
  return v == null || !Number.isFinite(v) ? '—' : v.toFixed(digits);
}
function pct(v: number | null | undefined, digits = 1): string {
  return v == null || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(digits)}%`;
}
function yi(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v) ? '—' : (v / 1e8).toFixed(0);
}

const pr = computed(() => {
  const pe = props.card?.pe_ttm;
  const roe = props.card?.roe_ttm;
  return pe == null || roe == null || roe <= 0 ? null : pe / (roe * 100);
});

/** 总股本趋势（三表 share_capital 逐期，时点值，单位：股） */
const shareSeries = computed(() =>
  props.ctx.dataset.reports
    .map((r) => ({ period: r.period.slice(0, 10), value: r.balance.share_capital ?? null }))
    .filter((p): p is { period: string; value: number } => p.value != null && p.value > 0),
);

/** 单位换算统一在数据层：share_capital 源值为「股」，展示一律折「亿股」 */
const shareSpec = computed(() =>
  trendLine(
    shareSeries.value.map((p) => p.period.slice(0, 4)),
    [{ name: '总股本', values: shareSeries.value.map((p) => +(p.value / 1e8).toFixed(2)) }],
    { title: '总股本变动', unit: '亿股' },
  ),
);

const shareChange = computed(() => {
  const s = shareSeries.value;
  if (s.length < 2) return null;
  const first = s[0].value;
  const last = s[s.length - 1].value;
  return first > 0 ? last / first - 1 : null;
});
</script>

<template>
  <section id="sec-valuation" class="wb-section scroll-mt">
    <div class="wb-section__head">
      <div>
        <h2 class="wb-section__title">估值 · 分红 · 股本</h2>
        <div class="wb-section__sub">估值只回答贵不贵，不回答值不值得买；不给目标价与买卖时点</div>
      </div>
    </div>
    <div class="wb-section__body">
      <p v-if="!card" class="wb-callout">示例快照没有实时估值。连接开放平台后可看 PE/PB/PS、自身 3 年分位与股息率。</p>
      <template v-else>
        <div class="wb-kpis">
          <div class="wb-kpi">
            <div class="wb-kpi__label">PE(TTM)</div>
            <div class="wb-kpi__value">{{ num(card.pe_ttm) }}<span class="wb-kpi__unit">x</span></div>
            <div class="wb-kpi__meta">3 年分位 {{ pct(card.pct_pe_3y, 0) }}</div>
          </div>
          <div class="wb-kpi">
            <div class="wb-kpi__label">PB</div>
            <div class="wb-kpi__value">{{ num(card.pb_ttm, 2) }}<span class="wb-kpi__unit">x</span></div>
            <div class="wb-kpi__meta">3 年分位 {{ pct(card.pct_pb_3y, 0) }}</div>
          </div>
          <div class="wb-kpi">
            <div class="wb-kpi__label">市赚率 PR</div>
            <div class="wb-kpi__value">{{ num(pr, 2) }}</div>
            <div class="wb-kpi__meta">PE ÷ ROE（%）</div>
          </div>
          <div class="wb-kpi">
            <div class="wb-kpi__label">股息率 TTM</div>
            <div class="wb-kpi__value">{{ pct(card.bonus_rate_ttm, 2) }}</div>
            <div class="wb-kpi__meta">LYR {{ pct(card.bonus_rate_lyr, 2) }}</div>
          </div>
          <div class="wb-kpi">
            <div class="wb-kpi__label">市值</div>
            <div class="wb-kpi__value">{{ yi(card.mv) }}<span class="wb-kpi__unit">亿</span></div>
            <div class="wb-kpi__meta">截至 {{ card.quote_date ?? '—' }}</div>
          </div>
        </div>

        <div class="mt-5 wb-grid-2">
          <div>
            <div class="wb-section__sub mb-2">分红</div>
            <p class="wb-note">
              当前股息率以 TTM/LYR 两点呈现；分红率序列、FCF 覆盖与逐笔「10派X元」方案明细属专业版数据域，
              连接后自动补全为完整分红史。
            </p>
          </div>
          <div>
            <div class="wb-section__sub mb-2">股本</div>
            <ChartFrame
              v-if="shareSeries.length >= 3"
              :spec="shareSpec"
              source="三表 · share_capital（已折亿股）"
              :height="180"
              :downloadable="false"
            />
            <p v-else class="wb-note">当前数据源未覆盖逐期股本（实时模式随三表自动带出）。</p>
            <p v-if="shareSeries.length >= 3 && shareChange != null" class="wb-note mt-1">
              区间总股本 {{ shareChange > 0 ? '+' : '' }}{{ (shareChange * 100).toFixed(1) }}%
              <template v-if="shareChange > 0.1">——显著扩张，每股口径指标应同步打折。</template>
            </p>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>
