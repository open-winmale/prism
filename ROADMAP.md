# Roadmap

> 原则：**结论先行、证据随行、口径诚实；做透不做宽。**
> **定位（2026-10-21 重设）：个人投资者的专业版简化工作台。** 通用 A 股非金融 + 白酒作为第一个行业镜头；不做附注/F10/预测/提醒等专业版数据域。
> 重设计诊断与实施计划见 [`docs/REDESIGN_DIAGNOSIS.md`](./docs/REDESIGN_DIAGNOSIS.md)。
> 旧版评审见 [`docs/REVIEW_AND_PLAN.md`](./docs/REVIEW_AND_PLAN.md)（保留作历史基线）。
> UI/UX 标尺：[`docs/DESIGN_SPEC.md`](./docs/DESIGN_SPEC.md)（旧版规格；工作台新规格待回写）。

## 🔄 v1.0 重做 — 专业版简化工作台（进行中）

- [x] **Phase 0 · 信任修复**：数据来源标签、缺数据→数据不足、`verifyDataset` 接入、五粮液异常期移除、FCF 单位、ROE 驱动标准化、季度声明、环境变量、EC 透明。
- [x] **Phase 0 · 数据层**：`card`（估值/股息/行业层级）+ `members`（行业成分/分位）、mapper 补商誉/长借/债券/应收款项融资/扣非/利息费用、缓存扩展。
- [x] **Phase 1 · 工作台壳**：设计 token、AppTopbar、CompanyHeader、WorkspaceNav、KpiTile、VerdictStrip、DataTable、StatementTable、RiskRow、InsightList；路由 `/company/:symbol/:workspace`。
- [x] **Phase 2 · 概览 + 财报**：结论条、五维 KPI、营收趋势、Top 风险、同业迷你表；三表工作台（年度/季度、原值/同比/占比、CSV）。
- [x] **Phase 3 · 质量/风险/同业/估值/跟踪（首版）**：盈利驱动、现金流质量、CCC、风险四态、行业 table/分位、PE/PB/PS/PR/股息、跟踪清单。
- [x] **Phase 4 · Onboarding 首版**：首访阅读提示、示例模式、数据源内联引导、空态替代路径。
- [x] **Phase 5 · 质量模型首版**：Altman Z、Piotroski F9、Sloan 应计、SGR、ROIC−WACC + 单测（133 tests）。
- [x] **Phase 5 · 深度与可视化闭环**：三表列组（原值+同比/占比）、科目下钻 dialog、ChartFrame（参考线/来源/截至）、同业散点+分位条、概览 2×2 小倍数、风险证据回链、年份窗口（5/10 年）；E2E 重写 50/50 通过；三视口基线（home/overview/financials）。
- [x] **Phase 5 · 季度口径全量单季化**：`singleQuarterView` 统一分析口径（概览/质量/风险引擎模块消费单季视图）；三表季度视图单季化 + 同比(同季)；`mineDetect` 季度模式自动切同季同比（计数单位「期」）；单测 +9。
- [x] **Phase 5 · 旧 IA 清理与文档回写**：删除 AnalysisPage/Scenario*/ReportHero/QualityBars/ModuleResult/ConclusionBlock/VerdictHeader/MineChecklist/scenarios/CompanyPicker/ReportNav/CtaBanner/SeverityBadge/TermTip/Card；store 精简（去掉 view/scenario/problem/lastResult）；DESIGN_SPEC v2.0（工作台规格）与 DATA_MODEL v1.0 变更回写。
- [x] **Phase 5 · 收尾补全**：季节性模块季度口径修复（单季视图不再二次差分）+ 质量工作区按口径挂载；`/compare` 独立页（PeerPanels 复用，快照降级引导）；分享深链按钮；404 兜底路由；E2E 54/54。
- [ ] **后续候选（需 live 数据/新依赖决策）**：三表逐行 peer 对比（需 AppId 验证行业成分）、PNG 图片导出（需引入 html-to-image 类依赖或 ECharts getDataURL 方案）。

## ✅ 已完成 — 上线与引流闭环（2026-10-21）

- [x] GitHub 建仓推送：[open-winmale/report-lens](https://github.com/open-winmale/report-lens)，tag `v0.2.0`，CI 绿。
- [x] 在线 Demo（GitHub Pages）：<https://open-winmale.github.io/report-lens/>，main push 自动部署，线上 E2E 14/14 通过。
- [x] 引流链路：全部 CTA 统一带 `utm_source=report-lens&utm_medium=github`。
- [x] Hero 报告信息架构收敛：排雷体检报告为默认视图，其余维度折叠。

## ✅ M1 — 白酒化地基（2026-10-21 完成）

> 目标：定位收窄到白酒，补齐白酒数据模型，换上真实数据。

- [x] 1. schema 补齐：`contract_liabilities` / `advance_receipts` / 存货三明细；`ProductionSalesRow` 增加 `revenue` / `unitPrice` / `tier`；`verify.ts` 8 规则数据校验器。
- [x] 2. 行业 UI 只暴露白酒；制造样例改标「对照」，不进首页（分析页下拉可切）。
- [x] 3. **真实白酒数据 ×3（2021–2025 年报·经审计·合并口径）**：茅台 600519 / 五粮液 000858 / 泸州老窖 000568，经赢麻了开放平台拉取，勾稽校验 0 error。
- [x] 4. 报告头部显著标识「真实数据 / 示例数据」；首页文案白酒化。
- [x] 5. 首页信息架构改造：选公司 → 直接进报告；「问题」下沉为报告章节锚点。
- [x] 6. 引擎行业化（提前完成原 M2 #11/#12）：排雷阈值白酒版（应收降权/存货成品口径/CFO 三年均值+收现比豁免/毛利率对自身均值）+ 白酒六维体检分（na 权重剔除归一化）+ 渠道信心检查。
- [x] 7. Hero 组件化拆分 + DESIGN_SPEC 落地：锚点条/术语提示/EChart 品牌色与空数据占位/375px 佐证可见修复；三视口基线截图入库。

**验收结果**：3 家真实数据跑通 Hero（茅台 verdict=安全）；typecheck/lint/单测 66 条/E2E 24 条全绿；CI+Pages 部署绿。

## ✅ 动态化（2026-10-21，提前于 M2-M4 完成）

> 定位升级：静态报告页 → winmale-v2 精简版（动态选标的 + 接口取数 + 多场景）。

- [x] 接口直连赢麻了平台（OAuth + skill run + discover），CORS 全开浏览器直连，对齐 skillhub 约定。
- [x] 动态选标的：白酒池 21 家动态拉取 + 搜索框 + `?symbol=` 直达 + 设置面板（自带 AppId）。
- [x] 多场景：防踩雷/看质地/验真伪三 Tab，共用一次取数，切场景零 EC。
- [x] 成本护栏：数据集 24h 缓存 / 单表失败降级 / EC 透出 / 内置样本不走接口。
- [x] 修复：selectStock 竞态、财务公司现金口径误报、E2E 适配新 IA（29/29）。

## M2 — 白酒专属分析能力

> 目标：补上白酒投资人真正要看的东西（复用 Script 专业资产口径）。

- [ ] 6. 合同负债「蓄水池」模块：余额、占营收比、环比/同比 → 渠道信心与收入前瞻。
- [ ] 7. 量价拆解：营收 = 销量 × 吨价，量增 / 价增 / 结构 三项贡献拆分。
- [ ] 8. 毛利率 × 产品结构：高端 vs 系列酒占比对综合毛利率的驱动。
- [ ] 9. 销售费用率模块（品牌投入 vs 渠道压货的判别线索）。
- [ ] 10. 分红回报模块（股息率 / 股利支付率，复用 Script `bonus.xs`）。
- [ ] 11. **排雷规则行业化**：白酒版阈值与解释（存货改成品口径、现金流改三年滑动、毛利率改自身历史、应收降权）。
- [ ] 12. **体检分换维度**：白酒版七维（毛利率 / 净利率 / ROE / 收现比 / 合同负债占比 / 销售费用率 / 分红率）。

**验收**：任一白酒公司报告能回答「增长来自量还是价」「渠道还有没有信心」；白酒样例不再触发行业错配误报。

## M3 — 同业横向对比

> 目标：落地四大分析方法里此前最弱的一环——横向对比（老唐方法论的「同业对比」）。

- [ ] 13. 对比视图 `/compare`：5 家并列 × 5 指标（毛利率 / ROE / 收现比 / 合同负债 / 营收增速）+ 分位标注。
- [ ] 14. 报告内「vs 同业」锚点；`peerBench` 升级为结构化同业数据集（真实数据生成，标来源）。

**验收**：一键对比渲染正确；分位计算有单测覆盖。

## M4 — Hero 深挖 + 体验补齐

- [ ] 15. 附注穿透闭环：白酒补存货构成（基酒 / 半成品 / 库存商品）、应收账龄、销售费用明细、合同负债明细；触发项点击直达。
- [ ] 16. 术语 tooltip + 每个区块「为什么看这个」口径说明。
- [ ] 17. 移动端 375px 专项适配（当前佐证列在窄屏被隐藏，属信息丢失级别问题）。
- [ ] 18. 结论段情境化 CTA（转化意愿最强的时刻）。

## M5 — 专业版衔接与社区

- [ ] 19. Open AppId 真实数据联调，产出字段缺口清单与降级提示。
- [ ] 20. 白酒行业基准常量（真实数据生成并标来源）。
- [ ] 21. E2E 进 CI（Actions 装 Chrome 跑 `e2e-screenshots/run.js`）。
- [ ] 22. good first issue ×2；发布 v1.0。

## 明确不做

- 自建数据录入 / 手工填表（数据源只走内置真实样例或赢麻了开放平台）。
- 注册登录 / 账户体系 / 自选股持久化（开源工具保持零门槛）。
- 估值定价与目标价：只给方法与区间口径，**不给买卖时点与仓位建议**。
- 白酒以外行业（M5 前不支持，避免重回「通用工具什么都做不透」）。
- 通用化多行业框架（与「做透白酒」冲突）。
