<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { mineChecks, mineVerdict, runProfitDrivers, type AnalysisContext } from '@/engine';
import { trendLine } from '@/engine/methods/trend';
import type { ChartSpec } from '@/engine';
import type { CompanyCard, IndustryMembersPayload } from '@/data/wm/types';
import { useAppStore } from '@/store/useApp';
import ChartFrame from '@/components/ui/ChartFrame.vue';
import KpiTile from '@/components/ui/KpiTile.vue';
import VerdictStrip from '@/components/ui/VerdictStrip.vue';
import RiskRow from '@/components/ui/RiskRow.vue';

const props = defineProps<{
  ctx: AnalysisContext;
  card: CompanyCard | null;
  peers: IndustryMembersPayload | null;
}>();

const store = useAppStore();

const checks = computed(() => mineChecks(props.ctx));
const verdict = computed(() => mineVerdict(checks.value));
const naCount = computed(() => checks.value.filter((c) => c.status === 'na').length);
const triggered = computed(() =>
  checks.value
    .filter((c) => c.status === 'triggered')
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity)),
);

function severityRank(severity: string): number {
  return severity === 'high' ? 3 : severity === 'mid' ? 2 : 1;
}

const latest = computed(() => last(props.ctx.computed.metrics) ?? null);
const reports = computed(() => props.ctx.dataset.reports);
const labels = computed(() => reports.value.map((r) => r.period.slice(0, 4)));

const revenue = computed(() => reports.value.map((r) => r.income.total_revenue ?? null));
const revenueGrowth = computed(() => {
  const a = last(revenue.value);
  const b = prevItem(revenue.value);
  return a != null && b != null && b !== 0 ? a / b - 1 : null;
});

function last<T>(items: T[]): T | undefined {
  return items[items.length - 1];
}
function prevItem<T>(items: T[]): T | undefined {
  return items[items.length - 2];
}

const roe = computed(() => latest.value?.roe_parent ?? null);
const grossMargin = computed(() => latest.value?.gross_margin ?? null);
const cfoNp = computed(() => latest.value?.cfo_to_net_profit ?? null);
const pePct = computed(() => props.card?.pct_pe_3y ?? null);

const driverTitle = computed(() => {
  const result = runProfitDrivers(props.ctx);
  return result.blocks[0]?.title?.replace(/^ROE [\d.]+% /, '') ?? '';
});

const thesis = computed(() => {
  const parts: string[] = [];
  const roeText = roe.value == null ? 'ROE 数据不足' : `ROE ${pct(roe.value)}`;
  parts.push(driverTitle.value ? `${roeText}，${driverTitle.value}` : roeText);
  if (cfoNp.value != null) parts.push(`经营现金流/净利 ${cfoNp.value.toFixed(2)}`);
  if (triggered.value.length) {
    parts.push(`需核查 ${triggered.value.slice(0, 2).map((c) => c.name).join('、')}`);
  } else if (naCount.value > 0) {
    parts.push(`${naCount.value} 项检查因数据不足未执行`);
  } else {
    parts.push('未触发主要排雷规则');
  }
  return `${parts.join('；')}。`;
});

const evidence = computed(() => {
  const items: string[] = [];
  if (revenueGrowth.value != null) items.push(`营收同比 ${pct(revenueGrowth.value)}`);
  if (grossMargin.value != null) items.push(`毛利率 ${pct(grossMargin.value)}`);
  if (cfoNp.value != null) items.push(`CFO/净利 ${cfoNp.value.toFixed(2)}`);
  if (props.card?.pe_ttm != null) items.push(`PE ${props.card.pe_ttm.toFixed(1)}x`);
  return items.slice(0, 4);
});

const riskChips = computed(() =>
  triggered.value.slice(0, 2).map((c) => c.name),
);

const statusLabel = computed(() => {
  if (verdict.value === 'danger') return '高风险';
  if (verdict.value === 'watch') return '需关注';
  if (verdict.value === 'insufficient') return '数据不足';
  return '稳健';
});

/** 2×2 小倍数：一屏四个核心指标，替代单张大图（信息密度优先） */
const smallMultiples = computed<{ spec: ChartSpec; source: string }[]>(() => {
  const metrics = props.ctx.computed.metrics;
  const gmValues = metrics.map((m) => m.gross_margin);
  const gmValid = gmValues.filter((v): v is number => v != null);
  const gmMean = gmValid.length ? gmValid.reduce((sum, v) => sum + v, 0) / gmValid.length : null;
  return [
    {
      spec: trendLine(
        labels.value,
        [{ name: '营业总收入', values: revenue.value.map((v) => (v == null ? null : v / 1e8)) }],
        { title: '营业总收入', unit: '亿元' },
      ),
      source: '利润表',
    },
    {
      spec: trendLine(
        labels.value,
        [{ name: '归母净利润', values: reports.value.map((r) => (r.income.net_profit_parent == null ? null : r.income.net_profit_parent / 1e8)) }],
        { title: '归母净利润', unit: '亿元' },
      ),
      source: '利润表',
    },
    {
      spec: trendLine(
        labels.value,
        [{ name: '毛利率', values: gmValues.map((v) => (v == null ? null : v * 100)) }],
        {
          title: '毛利率',
          unit: '%',
          refLines: gmMean == null ? undefined : [{ value: +(gmMean * 100).toFixed(1), label: `自身均值 ${(gmMean * 100).toFixed(1)}%` }],
        },
      ),
      source: '利润表 · 派生',
    },
    {
      spec: trendLine(
        labels.value,
        [{ name: 'CFO/归母净利', values: metrics.map((m) => (m.cfo_to_net_profit == null ? null : m.cfo_to_net_profit * 100)) }],
        { title: 'CFO/归母净利', unit: '%', refLines: [{ value: 100, label: '100%' }] },
      ),
      source: '现金流量表 · 派生',
    },
  ];
});

const peerRows = computed(() => {
  const items = [...(props.peers?.items ?? [])].sort((a, b) => (b.mv ?? 0) - (a.mv ?? 0));
  const rows = items.slice(0, 5).map((item) => ({
    name: item.name,
    pe: item.pe_ttm == null ? '—' : item.pe_ttm.toFixed(1),
    roe: item.roe_ttm == null ? '—' : `${(item.roe_ttm * 100).toFixed(1)}%`,
    mv: item.mv == null ? '—' : (item.mv / 1e8).toFixed(0),
    symbol: item.symbol,
  }));
  const current = items.find((item) => item.symbol === props.ctx.dataset.symbol);
  if (current && !rows.some((row) => row.symbol === current.symbol)) {
    rows.unshift({
      name: current.name,
      pe: current.pe_ttm == null ? '—' : current.pe_ttm.toFixed(1),
      roe: current.roe_ttm == null ? '—' : `${(current.roe_ttm * 100).toFixed(1)}%`,
      mv: current.mv == null ? '—' : (current.mv / 1e8).toFixed(0),
      symbol: current.symbol,
    });
  }
  return rows.slice(0, 6);
});

function pct(value: number | null | undefined, digits = 1): string {
  return value == null || !Number.isFinite(value) ? '—' : `${(value * 100).toFixed(digits)}%`;
}
</script>

<template>
  <VerdictStrip
    :status="verdict"
    :label="statusLabel"
    :thesis="thesis"
    :evidence="evidence"
    :risks="riskChips"
    :sufficiency="`${checks.length - naCount}/${checks.length} 项已核查`"
    :audit="ctx.dataset.meta?.auditOpinion"
    :as-of="card?.quote_date ?? ctx.dataset.periods[ctx.dataset.periods.length - 1]?.slice(0, 10)"
  />

  <div class="wb-kpis">
    <KpiTile
      label="营收同比"
      :value="revenueGrowth == null ? '—' : pct(revenueGrowth)"
      :meta="revenueGrowth == null ? '缺营收数据' : '最新报告期'"
      :spark="revenue"
    />
    <KpiTile
      label="ROE（归母）"
      :value="roe == null ? '—' : pct(roe)"
      :meta="roe == null ? '缺杜邦数据' : '杜邦口径'"
      :spark="ctx.computed.metrics.map((m) => m.roe_parent)"
    />
    <KpiTile
      label="毛利率"
      :value="grossMargin == null ? '—' : pct(grossMargin)"
      :meta="grossMargin == null ? '缺成本数据' : '营收 − 营业成本'"
      :spark="ctx.computed.metrics.map((m) => m.gross_margin)"
    />
    <KpiTile
      label="CFO / 归母净利"
      :value="cfoNp == null ? '—' : cfoNp.toFixed(2)"
      :meta="cfoNp == null ? '缺现金流数据' : '≥1 为佳'"
      :spark="ctx.computed.metrics.map((m) => m.cfo_to_net_profit)"
    />
    <KpiTile
      label="PE 3 年分位"
      :value="pePct == null ? '—' : pct(pePct, 0)"
      :meta="pePct == null ? '需连接开放平台' : `PE ${card?.pe_ttm?.toFixed(1) ?? '—'}x`"
      :spark="[]"
    />
  </div>

  <section class="wb-section">
    <div class="wb-section__head">
      <div>
        <h2 class="wb-section__title">核心趋势</h2>
        <div class="wb-section__sub">2×2 小倍数：规模、盈利、收现质量一屏看完；点击任一格可到财报下钻</div>
      </div>
      <RouterLink :to="`/company/${ctx.dataset.symbol}/financials`" class="wb-btn">看三表 →</RouterLink>
    </div>
    <div class="wb-section__body wb-mini-grid">
      <RouterLink
        v-for="(item, index) in smallMultiples"
        :key="index"
        :to="`/company/${ctx.dataset.symbol}/financials`"
        class="wb-mini-link"
        title="到财报工作台查看列组与下钻"
      >
        <ChartFrame :spec="item.spec" :source="item.source" :height="150" :downloadable="false" />
      </RouterLink>
    </div>
  </section>

  <div class="wb-grid-2">
    <section class="wb-section" style="margin-top: 0">
      <div class="wb-section__head">
        <div>
          <h2 class="wb-section__title">Top 风险</h2>
          <div class="wb-section__sub">
            {{ triggered.length ? `${triggered.length} 项触发` : '未触发主要规则' }}
          </div>
        </div>
        <RouterLink :to="`/company/${ctx.dataset.symbol}/risk`" class="wb-btn">全部风险 →</RouterLink>
      </div>
      <div class="wb-section__body">
        <div v-if="triggered.length" class="wb-risk-list">
          <RiskRow
            v-for="check in triggered.slice(0, 3)"
            :key="check.id"
            :check="check"
            :symbol="ctx.dataset.symbol"
          />
        </div>
        <p v-else class="wb-callout">
          {{ naCount ? `${naCount} 项因数据不足未执行，不能据此判定安全。` : '本次排雷规则均未触发。' }}
        </p>
      </div>
    </section>

    <section class="wb-section" style="margin-top: 0">
      <div class="wb-section__head">
        <div>
          <h2 class="wb-section__title">同业坐标</h2>
          <div class="wb-section__sub">
            {{ peers?.name ?? '行业组未取到' }} · {{ peers?.count ?? 0 }} 家 · 按市值排序
          </div>
        </div>
        <RouterLink :to="`/company/${ctx.dataset.symbol}/peers`" class="wb-btn">完整对比 →</RouterLink>
      </div>
      <div class="wb-section__body">
      <table v-if="peerRows.length" class="wb-peer-table">
        <thead>
          <tr>
            <th>公司</th>
            <th>PE(TTM)</th>
            <th>ROE</th>
            <th>市值（亿）</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in peerRows"
            :key="row.symbol"
            :class="{ 'is-current': row.symbol === ctx.dataset.symbol }"
          >
            <td>{{ row.name }}</td>
            <td>{{ row.pe }}</td>
            <td>{{ row.roe }}</td>
            <td>{{ row.mv }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="wb-callout">
        同业数据未取到。连接开放平台后可查看行业成分、估值分位与对比。
      </p>
      </div>
    </section>
  </div>

  <p v-if="store.fetchInfo.issues.length" class="wb-callout is-warn mt-4">
    数据校验提示：{{ store.fetchInfo.issues.slice(0, 2).map((i) => i.msg).join('；') }}
  </p>
</template>
