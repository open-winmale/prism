# M1 实施方案 · 白酒化地基

> 2026-10-21 ｜ 配套：[`docs/REVIEW_AND_PLAN.md`](./REVIEW_AND_PLAN.md)（评审）、[`docs/DESIGN_SPEC.md`](./DESIGN_SPEC.md)（UI/UX 规格）
> 目标：定位收窄到白酒 + 补齐白酒数据模型 + 规则行业化 + IA/UI 改造 + 真实数据。
> **UI 实现一律以 `DESIGN_SPEC.md` 为准，验收走其 §10 清单。**

---

## 0. 范围

**做**：数据模型补字段 → 数据校验器 → 排雷规则行业化 → 体检分换维度 → 首页/分析页 IA 改造 → Hero 拆分组件 → 设计规格落地 → 真实白酒数据 ×3。

**不做**（M1 内）：合同负债/量价/产品结构等新模块（M2）、同业对比（M3）、附注穿透（M4）、AppId 联调（M5）。

---

## 1. 批次划分与 DoD

| 批次 | 内容 | DoD（完成定义） |
| --- | --- | --- |
| **B1** | 数据模型 + 校验器 | 字段生效；`verifyDataset` 对现有样例 0 error；新增单测 ≥6 条 |
| **B2** | 引擎规则行业化 + 体检维度 | 白酒样例不再触发行业错配误报；制造样例仍触发高危；单测 ≥8 条 |
| **B3** | IA + 组件 + 设计规格落地 | 三视口截图与基线一致；走查清单全勾；E2E 断言 ≥14 |
| **B4** | 真实数据 ×3 | 勾稽校验 0 error；报告头部显示来源；3 家公司跑通 |

每批结束执行同一条门禁命令：

```bash
npm run typecheck && npm run lint && npm run test && npm run build
```

任意一项失败即视为该批次未完成，不进入下一批。

---

## 2. B1 · 数据模型

### 2.1 新增字段（`src/engine/schema/types.ts`）

`BalanceSheet` 追加：

```ts
contract_liabilities?: Num;   // 合同负债（白酒=经销商预付款，行业第一领先指标）
advance_receipts?: Num;       // 预收款项（旧列示，缺合同负债时兜底）
inventory_raw?: Num;          // 存货-原材料
inventory_wip?: Num;          // 存货-半成品（白酒即基酒）
inventory_finished?: Num;      // 存货-库存商品（成品）
```

`ProductionSalesRow` 追加：

```ts
tier?: 'high' | 'mid' | 'low' | 'total';  // 价格带（高端/中端/低端/合计）
revenue?: Num;      // 该口径收入（元）——量价拆解必需
unitPrice?: Num;    // 吨价（元/吨），可由 revenue/sales 派生
```

`ReportDataset` 追加：

```ts
meta?: { fragrance?: string; priceBand?: string; sourceNote?: string }; // 香型/价格带/来源说明
segmentRevenue?: { period: string; tier: string; revenue: Num; grossMargin?: Num }[]; // 产品结构（M2 用，M1 先定义）
```

### 2.2 新增派生指标（`src/engine/compute.ts` 的 `PeriodMetrics`）

| 字段 | 口径 | 备注 |
| --- | --- | --- |
| `contract_liab_ratio` | (合同负债 ?? 预收款) / 营业总收入 | 白酒蓄水池；无数据为 `null` |
| `sales_cash_ratio` | 销售商品收到现金 / 营业总收入 | 收现比；现有 `cashFlowQuality` 自算，统一提到 metrics |
| `finished_inv_ratio` | 成品库存 / 营业总收入 | 白酒排雷用（基酒不计入） |

`selling_rate`（销售费用率）已存在，直接复用，不重复定义。

规则：**任一输入为 `null` 时结果必须是 `null`，不得回退为 0**——这是"禁止把缺失当安全"的硬约束，单测必须覆盖。

### 2.3 数据校验器（新建 `src/engine/schema/verify.ts`）

```ts
export interface VerifyIssue { level: 'error' | 'warn'; field: string; period: string; msg: string }
export function verifyDataset(ds: ReportDataset): VerifyIssue[];
```

| # | 校验 | 级别 | 容差 |
| --- | --- | ---: | --- |
| 1 | `periods` 升序且 `reports` 数量一致 | error | — |
| 2 | 总资产 ≈ 负债合计 + 所有者权益合计 | error | 0.5% |
| 3 | 毛利率 与 `1−成本/营收` 一致 | error | 0.1pct |
| 4 | 净利润 ≥ 归母净利润 | warn | — |
| 5 | 合同负债全期缺失（白酒） | warn | — |
| 6 | 金额量级疑似非「元」（如 <1e6 且非比率） | warn | — |
| 7 | 销量 > 产量 + 期初库存 | warn | 1% |
| 8 | 期末现金 与 货币资金 偏离 | warn | 50% |

用途：① 样例数据的准入门禁；② B4 真实数据录入时的自检；③ 单测断言。**这是"落地质量"的第一道保险——真实数据最容易错在勾稽与单位。**

---

## 3. B2 · 引擎行业化

### 3.1 排雷规则：通用版 → 白酒版（`src/engine/analysis/mineDetect.ts`）

改造方式：`mineChecks(ctx)` 内部按 `ctx.industry` 取阈值表，不再硬编码。

| 规则 | 通用（制造业） | **白酒版** | 理由 |
| --- | --- | --- | --- |
| 应收增速 > 营收 | ≥2 年 且 应收/营收>15%，high | 阈值提至 >30%，**降为 low** | 先款后货，白酒几无应收 |
| 存货增速 > 营收 | ≥2 年 且 存货/营收>50%，high | **改用成品库存/营收>25%**；基酒增长单独输出"产能储备"中性提示 | 基酒储存 3–5 年是竞争力 |
| 经营现金流 < 净利润 | 单年<0.8 且 ≥2 年，high | **3 年滑动均值<0.8**；若收现比>1.0 则豁免为 safe | 预收款使单年 CFO 剧烈波动 |
| 毛利率畸高 | >同业基准 +10pct，mid | **与自身 5 年均值偏离 >5pct 且无产品结构解释**，mid | 高端白酒 90% 毛利是护城河 |
| 大存大贷 / 其他应收 / 商誉 | 不变 | 不变 | — |
| 在建工程 | >固定资产 30%，low | 保持阈值，文案增加"白酒扩产周期 2–3 年属正常" | 白酒扩产常见 |
| **渠道信心（新增）** | — | 合同负债/营收 连续 2 年环比降 >20% → mid | 白酒专属领先指标（字段 M1 就绪，规则 M2 启用；M1 先输出 na） |

输出契约不变（`MineCheck` 结构），仅阈值与 `why/next/laotang` 文案分行业。安全项仍必须给出"为什么安全"的解释。

### 3.2 体检分：通用七维 → 白酒六维（`src/engine/analysis/qualityCheck.ts`）

| 维度 | 权重 | 口径 | 打分方向 |
| --- | ---: | --- | --- |
| 毛利率 | 15% | 水平 + 趋势 | 越高越好 |
| 净利率 | 15% | 归母净利率 | 越高越好 |
| ROE（杜邦） | 20% | 归母 ROE | 越高越好 |
| 收现比 | 20% | 销售收现/营收 | >1 满分，<0.8 低分 |
| 合同负债蓄水 | 15% | 合同负债/营收 | 适中偏高为好，持续下滑扣分 |
| 销售费用率 | 15% | 销售费用/营收 | 越低越好（品牌力） |

被移出的三維及其原因：权益乘数（白酒杠杆极低无区分度）、资产周转率（基酒周转天然慢）、应计利润占比（预收款大时失真）。M2 补"分红率"后重分配权重至七维。

**硬规则**：某维度 `na`（如无合同负债）时，**该维度权重从分母剔除**，总分按剩余权重归一化，禁止按 0 分计入。此点必须有单测。

### 3.3 单测（追加到 `src/engine/analysis/`）

- 白酒样例：存货项不触发（基酒口径）、现金流项不误报、毛利率项不误报；
- 制造样例：三项高危仍触发（回归保护，证明行业化没有削弱通用能力）；
- `na` 维度剔除后总分归一化正确；
- `contract_liab_ratio` 缺失时派生为 `null` 而非 0。

---

## 4. B3 · 信息架构与组件

### 4.1 文件级改动清单

| 文件 | 动作 | 要点 |
| --- | --- | --- |
| `src/features/home/HomePage.vue` | 改造 | 去掉"选行业"步骤；改为公司卡片网格（名称/代码/香型·价格带/一句话特征），点击直达报告 |
| `src/features/home/CompanyPicker.vue` | 新建 | 公司卡组件；选中态 brandsoft |
| `src/features/analysis/ReportHero.vue` | 拆分 | 仅保留编排：A–E 五段顺序 + 章节 id 锚点 |
| `src/features/analysis/VerdictHeader.vue` | 新建 | Zone A（规格 §4.3） |
| `src/features/analysis/MineChecklist.vue` | 新建 | Zone B（规格 §4.4，含窄屏佐证换行） |
| `src/features/analysis/QualityBars.vue` | 新建 | Zone C（规格 §4.5，含 na 剔除显示） |
| `src/features/analysis/ConclusionBlock.vue` | 新建 | Zone E + 情境化 CTA |
| `src/components/ReportNav.vue` | 新建 | 章节锚点条（规格 §4.2） |
| `src/components/TermTip.vue` | 新建 | 术语提示（规格 §4.8） |
| `src/features/analysis/AnalysisPage.vue` | 改造 | 引入锚点条；公司条强化数据来源标签；移除"语境条"重复表述 |
| `src/features/charts/EChart.vue` | 改造 | 注入序列色；空数据占位；高度 `240/288` 随视口 |
| `src/store/useApp.ts` | 改造 | `industry` 固定 `liquor`；新增 `anchor` 状态（problem → 锚点映射）；保留 `view` |
| `src/engine/schema/industry.ts` | 改造 | `INDUSTRIES` 增加 `hidden` 标记，UI 只渲染白酒；`IndustryKey` 保留备扩展 |
| `src/styles/main.css` | 改造 | 追加语义色 CSS 变量；tooltip 样式；表格窄屏滚动 |
| `uno.config.ts` | 改造 | safelist 补齐新增语义色 |

### 4.2 路由与状态

```
/                      首页（选公司）
/analyze?symbol=600519&problem=risk   报告（problem → 默认锚点 risk→B 段）
/about
```

`problem` → 锚点映射：`risk→mine`、`profitability→quality`、`assetQuality→quality`、`operations→growth`。
锚点切换为页内滚动，不改路由，避免刷新丢失。

### 4.3 关键实现约束

- 拆分出的每个 Zone 组件**只接收 props、不直接取 store**，保证可单测、可独立走查。
- `ReportHero` 只做编排与锚点 id 挂载（`id="sec-mine"` 等）。
- 所有金额展示统一走 `utils.ts` 的 `fmtYi` / `fmtPct`，禁止组件内自造格式化。

---

## 5. B4 · 真实白酒数据

### 5.1 来源优先级

1. **赢麻了开放平台（Open AppId）**——最理想，字段由后端给出，需你提供凭证与字段清单；
2. **年报手工整理**——次选，从巨潮/公司官网年报摘录，**逐字段标注来源页与口径**；
3. 兜底：保留现有结构近似数据，但报告头部必须显式标注「示例数据 · 非真实财报」。

> 无论走哪条，**禁止凭记忆补全数字**；每个数值必须能回溯到具体年报页码或接口字段。

### 5.2 三家标的（建议）

| 代码 | 公司 | 香型 / 价格带 |
| --- | --- | --- |
| 600519 | 贵州茅台 | 酱香 / 超高端 |
| 000858 | 五粮液 | 浓香 / 高端 |
| 000568 | 泸州老窖 | 浓香 / 高端·中端双线 |

期间：**2021–2025 五个年度**（与现有样例一致口径），单位「元」。

### 5.3 必填字段清单（每期）

三大表全部一级科目（现有 schema 已覆盖）+ 新增：`contract_liabilities`、`inventory_wip`、`inventory_finished`、产销量（`production`/`sales`/`revenue`/`unit`）。
选填：`advance_receipts`、`inventory_raw`、`tier` 分级产销量、`segmentRevenue`。

### 5.4 录入规范

- 新目录 `src/data/samples/liquor/`，一公司一文件，`meta.sourceNote` 写明来源与口径；
- 每家公司数据接入 `verify.ts` 校验，**0 error 才允许合入**；
- `disclaimer` 改写为：「数据来源：{来源}；口径：{合并报表/母公司}；仅供学习，不构成投资建议」。

---

## 6. 质量门禁

| 层 | 命令 / 动作 | 门槛 |
| --- | --- | --- |
| 类型 | `npm run typecheck` | 0 错误 |
| 静态 | `npm run lint` | 0 警告 |
| 单测 | `npm run test` | 全绿（现有 24 条 + 新增 ≥14 条） |
| 数据 | `verifyDataset` | 样例 0 error |
| 构建 | `npm run build` | 无告警 |
| E2E | `node e2e-screenshots/run.js` | 断言全过 |
| 视觉 | 三视口截图 + 走查清单 | 与基线一致，清单全勾 |

CI（`.github/workflows/ci.yml`）已覆盖前四项；E2E 进 CI 排 M5。

---

## 7. 还原度保障机制

**三层，缺一不可：**

1. **规格先行**：UI 改动前先有 `DESIGN_SPEC.md` 对应条目；规格变动同步改文档，不改代码注释了事。
2. **三视口截图基线**：`e2e-screenshots/run.js` 扩展为在 1440×900 / 768×1024 / 375×812 三档截图，输出至 `docs/ui-baseline/`（**入库**）。后续每次 UI PR 重跑并人工比对差异，破坏性差异必须说明原因。
3. **走查清单**：`DESIGN_SPEC.md` §10 共 5 组约 20 项，每个 UI 批次结束逐项打勾，结果写进 commit message 或 PR 描述。

**E2E 断言补充（M1 后总数 ≥20）**：
- 首页公司卡片可点进报告且 URL 带 `symbol`
- 白酒样例 verdict = 安全；制造对照样例 verdict = 高危（行业化没削弱通用能力）
- 375px 下排雷清单佐证文本可见（**当前会失败，是待修项**）
- 章节锚点点击后区块进入视口
- 术语提示可触发
- `na` 维度显示为「无数据」且不拉低总分

---

## 8. 风险与开放项

| 项 | 风险 | 应对 |
| --- | --- | --- |
| 真实数据获取 | 无 AppId 则手工整理耗时且易错 | 优先 AppId；手工时用 `verify.ts` 逐期校验 + 交叉复核 |
| 合同负债口径 | 不同公司列示科目名不同（合同负债/预收款项） | `advance_receipts` 兜底，两者皆无则 na 并提示 |
| 基酒数据可得性 | 部分公司不单独披露半成品 | 缺则成品库存规则降级为"存货总额"并标注口径 |
| 行业常量 | 白酒基准（同业毛利率等）尚无真实来源 | M1 不引入基准数字；M2 用真实数据生成并标来源 |
| 拆分组件回归 | Hero 拆分可能破坏现有 E2E | 拆分前后各跑一次 E2E，断言集合不减少 |
