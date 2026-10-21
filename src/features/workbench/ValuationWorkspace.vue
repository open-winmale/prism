<script setup lang="ts">
import { computed } from 'vue';
import type { CompanyCard, IndustryMembersPayload } from '@/data/wm/types';

const props = defineProps<{
  card: CompanyCard | null;
  peers: IndustryMembersPayload | null;
}>();

function median(values: (number | null | undefined)[]): number | null {
  const valid = values.filter((v): v is number => v != null && Number.isFinite(v)).sort((a, b) => a - b);
  if (!valid.length) return null;
  const mid = valid.length >> 1;
  return valid.length % 2 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;
}

const medians = computed(() => ({
  pe: median((props.peers?.items ?? []).map((i) => i.pe_ttm)),
  pb: median((props.peers?.items ?? []).map((i) => i.pb)),
  ps: median((props.peers?.items ?? []).map((i) => i.ps_ttm)),
  roe: median((props.peers?.items ?? []).map((i) => i.roe_ttm)),
}));

const pr = computed(() => {
  const pe = props.card?.pe_ttm;
  const roe = props.card?.roe_ttm;
  if (pe == null || roe == null || roe <= 0) return null;
  return pe / (roe * 100);
});

function num(value: number | null | undefined, digits = 1): string {
  return value == null || !Number.isFinite(value) ? '—' : value.toFixed(digits);
}
function pct(value: number | null | undefined, digits = 1): string {
  return value == null || !Number.isFinite(value) ? '—' : `${(value * 100).toFixed(digits)}%`;
}
function yi(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? '—' : (value / 1e8).toFixed(0);
}
</script>

<template>
  <section class="wb-section">
    <div class="wb-section__head">
      <div>
        <h2 class="wb-section__title">估值</h2>
        <div class="wb-section__sub">
          估值只回答「贵不贵」，不回答「值不值得买」；不给目标价与买卖时点。
        </div>
      </div>
    </div>
    <div class="wb-section__body">
      <p v-if="!card" class="wb-callout">
        示例快照没有实时估值。连接开放平台后可看 PE/PB/PS、自身 3 年分位与行业分位。
      </p>
      <template v-else>
        <div class="wb-kpis">
          <div class="wb-kpi">
            <div class="wb-kpi__label">PE(TTM)</div>
            <div class="wb-kpi__value">{{ num(card.pe_ttm) }}<span class="wb-kpi__unit">x</span></div>
            <div class="wb-kpi__meta">行业中位数 {{ num(medians.pe) }}x</div>
          </div>
          <div class="wb-kpi">
            <div class="wb-kpi__label">PB</div>
            <div class="wb-kpi__value">{{ num(card.pb_ttm, 2) }}<span class="wb-kpi__unit">x</span></div>
            <div class="wb-kpi__meta">行业中位数 {{ num(medians.pb, 2) }}x</div>
          </div>
          <div class="wb-kpi">
            <div class="wb-kpi__label">PS(TTM)</div>
            <div class="wb-kpi__value">{{ num(card.ps_ttm, 2) }}<span class="wb-kpi__unit">x</span></div>
            <div class="wb-kpi__meta">行业中位数 {{ num(medians.ps, 2) }}x</div>
          </div>
          <div class="wb-kpi">
            <div class="wb-kpi__label">市赚率 PR</div>
            <div class="wb-kpi__value">{{ num(pr, 2) }}</div>
            <div class="wb-kpi__meta">PE ÷ ROE（ROE 按 % 计）</div>
          </div>
          <div class="wb-kpi">
            <div class="wb-kpi__label">股息率</div>
            <div class="wb-kpi__value">{{ pct(card.bonus_rate_ttm, 2) }}</div>
            <div class="wb-kpi__meta">近 12 个月</div>
          </div>
        </div>

        <div class="mt-5 grid gap-4 md:grid-cols-2">
          <div>
            <div class="wb-section__sub">PE 自身 3 年分位</div>
            <div class="mt-1 flex items-center gap-3">
              <div class="wb-meter flex-1"><i :style="{ width: `${Math.round((card.pct_pe_3y ?? 0) * 100)}%` }" /></div>
              <span class="wb-num text-xs text-slate-600">{{ pct(card.pct_pe_3y, 0) }}</span>
            </div>
            <p class="wb-note mt-1">当前 PE 在自身过去 3 年中的位置；越低不代表一定便宜。</p>
          </div>
          <div>
            <div class="wb-section__sub">PB 自身 3 年分位</div>
            <div class="mt-1 flex items-center gap-3">
              <div class="wb-meter flex-1"><i :style="{ width: `${Math.round((card.pct_pb_3y ?? 0) * 100)}%` }" /></div>
              <span class="wb-num text-xs text-slate-600">{{ pct(card.pct_pb_3y, 0) }}</span>
            </div>
            <p class="wb-note mt-1">PB 分位对银行、周期股更有参考意义；成长股需结合 ROE。</p>
          </div>
        </div>

        <div class="mt-5 grid gap-4 md:grid-cols-3">
          <div class="wb-callout">
            <div class="wb-section__sub">市值</div>
            <div class="wb-company__price">{{ yi(card.mv) }} <span class="wb-kpi__unit">亿</span></div>
          </div>
          <div class="wb-callout">
            <div class="wb-section__sub">ROE(TTM)</div>
            <div class="wb-company__price">{{ pct(card.roe_ttm) }}</div>
          </div>
          <div class="wb-callout">
            <div class="wb-section__sub">营收 / 净利同比</div>
            <div class="wb-company__price">
              {{ pct(card.tr_ttm_yoy) }} / {{ pct(card.np_ttm_yoy) }}
            </div>
          </div>
        </div>

        <p class="wb-note mt-4">
          数据来源：赢麻了开放平台 card（{{ card.quote_date ?? '—' }}）。分位为自身 3 年历史分位；
          行业分位见「同业」页。亏损公司 PE 不适用，应以 PB/PS 与现金流替代。
        </p>
      </template>
    </div>
  </section>
</template>
