import { anomalySignals, mineChecks, type AnalysisContext } from '@/engine';

// 单份报告导出为 Markdown：面向笔记工具（Obsidian/Logseq）与随手分享。
// 只读引擎现成产物（排雷清单/异动扫描/单期指标），不引入新口径——导出的每个数字
// 都能在页面上找到对应区块，口径与页面一致才算数。

export interface ReportMarkdownOptions {
  ctx: AnalysisContext;
  /** 页脚来源标识（store.sourceLabel，如「内置快照 · 0 EC」） */
  sourceLabel: string;
  /** 概览结论四态文案与一句话 thesis（与页面结论条一致） */
  statusLabel: string;
  thesis: string;
  evidence: string[];
  riskChips: string[];
}

function yi(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${(v / 1e8).toFixed(1)} 亿`;
}

function pctText(v: number | null | undefined, digits = 1): string {
  if (v == null) return '—';
  return `${(v * 100).toFixed(digits)}%`;
}

const STATUS_TEXT: Record<string, string> = {
  triggered: '触发',
  watch: '关注',
  safe: '安全',
  na: '数据不足',
};

export function buildReportMarkdown(opts: ReportMarkdownOptions): string {
  const { ctx } = opts;
  const ds = ctx.dataset;
  const metrics = ctx.computed.metrics;
  const latest = metrics[metrics.length - 1] ?? null;
  const checks = mineChecks(ctx);
  const anomalies = anomalySignals(ctx, { limit: 8 });
  const periods = ds.periods;
  const lines: string[] = [];

  lines.push(`# 财报透视 · ${ds.name}（${ds.symbol}）`);
  lines.push('');
  lines.push(
    `> 结论 **${opts.statusLabel}** · 报告期 ${periods[0]?.slice(0, 4) ?? '—'}–${periods[periods.length - 1]?.slice(0, 4) ?? '—'} · ${ds.meta?.auditOpinion ? `审计：${ds.meta.auditOpinion} · ` : ''}${opts.sourceLabel}`,
  );
  lines.push(`> ${opts.thesis}`);
  lines.push('');
  lines.push(`- 生成时间：${new Date().toISOString().slice(0, 10)}`);
  lines.push(`- 在线复核：https://open-winmale.github.io/prism/#/company/${ds.symbol}/overview`);
  lines.push('');

  lines.push('## 五维 KPI（最新报告期）');
  lines.push('');
  lines.push('| 指标 | 值 | 口径 |');
  lines.push('| --- | --- | --- |');
  const rev = ds.reports.map((r) => r.income.total_revenue ?? null);
  const rg = (() => {
    const a = rev[rev.length - 1];
    const b = rev[rev.length - 2];
    return a != null && b != null && b !== 0 ? a / b - 1 : null;
  })();
  lines.push(`| 营收同比 | ${pctText(rg)} | 本期营收 ÷ 上年同期 − 1（利润表） |`);
  lines.push(`| ROE（归母） | ${pctText(latest?.roe_parent ?? null)} | 归母净利润 ÷ 归母股东权益 |`);
  lines.push(`| 毛利率 | ${pctText(latest?.gross_margin ?? null)} | (营收 − 营业成本) ÷ 营收 |`);
  lines.push(`| CFO/归母净利 | ${latest?.cfo_to_net_profit != null ? latest.cfo_to_net_profit.toFixed(2) : '—'} | 经营现金流净额 ÷ 归母净利润 |`);
  lines.push(`| 最新营收 | ${yi(rev[rev.length - 1] ?? null)} | 利润表原值 |`);
  lines.push('');

  if (anomalies.length) {
    lines.push('## 异动信号（同比/结构双线扫描 Top）');
    lines.push('');
    for (const a of anomalies) {
      lines.push(`- **${a.period} ${a.itemName}**：${a.evidence} —— ${a.why}`);
    }
    lines.push('');
  }

  lines.push(`## 排雷清单（${checks.filter((c) => c.status !== 'na').length}/${checks.length} 项已核查）`);
  lines.push('');
  lines.push('| 检查项 | 状态 | 证据 | 说明 |');
  lines.push('| --- | --- | --- | --- |');
  for (const c of checks) {
    lines.push(`| ${c.name} | ${STATUS_TEXT[c.status] ?? c.status} | ${c.evidence} | ${(c.why ?? '').replace(/\|/g, '/')} |`);
  }
  lines.push('');

  lines.push('---');
  lines.push('');
  lines.push(
    '口径原则：缺失显示「—」不按 0 处理；季度口径为单季值（同比同季对比）；资产负债表为时点值。'
      + '本报告由开源工具 prism（财报透视）生成，仅为基于输入数据的客观计算，不构成投资建议。',
  );
  lines.push('');
  return lines.join('\n');
}

/** 触发浏览器下载 .md 文件（Blob，无网络） */
export function downloadMarkdown(filename: string, md: string): void {
  const blob = new Blob([`\uFEFF${md}`], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
