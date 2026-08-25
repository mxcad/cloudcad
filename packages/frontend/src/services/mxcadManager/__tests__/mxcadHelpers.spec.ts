import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * getPersonalSpaceId 回退行为回归测试
 *
 * 历史 bug：每次 Ctrl+S 保存都实时请求 personal-space 接口，
 * 偶发失败（网络抖动/瞬时 5xx）时静默返回 null，导致保存链路把
 * "我的图纸"误判为未知归属而弹出"另存为到云图"弹框。
 * 修复后：成功结果写入 fileSystemStore 缓存；失败/空数据回退缓存值。
 */

const mocks = vi.hoisted(() => ({
  projectControllerGetPersonalSpace: vi.fn(),
  handleError: vi.fn(),
}));

vi.mock('mxcad', () => ({ MxCpp: {} }));
vi.mock('@/api-sdk', () => ({
  projectControllerGetPersonalSpace:
    mocks.projectControllerGetPersonalSpace,
}));
vi.mock('@/utils/errorHandler', () => ({ handleError: mocks.handleError }));
vi.mock('@/utils/authCheck', () => ({ isAuthenticated: () => true }));
vi.mock('@/utils/tokenUtils', () => ({ isAccessTokenExpired: () => false }));
vi.mock('@/config/clientSetup', () => ({
  cancelLoginRedirect: vi.fn(),
}));
vi.mock('@/languages', () => ({ t: (key: string) => key }));
vi.mock('../loadingService', () => ({
  showGlobalLoading: vi.fn(),
  hideGlobalLoading: vi.fn(),
}));
vi.mock('@/utils/notificationEvents', () => ({
  globalShowToast: vi.fn(),
}));
vi.mock('../drawingSession', () => ({
  emit: vi.fn(),
}));

import { getPersonalSpaceId } from '../mxcadHelpers';
import { useFileSystemStore } from '@/stores/fileSystemStore';

describe('getPersonalSpaceId — 失败回退本地缓存（偶发另存为 bug 回归）', () => {
  beforeEach(() => {
    mocks.projectControllerGetPersonalSpace.mockReset();
    mocks.handleError.mockReset();
    useFileSystemStore.setState({ personalSpaceId: null });
  });

  it('请求成功 → 返回 id 并同步写入 fileSystemStore 缓存', async () => {
    mocks.projectControllerGetPersonalSpace.mockResolvedValue({
      data: { id: 'ps-1' },
      error: undefined,
    });

    await expect(getPersonalSpaceId()).resolves.toBe('ps-1');
    expect(useFileSystemStore.getState().personalSpaceId).toBe('ps-1');
  });

  it('请求成功但 data.id 为空 → 回退返回缓存值', async () => {
    useFileSystemStore.setState({ personalSpaceId: 'ps-cached' });
    mocks.projectControllerGetPersonalSpace.mockResolvedValue({
      data: {},
      error: undefined,
    });

    await expect(getPersonalSpaceId()).resolves.toBe('ps-cached');
  });

  it('接口返回 error（SDK 不抛错语义）→ 记录错误并回退缓存值', async () => {
    useFileSystemStore.setState({ personalSpaceId: 'ps-cached' });
    const err = new Error('boom');
    mocks.projectControllerGetPersonalSpace.mockResolvedValue({
      data: null,
      error: err,
    });

    await expect(getPersonalSpaceId()).resolves.toBe('ps-cached');
    expect(mocks.handleError).toHaveBeenCalledWith(
      err,
      'mxcadManager: getPersonalSpaceId'
    );
  });

  it('网络异常（抛错）→ 回退缓存值而非 null', async () => {
    useFileSystemStore.setState({ personalSpaceId: 'ps-cached' });
    mocks.projectControllerGetPersonalSpace.mockRejectedValue(
      new Error('network down')
    );

    await expect(getPersonalSpaceId()).resolves.toBe('ps-cached');
  });

  it('失败且无任何缓存 → 返回 null（与未登录旧行为一致）', async () => {
    mocks.projectControllerGetPersonalSpace.mockRejectedValue(
      new Error('network down')
    );

    await expect(getPersonalSpaceId()).resolves.toBeNull();
  });
});
