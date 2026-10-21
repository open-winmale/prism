import type { ReportDataset } from '@/engine';
import { maotaiSample } from './samples/maotai';
import { manufacturingSample } from './samples/manufacturing';
import { dataset as moutai } from './samples/liquor/600519';
import { dataset as wuliangye } from './samples/liquor/000858';
import { dataset as luzhoulaojiao } from './samples/liquor/000568';

// 内置数据集（开箱即用、纯前端离线）
// M1：首页只展示真实白酒三家；manufacturing 保留为「行业化对照」样本（分析页下拉可切）；
// maotaiSample（演示）不再进首页，保留给单测做优质画像回归样例。
export const SAMPLES: ReportDataset[] = [moutai, wuliangye, luzhoulaojiao, manufacturingSample];

// 演示样本（仅测试用）
export const DEMO_SAMPLES: ReportDataset[] = [maotaiSample];

// 首页公司卡片只展示真实白酒（DESIGN_SPEC §3.2）
export const LIQUOR_SAMPLES: ReportDataset[] = [moutai, wuliangye, luzhoulaojiao];

export function getSample(symbol: string): ReportDataset | undefined {
  return SAMPLES.find((s) => s.symbol === symbol);
}

export function listSamples(): { symbol: string; name: string; industry: string }[] {
  return SAMPLES.map((s) => ({ symbol: s.symbol, name: s.name, industry: s.industry }));
}
