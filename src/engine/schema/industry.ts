import type { IndustryKey } from './types';
import type { DomainId } from './problems';

// 投资问题（用户入口先选「问题」，再聚焦模块）—— 对应「以解决某个投资问题为主要设计思路」
export type ProblemId = 'risk' | 'profitability' | 'assetQuality' | 'operations';

export interface ProblemMeta {
  id: ProblemId;
  question: string; // 用户视角的投资问题
  title: string;
  desc: string;
  icon: string; // 用于 UI 展示
}

export const PROBLEMS: ProblemMeta[] = [
  {
    id: 'risk',
    question: '这家公司财务造假 / 爆雷风险高吗？',
    title: '财报排雷',
    desc: '用老唐排雷清单逐项扫描：应收、存货、经营现金流、商誉、其他应收、大存大贷等红绿灯。',
    icon: '🛡️',
  },
  {
    id: 'profitability',
    question: '这门生意赚不赚钱、能不能持续？',
    title: '盈利质量',
    desc: 'ROE 杜邦拆解、毛利率趋势与结构、净利润含金量，看清利润是真金白银还是纸面富贵。',
    icon: '💰',
  },
  {
    id: 'assetQuality',
    question: '资产厚不厚实？钱压在哪里？',
    title: '资产质量',
    desc: '资产结构轻重、固定资产效率、商誉与有息负债，判断家底虚实。',
    icon: '🏦',
  },
  {
    id: 'operations',
    question: '东西卖得动吗？产能匹配吗？',
    title: '营运与产销',
    desc: '存货周转、产销量匹配、固定资产产能利用，看经营链条是否顺畅。',
    icon: '📦',
  },
];

export interface IndustryMeta {
  key: IndustryKey;
  name: string;
  focus: ProblemId[]; // 该行业最该关心的投资问题
  note: string;
  /**
   * 行业模版：预编排的默认阅读参数。
   * 简化版的原则是「报告是预先编排好的，用户只读」——
   * 阈值、默认深挖方向都由行业模版给出，不再暴露给用户逐项配置。
   */
  template: {
    /** 同比异动高亮阈值（小数） */
    yoyThreshold: number;
    /** 结构占比异动阈值（百分点，小数） */
    shareThreshold: number;
    /**
     * 重要性下限（小数）：科目占总资产/营收比重低于此值不报突变——
     * 占比非常小（如 0.3% 的科目翻倍）不构成有意义的突变，避免小数点级噪音刷屏。
     */
    minShare: number;
    /** 三张表默认展开的科目深挖方向（id 与工作台 DEEP_TABS 对应） */
    defaultDeep: { income: string; balance: string; cashflow: string };
    /**
     * 六大问题域的行业附注：为什么这个行业要盯这个域（有数据支撑的行业逻辑）。
     * 缺省域 = 该行业此域按通用逻辑读。
     */
    domains: Partial<Record<DomainId, string>>;
    /** 科目级行业附注：突变说明里追加的针对性解读（键 = STMT_TREE 的 k） */
    itemNotes: Record<string, string>;
  };
}

/** 通用模版：非聚焦行业回落到此（阈值与旧默认一致） */
const GENERAL_TEMPLATE: IndustryMeta['template'] = {
  yoyThreshold: 0.3,
  shareThreshold: 0.05,
  minShare: 0.01,
  defaultDeep: { income: 'grossMargin', balance: 'assetStructure', cashflow: 'cashFlowQuality' },
  domains: {
    operating: '营运资金看占用：应收/存货增速长期快于营收，说明生意在变差',
    asset: '看钱压在哪：现金、产能、商誉的占比与变化决定资产质量',
    liability: '有息负债对照货币资金：大存大贷、短债长投都要追问',
    equity: '股本变动=稀释，未分配利润=积累：两者方向决定每股口径的成色',
    profit: '毛利率是议价权刻度，费用率是管理效率刻度',
    cashflow: 'CFO/净利长期 ≥1，利润才是真金白银',
  },
  itemNotes: {},
};

export const INDUSTRIES: IndustryMeta[] = [
  {
    key: 'liquor',
    name: '白酒 / 高端消费',
    focus: ['profitability', 'risk'],
    note: '聚焦毛利率、合同负债(预收款)、净利率与排雷；先款后货、高毛利是护城河信号。',
    template: {
      // 白酒毛利率是生意核心，异动阈值收紧到 20% / 3pct；深挖首看毛利与资产结构
      yoyThreshold: 0.2,
      shareThreshold: 0.03,
      minShare: 0.01,
      defaultDeep: { income: 'grossMargin', balance: 'assetStructure', cashflow: 'cashFlowQuality' },
      domains: {
        operating: '先款后货：合同负债（经销商预付）是蓄水池与需求领先指标；应收接近零是行业常态',
        asset: '钱压在哪主要看货币资金与存货——基酒（半成品）增长是竞争力，成品酒激增才是滞销',
        liability: '几乎无偿债压力：有息负债应接近零；应付/预收大是占用上下游话语权，越大越好',
        equity: '股本长期稳定是行业常态：高 ROE 支撑内生增长，频繁增发反而要警惕',
        profit: '毛利率 70%+ 是生意底色：毛利下滑比营收下滑更严重；费用克制是品牌力的体现',
        cashflow: '收现比 ≈1+（含增值税）；CFO/净利长期 >1，利润以现金形式落袋',
      },
      itemNotes: {
        IO: '白酒存货按基酒/成品分开看：基酒（半成品）增长是主动储备竞争力，成品酒激增才是滞销信号',
        CLC: '合同负债 = 经销商打款意愿，是营收的领先指标：骤降往往先于营收失速，白酒第一盯的科目',
        MFNS: '白酒账上现金充沛是常态；「大存大贷」在白酒语境下仍是资金真实性疑点',
        GM: '白酒毛利率 70%+ 是护城河刻度：下滑通常意味着产品结构降档或渠道返利加大',
        NRAR: '白酒应收应接近零：出现应收激增 = 放渠道信用换收入，行业罕见、必须查原因',
      },
    },
  },
  {
    key: 'manufacturing',
    name: '制造业',
    focus: ['operations', 'assetQuality', 'profitability'],
    note: '聚焦固定资产效率、产销量匹配、存货周转与 ROE。',
    template: {
      yoyThreshold: 0.3,
      shareThreshold: 0.05,
      minShare: 0.01,
      // 制造业先看资产结构与存货，再看利润含金量
      defaultDeep: { income: 'netProfit', balance: 'assetStructure', cashflow: 'cashConversionCycle' },
      domains: {
        operating: '营运资金是利润的隐形消耗：应收/存货增速长期快于营收 = 信用换收入或滞销',
        asset: '资产重：固定资产与在建工程决定折旧曲线与产能周期，转固时点压制未来利润',
        liability: '有息负债服务于产能扩张：扩张期上升可解释，收缩期仍高要警惕',
        equity: '看未分配利润积累与增发频率：靠增发长大的净资产会稀释 ROE',
        profit: '毛利率反映议价权：原材料涨价周期能否守住毛利是竞争力的直接检验',
        cashflow: 'CFO 覆盖 capex 之后应有余（FCF>0）；长期靠筹资输血的制造业要排除',
      },
      itemNotes: {
        PPE: '制造业固定资产 = 产能：激增后 1–2 年折旧压制利润，需对照营收增速能否消化',
        CIP: '在建工程长期挂账不转固 = 推迟折旧、虚增利润的常见手法，制造业尤其要盯',
        IO: '存货增速对照营收：原材料备货（涨价预期）与成品积压（滞销）含义相反，拆构成看',
        CLAR: '购建长期资产现金 = 产能投入强度：连续高于 CFO 意味着在透支扩张',
      },
    },
  },
  {
    key: 'cyclical',
    name: '周期 / 资源',
    focus: ['operations', 'profitability'],
    note: '聚焦产销量、产能利用率与盈利的周期性摆动。',
    template: {
      // 周期行业波动大，同比阈值放宽到 50%，避免整页飘红
      yoyThreshold: 0.5,
      shareThreshold: 0.1,
      minShare: 0.01,
      defaultDeep: { income: 'grossMargin', balance: 'fixedAssets', cashflow: 'cashFlowType' },
      domains: {
        operating: '量价同行：存货与合同负债的方向常常先于价格拐点',
        asset: '重资产 + 折旧刚性：产能利用率是盈利杠杆，闲时重、旺时轻',
        liability: '周期底部杠杆高是常态：看现金对短债的覆盖，能否活到周期回暖',
        equity: '周期股增发多发生在景气顶（高股价融资），摊薄后每股口径要重算',
        profit: '毛利率的历史位置比同比趋势重要：低位 + 供给出清才是反转观察条件',
        cashflow: '景气顶 CFO 最好时恰是 capex 最猛时：警惕「利润最大化 → 产能最大化」循环',
      },
      itemNotes: {
        GM: '周期股毛利率处历史低位且供给出清时才是反转观察点；单看同比会追高杀低',
        IBD: '周期底部的有息负债是生存指标：现金短债比 <1 的公司在赌周期回暖的时点',
      },
    },
  },
  {
    key: 'realestate',
    name: '地产 / 商贸',
    focus: ['risk', 'assetQuality'],
    note: '聚焦存货(土储/库存)、预收、有息负债与排雷。',
    template: {
      yoyThreshold: 0.3,
      shareThreshold: 0.05,
      minShare: 0.01,
      defaultDeep: { income: 'netProfit', balance: 'inventory', cashflow: 'cashFlowType' },
      domains: {
        operating: '预收/合同负债 = 已售未结，是利润的蓄水池：蓄水池见底先于利润失速',
        asset: '存货 = 土储与在建：去化速度与减值风险是资产端核心',
        liability: '三道红线口径：有息负债与现金短债比决定生死',
        equity: '少数股东权益占比异常高可能是明股实债，需对照少数股东损益',
        profit: '结转利润滞后于销售 1–2 年：看利润不如看预收变化',
        cashflow: 'CFF 大进大出是行业常态；CFO 长期为负、靠筹资续命要警惕',
      },
      itemNotes: {
        IO: '地产存货 = 土储 + 在建：对照销售速度看去化；利息资本化率影响真实毛利率',
        CLC: '地产合同负债 = 预售楼款：见底说明卖不动或没货卖，先于报表利润反映',
      },
    },
  },
  {
    key: 'tech',
    name: '科技 / 软件',
    focus: ['profitability', 'assetQuality'],
    note: '聚焦研发费用率、毛利率与轻资产质量。',
    template: {
      yoyThreshold: 0.3,
      shareThreshold: 0.05,
      minShare: 0.01,
      defaultDeep: { income: 'grossMargin', balance: 'assetStructure', cashflow: 'cashFlowQuality' },
      domains: {
        operating: '轻资产经营：应收与合同负债反映客户议价权与订单前瞻',
        asset: '核心资产是人：无形资产/开发支出的资本化比例决定利润成色',
        liability: '有息负债少：看应付与预收的经营性占款方向',
        equity: '增发与股权激励频繁：股本变动与股份支付摊销都要还原再比较',
        profit: '研发费用率是投入刻度：资本化处理会美化利润，务必对照现金流',
        cashflow: 'CFO 长期为正才配得上高估值；净利与 CFO 背离常见于应收/资本化',
      },
      itemNotes: {
        RD: '研发费用 vs 资本化：开发支出激增 = 把费用藏进资产，当期利润虚高、未来折耗反噬',
      },
    },
  },
  {
    key: 'general',
    name: '其他 / 通用于全行业',
    focus: ['risk', 'profitability', 'assetQuality', 'operations'],
    note: '排雷、ROE、资产结构等通用模块全部可用。',
    template: GENERAL_TEMPLATE,
  },
];

export function getIndustry(key: IndustryKey): IndustryMeta {
  return INDUSTRIES.find((i) => i.key === key) ?? INDUSTRIES[INDUSTRIES.length - 1];
}

/** 取行业模版（未知行业回落通用模版） */
export function industryTemplate(key: IndustryKey | undefined): IndustryMeta['template'] {
  return getIndustry(key ?? 'general').template;
}
