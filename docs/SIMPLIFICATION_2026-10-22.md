# 简化对齐：回到「行业模版 × 只读报告」的初衷（2026-10-22）

## 背景：设计初衷与偏移

最初设计目标：**聚焦投资过程中的关键问题，用专业版已有数据 + 行业模版，通过数据与图表把公司的财务、资产、生意、优势、劣势、分红、股本清晰表达出来**；并通过行业模版降低每个行业标的的解读门槛。

简化版的用户旅程应该只有两步：**选标的 + 切换导航**。用户是「读报告的人」，不是「搭图表的人」。

本轮之前的偏移（v1.1x 实测）：

| 偏移点 | 位置 | 问题 |
| --- | --- | --- |
| 自选图表构建器 | `MetricCompare.vue`（382 行）挂概览 + 财报两处 | 报告首屏邀请用户自己选 1–4 个科目、选口径、选线柱——构建式交互 |
| 条件条过载 | 财报工作台 7 组控件 | 同比/结构阈值三选、只看跳变开关直接暴露 |
| 散点可换轴 | `PeerPanels.vue` X/Y 轴下拉 | 同上 |
| 下钻带构建入口 | `LineItemDialog`「加入多指标对比」 | 从读数路径岔出到搭图路径 |
| 行业模版缺位 | `registry.ts` 行业路由死代码 | 只有 liquor 有行业化阈值，模版名存实亡 |
| 分红/股本几乎无表达 | 仅 `card.bonus_rate_ttm` 一个数字 | 设计目标明确列了「分红、股本」两问 |

## `../script` 专业版新增内容调研（2026-10-22）

本轮先调研了专业版脚本资产仓近期提交，确认可复用的新数据能力：

| 新增 | 位置（script 仓） | 对财报透视的价值 |
| --- | --- | --- |
| **行业比较一页式接口** | `assets/pages/cn/company/行业比较/read.xs` | 一次调用返回成员明细 + 我的快照 + 中位/分位 + 合计 + 长周期分位；成员过滤（剔 B 股/退市）与中位剔负口径已踩平 |
| **白酒竞争坐标** | 同目录 `coord.baijiu.xs` | 行业特化模版的现成范例：档位收入×毛利率×份额×合同负债；read.xs 末尾 `coord.available` 探测分发 |
| **分红股息三件套** | `assets/pages/{cn,hk}/company/分红股息/{schema,read,plan}.xs` | schema 即数据契约（四章树：概览/意愿/能力/增长可持续），12 个指标含 FCF 覆盖与 SGR；plan 为逐笔「10派X元」方案明细 |
| **股本结构** | `assets/pages/cn/company/股本结构/read.xs` | 最新构成（总/流通/受限、A/B/H）+ 历年变动时序；口径红线：已流通=无限售，null 不补 0 |
| **市场估值 snapshot+series** | `assets/pages/cn/company/市场估值/*.xs` | 平台 3/5/10 年历史分位 + 行业中位/分位；月频列式序列，分位带留给前端 |
| **deepread 深解体系** | `assets/deepread/<mkt>/<code>/{money.xs,entries.json}` | 统一 yearly 序列（17 字段）+ 竞争优劣势 official 种子（带 evidence 溯源，41+11+2 家） |
| **业绩披露域库** | `sys/forecast/` + `wm-data action=forecast` | 预告/快报/预约披露三线；注意两线变动率单位不同 |

**开放平台可达性边界（实测 `xs/skillhub/wm_data.xs`）**：wm-data 当前 action 为
`help|route|search|quote|card|finance|members|analysis_nav|analysis_run|filings|notice|forecast|macro|customs|owid|usgs|fred|holdings|metric|etf`。
上述新 pages 接口**尚未包成 wm-data action**；开源版经开放平台能拿到的分红/股本数据只有：
`card.bonus_rate_ttm/lyr`、内置指标码（`$BONUS_TTM` 等，action=metric 单点）、finance raw 的 `share_capital` 逐期字段。

## 本轮落地的优化

### A. 交互简化（去构建化）

1. **概览**：删除「核心指标/自选对比」seg 与 `MetricCompare`，核心趋势 2×2 恒为只读预设图。
2. **财报**：删除「多指标对比」区与工具栏按钮；条件条只剩口径（年度/季度）与窗口（5/10 年）两组阅读控件；同比/结构异动阈值改由**行业模版预设**并在说明中标注行业名；「只看跳变」开关移除。
3. **下钻弹窗**：移除「加入多指标对比」按钮与 `compare` emit，四视图（趋势/同比/数据/解读）保留。
4. **同业散点**：移除 X/Y 轴下拉，固定 ROE×PE（「质 × 价」最常见读法）。
5. `MetricCompare.vue` 整文件删除（-382 行）；`ChartPreview.vue`（dev-only）同步移除该区块。
6. `/compare` 独立页保留（不在导航内，仅深链分享用），其散点随 PeerPanels 固定轴。

### B. 行业模版机制落地

`src/engine/schema/industry.ts` 的 `IndustryMeta` 扩展 `template` 字段：

```ts
template: {
  yoyThreshold: number;   // 同比异动高亮阈值（白酒 20%、周期 50%、通用 30%）
  shareThreshold: number; // 结构占比阈值（白酒 3pct、周期 10pct、通用 5pct）
  defaultDeep: { income; balance; cashflow }; // 三表默认深挖方向
}
```

- 新增 `industryTemplate(key)` 取模版；未知行业回落通用模版。
- `FinancialsWorkspace` 消费模版：阈值不再可配置，深挖默认方向按行业给定（制造先看利润含金量、地产先看存货、周期先看固定资产与八型）。
- 后续行业（如白酒竞争坐标、deepread 优劣势种子）接入时，继续扩展 `template` 即可，工作区按 `ctx.industry` 读模版而非硬编码。

### C. 分红与股本（补设计目标缺失的两问）

估值工作区新增「分红与股本」只读块（0 额外 EC）：

- **分红**：股息率 TTM / LYR（card 已有）；分红率序列、FCF 覆盖、逐笔方案明细诚实标注为专业版数据域。
- **股本**：总股本变动趋势图（三表 `share_capital` 逐期，实时模式随三表自动带出）；区间增幅 >10% 时提示「股本显著扩张，每股口径指标应打折」（与 Piotroski 增发检测同源）；数据不足时降级说明。
- 接入路线：待 wm-data 增开 `dividend`（复用分红股息三件套）与 `share_structure`（复用股本结构 read.xs）action 后，本块直接升级为完整序列 + 方案明细表，UI 结构已预留。

## 后续路线（按价值排序）

1. wm-data 增开 `dividend` / `share_structure` / `industry_compare` action（script 仓 skillhub，包装已有 pages 脚本）→ 前端补分红序列与股本构成。
2. `coord` 分发机制对齐：`行业比较/read.xs` 的 `coord.available` 探测 → 白酒样板显示「竞争坐标」（档位收入 × 毛利率 × 合同负债比）。
3. deepread `entries.json` 作为优势/劣势章节内容源（带 evidence 溯源）。
4. 样板从「烤死的数据文件」升级为「数据快照 × 行业模版」正交组合。

---

# 第二轮：六大问题域 × 行业模版 v2（2026-10-22 下午）

## 方法论修正（用户澄清）

「财务、资产、生意……」只是示例。真正的方法骨架是：

1. **六大问题域**：经营问题、资产问题、股东权益问题、负债问题、利润问题、现金流问题——**每个行业一个模版**，聚焦哪些问题由模版回答（要有数据支撑）；
2. **固定检查方法发现数据突变** → **数据 + 图形 + 附注** 针对性说明；
3. 突变必须带**重要性过滤**：绝对值/占比非常小的科目不构成有意义的突变；
4. 聚焦**单公司研究**：最新季报研究 + 年报历史趋势研究（winmale-v2 的 PeriodMode 单页切换范式：同一表页 year/quarter 切换，不拆两个页面）；
5. 深度借鉴 `../web/winmale-v2` 已有产品方案。

## winmale-v2 调研结论（可移植设计点）

- **规则表判据范式**：`{judge, hit, evidence, why, knobs}` 五元组规则表（`fundamentals/cashflow/anomaly.ts` 等），命中到具体格子、证据现算、显式 GAPS——「数据突变→针对性说明」的完整范式；
- **PeriodMode 单页切换**：季报研究 = 同一表页 year/quarter 切换（季报附环比、同比自动换基准），sift 已同构，保持；
- **模版自声明式行业分发**：主脚本返回 `{available, key, script}`，前端懒加载（行业比较 coord 机制）；
- **schema 在数据侧、前端纯渲染**（远期）；
- **附注四层**：科目释义（metricNotes）/ 口径变更角标 / 财报原文附注（`附注/read.xs`）/ 表结构 schema。

## 本轮落地

### A. 六大问题域模型（`engine/schema/problems.ts`）

- `DomainId = operating | asset | liability | equity | profit | cashflow`，每域带用户视角问题；
- `domainOf(itemKey, kind)`：科目 → 问题域映射（营运资金科目归经营域，负债段归负债域，权益段归权益域）。

### B. STMT_TREE 补全负债段 + 股东权益段（`engine/derivations.ts`）

此前资产负债表只有资产段——**负债问题、股东权益问题完全无从发现突变**。新增 9 行（schema/BS_MAP 字段全部有映射，0 新增 EC）：

```
TCL 流动负债合计 / AP 应付票据及应付账款 / CLC 合同负债 / ARV 预收款项（旧准则） / TL 负债合计
SC 股本 / RE 未分配利润 / EQP 归母股东权益 / TE 所有者权益合计
```

配套 9 条科目释义（itemSemantics.ts），下钻解读与异动 why 直接可用。

### C. 行业模版 v2（`engine/schema/industry.ts`）

`template` 扩展：

```ts
{
  yoyThreshold, shareThreshold,
  minShare: number,                    // 重要性下限：占基项比重 < 1% 不报突变
  defaultDeep,
  domains: Partial<Record<DomainId, string>>,  // 六域行业附注（为什么这个行业盯这个域）
  itemNotes: Record<string, string>,   // 科目级行业附注（如白酒 IO → 基酒 vs 成品）
}
```

六个行业全部填了有数据支撑的域附注与科目附注（白酒：合同负债=蓄水池/基酒 vs 成品酒/应收应接近零；制造：转固时点/产能消化；周期：毛利率位置/现金短债比；地产：预售蓄水池/明股实债；科技：资本化 vs 费用化）。

### D. 突变检测增强（`engine/analysis/anomalyScan.ts`）

1. **重要性过滤**：`minShare`（默认 1%）——金额行当期占基项比重 <1% 不报；1%~3% 强制降级 mid；比率行不适用；
2. **信号带问题域**：`AnomalySignal.domain`；
3. **行业附注**：`AnomalySignal.note`（命中行业模版 itemNotes 时挂上）；
4. `runAnomalyScan` 阈值/下限/附注统一走 `ctx.industry` 行业模版。

### E. UI

- **概览「异动信号」= 问题域透镜**：信号按六大域归组，每组头部挂该行业的域附注（为什么盯这个域），每条信号带行业附注 + 通用 why；副标题实时显示当前模版阈值与重要性下限；
- **下钻弹窗**新增「行业附注」行（命中才显示）；
- 单测 +4（重要性过滤三条 + 行业附注一条），全套 282 通过。
