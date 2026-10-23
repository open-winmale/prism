import { describe, expect, it } from 'vitest';
import { canPullLive, sourceShortLabelOf } from './sourceLabel';

describe('sourceShortLabelOf', () => {
  it('快照优先于凭证来源', () => {
    expect(sourceShortLabelOf('snapshot', 'demo')).toBe('快照');
    expect(sourceShortLabelOf('snapshot', 'user')).toBe('快照');
    expect(sourceShortLabelOf('snapshot', 'none')).toBe('快照');
  });

  it('实时状态按凭证来源区分', () => {
    expect(sourceShortLabelOf('live', 'user')).toBe('私有 AppId');
    expect(sourceShortLabelOf('live', 'env')).toBe('部署凭证');
    expect(sourceShortLabelOf('live', 'demo')).toBe('体验密钥');
    expect(sourceShortLabelOf('live', 'none')).toBe('实时');
  });

  it('未取数为未连接', () => {
    expect(sourceShortLabelOf(null, 'none')).toBe('未连接');
  });
});

describe('canPullLive', () => {
  it('仅私有 AppId 且当前为快照时允许', () => {
    expect(canPullLive('snapshot', 'user')).toBe(true);
  });

  it('体验密钥 / 部署凭证 / 实时数据都不显示按钮', () => {
    expect(canPullLive('snapshot', 'demo')).toBe(false);
    expect(canPullLive('snapshot', 'env')).toBe(false);
    expect(canPullLive('live', 'user')).toBe(false);
    expect(canPullLive(null, 'user')).toBe(false);
  });
});
