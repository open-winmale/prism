# 财报透视 · 赢麻了开源版

[![CI](https://github.com/open-winmale/report-lens/actions/workflows/ci.yml/badge.svg)](https://github.com/open-winmale/report-lens/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Vue 3](https://img.shields.io/badge/Vue-3.5-42b883.svg)](https://vuejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6.svg)](https://www.typescriptlang.org)

> 用一份财报，解决一个投资问题。
> 排雷体检报告 · ROE · 毛利率 · 资产质量 · 现金流 —— 基于老唐《手把手教你读财报》方法论，复用赢麻了专业版分析资产。

**财报透视**是一个面向基本面投资者的前端开源项目：你不是来「看一堆数字」的，而是带着一个具体的投资问题来的——「这家公司财务上有没有雷？」「它的 ROE 靠什么驱动？」「利润是不是真金白银？」。打开任一公司，默认进入的不是模块菜单，而是一份**排雷体检报告**：Verdict 三态判定、老唐九项排雷清单（安全项也解释为什么安全）、七维质量分、结论与下一步。其他分析维度收进「更多维度」，能力完整保留。

路线图见 [ROADMAP.md](./ROADMAP.md)。

本开源版默认使用内置演示数据，**通过赢麻了开放平台（Open AppId）可一键接入真实财报与行业基准**，并引流至 [赢麻了专业版](https://winmale.com) 获取完整附注分析、机构级数据与更深入的诊断。

---

## ✨ 特性

- **问题驱动**：先选投资问题（排雷 / 盈利能力 / 资产质量 / 经营质量），再按行业聚焦，系统推荐最该看的模块。
- **老唐排雷清单**：应收增速、存货增速、经营现金流含金量、其他应收款、大存大贷、商誉、非经常性损益、毛利率畸高、在建工程不转固——九道红绿灯。
- **四类分析方法**：趋势（同比/环比）、结构（占比/构成）、横向（同业对比）、纵向（共同比报表）——全部用 ECharts 可视化。
- **可复用纯 TS 引擎**：分析逻辑与框架无关（`src/engine`），可同时服务 Vue（本仓库）与 React（赢麻了专业版）前端；字段命名与赢麻了专业版 `../script` 的 `stmt_tree.xs` 一一对应。
- **开放平台接入**：内置 `SampleProvider`，可选 `WinmaleOpenProvider`（Open AppId）→ 真实数据 + 同业基准，数据缺口自动降级并提示。
- **合规友好**：内置免责声明，结论是「分析」不是「荐股」。

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

内置两个演示数据集：**演示·白酒龙头**（优质画像）与 **演示·制造（排雷样例）**（刻意构造多项财务异常，用于展示排雷预警）。

---

## 🔌 连接赢麻了开放平台（获取真实数据）

开源版默认用内置演示数据。若要接入真实财报与行业基准，复制 `.env.example` 为 `.env` 并填入开放平台 AppId：

```bash
cp .env.example .env
```

```ini
# .env
VITE_WINMALE_OPEN_APPID=你的开放平台AppId
VITE_WINMALE_OPEN_BASE=https://open.winmale.com
VITE_PRO_URL=https://winmale.com
```

填入后，数据提供方自动从内置示例切换为 `WinmaleOpenProvider`；缺失字段（如扣非净利润、同业毛利率基准）会优雅降级并在界面提示「连接赢麻了专业版补全」。

> 尚未拥有 AppId？前往 [赢麻了专业版](https://winmale.com) 开通开放平台权限，解锁全量真实数据与机构级附注分析。

---

## 🛡 排雷体检报告（核心体验）

打开任一公司，默认进入的不是模块菜单，而是一份**「排雷体检报告」**：

1. **Verdict 头**：安全 / 关注 / 高危 三态判定 + 七维质量体检分（0–100）+ 现金流八型标签；
2. **老唐排雷清单**：9 项检查全部展示（不只显示触发的）——每项含状态灯、关键证据、「为什么危险/为什么安全」、触发时的「下一步核查什么」与证据图，点击展开；
3. **质量体检构成**：毛利率 / 净利率 / ROE / 周转 / 杠杆 / 盈利含金量 / 应计利润，透明权重打分；
4. **结论与下一步**：把信号变成可核查的清单，而非一票否决。

> 设计原则：**一个英雄体验做透，其余维度降级**。ROE 杜邦、毛利率、现金流八型、现金转换周期、附注分析等 10 个维度收进「更多维度」折叠菜单，能力完整保留。

<details>
<summary><b>🧭 全部分析维度一览</b>（点击展开）</summary>

| 维度 | 解决的问题 | 位置 |
| --- | --- | --- |
| 财报排雷（老唐九项） | 造假 / 埋雷信号扫描 | 体检报告主体 |
| 质量体检七维分 | 公司「成色」一眼看穿 | 体检报告主体 |
| 现金流八型 | 造血结构「性格标签」 | 体检报告主体 |
| 现金流质量（收现比/含金量/FCF） | 利润是不是真金白银 | 体检报告证据链 |
| ROE 杜邦 | 盈利由什么驱动 | 更多维度 |
| 毛利率分析 | 盈利质量与护城河 | 更多维度 |
| 净利润分析 | 利润可持续性 | 更多维度 |
| 资产结构分析 | 轻 / 重资产画像 | 更多维度 |
| 存货分析 | 滞销 / 虚增库存 | 更多维度 |
| 现金转换周期 | 产业链话语权 | 更多维度 |
| 固定资产分析 | 产能与折旧政策 | 更多维度 |
| 产销量分析 | 量价与产销率 | 更多维度 |
| 附注分析 | 关键科目明细穿透 | 更多维度 |

</details>

新增模块只需在 `src/engine/analysis/` 实现一个 `run*` 函数并注册到 `src/engine/registry.ts`，详见 [`docs/ANALYSIS_MODULES.md`](./docs/ANALYSIS_MODULES.md)。

---

## 🏗️ 架构

```
src/
├── engine/            # 纯 TS 分析引擎（与框架无关，可被任意前端复用）
│   ├── schema/        # 数据模型：字段 ↔ ../script stmt_tree.xs 一一对应
│   ├── compute.ts     # 单期/杜邦指标计算
│   ├── derivations.ts # 派生指标（复用 stmt_tree.xs 的 drv 运算）
│   ├── methods/       # 趋势/结构/横向/纵向 四类分析方法
│   ├── laotang/       # 老唐排雷规则清单
│   ├── analysis/      # 各分析模块（run* + module 定义）
│   └── registry.ts    # 模块注册与按问题/行业路由
├── data/             # 内置示例 + 数据提供方（Sample / WinmaleOpen）
└── features/         # Vue 组件（问题驱动 UI、图表、结论卡片）
```

更多设计细节见 [`docs/`](./docs)：
- [架构设计](./docs/ARCHITECTURE.md)
- [数据模型与字段映射](./docs/DATA_MODEL.md)
- [`../script` 资产复用说明](./docs/SCRIPT_REUSE.md)
- [分析模块与老唐方法论](./docs/ANALYSIS_MODULES.md)
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
