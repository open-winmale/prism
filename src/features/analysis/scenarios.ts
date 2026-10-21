import type { AnalysisResult } from '@/engine';

// 多场景定义。核心成本约束：S1/S2/S3 **共用同一份取数结果**（一次 5 年三表 ≈ 3 万 EC），
// 切场景只是前端重新编排，零额外取数。
//
//   S1 防踩雷 —— 这家公司会不会爆雷？（老唐排雷清单为主体，默认场景）
//   S2 看质地 —— 这门生意好不好？（六维体检分 + 盈利能力）
//   S3 验真伪 —— 利润是真金白银吗？（现金流质量 + 八型 + 营运效率）

export interface Scenario {
  id: string;
  label: string;
  icon: string;
  /** 入口问题（场景开场的那句话） */
  question: string;
  /** 头条结论来自哪个模块的第一个 block */
  headlineModule: string;
  /** 场景正文依次渲染的模块 */
  modules: string[];
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'mine',
    label: '防踩雷',
    icon: '🛡',
    question: '这家公司会不会爆雷？',
    headlineModule: 'mineDetect',
    modules: [],
  },
  {
    id: 'quality',
    label: '看质地',
    icon: '💎',
    question: '这门生意好不好？',
    headlineModule: 'qualityCheck',
    modules: ['roe', 'grossMargin', 'netProfit'],
  },
  {
    id: 'cash',
    label: '验真伪',
    icon: '💰',
    question: '利润是真金白银吗？',
    headlineModule: 'cashFlowQuality',
    modules: ['cashFlowType', 'cashConversionCycle', 'inventory'],
  },
];

export const DEFAULT_SCENARIO = 'mine';

export function getScenario(id: string): Scenario {
  return SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];
}

/** 头条结论：取该模块结果的第一个 block；模块缺数据时返回 undefined（UI 显示占位说明） */
export function scenarioHeadline(scenario: Scenario, run: (id: string) => AnalysisResult | undefined): AnalysisResult | undefined {
  const res = run(scenario.headlineModule);
  if (!res || res.blocks.length === 0) return undefined;
  return { ...res, blocks: [res.blocks[0]] };
}
