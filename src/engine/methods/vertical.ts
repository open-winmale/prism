import type { ChartSpec } from '../analysis/define';
import type { Num } from '../schema/types';

// 方法四：纵向对比（共同比报表 common-size）
// 把报表每一项表示为「占总资产（资产负债表）或占营收（利润/现金流）的比例」，看结构随年份变化。
export interface CommonSizeRow {
  label: string;
  values: Num[]; // 与 periods 对齐（已为比例 0~1，或 null）
}

// 共同比堆叠：某年各项占合计的比例（百分比）
export function commonSizeStacked(
  categories: string[],
  series: { name: string; data: Num[] }[],
  title?: string,
): ChartSpec {
  return { type: 'stackedBar', title, categories, series };
}

// 共同比表格：行=科目，列=年份，值为百分比文本
export function commonSizeTable(
  columns: { key: string; cn: string }[],
  rows: Record<string, unknown>[],
  title?: string,
): ChartSpec {
  return { type: 'table', title, table: { columns, rows } };
}
