<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  anomalySignals,
  industryTemplate,
  mineChecks,
  mineVerdict,
  runProfitDrivers,
  type AnalysisContext,
  type DomainId,
} from '@/engine';
import { peerPercentileSpec } from '@/engine/methods/peersChart';
import { overviewTrendSpecs } from '@/features/workbench/overviewCharts';
import { buildReportMarkdown, downloadMarkdown } from '@/features/workbench/reportMarkdown';
import { useAppStore } from '@/store/useApp';
import VerdictStrip from '@/components/ui/VerdictStrip.vue';
import ChartFrame from '@/components/ui/ChartFrame.vue';
import { sameQuarterYoyOf, yoyOf } from '@/engine/methods/columns';
import { anomalyEvidenceSpecs } from '../anomalyEvidence';

// 总览页：结论 + 核心趋势 2×2 + 异动信号（证据链直出）+ 六域扫描 + 同业坐标。
// 六域扫描只回答「哪个域有事、去哪个分页细看」——不堆数字，深度内容在分页。

const props = defineProps<{ ctx: AnalysisContext; card: NonNullable<unknown> | null }>();
const store = useAppStore();
void props.card;

const tpl = computed(() => industryTemplate(props.ctx.industry));
const signals = computed(() =>
  anomalySignals(props.ctx, {
    quarterly: store.dataMode === 'quarterly',
    yoyThreshold: tpl.value.yoyThreshold,
    shareThreshold: tpl.value.shareThreshold,
    minShare: tpl.value.minShare,
    industry: props.ctx.industry,
  }),
);
const checks = computed(() => mineChecks(props.ctx));
const verdict = computed(() => mineVerdict(checks.value));
const naCount = computed(() => checks.value.filter((c) => c.status === 'na').length);
const triggered = computed(() => checks.value.filter((c) => c.status === 'triggered'));
const highSignals = computed(() => signals.value.filter((s) => s.severity === 'high'));

const latest = computed(() => props.ctx.computed.metrics[props.ctx.computed.metrics.length - 1] ?? null);
const reports = computed(() => props.ctx.dataset.reports);
const revenue = computed(() => reports.value.map((r) => r.income.total_revenue ?? null));
/** 营收同比：年度相邻比；季报口径为同季对比（相邻比是环比） */
const revenueGrowth = computed(() => {
  const quarterly = reports.value.some((r) => r.sampling && r.sampling !== 'Q4');
  const yoys = quarterly ? sameQuarterYoyOf(reports.value, revenue.value) : yoyOf(revenue.value);
  return yoys[yoys.length - 1] ?? null;
});
const roe = computed(() => latest.value?.roe_parent ?? null);
const grossMargin = computed(() => latest.value?.gross_margin ?? null);
const cfoNp = computed(() => latest.value?.cfo_to_net_profit ?? null);

const driverTitle = computed(() => {
  const result = runProfitDrivers(props.ctx);
  return result.blocks[0]?.title?.replace(/^ROE [\d.]+% /, '') ?? '';
});

const thesis = computed(() => {
  const parts: string[] = [];
  const roeText = roe.value == null ? 'ROE 数据不足' : `ROE ${(roe.value * 100).toFixed(1)}%`;
  parts.push(driverTitle.value ? `${roeText}，${driverTitle.value}` : roeText);
  if (cfoNp.value != null) parts.push(`经营现金流/净利 ${cfoNp.value.toFixed(2)}`);
  const top = signals.value[0];
  if (top) parts.push(`最大异动 ${top.itemName}`);
  if (triggered.value.length) parts.push(`需核查 ${triggered.value.slice(0, 2).map((c) => c.name).join('、')}`);
  else if (naCount.value > 0) parts.push(`${naCount.value} 项检查因数据不足未执行`);
  else parts.push('未触发主要排雷规则');
  return `${parts.join('；')}。`;
});

const evidence = computed(() => {
  const items: string[] = [];
  if (revenueGrowth.value != null) items.push(`营收同比 ${(revenueGrowth.value * 100).toFixed(1)}%`);
  if (grossMargin.value != null) items.push(`毛利率 ${(grossMargin.value * 100).toFixed(1)}%`);
  if (cfoNp.value != null) items.push(`CFO/净利 ${cfoNp.value.toFixed(2)}`);
  if (store.card?.pe_ttm != null) items.push(`PE ${store.card.pe_ttm.toFixed(1)}x`);
  const top = signals.value[0];
  if (top) items.push(top.evidence);
  return items.slice(0, 5);
});

const statusLabel = computed(() => {
  if (verdict.value === 'danger') return '高风险';
  if (verdict.value === 'watch') return '需关注';
  if (verdict.value === 'insufficient') return '数据不足';
  return '稳健';
});

function exportMd(): void {
  const md = buildReportMarkdown({
    ctx: props.ctx,
    sourceLabel: store.sourceLabel,
    statusLabel: statusLabel.value,
    thesis: thesis.value,
    evidence: evidence.value,
    riskChips: triggered.value.slice(0, 2).map((c) => c.name),
  });
  downloadMarkdown(`${props.ctx.dataset.symbol}-财报研究.md`, md);
}

const smallMultiples = computed(() => overviewTrendSpecs(props.ctx));

/** 六域扫描：每域 = 异动计数 + 一句话头条（哪项异动最重 / 无异动），点击直达分页 */
const DOMAIN_PAGES: Record<DomainId, { name: string; page: string }> = {
  operating: { name: '经营', page: 'operating' },
  asset: { name: '资产', page: 'operating' },
  liability: { name: '负债', page: 'liability' },
  equity: { name: '股东权益', page: 'liability' },
  profit: { name: '利润', page: 'profit' },
  cashflow: { name: '现金流', page: 'cashflow' },
};

const domainDigest = computed(() =>
  (Object.keys(DOMAIN_PAGES) as DomainId[]).map((id) => {
    const domainSignals = signals.value.filter((s) => s.domain === id);
    const top = domainSignals[0];
    return {
      id,
      name: DOMAIN_PAGES[id].name,
      page: DOMAIN_PAGES[id].page,
      signalCount: domainSignals.length,
      headline: top
        ? `最重：${top.itemName}（${top.period}）`
        : '行业模版阈值下无异动',
    };
  }),
);

/** 展开的信号证据 */
const expandedSignal = ref<string | null>(null);
function toggleSignal(signal: (typeof signals.value)[number]): void {
  expandedSignal.value = expandedSignal.value === signal.id ? null : signal.id;
}
const expandedEvidence = computed(() => {
  if (!expandedSignal.value) return null;
  const signal = signals.value.find((s) => s.id === expandedSignal.value);
  return signal ? anomalyEvidenceSpecs(props.ctx, signal) : null;
});

function domainName(id: DomainId): string {
  const names: Record<DomainId, string> = {
    operating: '经营',
    asset: '资产',
    liability: '负债',
    equity: '股东权益',
    profit: '利润',
    cashflow: '现金流',
  };
  return names[id];
}

const peerPercentile = computed(() =>
  store.peers?.items?.length ? peerPercentileSpec(store.peers.items, props.ctx.dataset.symbol) : null,
);
</script>

<template>
  <div id="sec-verdict">
    <VerdictStrip
      :status="verdict"
      :label="statusLabel"
      :thesis="thesis"
      :evidence="evidence"
      :risks="triggered.slice(0, 2).map((c) => c.name)"
      :sufficiency="`${checks.length - naCount}/${checks.length} 项已核查 · 行业模版 ${ctx.industry}`"
      :audit="ctx.dataset.meta?.auditOpinion"
      :as-of="store.card?.quote_date ?? ctx.dataset.periods.at(-1)?.slice(0, 10)"
    />
  </div>

  <!-- 核心趋势 2×2：图表直出（无需点击） -->
  <section id="sec-trend" class="wb-section scroll-mt">
    <div class="wb-section__head">
      <div>
        <h2 class="wb-section__title">核心趋势</h2>
        <div class="wb-section__sub">2×2 小倍数 · 营收/增速/利润率/现金流含金量</div>
      </div>
      <button type="button" class="wb-btn" @click="exportMd">导出 Markdown</button>
    </div>
    <div class="wb-section__body wb-mini-grid">
      <ChartFrame
        v-for="(item, index) in smallMultiples"
        :key="index"
        :spec="item.spec"
        :source="item.source"
        :height="180"
        :downloadable="false"
      />
    </div>
  </section>

  <!-- 异动信号：点开即见证据图（历史趋势 + 关联对比直出，无二级跳转） -->
  <section id="sec-anomaly" class="wb-section scroll-mt">
    <div class="wb-section__head">
      <div>
        <h2 class="wb-section__title">异动信号</h2>
        <div class="wb-section__sub">
          行业模版阈值：同比 ±{{ Math.round(tpl.yoyThreshold * 100) }}% / 结构 ±{{ Math.round(tpl.shareThreshold * 100) }}pct
          · 占比与增量 &lt;{{ Math.round(tpl.minShare * 100) }}% 不报 · 共 {{ signals.length }} 项，高危 {{ highSignals.length }}
        </div>
      </div>
    </div>
    <div class="wb-section__body">
      <p v-if="!signals.length" class="wb-callout">
        行业模版阈值下三表没有足够重要的跳变。这不代表没有问题，只代表没有显著变化。
      </p>
      <template v-else>
        <div class="wb-anomaly">
          <button
            v-for="signal in signals.slice(0, 6)"
            :key="signal.id"
            type="button"
            class="wb-anomaly__item"
            :class="{
              'is-high': signal.severity === 'high',
              'is-bad': signal.tone === 'bad',
              'is-good': signal.tone === 'good',
              'is-on': expandedSignal === signal.id,
            }"
            @click="toggleSignal(signal)"
          >
            <span class="wb-anomaly__period">{{ signal.period }}</span>
            <strong>{{ signal.itemName }}</strong>
            <span class="wb-note">{{ domainName(signal.domain) }}域 · {{ signal.type === 'yoy' ? '同比' : '结构' }}</span>
            <span class="wb-anomaly__evidence">{{ signal.evidence }}</span>
            <span v-if="signal.note" class="wb-anomaly__why">行业附注：{{ signal.note }}</span>
            <span class="wb-note">{{ expandedSignal === signal.id ? '▲ 收起证据' : '▼ 趋势与关联对比' }}</span>
          </button>
        </div>
        <div v-if="expandedEvidence" class="wb-evidence mt-3">
          <p class="wb-note mb-2">
            证据链：跳变发生在长序列的什么位置？与{{ expandedEvidence.related.name }}的方向是否背离？
          </p>
          <div class="wb-grid-2">
            <ChartFrame v-if="expandedEvidence.trend" :spec="expandedEvidence.trend" source="三表" :height="220" />
            <ChartFrame v-if="expandedEvidence.compare" :spec="expandedEvidence.compare" source="三表 · 派生同比" :height="220" />
          </div>
        </div>
      </template>
    </div>
  </section>

  <!-- 六域异动计数条：每域是否有事、几件事，一眼扫描；详情在分页 -->
  <section class="wb-section">
    <div class="wb-section__head">
      <div>
        <h2 class="wb-section__title">六大问题域扫描</h2>
        <div class="wb-section__sub">每个域有没有异动、在哪个分页细看——只做定位，不堆数字</div>
      </div>
    </div>
    <div class="wb-section__body">
      <div class="wb-grid-2">
        <RouterLink
          v-for="section in domainDigest"
          :key="section.id"
          :to="`/company/${ctx.dataset.symbol}/${section.page}#domain-${section.id}`"
          class="wb-callout"
          style="display: block"
        >
          <div class="flex items-baseline justify-between gap-2">
            <strong>{{ section.name }}问题</strong>
            <span v-if="section.signalCount" class="wb-chip is-risk">{{ section.signalCount }} 项异动</span>
            <span v-else class="wb-note">无异动</span>
          </div>
          <p class="wb-note mt-1">{{ section.headline }}</p>
        </RouterLink>
      </div>
    </div>
  </section>

  <!-- 同业坐标（直出） -->
  <section v-if="peerPercentile" class="wb-section scroll-mt">
    <div class="wb-section__head">
      <div>
        <h2 class="wb-section__title">同业坐标</h2>
        <div class="wb-section__sub">{{ store.peers?.name }} · {{ store.peers?.count ?? 0 }} 家 · 行业横截面分位</div>
      </div>
    </div>
    <div class="wb-section__body">
      <ChartFrame :spec="peerPercentile" source="开放平台 industry members" :height="220" />
    </div>
  </section>
</template>
