# Changelog

本项目遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased] - 2026-10-21

### 🧭 专业版简化工作台（v1.0 重做）

- **工作台重构**：`/company/:symbol/:workspace` 七个工作区（概览/财报/质量/同业/估值/风险/跟踪），取消三场景 Tab 与「更多维度」；桌面左栏、移动底部导航。
- **深度闭环（对齐专业版「期间 × 科目 × 下钻」）**：三表列组（每期 原值+同比/占比 子列、双行表头、科目行可点）；科目下钻 dialog（趋势/同比/数据 三视图，ESC 关闭）；年份窗口 5/10 年（实时模式 EC 预估）；CSV 按当前列组导出。
- **可视化系统**：ChartFrame（标题/单位/来源/数据截至/参考线脚注）；ChartSpec 新增 `refLines` 与 `scatter`；收现比、CFO/净利、警戒线、行业中位数等参考线落地；概览 2×2 小倍数（营收/归母净利/毛利率/CFO/净利）。
- **同业可视化**：ROE vs PE 散点（当前公司高亮 + 中位数十字线）、PE/PB/ROE 横截面分位条；`engine/methods/peersChart.ts` 纯函数（引擎不依赖数据层）。
- **证据回链**：排雷检查标注对应科目字段，风险展开可「在财报中查看」。
- **信任修复**：数据来源按 dataset 实际来源标注；缺数据→「数据不足」而非「安全」；`verifyDataset` 接入所有渲染路径；五粮液 2025 异常利润表期次移除；FCF 单位修正；ROE 驱动按对数贡献/偏离标准化；季度声明改为「仅季节性单季、其余需年度」。
- **数据层**：新增 `card`（PE/PB/PS、3 年分位、股息、行业层级）与 `members`（行业成分/分位）；mapper 补商誉/长借/债券/应收款项融资/扣非/利息费用/股本/未分配利润；修正「应收票据及应收账款」重复计算；缓存升级 v2。
- **质量模型**：Altman Z、Piotroski F9、Sloan 应计、SGR、ROIC−WACC（WACC 5% 基准）；缺市值/科目不硬算。
- **UI 系统**：浅色研究终端 token、AppTopbar、CompanyHeader、VerdictStrip、KpiTile、DataTable、StatementTable、LineItemDialog、ChartFrame、RiskRow、InsightList；无 emoji、无卡片墙、数字 tabular-nums、表格 sticky。
- **验证**：单测 150 条、E2E 50/50（快照 0 EC）、四门禁全绿；三视口基线（home/overview/financials × 1440/768/375）。
- **季度口径全量单季化**：`singleQuarterView` 把流量表统一换成单季值（DIFFQ_YTD），概览/质量/风险的引擎模块在季度模式下全部消费单季视图；三表季度视图流量单季化、同比切换为**同季对比**（`sameQuarterYoyOf`）；`mineDetect` 应收/存货增速检查季度模式自动切同季同比（计数单位「期」）；推不出的期次显示「—」。**修复**：季节性模块在季度口径下不再对单季视图做二次差分（回归测试覆盖），并挂入质量工作区（仅季度口径展示）。
- **`/compare` 独立对比页**：复用 `PeerPanels`（KPI 分位 + ROE vs PE 散点 + 分位条 + 全行业表）；快照模式显式降级引导（申请 AppId / 看示例），不伪装数据；新增 404 兜底路由与「分享」深链复制按钮。
- **旧 IA 清理**：删除 AnalysisPage、ScenarioTabs/View、ReportHero、QualityBars、ModuleResult、ConclusionBlock、VerdictHeader、MineChecklist、scenarios、CompanyPicker、ReportNav、CtaBanner、SeverityBadge、TermTip、Card；store 精简（移除 view/scenario/problem/lastResult）。
- **文档**：DESIGN_SPEC v2.0（工作台 token/组件/三视口/反 demo 清单）；DATA_MODEL 增补 raw 映射 v2、card/members、缓存 v2、季度单季视图、verify 规则 9。最终单测 158 条。
- **安全**：换 AppId 清空旧缓存并重拉当前标的；校验失败阻断渲染；金融企业/数据不足显式提示。

## [0.5.0] - 2026-10-21

### 📊 内容深度 + 年季口径 + 免费 AppID 引导

- **AppID 申请流程页面化**：设置弹窗改为三步引导（申请说明 → 填写验证 → 完成），首屏绿色横幅提示「完全免费」，支持粘贴后自动验证（验证会发起一次检索，约 620 EC），首页 CTA 改「免费开通实时数据」。
- **看质地升级 · 盈利驱动分解**（对齐 script 盈利能力页 + 困境反转包）：ROE 三因子归因（产品/效率/杠杆）+ 各驱动力边际方向（拐点侦测）——揭示「高 ROE 靠什么、方向向上还是向下」，比 ROE 水平本身更重要。
- **验真伪升级 · 季节性分析**（对齐 script 季节性分析 + DIFFQ_YTD）：单季口径营收/利润、**单季 vs 去年同季**的可比同比、各年季节占比矩阵——识别春节效应与渠道行为变化。
- **年度/季度口径切换**：分析页一键切换。季度模式拉最近 8 个报告期；**单季值由累计值差分推导**（单季 = 本期累计 − 上期累计），杜绝「拿累计值当单季值」的口径错误；口径说明在页面明示。
- **引擎层单季/TTM 模块**（engine/quarter.ts，15 条单测）：deriveSingleQuarter / singleQuarterReports / ttmFlowAt / singleQuarterYoy，缺期返回 null 绝不猜。

### ⚙️ 修复

- 内置快照样本（茅台等三家）拦截所有口径请求 → 季度口径对精选三家无效；现仅年度口径走快照。
- 季节性/单季展示单位换算（元 → 亿元）。

## [0.4.0] - 2026-10-21

### 🔄 动态化：从静态报告页到「winmale-v2 精简版」

- **接口直连赢麻了平台**：`/v1/oauth/token`（client_credentials）+ `/v1/skills/wm-data/run`，浏览器直连（CORS 已验证全开）；对齐 skillhub 调用约定（`{"args":{...}}` 包装 / X-Status / 401 重试）。
- **动态选标的**：首页白酒池动态拉取（21 家 + 估值中枢，24h 缓存）；搜索框按名称/拼音/代码检索任意标的；`?symbol=` 直达；设置面板填自己的 AppId 即可（公开站默认不内置凭证）。
- **多场景分析**：防踩雷 / 看质地 / 验真伪三个场景 Tab，**共用同一次取数**（切场景零 EC）；每个场景一个入口问题 + 头条结论 + 编排正文。
- **成本护栏**：全量刷新一家公司 ≈ 3 万 EC → 数据集本地缓存 24h（重复查看 0 EC）；单表失败降级不炸全量；EC 消耗透出展示。
- **架构文档**：`docs/DYNAMIC_ARCHITECTURE.md` 记录实测接口契约、EC 成本表、三模架构决策。

### ⚙️ 修复

- `selectStock` 竞态：立即标记 `currentSymbol` + 请求序号丢弃过期响应（URL 指定标的不再被默认选中覆盖）。
- 现金口径：识别集团财务公司（存放央行/同业款项计入期末现金但不在货币资金），校验器不再对茅台/五粮液误报。
- 内置样本（制造对照）在 live 模式下直接走快照，不再打到接口。

## [0.3.0] - 2026-10-21

### 🍶 M1 白酒化：定位收窄 + 真实数据

- **真实白酒数据 ×3**：贵州茅台/五粮液/泸州老窖 2021–2025 年度合并报表（经审计），经赢麻了开放平台拉取，勾稽校验 0 error；首页公司卡片直达报告。
- **引擎行业化**：排雷规则按行业取阈值——白酒版应收降权（先款后货）、存货改成品口径（基酒是竞争力）、经营现金流 3 年均值+收现比豁免（预收款扰动）、毛利率对自身 5 年均值（90% 毛利是护城河）；新增白酒专属「渠道信心」检查（合同负债蓄水池连续缩水报警）。
- **体检分白酒六维**：收现比/合同负债蓄水/销售费用率换入，周转/杠杆/应计移出；na 维度权重从分母剔除归一化（禁止把缺失当 0 分拉低）。
- **数据校验器 `verify.ts`**：8 规则勾稽校验（资产=负债+权益/期次对齐/单位量级/现金对账），作为样例与真实数据准入门禁。
- **IA 改造**：首页去「选行业」步骤，公司卡片直达；「问题」下沉为报告章节锚点条；Hero 拆分为四个可复用 Zone 组件。
- **UI 规格**：注入品牌序列色、空数据占位、375px 佐证可见修复、示例/真实数据标签强化、术语提示组件；三视口基线截图入库 `e2e-screenshots/ui-baseline/`。

### ⚙️ 质量

- 测试 24 → 66（数据校验器 12 + 行业化规则 13 + 真实数据准入 15 + 既有回归）；E2E 14 → 24 断言。

## [0.2.0] - 2026-10-20

### 🎯 信息架构重构：一个英雄体验做透

- **新增「排雷体检报告」Hero 视图**（默认视图）：Verdict 三态头（安全/关注/高危）+ 七维质量体检分环形图 + 老唐排雷清单（9 项全部展示、逐项可展开「为什么危险/为什么安全 + 证据图 + 下一步核查」）+ 质量七维构成条 + 结论与下一步。
- **菜单收敛**：原 13 模块平铺 → 1 个 Hero 报告 + 「更多维度」折叠（10 个次级维度）。排雷/质量体检/现金流质量转为 Hero 数据源，不再单独开门；能力全部保留。
- **问题语境条**：首页选择的「投资问题」在分析页顶部持续可见（此前选完即丢失），问题驱动真正闭环。

### ⚙️ 引擎（纯 TS，Hero 与模块共享口径）

- `mineDetect` 重构：`mineChecks()` 输出每项检查的完整档案（evidence/why/next/laotang/chart），`mineVerdict()` 输出三态综合判定；安全项也生成解释（此前安全项不可见）。
- `qualityCheck` 重构：抽出 `qualityScoreOf()` 七维透明加权评分（毛利率 15/净利率 15/ROE 20/周转 10/杠杆 10/盈利含金量 20/应计 10），Hero 与模块共用。
- `cashFlowType` 抽出 `flowTypeRows()` 八型编码（CFO/CFI/CFF 符号 → 蛮牛/老母鸡/奶牛/女巫/蝙蝠/赌徒/躺平/咸鱼）。
- 新增 `cashFlowQuality`（销售收现比/盈利含金量/FCF，源自 Script「现金流量」「真金白银包」资产）、`cashConversionCycle`（应收/存货/应付周转天数 + CCC，源自 `ccf.xs`；零应收不再断链）。
- 样例补 `accounts_payable` 字段；制造排雷样例 2024 年现金流改为「赌徒型」（经营失血、筹资续命），与大存大贷叙事自洽。

### ✅ 质量

- 测试 13 → 24（新增：八型判定、质量分两样例校准、CCC 零应收、排雷档案 verdict/next 完整性）。
- typecheck 0 错误；lint 0 警告；build 无告警；preview 冒烟 HTTP 200。

## [0.1.0] - 2026-10-20

- 首个可运行 MVP：Vue3 + Vite + TS + UnoCSS + ECharts（tree-shaking 单 chunk）。
- 纯 TS 分析引擎（schema ↔ stmt_tree.xs 一一对应；ROE 杜邦 ↔ hroe_b2.xs；附注 ↔ note_*.xs）。
- 9 个分析模块 + 老唐排雷清单 + 问题驱动首页 + 数据 Provider 抽象（SampleProvider / WinmaleOpenProvider）。
- 开源治理：MIT、README、CONTRIBUTING、CoC、CI、dependabot、docs 四篇。
