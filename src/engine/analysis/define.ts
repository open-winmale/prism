import type { ComputedDataset, PeriodMetrics } from '../compute';
import type { IndustryKey, ReportDataset } from '../schema/types';
import type { ProblemId } from '../schema/industry';

export type Severity = 'high' | 'mid' | 'low' | 'info';

// 通用图表描述（UI 层 EChart.vue 据此渲染 ECharts），与框架无关
export type ChartType =
  | 'line'
  | 'bar'
  | 'pie'
  | 'scatter'
  | 'stackedBar'
  | 'groupedBar'
  | 'waterfall'
  | 'heatmap'
  | 'table';

/** 参考线：yAxis（默认）或 xAxis 位置画虚线，如「CFO/NP=100%」「行业中位数」 */
export interface ChartRefLine {
  value: number;
  label?: string;
  axis?: 'x' | 'y';
}

/** 散点：同业横截面（ROE vs PE 等）；highlight=true 的点单独成系列高亮 */
export interface ChartPoint {
  name: string;
  x: number;
  y: number;
  highlight?: boolean;
}

/** 系列级画法：用于「柱 + 线」双轴组合（如营收柱 + 增速线） */
export interface ChartSeries {
  name: string;
  data: (number | null)[];
  area?: boolean;
  /** 该系列画成柱还是线；缺省跟随 spec.type */
  as?: 'bar' | 'line';
  /** 该系列画在右轴；存在即启用双轴 */
  axis?: 'left' | 'right';
}

/** 瀑布条目：isTotal 标记首尾的总数柱（整根落地），其余为增量柱（按正负悬浮） */
export interface WaterfallItem {
  categories: string[];
  values: (number | null)[];
  isTotal?: boolean[];
}

/** 热力矩阵：行优先扁平数组，长度 = rows.length × cols.length */
export interface HeatmapData {
  rows: string[];
  cols: string[];
  values: (number | null)[];
  /** 色阶范围；缺省自动取数据范围 */
  visualMin?: number;
  visualMax?: number;
  /** 单位后缀，默认 %（值为 0~1 的比例） */
  unit?: string;
}

export interface ChartSpec {
  type: ChartType;
  title?: string;
  unit?: string;
  note?: string;
  // 折线 / 柱状 / 组合
  categories?: string[];
  series?: ChartSeries[];
  // 参考线（阈值线 / 中位数线）
  refLines?: ChartRefLine[];
  // 散点
  points?: ChartPoint[];
  xLabel?: string;
  yLabel?: string;
  /** 右轴名称（存在右轴系列时必填，否则图例看不出单位） */
  yLabelRight?: string;
  // 饼图
  pie?: { name: string; value: number }[];
  // 表格
  table?: { columns: { key: string; cn: string }[]; rows: Record<string, unknown>[] };
  // 瀑布（增长来源拆解等）
  waterfall?: WaterfallItem;
  // 热力（季节占比矩阵、共同比逐年结构）
  heatmap?: HeatmapData;
  // 额外 ECharts option 覆盖
  option?: Record<string, unknown>;
}

export interface InsightBlock {
  id: string;
  title: string;
  severity?: Severity; // 红绿灯
  summary: string; // 结论性陈述
  charts: ChartSpec[];
  details?: string[]; // 支撑要点
  laotang?: string; // 老唐视角点评
}

export interface AnalysisResult {
  moduleId: string;
  moduleTitle: string;
  blocks: InsightBlock[];
  warnings?: string[]; // 数据缺口提示
}

export interface AnalysisContext {
  dataset: ReportDataset;
  computed: ComputedDataset;
  industry: IndustryKey;
  // 同业基准（可选，来自赢麻了后端或内置行业常量）
  peerBench?: Record<string, number>;
  /** 最新总市值（元）：Altman Z 的 x4 用；快照/无行情时为 null */
  marketValue?: number | null;
  /** 近 12 个月股息率（小数）：SGR 的留存率用；无行情时为 null */
  dividendYield?: number | null;
}

export interface AnalysisModule {
  id: string;
  title: string;
  desc: string;
  problems: ProblemId[]; // 适配的投资问题
  industries: IndustryKey[]; // 适用行业；空数组 = 通用
  run: (ctx: AnalysisContext) => AnalysisResult;
}

export type { PeriodMetrics };
