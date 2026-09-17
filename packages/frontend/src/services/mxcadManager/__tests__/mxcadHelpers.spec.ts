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
  memberControllerGetUserProjectPermissions: vi.fn(),
  handleError: vi.fn(),
  hasPendingOpen: vi.fn().mockReturnValue(false),
}));

vi.mock('mxcad', () => ({
  MxCpp: {
    App: {
      getCurrentMxCAD: () => ({
        saveFile: (_name: string, cb: (data: Uint8Array) => void) => {
          cb(new Uint8Array([1, 2, 3]));
        },
      }),
    },
  },
}));
vi.mock('@/api-sdk', () => ({
  projectControllerGetPersonalSpace:
    mocks.projectControllerGetPersonalSpace,
  memberControllerGetUserProjectPermissions:
    mocks.memberControllerGetUserProjectPermissions,
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
// triggerSaveAs 动态导入的门面（避免测试环境加载真实 mxcad-app/mxdraw 链）
vi.mock('../mxcadManager', () => ({
  mxcadManager: {
    hasPendingOpen: () => mocks.hasPendingOpen(),
  },
}));
vi.mock('../../drawingSession', () => ({
  emit: vi.fn(),
}));

import { getPersonalSpaceId, triggerSaveAs } from '../mxcadHelpers';
import { useFileSystemStore } from '@/stores/fileSystemStore';
import { useCADEditorStore } from '@/stores/useCADEditorStore';
import { emit } from '../../drawingSession';
import { globalShowToast } from '@/utils/notificationEvents';
import { CAD_EVENTS } from '@/constants/events';
import type { CurrentFileInfo } from '../mxcadTypes';

function setFileInfo(overrides: Partial<CurrentFileInfo> = {}): void {
  useCADEditorStore.setState({
    currentFileInfo: {
      fileId: 'node-1',
      parentId: null,
      projectId: null,
      name: 'drawing.dwg',
      ...overrides,
    },
  });
}

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

describe('triggerSaveAs — 项目图纸 CAD_SAVE 门控（无权限 = 无另存为权限）', () => {
  // saveDefaults 的 projectPermsCache 为模块级，各用例用不同 projectId 避免串扰
  beforeEach(() => {
    vi.clearAllMocks();
    setFileInfo();
  });

  it('项目图纸 + 无 CAD_SAVE → 拒绝，不打开另存为窗口', async () => {
    setFileInfo({ projectId: 'proj-deny' });
    mocks.memberControllerGetUserProjectPermissions.mockResolvedValue({
      data: { permissions: ['CAD_READ'] },
      error: undefined,
    });

    await expect(triggerSaveAs()).resolves.toBe(false);
    expect(globalShowToast).toHaveBeenCalledWith(
      '您没有保存图纸的权限',
      'warning'
    );
    expect(emit).not.toHaveBeenCalledWith(
      CAD_EVENTS.SAVE_AS,
      expect.anything()
    );
  });

  it('项目图纸 + 有 CAD_SAVE → 打开另存为窗口', async () => {
    setFileInfo({ projectId: 'proj-ok' });
    mocks.memberControllerGetUserProjectPermissions.mockResolvedValue({
      data: { permissions: ['CAD_SAVE'] },
      error: undefined,
    });
    mocks.projectControllerGetPersonalSpace.mockResolvedValue({
      data: { id: 'ps-1' },
      error: undefined,
    });

    await expect(triggerSaveAs()).resolves.toBe(true);
    expect(emit).toHaveBeenCalledWith(
      CAD_EVENTS.SAVE_AS,
      expect.objectContaining({ currentFileName: 'drawing.dwg' })
    );
  });

  it('资源库文件（projectId 为库节点 ID）→ 不受项目门控，直接打开另存为窗口', async () => {
    setFileInfo({
      projectId: 'lib-root-id',
      libraryKey: 'drawing',
      path: '202607/lib/node.mxweb',
    });
    mocks.projectControllerGetPersonalSpace.mockResolvedValue({
      data: { id: 'ps-1' },
      error: undefined,
    });

    await expect(triggerSaveAs()).resolves.toBe(true);
    expect(
      mocks.memberControllerGetUserProjectPermissions
    ).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith(
      CAD_EVENTS.SAVE_AS,
      expect.objectContaining({ currentFileName: 'drawing.dwg' })
    );
  });

  it('公开/本地图纸（无 projectId）→ 不受门控，直接打开另存为窗口', async () => {
    setFileInfo({ projectId: null, fileHash: 'local-md5' });
    mocks.projectControllerGetPersonalSpace.mockResolvedValue({
      data: { id: 'ps-1' },
      error: undefined,
    });

    await expect(triggerSaveAs()).resolves.toBe(true);
    expect(
      mocks.memberControllerGetUserProjectPermissions
    ).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith(
      CAD_EVENTS.SAVE_AS,
      expect.objectContaining({ currentFileName: 'drawing.dwg' })
    );
  });

  it('项目图纸 + 权限查询抛异常 → fail-closed 拒绝', async () => {
    setFileInfo({ projectId: 'proj-err' });
    mocks.memberControllerGetUserProjectPermissions.mockRejectedValue(
      new Error('network')
    );

    await expect(triggerSaveAs()).resolves.toBe(false);
    expect(mocks.handleError).toHaveBeenCalledWith(
      expect.anything(),
      'mxcadManager: triggerSaveAs project permission check'
    );
    expect(emit).not.toHaveBeenCalledWith(
      CAD_EVENTS.SAVE_AS,
      expect.anything()
    );
  });

  it('新图纸打开中（pendingOpen）→ 拒绝，不打开另存为窗口', async () => {
    setFileInfo({ projectId: null });
    mocks.hasPendingOpen.mockReturnValue(true);

    await expect(triggerSaveAs()).resolves.toBe(false);
    expect(globalShowToast).toHaveBeenCalledWith(
      '图纸正在打开，请稍后再保存',
      'warning'
    );
    expect(emit).not.toHaveBeenCalledWith(
      CAD_EVENTS.SAVE_AS,
      expect.anything()
    );
    mocks.hasPendingOpen.mockReturnValue(false);
  });
});
