// 财报透视引擎 —— 纯 TS，无框架依赖，可被 Vue / React 两端复用。
// 「复用 ../script 资产」的落点：schema 字段 ↔ stmt_tree.xs；衍生运算 ↔ derivations；
// ROE 杜邦 ↔ hroe_b2.xs；附注 ↔ note_*.xs；排雷 ↔ sys/audit + 老唐清单。

export * from './schema/types';
export * from './schema/industry';
export * from './schema/verify';
export * from './compute';
export * from './derivations';
export * from './utils';
export * from './analysis/define';
export { runMineDetect, mineChecks, mineVerdict } from './analysis/mineDetect';
export type { MineCheck, MineVerdict as MineVerdictType, MineSeverity, MineStatus } from './analysis/mineDetect';
export { runRoe } from './analysis/roe';
export { runGrossMargin } from './analysis/grossMargin';
export { runNetProfit } from './analysis/netProfit';
export { runAssetStructure } from './analysis/assetStructure';
export { runInventory } from './analysis/inventory';
export { runFixedAssets } from './analysis/fixedAssets';
export { runProductionSales } from './analysis/productionSales';
export { runFootnote } from './analysis/footnote';
export { runCashFlowQuality } from './analysis/cashFlowQuality';
export { runCashFlowType, flowTypeRows } from './analysis/cashFlowType';
export type { FlowTypeRow } from './analysis/cashFlowType';
export { runQualityCheck, qualityScoreOf } from './analysis/qualityCheck';
export type { QualityScore, QualitySub } from './analysis/qualityCheck';
export { runCashConversionCycle } from './analysis/cashConversionCycle';
export * from './registry';
export { LAOTANG_MINING_RULES, LAOTANG_DUPONT_NOTE, LAOTANG_GROSS_MARGIN_NOTE, LAOTANG_NOTE_QUALITY } from './laotang/rules';
