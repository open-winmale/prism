// 六大问题域：经营 / 资产 / 负债 / 股东权益 / 利润 / 现金流。
// 这是「每个行业一个模版」的骨架：行业模版声明自己聚焦哪些域、每个域为什么值得盯，
// 突变检查发现信号后，按域归组、挂行业附注，形成「数据 + 图形 + 附注」的针对性说明。
//
// 域的划分标准（对应三大报表 + 资本结构）：
//   经营    —— 营运资金与经营性占款（应收/预付/其他应收/存货/应付/合同负债/收现）
//   资产    —— 资产的配置与质量（现金/产能/商誉/投资）
//   负债    —— 偿债压力与杠杆（流动/速动/有息负债/负债合计）
//   股东权益 —— 股本的增减与留存（股本/未分配利润/归母权益）
//   利润    —— 利润表的量价与费用（收入/毛利/费用率/净利）
//   现金流  —— 三大现金流与现金存量

export type DomainId = 'operating' | 'asset' | 'liability' | 'equity' | 'profit' | 'cashflow';

export interface DomainMeta {
  id: DomainId;
  name: string;
  /** 用户视角的问题 */
  question: string;
}

export const DOMAINS: DomainMeta[] = [
  { id: 'operating', name: '经营', question: '生意运转顺畅吗？营运资金被谁占用？' },
  { id: 'asset', name: '资产', question: '家底压在哪？资产质量实不实？' },
  { id: 'liability', name: '负债', question: '欠的钱压不压得住？杠杆安不安全？' },
  { id: 'equity', name: '股东权益', question: '股本有没有被稀释？利润有没有留下来？' },
  { id: 'profit', name: '利润', question: '赚不赚钱？量价与费用发生了什么？' },
  { id: 'cashflow', name: '现金流', question: '利润是不是真金白银？钱从哪来到哪去？' },
];

/** 科目（STMT_TREE 的 k）→ 问题域。先查经营域白名单，再按报表段兜底。 */
const OPERATING_KEYS = new Set([
  'NRAR', // 应收票据及应收账款
  'FRRE', // 应收款项融资
  'ADP', // 预付款项
  'ORNET', // 其他应收款
  'IO', // 存货（占款在下游/库存，归经营）
  'AP', // 应付票据及应付账款
  'CLC', // 合同负债
  'ARV', // 预收款项
  'SSIR', // 销售收现
]);

const LIABILITY_KEYS = new Set(['TCL', 'IBD', 'TL', 'LD', 'SD']);
const EQUITY_KEYS = new Set(['SC', 'RE', 'EQP', 'TE']);

export function domainOf(itemKey: string, kind?: 'balance' | 'income' | 'cashflow'): DomainId {
  if (OPERATING_KEYS.has(itemKey)) return 'operating';
  if (kind === 'income') return 'profit';
  if (kind === 'cashflow') return 'cashflow';
  if (LIABILITY_KEYS.has(itemKey)) return 'liability';
  if (EQUITY_KEYS.has(itemKey)) return 'equity';
  return 'asset';
}

export function domainMeta(id: DomainId): DomainMeta {
  return DOMAINS.find((d) => d.id === id) ?? DOMAINS[0];
}
