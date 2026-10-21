# 动态化架构方案 —— 从「静态报告页」到「winmale-v2 精简版」

> 目标转变：M1 交付的是「数据烤死在 TS 文件里的静态报告」。本文档定义转向
> **动态选标的 + 接口访问 winmale server + 多场景分析** 的产品形态，即 `winmale-v2` 的精简开源版。

---

## 〇、现状问题

| 问题 | 现状 |
| --- | --- |
| 数据来源 | `src/data/samples/liquor/*.ts` 是 2026-10-21 手工拉取后硬编码的快照 |
| 可选标的 | 3 家，写死在 `LIQUOR_SAMPLES`，加一家要改代码 + 发版 |
| 数据新鲜度 | 财报更新后不会变，需人工重拉 |
| 场景 | 单一「财报排雷 + 质地体检」Hero，其余模块藏进「更多维度」折叠 |
| `WinmaleOpenProvider` | **接口路径是臆造的**（`/open/v1/stocks`、`/open/v1/finreport` 均不存在），从未联调 |

---

## 一、实测事实（2026-10-21 联调验证）

### 1.1 接口链路

| 环节 | 事实 |
| --- | --- |
| API Base | `https://api.winmale.com` |
| **鉴权** | `POST /v1/oauth/token`，`application/x-www-form-urlencoded`：`grant_type=client_credentials&client_id=<id>&client_secret=<secret>` → `{access_token}`，有效期 7200s |
| **取数** | `POST /v1/skills/{skill_id}/run`，`Authorization: Bearer <token>`，body 必须包装为 `{"args":{...}}`（顶层裸 `action` 会被拒：`ARGS_REQUIRED`） |
| 响应体 | `{success, data, error{code,message}, meta{request_id, metering{analysis.ec_cost, latency_ms}}}` |
| 响应头 | `X-Status`（JSON，URL-encoded），CORS 下需 `Access-Control-Expose-Headers: X-Status`（已开放） |
| **CORS** | `access-control-allow-origin: *` / `allow-headers: *` / `allow-methods: *` → **浏览器可直连，无需代理绕 CORS** |
| 可用 skill_id | `wm-data`（综合数据）、其余 skill 同形 |

### 1.2 EC 成本实测（决定架构的硬约束）

| 调用 | EC | 延迟 | 备注 |
| --- | --- | ---: | ---: | --- |
| `search`（搜标的） | 620 | 192ms | 便宜，可直接搜 |
| `card`（一页纸：行情/估值/分红/概念） | 2,252 | ~200ms | |
| `finance` `view=raw` 单期（1 张表） | 1,988 | 191ms | **含全部明细字段** |
| `finance` `view=key` 6 期 | 5,921 | 217ms | 中期汇总指标 |
| `finance` `view=h` 6 期 | 15,209 | ~300ms | 三表齐全但**只有汇总项** |

### 1.3 字段能力（决定必须走 `raw`）

`h` / `key` 视图只给**汇总项**：

```
income:  annual, audit_opinion, date_sas, h_np, h_npts, h_op, h_tr, report_date, sampling, sas
balance: annual, audit_opinion, date_sas, h_ta, h_te, h_tl, report_date, sampling, sas
cashflow:annual, audit_opinion, date_sas, h_ccf, h_ncf, h_ncff, h_ncfi, h_ncfo, report_date, sampling, sas
```

白酒引擎的关键明细——**合同负债 `contractLiab`、存货 `inventory`、在建工程 `constructioninProgress`、
销售收现 `salesServices`、购建固定资产 `constructLongAsset`、营业成本 `operateCost`、
销售费用 `saleExpense`**——**只存在于 `raw` 视图**（单期 88~90 字段）。

> **结论：完整报告 = 5 年 × 3 表 = 15 次 `raw` ≈ 2.98 万 EC / 家 / 次全量刷新。**

### 1.4 对照：winmale-v2 专业版怎么做的

| winmale-v2 | 事实 |
| --- | --- |
| 财报取数 | 不是 REST，而是 `EvalSvc.EvalScript` 执行 XS 脚本（`/wm/api/winmale/EvalSvc.EvalScript`） |
| 鉴权 | 用户 JWT（`Authorization: <token>`，cookie 中 wm token），非 AppId |
| 路径 | 网关式 `/wm/api/{微服务}/{Service}.{Method}`，业务走 protobuf 生成的 ClientImpl（实际发 JSON） |
| 财报页 | `features/analysis/pages/balance-sheet` → `eval.ts` 执行 `assets/pages/cn/company/资产负债表/read.xs` |
| 搜索 | `POST /wm/api/winmale/Base.SearchSymbol` |

> 精简版**不复用 v2 的 EvalSvc/XS 路径**（需要登录态 + 内部协议），改用**开放平台 `/v1/skills/{id}/run`**（AppId 鉴权，无需用户登录），这是开源可公开访问的正确入口。

---

## 二、架构候选

### 候选 A · 前端直连（零后端）

用户在 UI 或部署 env 填入自己的 ClientId + Secret（存 localStorage），前端自行换 token 后直连 `api.winmale.com`。

- ✅ 纯静态、GitHub Pages 直接可跑、零运维
- ✅ CORS 已验证全开，技术上可行
- ❌ **Secret 落在浏览器**：开源站若内置共享 AppId 等于公开密码
- ❌ 无跨用户共享缓存 → 每个访客首次访问都烧 3 万 EC
- ⚠️ 只适合「用户自带凭据的自部署/本地开发」场景

### 候选 B · BFF 薄代理（推荐）

一个极薄服务端，**代码开源在本仓 `server/`**，可一键部署到 Cloudflare Workers / Vercel / 自托管 Node。

- **持有 ClientId/Secret** 换 token（secret 永不接触浏览器）
- **缓存**：key = `symbol + periods + view`，年报 TTL ≥ 24h（财报年更，命中率极高）
- **限速**：按 IP + 会话；标的白名单可选（只允许白酒池，防任意标的被刷）
- **计量透出**：把 `meta.metering.ec_cost` 回传前端，让成本可见
- ✅ secret 安全；**跨用户共享缓存 → 成本降到 1/N**；可限速防刷
- ✅ 前端代码与主站一致，只是 base URL 指向 BFF
- ❌ 多一个部署物（但 Workers/Vercel 免费额度足够）

### 候选 C · 复用已有的开放平台 Go 后端

在 `../openplatform/backend`（Go + MongoDB，已有鉴权/限速/计量）加一组 report-lens 专用 endpoint。

- ✅ 基础设施现成
- ❌ 开源用户拿不到该后端 → 开源项目无法独立运行
- ❌ 与本项目解耦，迭代互相阻塞

### 决策：**B 为主 + A 为自部署兜底**

| 场景 | 走哪条 |
| --- | --- |
| 官方站点 `open-winmale.github.io` | BFF（共享缓存、共享 AppId、限速） |
| 自部署 / 本地开发 | 用户在设置里填自己的 AppId → 直连（A） |
| 两个都没有 | 内置 3 家快照（已有），**降级为 Demo 模式**，0 EC、即时可用 |

三条路共用**同一个 `ReportDataset` 出口契约**，引擎与 UI 完全不感知数据来源。

---

## 三、产品形态

### 3.1 动态选标的

| 能力 | 实现 | 成本 |
| --- | --- | --- |
| **搜索框**（拼音/名称/代码） | `wm-data` `action=search`，debounce 300ms | 620 EC/次，便宜 |
| **白酒池**（默认入口） | 内置 ~20 家白酒标的静态清单（名称/代码/香型/价格带），0 EC | 0 |
| **URL 直达** | `/#/analyze?symbol=600519`（已支持，需保留） | 0 |
| **自选对比** | 勾 2–3 家 → 并排横比（M3 已有设计） | 按家数 × 3 万 EC（缓存后趋 0） |
| 最近访问 | localStorage 记录 | 0 |

### 3.2 多场景分析

「场景」= 一个入口问题 + 一套 Hero 编排 + 一组模块。取代现在单一 Hero + 「更多维度」折叠。

| # | 场景 | 入口问题 | 编排（Hero 内容） | 数据需求 |
| --- | --- | --- | --- | --- |
| S1 | **防踩雷** | 这家公司会不会爆雷？ | 排雷清单（10 项三态）+ 结论 | `raw` 5 年三表 |
| S2 | **看质地** | 这门生意好不好？ | 六维体检分 + 强弱项 | 同上（复用） |
| S3 | **验真伪** | 利润是真金白银吗？ | 现金流质量 + 现金流八型 + 收现比 + 应收存货 | 同上（复用） |
| S4 | **看定价** | 现在贵不贵？ | PE/PB/股息率/估值分位 | `card`（2,252 EC，便宜） |
| S5 | **收息** | 靠分红能回本吗？ | 股息率 + 分红连续性 + 分红率 | `card` + 财报分红数据 |
| S6 | **比同行** | 白酒里谁最强？ | 多公司并排关键指标 | 多家 `raw` |

**关键设计**：S1/S2/S3 共用**同一份 `raw` 拉取结果**（一次 3 万 EC，三个场景都免费）。
→ 场景切换**不重新取数**，只在前端重新编排 Hero。这是成本可控的核心。

### 3.3 场景切换器形态

```
[ 贵州茅台 600519 · 酱香 · 超高端        🔍 搜索标的 ]
───────────────────────────────────────────────────
[防踩雷] [看质地] [验真伪] [看定价] [收息] [比同行]     ← 场景 Tab（切换零取数）
───────────────────────────────────────────────────
  场景 Hero（该场景的专属结论 + 证据）
```

---

## 四、分期实施

### P1 · 数据源重构（地基）

1. `src/data/wm/token.ts` — OAuth 换 token + 缓存（7200s，提前 5min 续期）
2. `src/data/wm/client.ts` — `POST /v1/skills/wm-data/run` 客户端，`{"args":{...}}` 包装，解析 `X-Status`
3. `src/data/wm/mapper.ts` — **`raw` JSON → `ReportDataset` 映射**（含字段名映射表、缺失= null 硬约束）
4. `src/data/wm/batch.ts` — 5 年 × 3 表批量拉取 + 并发控制 + 单期失败不炸全量（缺期降级）
5. `server/` — BFF（Hono，可跑 Cloudflare Workers / Vercel / Node）：
   - `POST /api/dataset` { symbol, periods } → 带缓存的完整 `ReportDataset`
   - `GET /api/search` { q } → 标的搜索
   - IP 限速 + 内存/KV 缓存 + EC 透出
6. `src/data/provider.ts` 重写为三模：`bff` / `direct`（自带 AppId）/ `snapshot`（内置快照）
7. 准入：拉取结果必须过 `verifyDataset`，不达标则拒绝渲染并提示

### P2 · 动态选标的

8. 搜索框组件（debounce + 下拉结果 + 键盘可达）
9. 白酒池静态清单 + 卡片（香型/价格带分组）
10. 路由 `?symbol=` + 最近访问 + 加载态/空态/错误态

### P3 · 多场景

11. `ScenarioTab` 场景切换器 + 6 个场景 Hero 组件
12. 场景级数据复用（一次取数，多场景编排）
13. `card` action 接入（报价/估值/股息），支撑 S4/S5

### P4 · 体验与成本护栏

14. 前端 SWR 缓存（localStorage/IndexedDB，按 `symbol+periods` 存）
15. 骨架屏 / 部分失败降级（缺某年数据 → 标注而非整页失败）
16. EC 成本可见（页脚显示本次消耗，BFF 透出）
17. E2E 扩展：动态搜索 → 选标的 → 切场景全链路

---

## 五、风险与对策

| 风险 | 对策 |
| --- | --- |
| **EC 被刷爆** | BFF 缓存（年报 TTL 24h）+ IP 限速 + 标的白名单 + 计量告警 |
| `raw` 单期失败 | 部分降级：缺期标注「数据缺失」，`verifyDataset` 出 warn 不 error |
| 拉取 15 次太慢（~3s） | 并发 5 + 服务端缓存；首屏先给快照秒开，真实数据到了再替换（SWR） |
| 用户填错 AppId | 明确的错误态文案 + 「回退快照」按钮 |
| CORS/网络失败 | 三级降级：BFF → 直连 → 快照 |

---

## 六、验收标准

- [ ] 搜索任意白酒标的 → 拉到真实 2021–2025 三表 → 出报告（**无需改代码发版**）
- [ ] 6 个场景切换，S1/S2/S3 共用一次取数（EC 只花一次）
- [ ] 二次访问同一标的**零 EC**（命中 BFF 缓存）
- [ ] 接口全挂 → 自动降级内置快照，页面仍可用
- [ ] typecheck / lint / 单测 / E2E 全绿
