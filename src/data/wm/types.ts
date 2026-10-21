// 赢麻了开放平台接口层类型。
// 链路（2026-10-21 实测）：
//   1) POST {base}/v1/oauth/token  application/x-www-form-urlencoded
//      grant_type=client_credentials&client_id=<id>&client_secret=<secret> → { access_token, expires_in }
//   2) POST {base}/v1/skills/{skill_id}/run   Authorization: Bearer <token>
//      body 必须包装为 {"args":{...}}（顶层裸 action 会被拒：ARGS_REQUIRED）
//   3) POST {base}/v1/analysis/xs/discover    { q } → 标的/行业/技能检索
// 与 ../skillhub/skills/wm-skillhub/scripts/_wm_runtime.py 的约定保持一致。

export interface WmCredentials {
  clientId: string;
  clientSecret: string;
  apiBase?: string; // 默认 https://api.winmale.com
}

export const DEFAULT_API_BASE = 'https://api.winmale.com';

/** OAuth 令牌（expiresAt 为 epoch 毫秒） */
export interface WmToken {
  accessToken: string;
  expiresAt: number;
}

/** 统一取数结果。error 优先于 data 判断。 */
export interface SkillRunResult<T = unknown> {
  ok: boolean;
  data: T | null;
  error?: { code: string; message: string };
  /** 本次调用消耗的 EC（来自 meta.metering.analysis.ec_cost） */
  ecCost?: number;
}

/** 服务端原始响应体（用于类型收窄，避免到处 any） */
export interface RawEnvelope<T = unknown> {
  success?: boolean;
  data?: T | null;
  error?: { code?: string; message?: string } | null;
  meta?: {
    request_id?: string;
    server_time?: string;
    metering?: { 'analysis.ec_cost'?: number; latency_ms?: number };
  };
}

/** discover 命中项（domain: symbol | industry | skill | vfunc …） */
export interface DiscoverHit {
  domain: string;
  id: string;
  title: string;
  snippet?: string;
  score?: number;
}

/** 行业成分（members action） */
export interface IndustryMember {
  symbol: string;
  name: string;
  close?: number | null;
  pe_ttm?: number | null;
  pb?: number | null;
  ps_ttm?: number | null;
  roe_ttm?: number | null;
  mv?: number | null;
  percent?: number | null;
}

export interface IndustryAggregates {
  pe_ttm?: number | null;
  pb?: number | null;
  roe_ttm?: number | null;
}

/** 期次元信息（finance key view 的 periods_meta） */
export interface PeriodMeta {
  report_date: string; // '2025-12-31T00:00:00Z' 或 '2025-12-31'
  sampling?: string; // 'Q4' 表示年报
  annual?: number;
}

/** raw 视图单期全字段（88~90 个，按需读取；未列出者不映射） */
export type RawStatement = Record<string, unknown>;

/** finance raw 视图返回体 */
export interface FinanceRawPayload {
  view?: string;
  statement?: 'bs' | 'is' | 'cf';
  sas?: string;
  report_sas?: string;
  symbol?: string;
  raw?: RawStatement | string; // 有时是 JSON 字符串
  periods_meta?: PeriodMeta[];
  period?: Record<string, unknown>;
  freshness?: number;
}
