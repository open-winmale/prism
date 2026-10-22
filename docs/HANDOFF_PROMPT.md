# report-lens 交接提示词（v4 · 2026-10-22 · Phase 6 价值深度 + 表达力 + 375px 专项完成之后）

> 用途：把本文件全文交给下一个 AI（Claude/Codex/其他），授权其在指定约束内继续开发本项目。
> 项目根：`/Users/congwuzhang/work/src/end/sift`（report-lens）
> 线上（旧版 v0.5）：https://open-winmale.github.io/report-lens/ ｜ GitHub：`open-winmale/report-lens`（push main 自动部署 Pages）
> 本地预览：`npm run dev` → http://127.0.0.1:5173/report-lens/ （base 是 `/report-lens/`，根路径 302 过去）

---

## ⚠️ 接手前必读的三条硬状态（2026-10-22 11:00 UTC+8 更新）

1. **v1.1.0 已提交并推送**（2026-10-22，48 个文件 + 版本号 1.1.0 + tag v1.1.0；连同此前 3 个本地提交一起上线 Pages）。此后接手 AI 的新改动照常工作，仍守「不擅自 commit/push、中文三段式提交信息」的约定。
2. **四门禁 2026-10-22 10:40 实测 4/4 全绿**（含上轮缺口的 `npm run build`——429 限的是当时 AI 会话配额，构建本身纯本地无碍）。
3. **门禁真实数字（2026-10-22 实测）**：单测 **232 passed / 5 skipped**；`npm run typecheck` 0 错；`npm run lint` 0 warning/0 error；E2E **101 断言全绿**（含三表同业横截面、条件选项、下钻解读、异动信号、瀑布图/热力图、Beneish、移动端 375px 专项 6 条、泸州老窖校验零噪声 1 条）；build 通过。三视口基线已重生成。

---

## 第一部分 · 背景与定位（为什么有这个项目，现在是什么）

### 1.1 生态位置

**赢麻了（winmale.com）** 是面向个人投资者的投研平台。专业版前端在 `../web/winmale-v2`（React，内网 JWT，`src/features/analysis`）。后端方法论在 `../script`（XScript，约 237 个 .xs 资产：三表口径 `sys/rptdom/stmt_tree.xs`、指标库 `sys/metric/cn/from_db.json` 1274 项、行业分位 PERCENTILE、单季 DIFFQ_YTD 等）。

**report-lens（本项目，sift）** 是「个人投资者的专业版简化版」：保留专业版的「期间 × 科目 × 对比 × 下钻」证据链，去掉机构级复杂度。范围 = A 股非金融企业的三表诊断（白酒是第一个行业镜头）；不做附注/F10/盈利预测/ROI/提醒（专业版数据域，报告内放情境化 CTA 引流，所有 CTA 带 `utm_source=report-lens`）。

产品承诺（不可妥协）：**结论先行、证据可查、口径诚实**——5 秒结论 / 30 秒证据 / 3 分钟下钻，且每个答案都能指出是哪个数字支撑的。

### 1.2 当前状态（v1.0 → v1.1 价值深度 + 表达力，本地未 commit）

**已落地（全部有单测/E2E 背书，见 §2.2 文件地图）**：

- **七工作台 IA**：`/company/:symbol/:workspace?`，workspace ∈ overview|financials|quality|peers|valuation|risk|tracking；桌面左栏 + 移动底部导航；`/compare` 独立对比页（三表逐行同业横截面，勾选渐进加载、默认 0 EC）；`/method` 方法论页；404 兜底。
- **三表列组工作台**：每期「原值 + 同比/占比」子列、双行表头 sticky、科目行可点 → `LineItemDialog`（趋势/同比/数据/**解读**四视图，ESC 关闭）、5/10 年窗口、CSV 导出。
- **数据层**（v2）：`card` + `members` + mapper（缺字段一律 null）；缓存 v2（换 AppId 清缓存重拉）。
- **质量模型**：Altman Z / Piotroski F9 / Sloan 应计 / SGR / ROIC−WACC / Beneish M-Score（8 因子，开源版差异化，专业版也没有）。
- **Phase 6 价值深度（0 新增 EC）**：
  - **异动扫描** `engine/analysis/anomalyScan.ts`：同比 ±30% + 结构占比 ±5pct 双线扫描全部科目，输出 severity/direction/tone/evidence/why/next；同名科目×期间只报一次。
  - **增长来源** `engine/analysis/growthSources.ts`：总资产增量瀑布拆解（负债/少数股东/留存收益/增发/其他），口径移植自专业版 `$STM=$SE+$TL+$MIN`；样本字段缺失优雅降级（合并为「股东的钱」）。
  - **科目释义档案** `engine/analysis/itemSemantics.ts`：41 科目的 what/how/why/next 四段档案，支撑下钻解读与异动判读。
  - **Beneish M-Score** `engine/analysis/beneish.ts`：挂风险区首位；DEPI 因数据源无折旧字段恒缺→中性值代入并明示；缺 ≥3 因子整体置 na；瀑布图从中性基准 −2.48 出发画门线 −2.22/−1.78；先款后货公司 DSRI 极低但文案明示「不携带信息」。
- **Phase 6 表达力（UI/UX）**：
  - **多样化图形**：ECharts 适配层新增**瀑布图**（增长来源/Beneish）/ **热力图**（季节占比矩阵）/ **柱+线双轴组合**（营收柱+增速线）。`waterfall` 类型此前声明未实现会退化成柱状，已修复并补 `refLines`。
  - **条件选项**：财报工作台条件条（口径/窗口/同比阈值 20·30·50% / 结构阈值 3·5·10pct / **只看跳变科目**开关）；概览异动深链 `?kind=&item=` 直达解读。
  - **异常突出**：三表子列异动高亮（升红降绿）+ 行首标记 + 图例；概览新增「异动信号」Top 6 区（按严重度排序）。
  - **下钻解读**：科目下钻第 4 视图「解读」（`itemSemantics.dossierOf` 驱动）；`LineItemDialog` 新增 `initialMode` prop。
  - **资产归位**：此前 10 个零挂载模块已挂 7 个（现金流八型→财报区；杜邦/毛利率/净利/六维体检分/增长来源/异动扫描→质量区）；风险区挂回 roe/grossMargin/netProfit/qualityCheck + Beneish 首位；估值区加 `quantile()` 行业横截面分位条（PE/PB/PS/ROE，与自身 3 年分位并列并明示「是两回事」）。
  - **三表逐行同业横截面** `/compare`：同行科目并排 + 中位数 + 排名 + 偏离倍数 + 整行着色；期间对齐（缺则标注「未对齐」）；缺失不进中位数/排名；EC 默认 0，>0 才弹确认。
- **口径修复（暴露于实测，单测钉死）**：CF 共同比分母改「流量÷营收、期末现金÷总资产」；NCF 行改 `sum_all(经营+投资+筹资)`；`yoy()` 基期为正硬约束；异动单位比率用%/结构用 pct 不混用。
- **移动端 375px 专项（2026-10-22 完成）**：实测诊断推翻「佐证列被隐藏」旧描述——真实问题是条件条 316px 吃掉首屏 + 数据区可见仅 242px 无横滚线索。新增 `FilterCollapse`（条件条窄屏收起为一行如实摘要，桌面不回归）与 `TableScroll`（右缘渐隐指示，滚到底消失）两个共享组件；窄屏密度收紧；一屏完整期间 1.7→2.7 个；E2E +6 断言。
- **数据校验零噪声（2026-10-22，用户实测泸州老窖触发）**：移除「净利润≥归母」规则（少数股东损益为负是恒等式正常结果）；量级规则收窄到规模字段（小字段如长期待摊费用几十万是真实数据）；茅台样本补 `cashScope: finance-subsidiary`（期末现金含财务公司存放央行/同业，实时链路有 detectCashScope、快照此前漏标）。三样本「0 噪声告警」+ E2E「泸州老窖概览无校验噪声」已钉死。
- **季度表二次差分修复（2026-10-22，用户实测泸州老窖触发）**：store.analysisDataset 季度模式已做单季视图，FinancialsWorkspace 曾又差分一次 → 实时数据算出负营收（2025Q2 −22.5 亿）。修复后工作台直接消费 ctx.dataset；quarter.test.ts 用真实原始值钉死「单次差分为正 / 二次差分出负」。
- **季度模式首期无数据属设计而非缺陷（2026-10-22 用户问询澄清）**：季度窗口取最近 8 个报告期，首期（如 2024Q3）的单季值需上一期累计（半年报）差分，窗口外推不出 → 利润表/现金流量表显示「—」（铁律：不拿累计冒充单季）；资产负债表是时点值不受影响。可选改进未做：多取 1 期垫脚（+3 张表 ≈ +6000 EC）。
- **E2E 禁点「季度」按钮**：dev 环境 `.env.local` 带凭证时切季度会真实触发实时取数（8 期 × 3 表）花 EC——季度口径正确性由 quarter.test.ts 单测守，E2E 只走快照路径。

**未做（等用户决策，见第三部分）**：commit/push、E2E 进 CI、申万 L3 全成分 peer 对比（需 AppId 配额）、产销量/附注模块（缺年报原文域，未挂载）。

---

## 第二部分 · 技术现状（改码前必读）

### 2.1 栈与命令

Vue3 + Vite5 + TS(strict) + UnoCSS + ECharts(core 按需) + pinia + vitest + oxlint。无 sass（样式是 `src/styles/workbench.css`，**纯 CSS，注释只能 `/* */`**）。`tsconfig target ES2020`——**没有 `.at()`**，用 `arr[arr.length - 1]`。

```bash
npm run typecheck && npm run lint && npm test -- --run && npm run build   # 四门禁，每批次必跑
npm run dev    # 5173
E2E_BASE=http://127.0.0.1:5173/report-lens NO_PROXY=127.0.0.1,localhost node e2e-screenshots/run.cjs
# E2E 用系统 Chrome（playwright-core 绝对路径 require），先后台起 dev 再跑；100 断言
```

本地联调凭证：`/Users/congwuzhang/work/src/end/script/.env` 的 `OPEN_PLATFORM_CLIENT_ID/SECRET/BASE_URL`；sift 侧 `.env.local` 映射为 `VITE_WM_CLIENT_ID/SECRET/API_BASE`（已 gitignore，**严禁提交或写进回复**）。真接口集成测试：`WM_E2E=1 npx vitest run src/data/wm/live.integration.test.ts`（5 条，默认 skip）。

### 2.2 文件地图（增量，含 Phase 6 新增）

| 文件 | 职责 |
| --- | --- |
| `src/engine/` | 纯 TS 引擎，**不依赖 Vue、不依赖 data 层** |
| `engine/schema/types.ts` | 三表字段；`PeriodReport.sampling`；`meta.auditOpinion/dataMode` |
| `engine/compute.ts` | `PeriodMetrics` 单期指标 + 杜邦；null 传播 |
| `engine/quarter.ts` | `deriveSingleQuarter`/`singleQuarterView`/`ttmFlowAt` |
| `engine/derivations.ts` | **`sum_all`（缺任一项→null）**；NCF 行修复 |
| `engine/utils.ts` | **`yoy()` 基期为正硬约束**（基期≤0→null） |
| `engine/methods/columns.ts` | 列组纯函数；`shareDenominator` 修 CF 各段分母 |
| `engine/methods/peersChart.ts` | `peersScatter`/`quantile`/`rankOf`（横截面） |
| `engine/methods/peerStatements.ts` | **`peerStatementTable(kind, main, others, {outlierGap})`**：同行业科目并排+中位数+排名+偏离，缺失不进统计 |
| `engine/analysis/mineDetect.ts` | 老唐排雷 10 项；四态；季度切同季同比 |
| `engine/analysis/qualityModels.ts` | Altman/Piotroski/Sloan/SGR/ROIC |
| `engine/analysis/beneish.ts` | **新增**：8 因子 M-Score，门线 −2.22/−1.78，DEPI 无字段→中性值，缺≥3 因子→na |
| `engine/analysis/anomalyScan.ts` | **新增**：同比±30% + 结构±5pct 双线扫描 |
| `engine/analysis/growthSources.ts` | **新增**：总资产增量瀑布拆解，缺失降级合并「股东的钱」 |
| `engine/analysis/itemSemantics.ts` | **新增**：41 科目 what/how/why/next 档案 |
| `engine/analysis/define.ts` | ChartSpec 增 `waterfall`/`heatmap`/`combo` 类型与字段 |
| `engine/schema/verify.ts` | 数据准入门禁；规则 9 = 相邻期营收/净利 YoY>±50% → warn |
| `src/data/wm/{client,mapper,cache}.ts` | 开放平台直连；mapper 缺失 null；缓存 v2 |
| `src/store/useApp.ts` | **provider 实例存普通变量**；`analysisDataset`；`compareTargets` ref + `estimateCompareEc()` |
| `src/features/charts/EChart.vue` | **新增 waterfall/heatmap/柱+线双轴** 翻译 |
| `src/components/ui/StatementTable.vue` | **条件选项 props**（yoy/结构阈值/只看跳变）+ 异动高亮 wb-flag-dot |
| `src/components/ui/LineItemDialog.vue` | **新增第 4 视图「解读」** + `initialMode` prop |
| `src/components/ui/PeerStatementTable.vue` | **新增**：`/compare` 同业横截面表，props main/others/outlierGap |
| `src/components/ui/FilterCollapse.vue` | **新增**：条件条窄屏收纳（≤767px 折叠成摘要行，桌面恒展开）；财报工作台与横截面表在用，`/compare` 勾选主交互区不用 |
| `src/components/ui/TableScroll.vue` | **新增**：表格横滚右缘渐隐指示（is-scrollable / is-at-end），ResizeObserver 自适应内容宽度 |
| `src/features/workbench/{Overview,Financials,Quality,Risk,Valuation}Workspace.vue` | 异动 Top6 区 / 条件条+深链 / 质量区挂载 / Beneish 首位+科目深挖 / 行业分位条 |
| `src/features/workbench/ComparePage.vue` | **重写**：勾选渐进加载 + EC 预估可见 + `estimateCompareEc`/`ecPerCompany` |
| `docs/VALUE_DEPTH_PLAN.md` | 本次价值深度调研与分批方案（Batch1/2/3 划分基线） |
| `docs/DESIGN_SPEC.md` | **v2.0 工作台规格（UI 唯一标尺）** |

### 2.3 开放平台接口事实（2026-10-21 实测，未变）

```
OAuth  POST {base}/v1/oauth/token  form: grant_type=client_credentials&client_id&client_secret → Bearer 7200s
取数   POST {base}/v1/skills/wm-data/run   body 必须 {"args":{...}}；错误在 X-Status 头或 body.error；401 清 token 重试；CORS 全开
base   默认 https://api.winmale.com
```

| action | EC 实测 | 关键结构 |
| --- | ---: | --- |
| `finance view=raw` | ~2,000/张 | `data.finance.raw` |
| `card` | ~2,400 | **`data.card`**；比率=小数（roe_ttm=0.3324→33.24%） |
| `members` | ~3,400 | items/aggregates 在 data 顶层（非 result）；key='白酒' 或 `industry.S340501` |
| `discover` | ~620 | hits[] |

EC 账：年度 5 年 ≈ 3 万（+card/members ≈ 3.6 万首刷）；季度 8 期 ≈ 5–11 万；10 年 ≈ 6 万；缓存 24h 后 0。**任何新功能第一个设计问题 = EC 账与缓存策略。** `/compare` 已做：默认 0 家 = 0 EC，勾选不自动取数，>0 EC 才弹确认。

### 2.4 口径铁律（违反 = 重大事故）

1. **累计 vs 单季**：季度统一走 `singleQuarterView`；同比必须同季（`sameQuarterYoyOf`）；**季节性模块禁止二次差分**。
2. **缺失 ≠ 0**：源缺失一律 null；引擎 null 传播；UI 显示 `—`；`?? 0` 是 bug（`growthSources` 缺 retained_earnings/share_capital 时合并「股东的钱」柱，绝不按 0 补齐）。
3. **缺数据 ≠ 安全**：排雷四态，na≥3 → `insufficient`；检查文案不许把「无法判断」说成「通过」。
4. **资产负债表是时点值**：不参与差分。
5. **单位**：内部全「元」，展示「亿元」；card/members 比率是小数。
6. **横截面分位 ≠ 历史分位**：members 分位必须注明口径与样本数 n。
7. **数据准入**：所有数据集渲染前过 `verifyDataset`，error 阻断。
8. **行业化**：白酒用 LIQUOR_T 阈值；金融企业直接提示不支持。
9. **color 语义两套不混用**：`is-up`/`is-down` = 升降方向（涨红跌绿，中国习惯）；`is-bad`/`is-good` = 好坏判读（红=警惕）。异动高亮用方向色，风险警示用判读色，别混。
10. **Beneish 缺失诚实**：DEPI（折旧率）数据源无字段→恒缺，按中性值代入 + UI 明示；缺 ≥3 因子整体置 na，不按 0 压低分。先款后货公司 DSRI 极低但文案须写「不携带信息」，不伪装成回款改善。

### 2.5 踩坑记录（勿重蹈）

1. **provider 实例不能进 `ref()`**——reactive 代理丢 `this`；存普通变量 + `providerKind` ref。
2. **应收票据映射**：用 `billsReceivable`，不用合并字段 `noteAccountsReceivable`（会重复）。
3. **members 响应**：items 在 `data` 顶层，非 `data.result.items`。
4. **换 AppId 必须清缓存**并重拉当前标的。
5. **验证 AppId** 用 `discover` 花 ~620 EC——文案禁写「0 EC」。
6. **workbench.css 纯 CSS**：注释 `/* */`；新样式进此文件（`.wb-*` 前缀），不建 .scss。
7. **E2E**：dev 必须 run_in_background；`NO_PROXY=127.0.0.1,localhost`；`waitForSelector` 不用固定 sleep；playwright-core 绝对路径 require。
8. **浮点断言** `toBeCloseTo`；**JS 无 `.at()`**（ES2020）。
9. 五粮液 2025 年报源数据利润表异常——样本已移除并 `meta.sourceNote` 注明，待数据源修复后重拉；verify 规则 9 自动拦期次错位。
10. **反 demo 红线**：无 emoji、无卡片墙、无营销 hero、无 0–100 伪精确总分；`DESIGN_SPEC.md` v2.0 唯一标尺。
11. **CF 共同比分母**：流量项÷营业总收入、期末现金÷总资产；拿经营现金流净额当整表分母会算出 −750%（CFO 负时）。
12. **NCF 行**：原误取 `net_cash_operating`（与 NCFO 重复）→ 改 `sum_all(经营+投资+筹资)`。
13. **`yoy()` 基期为负**：现金净增加额 −20→+196 亿会算出 −1070.7%（无解释力）→ 基期≤0 返回 null 引导看绝对额。
14. **深链 `watch(kind)` 吞下钻**：set `selectedItem` 被异步 watch 清掉 → 改用 `pickKind` + 手动 clear（不依赖 watch kind）。
15. **Beneish GMI/DEPI 方向**：初写 invert 把毛利率下滑读成「改善」→ 删 invert + 回归测试。
16. **growthSources 样本缺失**：仅近两期有 retained_earnings/share_capital → 缺失≠0 铁律，合并「股东的钱」柱。
17. **旧文档描述可能过时，实测为准**：ROADMAP「375px 佐证列被隐藏」写于 v1.0 重做前，重做后实为横滚+sticky 并无隐藏——375px 专项先截图量化诊断（条件条 316px 才是真凶）再动手，避免按过时描述修错方向。
18. **单季视图只许差分一次**：ctx.dataset 在季度模式已是 singleQuarterView 的产物，任何消费方（组件/引擎模块）不得再过一遍——二次差分会算出「Q2 = H1 − 2×Q1」的负营收（2026-10-22 泸州老窖线上事故）。新增季度消费路径时先确认数据来自 store.analysisDataset 还是原始 dataset。
19. **负值/空列先查口径链再谈展示**：用户看到「不协调」的表格（负营收、整列 —），根因几乎都在口径层（二次差分、窗口边界、映射缺字段），逐列复算原始值即可定位，别先改 UI。

---

## 第三部分 · 待办与决策（按优先级）

1. **commit / push（等用户指令）**：43 文件未 commit（`.zcode/` 已 gitignore 不入库）；本地 main 领先 origin 3 个提交，push 将一次上线 4 个提交（v1.0 重做 + PNG 导出 + 可访问性 + 本轮）。对外动作须显式确认；顺带决策 `package.json` 0.5.0→1.1.0 + 打 tag。
2. **E2E 进 CI**：GitHub Actions 装 Chrome 跑 `e2e-screenshots/run.cjs`（现仅本地，100 断言）。
3. **三表 peer 对比扩展到申万 L3 全成分**：需 AppId 验证行业成分（21 家 × 3 万 ≈ 63 万 EC），动手前必问用户是否接受消耗与分批策略；现行 `/compare` 已支持手动勾选，无需改架构。
4. **可选小项**：产销量/附注模块因依赖年报原文域（当前三表 schema 无该字段）未挂载，属数据源缺口非代码缺口；首页「热门公司」chips 可改 RouterLink；旧 `REVIEW_AND_PLAN.md`/`IMPLEMENTATION_PLAN.md` 描述旧 IA 可归档。
5. **远期**：BFF 共享缓存（官方站「打开即用」时再上）；更多行业镜头（引擎已通用，只差阈值表与样例）。

## 第四部分 · 工作方式约定

1. **先诊断后动手**：新需求先出结构化诊断/方案（带 [file:line] 证据），等确认优先级再改码；方案期只读。
2. **不擅自 commit/push**：中文提交信息、动机/方案/验证三段；push 须显式确认。
3. **接口诚实**：新接口先 curl 实测字段/单位再写映射（mapper 注释记实测日期）；数字凭实测，禁凭记忆补；发现异常回溯源头不静默修。
4. **每批次验收**：四门禁 + E2E 全绿才算完；引擎新逻辑必有单测（含「缺失→null」路径）；视觉改动重生成三视口基线。
5. **复用纪律**：只移植 script 公式与判定逻辑（注释标来源语义），不复制专有文案；引擎不引 UI 依赖；组件进 `components/ui` 前先确认 ≥2 处使用。
6. **交付物**：改动文件清单 + 关键数字验证（结论在茅台/五粮液/泸州老窖公开数据可交叉核对）+ 本次新增 EC 说明。
7. **遇到「继续/再试一下」类重试指令**：先排查根因（如 429 限频、缓存串数据、watch 异步吞状态）再决定是否重试，不要盲目重跑被阻断的任务。
