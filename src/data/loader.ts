import type { ReportDataset } from '@/engine';
import { maotaiSample } from './samples/maotai';
import { manufacturingSample } from './samples/manufacturing';

// 内置示例数据集（开箱即用、纯前端离线）
// M1 收窄白酒：首页只展示 liquor 公司；manufacturing 保留为「行业化对照」样本（测试与对照用）
export const SAMPLES: ReportDataset[] = [maotaiSample, manufacturingSample];

// 首页公司卡片只展示白酒（DESIGN_SPEC §3.2：不再出现选行业步骤）
export const LIQUOR_SAMPLES: ReportDataset[] = SAMPLES.filter((s) => s.industry === 'liquor');

export function getSample(symbol: string): ReportDataset | undefined {
  return SAMPLES.find((s) => s.symbol === symbol);
}

export function listSamples(): { symbol: string; name: string; industry: string }[] {
  return SAMPLES.map((s) => ({ symbol: s.symbol, name: s.name, industry: s.industry }));
}
