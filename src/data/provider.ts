import type { IndustryKey, ReportDataset } from '@/engine';
import { LIQUOR_SAMPLES, SAMPLES, getSample } from './loader';

// 数据提供方抽象：默认走内置示例，可选连接赢麻了开放平台（Open AppId）获取真实财报。
// 设计对齐 ../skillhub 的「通过 Open AppId 连后端」思路——开源免费版用示例引流，
// 专业版（winmale.com）用 AppId 提供全市场实时数据。
export interface DataProvider {
  kind: 'sample' | 'winmale';
  list(): Promise<{ symbol: string; name: string; industry: IndustryKey }[]>;
  /** 全量列表（含非白酒对照样本）；默认等同 list() */
  listAll?(): Promise<{ symbol: string; name: string; industry: IndustryKey }[]>;
  get(symbol: string): Promise<ReportDataset>;
}

export class SampleProvider implements DataProvider {
  kind = 'sample' as const;
  // 首页列表只给白酒（M1 收窄）；get 仍可取任意样本（制造业样本供对照视图/测试）
  async list() {
    return LIQUOR_SAMPLES.map((s) => ({ symbol: s.symbol, name: s.name, industry: s.industry }));
  }
  // 全量：白酒 + 对照样本（分析页下拉切换用）
  async listAll() {
    return SAMPLES.map((s) => ({ symbol: s.symbol, name: s.name, industry: s.industry }));
  }
  async get(symbol: string) {
    const ds = getSample(symbol);
    if (!ds) throw new Error(`未找到示例数据集: ${symbol}`);
    return ds;
  }
}

export interface WinmaleOpenConfig {
  appId: string;
  base: string; // 如 https://open.winmale.com
}

// 赢麻了开放平台提供方：用 Open AppId 拉取真实财报。
// 后端约定返回 ReportDataset 形状的 JSON：{ data: ReportDataset }。
export class WinmaleOpenProvider implements DataProvider {
  kind = 'winmale' as const;
  constructor(private cfg: WinmaleOpenConfig) {}

  async list() {
    const res = await fetch(`${this.cfg.base}/open/v1/stocks?appid=${encodeURIComponent(this.cfg.appId)}`);
    if (!res.ok) throw new Error(`赢麻了开放平台列表接口错误: ${res.status}`);
    const json = await res.json();
    const list = json?.data?.list ?? json?.list ?? [];
    return (list as { symbol: string; name: string; industry: IndustryKey }[]).map((x) => ({
      symbol: x.symbol,
      name: x.name,
      industry: x.industry,
    }));
  }

  async get(symbol: string) {
    const res = await fetch(
      `${this.cfg.base}/open/v1/finreport?appid=${encodeURIComponent(this.cfg.appId)}&symbol=${encodeURIComponent(symbol)}`,
    );
    if (!res.ok) throw new Error(`赢麻了开放平台财报接口错误: ${res.status}`);
    const json = await res.json();
    const ds = json?.data as ReportDataset | undefined;
    if (!ds || !ds.reports || ds.reports.length === 0) {
      throw new Error('赢麻了开放平台返回的数据不完整，无法解析为财报数据集');
    }
    return ds;
  }
}

export interface ProviderOptions {
  appId?: string;
  base?: string;
  forceSample?: boolean;
}

export function createProvider(opts: ProviderOptions = {}): DataProvider {
  if (!opts.forceSample && opts.appId && opts.appId.trim()) {
    return new WinmaleOpenProvider({ appId: opts.appId.trim(), base: opts.base || 'https://open.winmale.com' });
  }
  return new SampleProvider();
}
