import type { DataSourceKind } from './provider';
import type { CredentialSource } from './wm/credentials';

// 顶栏来源短标签与「拉取实时」按钮可见性。
// 纯函数，避免把凭证/来源判断散落在组件里；类型导入不会产生运行时循环。

export function sourceShortLabelOf(kind: DataSourceKind | null, source: CredentialSource): string {
  if (kind === 'snapshot') return '快照';
  if (source === 'user') return '私有 AppId';
  if (source === 'env') return '部署凭证';
  if (source === 'demo') return '体验密钥';
  if (kind === 'live') return '实时';
  return '未连接';
}

/** 只有用户自己的 AppId 才允许从样板页强制拉实时；体验密钥不显示按钮，避免消耗共享额度 */
export function canPullLive(kind: DataSourceKind | null, source: CredentialSource): boolean {
  return kind === 'snapshot' && source === 'user';
}
