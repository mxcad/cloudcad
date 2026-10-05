import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

/**
 * drawingOpener —— 「打开一张图纸」唯一对外 interface 的契约测试
 *
 * 锁定两件事：
 * 1. 判别联合各 source 正确路由到实现（node/library/share 走 loadByNodeId、
 *    hash 走 loadByHash，参数装配正确——share 必须经 shareControllerResolveShareNode，
 *    这是「删除 useShareFileLoad 整份重复实现后行为等价」的核心断言）；
 * 2. interface 契约：成功时 editorState 完整（fileId/fileName/updatedAt/projectId/
 *    permissions/isActive/loading），失败时 errorType 按 typed error kind 归类。
 */

const {
  nodeControllerGetNode,
  nodeControllerGetRootNode,
  libraryControllerGetDrawingNode,
  libraryControllerGetBlockNode,
  shareControllerResolveShareNode,
  projectControllerGetPersonalSpace,
} = vi.hoisted(() => ({
  nodeControllerGetNode: vi.fn(),
  nodeControllerGetRootNode: vi.fn(),
  libraryControllerGetDrawingNode: vi.fn(),
  libraryControllerGetBlockNode: vi.fn(),
  shareControllerResolveShareNode: vi.fn(),
  projectControllerGetPersonalSpace: vi.fn(),
}));

vi.mock('@/api-sdk', () => ({
  nodeControllerGetNode,
  nodeControllerGetRootNode,
  libraryControllerGetDrawingNode,
  libraryControllerGetBlockNode,
  shareControllerResolveShareNode,
  projectControllerGetPersonalSpace,
}));

vi.mock('@/services/permissionService', () => ({
  loadCADPermissions: vi.fn(async () => {}),
  checkLibraryPermissions: vi.fn(async () => true),
}));

vi.mock('@/services/mxwebCacheService', () => ({
  getCachedMxwebData: vi.fn(async () => null),
  setMxwebCache: vi.fn(async () => {}),
  buildCacheKey: (path: string, ts: number) => `${path}:${ts}`,
  clearMxwebCache: vi.fn(async () => {}),
}));

vi.mock('@/plugins/mxcad/openMxWeb', () => ({
  openMxWeb: vi.fn(async () => true),
}));

vi.mock('@/services/extRefService', () => ({
  getPreloadingData: vi.fn(async () => null),
  checkExternalReferences: vi.fn(async () => []),
  uploadExtRefImage: vi.fn(),
  uploadExtRefDwg: vi.fn(),
  parseExtRefFileNames: vi.fn(() => []),
}));

vi.mock('@/services/publicFileService', () => ({
  isHashLike: (hash: string) => /^[a-f0-9]{8,64}$/i.test(hash),
  getPublicPreloadingData: vi.fn(async () => ({})),
  buildPublicMxwebUrl: (hash: string) => `/api/v1/public-file/access/${hash}.mxweb`,
  checkPublicExtReference: vi.fn(async () => true),
}));

vi.mock('@/plugins/vant/components/popup/showExternalReferenceUploadPopup', () => ({
  showExternalReferenceUploadPopup: vi.fn(),
}));

vi.mock('vant', () => ({
  showDialog: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('@/languages', () => ({
  t: (key: string) => key,
}));

import { openDrawing } from './drawingOpener';
import { useEditorStore } from '@/stores/editor';
import {
  shareControllerResolveShareNode as shareResolveSdk,
  nodeControllerGetNode as getNodeSdk,
} from '@/api-sdk';
import { openMxWeb } from '@/plugins/mxcad/openMxWeb';
import { loadCADPermissions } from '@/services/permissionService';

const shareResolveMock = vi.mocked(shareResolveSdk);
const getNodeMock = vi.mocked(getNodeSdk);

function shareNodeInfo(overrides: Record<string, unknown> = {}) {
  return {
    id: 'file-1',
    name: 'share.dwg',
    path: '202607/x/a.mxweb',
    updatedAt: '2026-01-01T00:00:00.000Z',
    fileHash: 'hash123',
    deletedAt: null,
    parentId: null,
    ...overrides,
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  useEditorStore().reset();
  vi.clearAllMocks();
});

describe('drawingOpener — share 源（原 useShareFileLoad 行为等价）', () => {
  it('成功 → 经 shareControllerResolveShareNode 取节点，editorState 完整', async () => {
    shareResolveMock.mockResolvedValue({ data: shareNodeInfo() } as never);

    const ok = await openDrawing({ source: 'share', token: 'tk-1', nodeId: 'file-1' });

    expect(ok).toBe(true);
    expect(shareResolveMock).toHaveBeenCalledWith({
      path: { token: 'tk-1' },
    });
    const s = useEditorStore().state;
    expect(s.fileId).toBe('file-1');
    expect(s.fileName).toBe('share.dwg');
    expect(s.updatedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(s.projectId).toBeNull();
    expect(s.libraryKey).toBeNull();
    expect(s.permissions).toEqual({
      canSave: false,
      canExport: true,
      canManageExternalRef: false,
    });
    expect(s.isActive).toBe(true);
    expect(s.loading).toBe(false);
    expect(s.error).toBeNull();
    expect(s.errorType).toBeNull();
    // URL 带 shareToken（query），openMxWeb 附加 x-share-token 头
    expect(openMxWeb).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/mxcad/filesData/202607/x/a.mxweb?t=')
    );
    expect(openMxWeb).toHaveBeenCalledWith(
      expect.stringContaining('shareToken=tk-1')
    );
  });

  it('节点已删除（deletedAt）→ errorType not-found（不再依赖中文字面 includes）', async () => {
    shareResolveMock.mockResolvedValue({
      data: shareNodeInfo({ deletedAt: '2026-01-01T00:00:00.000Z' }),
    } as never);

    const ok = await openDrawing({ source: 'share', token: 'tk-1', nodeId: 'file-1' });

    expect(ok).toBe(false);
    const s = useEditorStore().state;
    expect(s.errorType).toBe('not-found');
    expect(s.loading).toBe(false);
    expect(s.isActive).toBe(false);
  });

  it('未转换完成（无 fileHash）→ errorType converting', async () => {
    shareResolveMock.mockResolvedValue({
      data: shareNodeInfo({ fileHash: null }),
    } as never);

    const ok = await openDrawing({ source: 'share', token: 'tk-1', nodeId: 'file-1' });

    expect(ok).toBe(false);
    expect(useEditorStore().state.errorType).toBe('converting');
  });
});

describe('drawingOpener — node 源', () => {
  it('成功 → nodeControllerGetNode 路由 + 权限加载 + editorState 完整', async () => {
    getNodeMock.mockResolvedValue({
      data: shareNodeInfo({ isRoot: true, parentId: null }),
    } as never);
    projectControllerGetPersonalSpace.mockResolvedValue({ data: null });

    const ok = await openDrawing({ source: 'node', nodeId: 'file-1' });

    expect(ok).toBe(true);
    expect(getNodeMock).toHaveBeenCalledWith({
      path: { nodeId: 'file-1' },
    });
    const s = useEditorStore().state;
    expect(s.projectId).toBe('file-1');
    expect(s.isActive).toBe(true);
    expect(s.loading).toBe(false);
  });
});

describe('drawingOpener — library 源（图纸库 / 图块库）', () => {
  it('成功 → 库节点接口路由，editorState 记 libraryKey 与受限权限', async () => {
    libraryControllerGetDrawingNode.mockResolvedValue({
      data: shareNodeInfo({ name: 'lib.dwg' }),
    } as never);

    const ok = await openDrawing({
      source: 'library',
      libraryKey: 'drawing',
      nodeId: 'file-1',
    });

    expect(ok).toBe(true);
    expect(libraryControllerGetDrawingNode).toHaveBeenCalledWith({
      path: { nodeId: 'file-1' },
    });
    // 库节点不在文件系统节点接口里
    expect(getNodeMock).not.toHaveBeenCalled();
    const s = useEditorStore().state;
    expect(s.libraryKey).toBe('drawing');
    expect(s.fileId).toBe('file-1');
    expect(s.fileName).toBe('lib.dwg');
    // 库源不走根节点解析：projectId 停在 parentId 初值，无 parentId 即 null
    expect(s.projectId).toBeNull();
    // libraryKey 只落在 store 字段上，FileSystemNode 没有这一列——
    // 保存侧必须读 state.libraryKey，且 canSave 门禁须排除 libraryKey。
    // （曾同时违反这两点，导致库文件保存分支恒不可达）
    expect(
      (s.fileInfo as Record<string, unknown> | null)?.libraryKey
    ).toBeUndefined();
    expect(s.permissions).toEqual({
      canSave: false,
      canExport: true,
      canManageExternalRef: false,
    });
    expect(s.isActive).toBe(true);
    expect(s.loading).toBe(false);
  });

  it('图块库 → libraryControllerGetBlockNode 路由，libraryKey 记 block', async () => {
    libraryControllerGetBlockNode.mockResolvedValue({
      data: shareNodeInfo({ name: 'blk.dwg' }),
    } as never);

    const ok = await openDrawing({
      source: 'library',
      libraryKey: 'block',
      nodeId: 'file-2',
    });

    expect(ok).toBe(true);
    expect(libraryControllerGetBlockNode).toHaveBeenCalledWith({
      path: { nodeId: 'file-2' },
    });
    expect(libraryControllerGetDrawingNode).not.toHaveBeenCalled();
    expect(useEditorStore().state.libraryKey).toBe('block');
  });

  it('库源不加载项目 CAD 权限、不查个人空间', async () => {
    libraryControllerGetDrawingNode.mockResolvedValue({
      data: shareNodeInfo({ parentId: null }),
    } as never);

    const ok = await openDrawing({
      source: 'library',
      libraryKey: 'drawing',
      nodeId: 'file-1',
    });

    expect(ok).toBe(true);
    expect(vi.mocked(loadCADPermissions)).not.toHaveBeenCalled();
    expect(projectControllerGetPersonalSpace).not.toHaveBeenCalled();
    expect(useEditorStore().state.personalSpaceId).toBeNull();
  });
});

describe('drawingOpener — hash 源（公开文件）', () => {
  it('成功 → editorState 记 hash 为 fileId、受限权限', async () => {
    const ok = await openDrawing({ source: 'hash', hash: 'abcdef1234567890' });

    expect(ok).toBe(true);
    const s = useEditorStore().state;
    expect(s.fileId).toBe('abcdef1234567890');
    expect(s.projectId).toBeNull();
    expect(s.permissions.canSave).toBe(false);
    expect(s.isActive).toBe(true);
  });
});
