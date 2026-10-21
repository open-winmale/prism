# report-lens 优化任务交接 Prompt（v2 · 背景与目标完整版）

> 用途：把本文件全文交给外部 AI（Codex / Claude / 其他），授权其在指定约束内继续优化本项目。
> 项目：`/Users/congwuzhang/work/src/end/sift`（report-lens v0.5.0）
> 线上：https://open-winmale.github.io/report-lens/ ｜ GitHub：`open-winmale/report-lens`

---

## 第一部分 · 背景（为什么有这个项目，它经历了什么）

### 1.1 项目缘起与生态位置

**赢麻了（winmale.com）** 是一个面向个人投资者的投研平台，其专业版前端是 `../web/winmale-v2`（React + TS，内网凭证访问，features 含分析树/选股/回测/深读等 30+ 模块）。平台后端有一套自研的财报分析资产体系（XScript 语言，下称 `../script`，约 237 个专业分析资产：质量体检包、暴雷预警、现金流八型、行业比较、季节性分析等）。

**report-lens（财报透视）是这个生态的开源精简版**，放在 `src/end/sift`，有三重目的：

1. **引流**：开源免费版解决「读财报门槛高」的普遍痛点，吸引个人投资者；深度需求导向 winmale.com 专业版（所有 CTA 带 `utm_source=report-lens`）；
2. **复用**：把 `../script` 的专业分析方法论（老唐《手把手教你读财报》排雷清单、质量体检维度、现金流八型、单季推导 DIFFQ_YTD 等）移植成纯 TS 引擎，开源可见、逻辑透明；
3. **通道**：通过赢麻了开放平台（AppId 免费申请）让开源用户也能查实时财报数据——数据在云端，分析在前端，凭证归用户。

**用户画像**：A 股个人投资者，看得懂「毛利率 91%」但看不懂「应计利润占比异常是否意味着利润造假」；需要的是**结论先行、证据可查、门槛低但不失真**的财报解读，而不是专业终端的原始数据堆砌。

### 1.2 产品形态（当前 v0.5.0）

一句话：**选一家公司（搜索或精选卡片）→ 出一份多场景体检报告（防踩雷/看质地/验真伪三个 Tab）→ 每个结论都带佐证数字与下一步核查建议**。

```
首页：搜索框（任意公司，discover 接口检索）+ 精选 3 家白酒卡片（茅台/五粮液/泸州老窖）
      ↓ 点击 / 搜索选中
分析页：公司条（名称/期间/实时接口标签/EC 消耗）+ 年度|季度口径切换 + 三场景 Tab
  ├─ S1 防踩雷：老唐排雷清单 10 项（每项三态：触发/安全/缺数据，触发带证据图与下一步核查建议）
  ├─ S2 看质地：六维体检分（环形图）+ 盈利驱动分解（ROE 三因子归因 + 拐点侦测）+ ROE/毛利/净利趋势
  └─ S3 验真伪：现金流质量头条 + 季节性分析（单季口径）+ 现金流八型 + CCC + 存货
      ↓ 「更多维度」折叠
次级模块：杜邦/毛利率/净利/资产结构/存货/固定资产/在建工程/产销量/附注（13 个模块注册于 registry.ts）
```

**三场景共用一次取数**（一次拉 5 年×3 表 ≈ 3 万 EC），切场景零成本——这是成本护栏的核心设计。

### 1.3 演进史（理解现状为什么是这样的）

| 版本 | 里程碑 | 关键决策 |
| --- | --- | --- |
| v0.1-0.2 | MVP 13 模块 + Hero 化改版 | 用户反馈「聚焦做透一件事，不要大而无用」→ 问题驱动 IA 改为 Hero 报告 |
| v0.3 (M1) | 白酒化 + 真实数据 | 行业收窄白酒（预收款/合同负债是行业第一指标）；排雷阈值行业化（制造业标尺误判白酒：基酒存货是竞争力、先款后货、预收款扰动 CFO）；打通开放平台取数，3 家真实年报快照内置 |
| v0.4 | 动态化 | 用户定调「不是静态页面，要 winmale-v2 精简版」→ 接口直连（实测 CORS 全开浏览器可直连）+ 动态搜索选标的 + 修掉搜索丢 this 的 reactive 代理 bug |
| v0.5 | 内容深度 + 年季口径 | 用户要求「看质地/验真伪要比防踩雷好」「支持年季分析、警惕累计值口径」→ 新增盈利驱动分解（ROE 归因+拐点）、季节性分析（单季差分）、engine/quarter.ts 口径引擎 |

### 1.4 数据源事实（已逐项实测，2026-10-21）

赢麻了开放平台 API（base：`https://api.winmale.com` 或 `https://winmale.com/wm/proxy/winmale`，完全同构）：

```
鉴权   POST {base}/v1/oauth/token  （form: grant_type=client_credentials&client_id&client_secret）
取数   POST {base}/v1/skills/wm-data/run   body 必须 {"args":{...}}，Bearer 7200s
检索   POST {base}/v1/analysis/xs/discover  {"q":...} → hits[{domain:'symbol'|'industry', id, title}]
CORS   全开（allow-origin:*），纯前端可直连，无需 BFF
```

| action | 用途 | EC 实测 |
| --- | --- | ---: |
| `finance view=key` | 期次发现 + 汇总指标 | 2.8k-5.9k |
| `finance view=raw`（statement=bs/is/cf） | 单期单表全字段明细（**合同负债/存货/费用明细只在这里**） | ~1988/张 |
| `members`（key=白酒 kind=industry） | 21 家成分 + close/pe/pb/roe_ttm/mv | ~3795 |
| `card` | 一页纸（行情/估值/分红/概念） | ~2.2k |

**成本硬约束**：年度全量一家 ≈ 3 万 EC，季度全量（8 期×3 表）≈ 11 万 EC。已落地对策：数据集 24h 本地缓存（annual/quarterly 分 key）、白酒池缓存、内置样本年度口径走快照 0 EC。**任何新功能的第一个设计问题是：要花多少 EC，缓存策略是什么。**

凭证（本地联调，严禁提交）：`/Users/congwuzhang/work/src/end/script/.env` 的 `OPEN_PLATFORM_CLIENT_ID/SECRET/BASE_URL`；本地 `.env.local` 映射为 `VITE_WM_*`（已 gitignore）。

---

## 第二部分 · 目标（做到什么程度算好）

### 2.1 北极星目标（产品存在的原因）

为普通投资者：
1. **降低理解门槛**——把「毛利率 91%」后面的东西（护城河、含金量、可持续性）翻译成结论先行、证据可查的陈述；
2. **提升深入了解一家公司的效率**——5 分钟读完一份报告，获得原本要翻三张表 + 附注 + 行业对比才能得到的判断；
3. **揭示深层次信息**——给出普通投资者看不到的东西：累计值陷阱、渠道蓄水池（合同负债）边际变化、ROE 驱动结构恶化拐点、单季异常、造假信号（应计异常/营收应收背离）。

### 2.2 产品原则（评判每个功能的尺子）

- **结论先行，证据随行**：每句话带佐证数字；「缺数据」明示而非假装安全；
- **口径诚实**：这是财报产品的生命线（见第四部分红线）；
- **做透不做宽**：拒绝「大而无用」；新功能必须回答「揭示了什么之前看不到的信息」；
- **成本可见**：EC 花费透明，能缓存不重取，能在已有数据上算的绝不重新拉数。

### 2.3 本轮优化目标（交接给外部 AI 的具体任务）

**第一步（必做）**：对现状做全面诊断，输出结构化报告——整体评分（/10）+ 分维度表（功能价值深度/口径严谨性/UI·UX·IA/代码质量）+ 问题清单（`P0-P3 + [file:line] + problem/evidence/fix` 三段式）。**先交诊断，等用户确认后再改码。**

**第二步（按确认的优先级实施）**，候选方向与预期产出：

| 优先级 | 方向 | 预期产出 | 关键约束 |
| --- | --- | --- | --- |
| P0 | **同业横比 + 行业分位**（「跟行业内标的比」，数据层已就绪） | 当前公司关键指标（毛利率/净利率/ROE/合同负债率/收现比）在对比集内的排名 + 分位条 + 中位数对照；参照理杏仁分位形态与 `../script` 的 `PERCENTILE`（申万 l3 内名次 [0,1]）、`行业比较.收益率比较.xs` | 全量 21 家×3 万 EC 不可行——必须给抽样/勾选对比/逐家缓存策略 |
| P1a | **暴雷预警深化**（防踩雷场景） | Altman Z-Score（5 因子分区）+ Beneish M-Score（8 因子，阈值 -2.22）+ 营收/应收背离交叉验证；对齐 `../script` 的 `基本面.暴雷预警` | 全部可从现有数据集推导，0 新增取数 |
| P1b | **成长质量**（看质地场景） | SGR = ROE×留存率；ROIC−WACC 缺口（WACC 5% 基准声明）；增长来源拆解（股东投入 vs 负债扩张 vs 利润积累）；结合已有拐点侦测回答「增长是否在透支资产负债表」 | 对齐 `基本面.成长可持续` |
| P2 | **同型分析** | 三大表同型百分比（BS÷总资产、PL÷营收、CF÷NCFO）+（应收+存货)/总资产虚资产信号 | 对齐 `基本面.同型分析` |
| P3 | 体验 | 骨架屏（进度已透出 store.progress）、图表深链分享、移动端适配 | — |

**非目标（明确不做）**：不做全市场多行业（当前聚焦白酒，引擎行业化阈值只配了 GENERAL/LIQUOR 两套）；不做选股/回测（专业版领地）；不做实时行情 K 线；不引入后端服务（保持纯前端直连架构）；不复制 `../script` 专有文案（只移植公式与判定逻辑，注释标注来源语义）。

### 2.4 成功判据（怎么算做好了）

1. 一份报告读完，用户能回答：这公司会不会爆雷（三态判定+证据）？生意好不好（驱动结构+方向）？利润是不是真的（含金量+单季异常）？——**且每个答案都能指出是哪个数字支撑的**；
2. 新模块的每个结论都能在茅台/五粮液/泸州老窖三家的公开数据上交叉验证通过；
3. 质量基线不回退：单测 121+、E2E 31 断言、门禁四连（typecheck/lint/test/build）全绿；
4. 新增取数有 EC 账说明，且缓存策略明确。

---

## 第三部分 · 技术现状（改动前必读）

### 3.1 栈与路径

Vue3 + Vite + TS + UnoCSS + ECharts（tree-shaken）+ pinia + vue-router + Vitest + oxlint。
项目根：`/Users/congwuzhang/work/src/end/sift`。引擎 `src/engine/`（纯 TS 无框架依赖）｜数据层 `src/data/`｜UI `src/features/` + `src/components/`｜E2E `e2e-screenshots/run.cjs`。

### 3.2 核心文件地图

| 文件 | 职责 |
| --- | --- |
| `src/engine/schema/types.ts` | 三表字段（对应 `../script/sys/rptdom/stmt_tree.xs` col 名）；`PeriodReport.sampling`（Q1-Q4 口径标记）；`meta.cashScope`（财务公司现金口径） |
| `src/engine/compute.ts` | `PeriodMetrics` 单期指标 + 杜邦三因子（相邻期均值）；**白酒专属指标**：`contract_liab_ratio`（蓄水池）/`sales_cash_ratio`（收现比）/`finished_inv_ratio`（成品滞销） |
| `src/engine/quarter.ts` | **单季/TTM 推导引擎**（DIFFQ_YTD 语义）：`deriveSingleQuarter`/`singleQuarterReports`/`ttmFlowAt`/`singleQuarterYoy`；缺期一律 null 不猜 |
| `src/engine/analysis/mineDetect.ts` | 老唐排雷 10 项；阈值表行业化（`GENERAL_T`/`LIQUOR_T`）；白酒专属「渠道信心」检查 |
| `src/engine/analysis/qualityCheck.ts` | 体检分：白酒六维（收现比/蓄水池/销售费用率替换周转/杠杆/应计）；**na 维度权重从分母剔除归一化** |
| `src/engine/analysis/profitDrivers.ts` | ROE 三因子归因 + 边际方向拐点侦测（S2 看质地） |
| `src/engine/analysis/seasonality.ts` | 单季口径季节分布 + 单季 vs 去年同季可比同比（S3 验真伪） |
| `src/engine/analysis/cashFlowQuality.ts` / `cashFlowType.ts` | 现金流质量 + 八型（CFO/CFI/CFF 符号编码） |
| `src/engine/schema/verify.ts` | 8 规则数据准入门禁（资产=负债+权益 0.5% 容差等）；**所有数据集渲染前必须 0 error** |
| `src/data/wm/client.ts` | 接口客户端（OAuth/args 包装/X-Status/401 重试/discover） |
| `src/data/wm/dataset.ts` | 期次发现（key 视图）+ 逐期三表并发（`mode:'annual'\|'quarterly'`，quarterly=8 报告期 Q1-Q4 混合） |
| `src/data/wm/mapper.ts` | raw 全字段→三表映射表（注释含实测来源）；**缺失一律 null 禁 0**；`detectCashScope`（财务公司口径识别） |
| `src/data/wm/cache.ts` | 数据集 24h 缓存（key=`symbol:mode:count`），配额满按时间淘汰 |
| `src/data/provider.ts` | 双模 `LiveProvider`/`SnapshotProvider` 出口契约一致；`liquorPool()`（members 白酒池 24h 缓存）；`search()`（discover）；**内置样本仅 annual 口径走快照** |
| `src/store/useApp.ts` | `dataMode`/`scenario`/`selectStock`（请求序号防竞态）/`searchSymbols`（防抖）；**provider 是类实例存普通变量**（reactive 代理会丢 this——已踩坑） |
| `src/features/analysis/scenarios.ts` | 三场景定义（headline + modules 编排，共用一次取数） |
| `src/data/samples/liquor/*.ts` | 真实年报快照 2021-2025（茅台/五粮液/泸州老窖，勾稽 0 error） |
| `docs/` | `DYNAMIC_ARCHITECTURE.md`（接口契约全记录）/`DESIGN_SPEC.md`（UI 规格）/`IMPLEMENTATION_PLAN.md`/`ROADMAP.md` |

### 3.3 关键坑（已踩过，勿重蹈）

1. **provider 类实例进 `ref()` 会被 reactive 代理**，方法解构调用丢 `this`（搜索静默失败的根因）——实例存普通变量；
2. **`selectStock` 竞态**：取数慢，快速切换会过期覆盖——立即标记 `currentSymbol` + 请求序号丢弃过期响应；
3. **财务公司现金口径**：茅台期末现金是货币资金 2.4 倍（存放央行/同业计入现金流表）——`detectCashScope` 识别后校验器不误报；
4. **内置快照曾拦截所有口径请求**（茅台切季度无效）——仅 annual 走快照；
5. **E2E 起服务**必须用 `run_in_background`（nohup 会被清）；Playwright 需 `NO_PROXY=localhost,127.0.0.1`；实时模式冷拉 15 张表最长 ~40s，等待用 `waitForSelector` 不是固定 sleep。

---

## 第四部分 · 口径铁律（违反 = 重大事故，review 按红线对待）

1. **累计 vs 单季**：中国财报 Q1 是单季值；Q2（半年报）/Q3（三季报）/Q4（年报）都是「年初至今累计」。单季 = 本期累计 − 上期累计（同年内、采样相邻），全部经 `engine/quarter.ts` 推导。**禁止拿累计值直接当单季算同比/环比**——季节效应会污染一切增长结论。
2. **缺失 ≠ 0**：源字段缺失一律 `null`；引擎派生指标 null 传播表达「无法判定」；UI 对 null 显示「缺数据」而非 0。
3. **资产负债表是时点值**：不参与单季差分。
4. **TTM = 最近 4 个单季之和**（不限同 sampling；任一单季推不出 → null 不猜）。
5. **数据准入**：任何数据集渲染前过 `verifyDataset` 且 0 error。
6. **单位**：内部全「元」，展示层统一「亿元」。
7. **白酒行业化**：基酒存货是竞争力（排雷查成品口径）、先款后货（应收降权）、预收款扰动 CFO（3 年均值+收现比豁免）、90% 毛利是护城河（毛利率畸高查自身 5 年均值非同业）。不得用制造业标尺评判白酒。

---

## 第五部分 · 工作方式约定

1. **诊断先行**：先交结构化诊断报告，等用户确认优先级再动手；改码前 diff-first 展示思路；
2. **不擅自提交**：commit/push 由用户确认后执行；提交信息中文（动机/方案/验证三段）；
3. **接口诚实**：新接口调用先 curl 实测字段再写映射（`mapper.ts` 注释风格：记录实测日期与字段来源）；数字/单位逐字来自平台返回，禁止凭记忆补全；发现数字疑似错误回溯源头而非静默修正；
4. **script 资产复用**：只移植公式与判定逻辑（内化为 MIT），注释标注来源与语义（现有风格：`对齐 script 的 DIFFQ_YTD`）；不复制专有文案；
5. **每批次验收**：`npm run typecheck && npm run lint && npm run test && npm run build` 全绿；新引擎逻辑必须有单测（含「缺失→null」与勾稽自洽路径，参照 `quarter.test.ts` 风格）；真接口验证：
   ```bash
   set -a && source /Users/congwuzhang/work/src/end/script/.env && set +a
   WM_E2E=1 npx vitest run src/data/wm/live.integration.test.ts
   ```
   浏览器 E2E（31 断言）：
   ```bash
   npm run dev   # run_in_background
   E2E_BASE="http://localhost:5173/report-lens" NO_PROXY="localhost,127.0.0.1" node e2e-screenshots/run.cjs
   ```
6. **交付物**：改动文件清单 + 关键数字验证（新结论在茅台/五粮液/泸州老窖公开数据上交叉核对）+ 本次新增 EC 成本说明。
