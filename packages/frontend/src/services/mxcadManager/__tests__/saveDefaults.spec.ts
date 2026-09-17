import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/api-sdk', () => ({
  nodeControllerGetNode: vi.fn(),
  libraryControllerGetDrawingNode: vi.fn(),
  libraryControllerGetBlockNode: vi.fn(),
  memberControllerGetUserProjectPermissions: vi.fn(),
  saveControllerSaveMxwebToNode: vi.fn(),
}));

import { memberControllerGetUserProjectPermissions } from '@/api-sdk';
import {
  createDefaultPermissionQuerier,
  clearSavePermissionCache,
} from '../saveDefaults';

const apiMock = memberControllerGetUserProjectPermissions as ReturnType<
  typeof vi.fn
>;

beforeEach(() => {
  vi.clearAllMocks();
  clearSavePermissionCache();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createDefaultPermissionQuerier — 项目权限缓存（TTL）', () => {
  it('TTL 内命中缓存：同项目第二次查询不再请求 API', async () => {
    apiMock.mockResolvedValue({ data: { permissions: ['CAD_SAVE'] } });
    const querier = createDefaultPermissionQuerier();

    expect(await querier.hasProjectPermission('p1', 'CAD_SAVE')).toBe(true);
    expect(await querier.hasProjectPermission('p1', 'CAD_EXPORT')).toBe(false);
    expect(apiMock).toHaveBeenCalledTimes(1);
  });

  it('TTL（5 分钟）过期后重新请求 API', async () => {
    apiMock.mockResolvedValue({ data: { permissions: ['CAD_SAVE'] } });
    const querier = createDefaultPermissionQuerier();

    await querier.hasProjectPermission('p1', 'CAD_SAVE');
    vi.advanceTimersByTime(5 * 60 * 1000);
    await querier.hasProjectPermission('p1', 'CAD_SAVE');

    expect(apiMock).toHaveBeenCalledTimes(2);
  });

  it('clearSavePermissionCache 后重新请求 API（登录/登出防跨用户串用）', async () => {
    apiMock.mockResolvedValue({ data: { permissions: ['CAD_SAVE'] } });
    const querier = createDefaultPermissionQuerier();

    await querier.hasProjectPermission('p1', 'CAD_SAVE');
    clearSavePermissionCache();
    await querier.hasProjectPermission('p1', 'CAD_SAVE');

    expect(apiMock).toHaveBeenCalledTimes(2);
  });

  it('查询失败（SDK error）→ 抛出且不写缓存，恢复后重新请求', async () => {
    apiMock.mockResolvedValue({ error: new Error('403') });
    const querier = createDefaultPermissionQuerier();

    await expect(
      querier.hasProjectPermission('p1', 'CAD_SAVE')
    ).rejects.toThrow('403');

    apiMock.mockResolvedValue({ data: { permissions: ['CAD_SAVE'] } });
    expect(await querier.hasProjectPermission('p1', 'CAD_SAVE')).toBe(true);
    expect(apiMock).toHaveBeenCalledTimes(2);
  });
});
