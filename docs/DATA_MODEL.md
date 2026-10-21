# 数据模型与字段映射

本文件说明 `src/engine/schema/types.ts` 的数据模型，以及它与赢麻了专业版 `../script/sys/rptdom/stmt_tree.xs` 的**字段一一对应**关系。

## 1. 单位约定

- **源数据单位：元**（与 `stmt_tree.xs` 聚源口径一致，避免「亿/万元」混用）。
- **展示层**：UI 统一换算为「亿元」（见 `utils.fmtYi`）。报告文字统一用「亿元」，不用 `RMB bn` 等含混单位。
- 比率类指标（毛利率、费用率、周转率）均为小数（0.91 = 91%），展示层用 `fmtPct` 转百分比。

## 2. ReportDataset（一份财报数据集）

| 字段 | 含义 |
| --- | --- |
| `symbol` / `name` | 标的代码 / 名称 |
| `industry` | 行业键（`liquor` / `manufacturing` / `cyclical` / `realestate` / `tech` / `general`） |
| `periods` | 期间列表（升序，如 `'2024-12-31'`） |
| `reports` | 各期三表，与 `periods` 对齐 |
| `footnote?` | 附注明细（见 §5） |
| `productionSales?` | 产销量（来自附注/行业，可选） |
| `disclaimer?` | 数据来源说明（示例/真实） |
| `peerBench?` | 同业基准，如 `{ gross_margin: 0.25 }` |

## 3. 三表字段 ↔ stmt_tree.xs `col` 映射

> `k` 为专业版内部键，`col` 为本仓库 `BalanceSheet` / `IncomeStatement` / `CashFlowStatement` 的字段名（二者同名，便于溯源）。

### 资产负债表（fin.balance_sheet）

| col | 中文 | 备注 |
| --- | --- | --- |
| `monetary_funds` | 货币资金 | MFNS |
| `trading_fin_assets` | 交易性金融资产 | TFA |
| `notes_receivable` | 应收票据 | NR |
| `accounts_receivable` | 应收账款 | AR（NRAR = NR + AR 之和） |
| `receivables_financing` | 应收款项融资 | FRRE |
| `prepayments` | 预付款项 | ADP |
| `other_receivables` | 其他应收款 | ORNET |
| `inventories` | 存货 | IO |
| `contract_assets` | 合同资产 | CAS |
| `other_current_assets` | 其他流动资产 | OCA |
| `total_current_assets` | 流动资产合计 | TCA |
| `fixed_assets` | 固定资产 | PPE |
| `cip` | 在建工程 | CIP |
| `right_of_use_assets` | 使用权资产 | URA |
| `intangible_assets` | 无形资产 | IA |
| `development_expenditure` | 开发支出 | DE |
| `goodwill` | 商誉 | GW |
| `long_term_deferred_expenses` | 长期待摊费用 | LTDE |
| `deferred_tax_assets` | 递延所得税资产 | DITA |
| `other_noncurrent_assets` | 其他非流动资产 | ONAS |
| `total_noncurrent_assets` | 非流动资产合计 | TNA |
| `total_assets` | 资产总计 | TA |
| `short_term_loans` | 短期借款 | — |
| `noncurrent_liab_1y` | 一年内到期非流动负债 | — |
| `long_term_loans` | 长期借款 | — |
| `bonds_payable` | 应付债券 | — |
| `lease_liabilities` | 租赁负债 | — |
| `total_current_liabilities` | 流动负债合计 | — |
| `total_liabilities` | 负债合计 | TL |
| `equity_parent` | 归属于母公司股东的权益 | SE |

### 利润表（fin.income_statement）

| col | 中文 | 备注 |
| --- | --- | --- |
| `total_revenue` | 营业总收入 | TR |
| `operating_cost` | 营业成本 | OC |
| `tax_and_surtax` | 税金及附加 | BTAS |
| `selling_expense` | 销售费用 | SEXE |
| `admin_expense` | 管理费用 | MEXE |
| `rd_expense` | 研发费用 | RD |
| `finance_expense` | 财务费用 | FE |
| `operating_profit` | 营业利润 | OP |
| `total_profit` | 利润总额 | TP |
| `income_tax` | 所得税费用 | TAX |
| `net_profit` | 净利润 | NP |
| `net_profit_parent` | 归母净利润 | — |
| `net_profit_excl_nonrecurring` | 扣非净利润 | — |

### 现金流量表（fin.cashflow_statement）

| col | 中文 | 备注 |
| --- | --- | --- |
| `cash_from_sales` | 销售商品、提供劳务收到的现金 | SSIR |
| `taxes_paid` | 支付的各项税费 | PATL |
| `net_cash_operating` | 经营活动现金流量净额 | NCFO |
| `capex_cash` | 购建长期资产支付的现金 | CLAR |
| `net_cash_investing` | 投资活动现金流量净额 | NCFI |
| `net_cash_financing` | 筹资活动现金流量净额 | NCFF |
| `cash_end` | 期末现金及等价物 | CCF |

## 4. 派生指标（PeriodMetrics）

这些指标在 `compute.ts` 计算，其公式与 `stmt_tree.xs` 的 `drv` 运算一致：

| 指标 | 公式 | 对应 drv |
| --- | --- | --- |
| `gross_margin` | (营收 − 成本) / 营收 | `margin(operating_cost, total_revenue)` |
| `selling_rate` 等 | 各项费用 / 营收 | `share(费用, total_revenue)` |
| `three_expense_rate` | 四费合计 / 营收 | `sum_share(total_revenue, [...])` |
| `current_ratio` | 流动资产 / 流动负债 | `div(TCA, TCL)` |
| `quick_ratio` | (流动资产 − 存货) / 流动负债 | `quick(TCA, TCL, m=inventories)` |
| `interest_bearing_debt` | 短借 + 一年内到期 + 长借 + 应付债券 + 租赁负债 | `sum([...])` |
| `debt_to_assets` | 负债 / 资产 | `div(TL, TA)` |
| `equity_multiplier` | 资产 / 归母权益 | `div(TA, SE)` |
| `cfo_to_net_profit` | 经营现金流 / 归母净利润 | `div(NCFO, NP_parent)` |

**杜邦（需相邻期均值，在 `withAvg` 补算）：**

| 指标 | 公式 |
| --- | --- |
| `net_margin_parent_dupont` | 归母净利润 / 营收 |
| `asset_turnover` | 营收 / 平均总资产 |
| `equity_multiplier_dupont` | 平均总资产 / 平均归母权益 |
| `roe_parent` | 净利率 × 总资产周转率 × 杠杆系数 |

口径对齐赢麻了 `sys/metric/hroe_b2.xs` 的**归母口径**杜邦分解（另含普通股口径，专业版更完整）。

## 5. 附注（FootnoteItem）

```ts
interface FootnoteItem {
  code: string;   // 专业版代码，如 IO=存货、MFNS=货币资金
  cn: string;
  period: string;
  source: string; // 'sina' | 'pdf'（与 note_query.xs 车道一致）
  sections: { title, columns, rows }[];
}
```

`code` 直接复用赢麻了专业版附注目录的专业代码，便于由 `rptdom.notes_for(sym, code, period)` 回填真实明细（见 [SCRIPT_REUSE.md](./SCRIPT_REUSE.md)）。

## 6. 产销量（ProductionSalesRow）

不在三大表内，来自附注或行业数据：`{ period, product?, production?, sales?, inventory?, unit? }`。用于产销量分析模块的「产销率」(sales / production) 等。

---

## 7. v1.0 变更（2026-10-21 · 工作台重做）

### 7.1 raw 字段映射（`data/wm/mapper.ts`）v2

| 目标字段 | raw 字段 | 用途 |
| --- | --- | --- |
| `notes_receivable` | `billsReceivable` | **应收票据单列**（不映射合并字段 `noteAccountsReceivable`，避免与 `accountsReceivable` 相加重复） |
| `receivables_financing` | `financeReceivable` | 应收合计 |
| `goodwill` | `goodwill` | 商誉检查 |
| `long_term_loans` / `bonds_payable` | `longTermLoans` / `bondPayable` | 有息负债 |
| `notes_payable` | `notePayable` | 应付合计 / DPO |
| `share_capital` | `shareCapital` | Piotroski「未增发」 |
| `retained_earnings` | `unassignRpofit` | Altman X2 |
| `net_profit_excl_nonrecurring` | `deductParentNetProfit` | 扣非 / 非经常性损益 |
| `interest_expense` | `feInterestExpense` | 利息保障 |
| `total_operating_cost` | `totalOperatingCost` | 营业总成本 |
| `contract_assets` | `contractAsset` | 合同资产 |
| `minority_interest` | `minorityEquity` | 少数股东权益 |
| `trading_fin_assets` | `tradingFinancialAsset` | 交易性金融资产 |
| `long_term_equity_investment` / `investment_property` | `longEquityInvest` / `investRealestate` | 资产结构 |

不可得（只来自附注/专业版）：存货三明细（原材料/半成品/成品）、分部收入、产销量、附注。

### 7.2 ReportDataset.meta 扩展

| 字段 | 说明 |
| --- | --- |
| `auditOpinion?` | 最新一期审计意见（raw `opinionType`），报告头展示 |
| `dataMode?` | `'annual' \| 'quarterly'`；季度模式标记，引擎据此切换同季同比 |

### 7.3 数据开放面（新增数据源）

| 源 | 内容 | 单位约定（实测 2026-10-21） |
| --- | --- | --- |
| `card` | PE/PB/PS(TTM)、ROE(TTM)、`pct_pe_3y`/`pct_pb_3y`（自身 3 年分位）、股息率（TTM/LYR）、营收/净利 TTM 同比、`industry_l1/l2/l3`、`org_type`、`quote_date` | 金额=元；**比率=小数**（0.3324→33.24%） |
| `members` | 行业成分（symbol/name/mv/pe_ttm/pb/ps_ttm/roe_ttm/close/percent）+ aggregates | 同上；items 在 data 顶层 |

### 7.4 缓存 v2（`data/wm/cache.ts`）

- key 前缀 `report-lens:v2:dataset:`（v1 语义变更自动失效）；entry 增加 `card` / `peers` / `missing`。
- 读写同时清理 legacy `report-lens:dataset:` 键。

### 7.5 AnalysisContext 扩展

| 字段 | 说明 |
| --- | --- |
| `marketValue?` | 最新总市值（元，来自 card.mv）；Altman X4 / SGR payout 用；缺失→相关模型显式「数据不足」 |
| `dividendYield?` | 股息率 TTM（小数）；SGR 留存率用 |

### 7.6 季度口径（单季视图）

- `quarter.singleQuarterView(reports)`：流量表（利润表/现金流量表）全部换成单季值（DIFFQ_YTD），资产负债表保持时点值；推不出的期次流量置 null。
- `columns.sameQuarterYoyOf(reports, values)`：同季同比（对去年同季，绝不用相邻期——那是环比）。
- store：`analysisDataset` = 季度模式下的单季视图数据集；**概览/质量/风险的引擎模块全部消费它**；三表工作台展示同一视图 +「同比(同季)」子列。
- `mineDetect`：应收/存货增速检查在季度模式下自动切同季同比，计数单位为「期」。

### 7.7 数据校验（verify.ts）新增

- 规则 9：相邻期营收/归母净利同比 >±50% → warn（期次错位/单位错误的信号；五粮液 2025 异常期已据此移除）。
- `provider` 对所有数据集（快照/缓存/实时）执行 `verifyDataset`：error 抛错阻断渲染，warn 透传 UI。
