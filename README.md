# 财报透视（Prism）· 赢麻了开源版

[![CI](https://github.com/open-winmale/prism/actions/workflows/ci.yml/badge.svg)](https://github.com/open-winmale/prism/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Vue 3](https://img.shields.io/badge/Vue-3.5-42b883.svg)](https://vuejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6.svg)](https://www.typescriptlang.org)

> 个人投资者的专业版简化版：保留专业版的「期间 × 科目 × 对比 × 下钻」证据链，去掉机构级复杂度。
> 报告化工作台 · 三表 · 质量 · 估值 · 风险 · 跟踪 —— 结论先行，每个数字可核查，聚焦单公司研究。

**🌐 在线体验（免安装）**：<https://open-winmale.github.io/prism/>

> 本项目前身为 `open-winmale/report-lens`，2026-10-22 起更名迁移至本仓库。

**财报透视**是一个面向基本面投资者的前端开源项目：打开即看到一份完整的样板报告（默认贵州茅台），再沿着财报、质量、估值、风险、跟踪六个工作区逐层核查。顶部样板画廊可在消费白马、制造排雷等 4 个案例间切换，全部 0 EC。它把赢麻了专业版的分析框架（ROE 杜邦、现金流质量、排雷判据）移植成纯 TS 引擎，开源可见、逻辑透明，**聚焦单公司研究**（同业坐标作为估值页内嵌区块，不占独立导航）。

路线图见 [ROADMAP.md](./ROADMAP.md)。

本开源版默认打开内置样板（3 家真实白酒 + 1 个合成排雷样例）；通过赢麻了开放平台（AppId）可接入真实财报、行业成分与估值，并引流至 [赢麻了专业版](https://winmale.com) 获取附注、盈利预测、股东/公告与提醒等深度能力。

---

## ✨ 特性

- **打开即成品 + 样板画廊**：`/#/` 直接落到默认样板报告；顶部 4 个样板（3 家真实白酒 + 演示·制造）横向切换，快照 0 EC；搜索任意 A 股才走接口。
- **报告化工作台**：概览、财报、质量、估值、风险、跟踪六个工作区；结论先行，明细可下钻，不做「更多维度」垃圾桶。
- **专业三表**：5 年年度 / 8 季季度、原值/同比/占比、sticky 表头与首列、数字右对齐、缺失显示「—」、CSV 导出。
- **判据而不是打分**：排雷清单四态（触发/关注/安全/数据不足），每项带证据、为什么、下一步；Altman Z、Piotroski F9、Sloan 应计、SGR、ROIC−WACC 全部标注适用边界，缺数据不硬算。
- **只读核心趋势**：概览 2×2 小倍数与同业散点（ROE×PE）均为预设图；异动阈值、科目深挖默认方向由**行业模版**预设——用户只读报告与切换导航，不需要自己搭图表。
- **估值与同业坐标**：PE/PB/PS、自身 3 年分位、行业成分与横截面分位内嵌估值页，全部标注来源与样本数。
- **数据严谨性**：缺失≠0；累计≠单季；审计意见、报告期、数据截至、币种/单位常驻；金融企业直接提示不支持。
- **可复用纯 TS 引擎**：分析逻辑与框架无关（`src/engine`），可同时服务 Vue（本仓库）与 React（赢麻了专业版）。
- **开放平台接入**：内置示例 0 EC；填入自己的 AppId 后查任意 A 股非金融公司，首次约 3.6 万 EC、24h 缓存。
- **合规友好**：不荐股、不给目标价、不做买卖时点；内置免责声明与「估值只回答贵不贵」提示。

---

## 🚀 快速开始

要求 Node ≥ 18.18。

```bash
npm install
npm run dev        # 启动开发服务器（默认 http://localhost:5173）
npm run build      # 生产构建
npm run test       # 运行引擎单测（Vitest）
npm run typecheck  # 类型检查（vue-tsc）
npm run lint       # Lint（oxlint）
```

内置 4 个样板：**贵州茅台 / 五粮液 / 泸州老窖**（真实年度报表）+ **演示·制造（排雷样例）**（合成数据，刻意构造多项财务异常）。打开 `/#/` 会直接进入样板报告，顶部画廊切换。

---

## 🔌 连接赢麻了开放平台（获取真实数据）

开源版默认用内置演示数据。若要接入真实财报与行业基准，复制 `.env.example` 为 `.env` 并填入开放平台 AppId：

```bash
cp .env.example .env
```

```ini
# .env
VITE_WM_CLIENT_ID=你的开放平台ClientId
VITE_WM_CLIENT_SECRET=你的开放平台ClientSecret
VITE_WM_API_BASE=https://api.winmale.com
VITE_PRO_URL=https://winmale.com
```

填入后，数据提供方自动从内置示例切换为 `LiveProvider`；缺失字段（如扣非净利润、同业毛利率基准）会优雅降级并在界面提示「连接赢麻了专业版补全」。

> 尚未拥有 AppId？前往 [赢麻了专业版](https://winmale.com) 开通开放平台权限，解锁全量真实数据与机构级附注分析。

---

## 🧭 报告化工作台（核心体验）

打开 `/#/` 即进入默认样板报告（贵州茅台）的**概览工作台**；顶部样板画廊可切到五粮液、泸州老窖、演示·制造，全部 0 EC：

1. **结论条**：稳健 / 关注 / 高风险 / 数据不足 + 一句话 thesis + 3 条证据 + 2 条风险 + 数据完整度 + 审计意见；
2. **五维 KPI**：营收同比、ROE、毛利率、CFO/净利、PE 3 年分位，每项带 sparkline/行业中位数；
3. **Top 风险**：按严重度排序，点开看证据、为什么、下一步；
4. **同业坐标（内嵌）**：行业成分、PE/ROE/市值对比与行业横截面分位，当前公司高亮；
5. **六个工作区**：概览 / 财报 / 质量 / 估值 / 风险 / 跟踪（聚焦单公司研究；同业坐标内嵌在概览迷你表与估值页），桌面左栏、移动底部导航。

> 设计原则：**结论先行、证据随行、口径诚实**。不做 0–100 总分；缺数据不判安全；每个数字都能回到报告期/科目/公式/来源。

<details>
<summary><b>🧭 六个工作区</b>（点击展开）</summary>

| 工作区 | 回答的问题 | 主要内容 |
| --- | --- | --- |
| 概览 | 这家公司财务上怎么样？ | 结论条、五维 KPI、营收趋势、问题域异动信号、Top 风险、同业迷你表 |
| 财报 | 数字从哪里来？ | 三表、5 年/8 季、原值/同比/占比、sticky 表头、CSV |
| 质量 | 生意好不好、利润真不真？ | ROE/ROIC、毛利率/费用率、CFO/净利、应计、CCC |
| 估值 | 贵不贵？分红股本什么样？ | PE/PB/PS、自身 3 年分位、PR、股息率、总股本变动趋势、行业横截面分位 |
| 风险 | 有没有雷？ | 8–10 项判据、四态结论、证据/为什么/下一步 |
| 跟踪 | 接下来看什么？ | 3–5 个指标、阈值、什么会推翻结论 |
</details>

新增模块只需在 `src/engine/analysis/` 实现一个 `run*` 函数并注册到 `src/engine/registry.ts`，详见 [`docs/ANALYSIS_MODULES.md`](./docs/ANALYSIS_MODULES.md)。

---

## 🏗️ 架构

```
src/
├── engine/            # 纯 TS 分析引擎（与框架无关，可被任意前端复用）
│   ├── schema/        # 数据模型：字段 ↔ ../script stmt_tree.xs 一一对应
│   ├── compute.ts     # 单期/杜邦指标计算
│   ├── derivations.ts # 三表目录树与派生指标（复用 stmt_tree.xs 的 drv 运算）
│   ├── methods/       # 趋势/结构/横向/纵向 四类分析方法
│   ├── laotang/       # 老唐排雷规则清单
│   ├── analysis/      # 各分析模块（run* + module 定义）
│   └── registry.ts    # 模块注册与按问题/行业路由
├── data/              # 内置示例 + 数据提供方（Snapshot / Live）
├── components/
│   ├── layout/        # 预留
│   └── ui/            # 工作台组件：CompanyHeader / VerdictStrip / DataTable / RiskRow ...
├── features/
│   ├── workbench/     # 报告化工作台：概览/财报/质量/估值/风险/跟踪
│   ├── home/          # 关于/方法论/配额说明
│   └── charts/        # ECharts 适配层
└── styles/            # 主题 token、基础样式、工作台设计系统
```

更多设计细节见 [`docs/`](./docs)：
- [架构设计](./docs/ARCHITECTURE.md)
- [数据模型与字段映射](./docs/DATA_MODEL.md)
- [`../script` 资产复用说明](./docs/SCRIPT_REUSE.md)
- [分析模块与老唐方法论](./docs/ANALYSIS_MODULES.md)
- [全面评审与优化计划（白酒聚焦）](./docs/REVIEW_AND_PLAN.md)
- [M1 实施方案](./docs/IMPLEMENTATION_PLAN.md)
- [UI/UX 设计规格与还原度验收清单](./docs/DESIGN_SPEC.md)
- [简化对齐：行业模版 × 只读报告（2026-10-22）](./docs/SIMPLIFICATION_2026-10-22.md)
- [路线图](./ROADMAP.md) · [更新日志](./CHANGELOG.md)

---

## 🤝 参与贡献

欢迎 Issue / PR！新增分析模块、补充行业、修复排雷误报都很有价值。参见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

---

## ⚠️ 免责声明

本项目仅用于财务分析与教育目的，**所有结论均为基于输入数据的客观计算，不构成任何投资建议，亦不构成买卖任何证券的要约或招揽**。投资有风险，决策需谨慎。演示数据非真实财报，请以官方披露为准。

---

## 📄 开源协议

[MIT](./LICENSE) © 2026 赢麻了 / winmale.com
