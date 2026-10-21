import type { AnalysisContext, AnalysisModule, AnalysisResult } from './analysis/define';
import type { IndustryKey } from './schema/types';
import type { ProblemId } from './schema/industry';
import { computeDataset } from './compute';
import { mineDetectModule } from './analysis/mineDetect';
import { roeModule } from './analysis/roe';
import { grossMarginModule } from './analysis/grossMargin';
import { netProfitModule } from './analysis/netProfit';
import { assetStructureModule } from './analysis/assetStructure';
import { inventoryModule } from './analysis/inventory';
import { fixedAssetsModule } from './analysis/fixedAssets';
import { productionSalesModule } from './analysis/productionSales';
import { footnoteModule } from './analysis/footnote';
import { cashFlowQualityModule } from './analysis/cashFlowQuality';
import { cashFlowTypeModule } from './analysis/cashFlowType';
import { qualityCheckModule } from './analysis/qualityCheck';
import { cashConversionCycleModule } from './analysis/cashConversionCycle';
import { profitDriversModule } from './analysis/profitDrivers';
import { qualityModelsModule } from './analysis/qualityModels';
import { seasonalityModule } from './analysis/seasonality';

export const MODULES: AnalysisModule[] = [
  mineDetectModule,
  cashFlowTypeModule,
  cashFlowQualityModule,
  qualityCheckModule,
  profitDriversModule,
  qualityModelsModule,
  seasonalityModule,
  roeModule,
  grossMarginModule,
  netProfitModule,
  assetStructureModule,
  inventoryModule,
  cashConversionCycleModule,
  fixedAssetsModule,
  productionSalesModule,
  footnoteModule,
];

export function getAllModules(): AnalysisModule[] {
  return MODULES;
}

export function getModule(id: string): AnalysisModule | undefined {
  return MODULES.find((m) => m.id === id);
}

// 按投资问题取模块
export function getModulesByProblem(problem: ProblemId): AnalysisModule[] {
  return MODULES.filter((m) => m.problems.includes(problem));
}

// 按行业聚焦：行业专属模块优先，通用模块（industries 为空）始终包含
export function getModulesByIndustry(industry: IndustryKey): AnalysisModule[] {
  const specific = MODULES.filter((m) => m.industries.includes(industry));
  const general = MODULES.filter((m) => m.industries.length === 0);
  const seen = new Set<string>();
  const out: AnalysisModule[] = [];
  for (const m of [...specific, ...general]) {
    if (!seen.has(m.id)) {
      seen.add(m.id);
      out.push(m);
    }
  }
  return out;
}

export function runModule(id: string, ctx: AnalysisContext): AnalysisResult | undefined {
  const mod = getModule(id);
  return mod ? mod.run(ctx) : undefined;
}

export function buildContext(
  ctx: Omit<AnalysisContext, 'computed'> & { computed?: AnalysisContext['computed'] },
): AnalysisContext {
  return { ...ctx, computed: ctx.computed ?? computeDataset(ctx.dataset) };
}
