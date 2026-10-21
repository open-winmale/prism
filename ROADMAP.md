# Roadmap

> 原则：**一个英雄体验做透，其余维度降级。** 每一项都必须服务「排雷/质地体检」这个核心，拒绝大而无用。

## P0 — 上线与引流闭环 ✅（2026-10-21 完成）

- [x] **1. GitHub 建仓推送**：[open-winmale/report-lens](https://github.com/open-winmale/report-lens)，tag `v0.2.0`；CI 绿。
- [x] **2. 在线 Demo（GitHub Pages）**：<https://open-winmale.github.io/report-lens/>，main push 自动部署；线上 E2E 14/14 通过。
- [x] **3. 引流链路**：全部 CTA 统一带 `utm_source=report-lens&utm_medium=github`。

## P1 — Hero 做深最后一公里

- [ ] **4. 附注穿透闭环**：制造样例补应收账龄/存货构成/在建工程附注；排雷触发项「下一步核查」从纯文本改为**一键展开对应附注明细**。排雷→核查证据，点击即达。
- [ ] **5. 真实数据联调**（需 Open AppId）：WinmaleOpenProvider 对 `open.winmale.com` 实测，产出字段缺口清单（扣非/同业基准/附注），核对降级提示。
- [ ] **6. 移动端适配**：375px 视图 E2E 截图走查，修清单行/verdict 头窄屏布局。零售用户大多在手机上。

## P2 — 开源社区与质量信任

- [ ] **7. 社区入口**：good first issue ×2~3（排雷阈值可配置、内置行业基准常量表）。
- [ ] **8. E2E 进 CI**：Actions 安装 Chrome 跑 `e2e-screenshots/run.js`，作为 PR 门禁。
- [ ] **9. 首屏性能**：Lighthouse 基线一次；ECharts chunk（gzip 175KB）改首屏 dynamic import（Hero 首屏不依赖图表）。

## P3 — 谨慎扩展（P1 完成前不做）

- [ ] 10. 内置行业毛利率基准常量（消除无 AppId 时的 `na` 项——为「透」服务，非加模块）。
- [ ] 11. 新行业样例（如地产高负债画像）——每个样例必须服务排雷叙事。

## 明确不做

- 用户自建数据录入（数据源只走内置样例或赢麻了开放平台）。
- 多公司横向对比（超出「看懂一家公司」的范围）。
- 注册登录 / 账户体系（开源工具保持零门槛）。
