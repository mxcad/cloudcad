import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

/**
 * useSave.save —— 保存分流门禁的契约测试
 *
 * 锁定的缺陷：库图纸的保存分支曾经无条件不可达，原因有两层——
 * 1. 项目保存权限门禁（`!canSave && fileId`）在库分支之前执行，
 *    而 useFileLoader 对库源固定写入 canSave:false，门禁必然先命中；
 * 2. 库分支的判定值取自 `fileInfo.libraryKey`，但 libraryKey 不是
 *    FileSystemNode 的字段，接口返回里永远没有它。
 * 于是库图纸保存恒报「没有保存权限，请另存为」，saveLibraryDrawing /
 * saveLibraryBlock 成为死码。这两条是各自的必要条件，缺一都不能修好。
 *
 * 未认证的守卫（isAuthenticated）不属于被测对象，经 useUser().refresh()
 * 让真实状态机重读 localStorage。
 */

const {
  getMxwebBlob,
  saveToNode,
  saveLibraryDrawing,
  saveLibraryBlock,
  nodeControllerGetNode,
  projectControllerGetPersonalSpace,
} = vi.hoisted(() => ({
  getMxwebBlob: vi.fn(),
  saveToNode: vi.fn(),
  saveLibraryDrawing: vi.fn(),
  saveLibraryBlock: vi.fn(),
  nodeControllerGetNode: vi.fn(),
  projectControllerGetPersonalSpace: vi.fn(),
}));

vi.mock('@/api-sdk', () => ({
  nodeControllerGetNode,
  projectControllerGetPersonalSpace,
}));

vi.mock('../services/saveService', () => ({
  getMxwebBlob,
  saveToNode,
  saveLibraryDrawing,
  saveLibraryBlock,
}));

vi.mock('../services/thumbnailService', () => ({
  uploadThumbnailForNode: vi.fn(async () => {}),
}));

vi.mock('../services/pendingImageService', () => ({
  processPendingImages: vi.fn(async () => {}),
}));

vi.mock('../services/mxwebCacheService', () => ({
  buildCacheKey: (path: string, ts: number) => `${path}:${ts}`,
  clearMxwebCache: vi.fn(async () => {}),
  setMxwebCache: vi.fn(async () => {}),
}));

vi.mock('../utils/apiConfig', () => ({ handleApiError: vi.fn() }));

vi.mock('../utils/authSession', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/authSession')>();
  return { ...actual, isTokenExpired: () => false, readToken: () => 'tok' };
});

vi.mock('vant', () => ({
  showToast: vi.fn(),
  showLoadingToast: vi.fn(),
  closeToast: vi.fn(),
}));

vi.mock('@/languages', () => ({ t: (key: string) => key }));

import { useSave } from './useSave';
import { useUser } from './useUser';
import { useEditorStore } from '@/stores/editor';

/** 写入会话与角色权限后让 useUser 的真实状态机重读 localStorage。 */
function loginAs(codes: string[] = []): void {
  localStorage.setItem('accessToken', 'tok');
  localStorage.setItem('user', JSON.stringify({ role: { permissions: codes } }));
  useUser().refresh();
}

function editor(): ReturnType<typeof useEditorStore> {
  return useEditorStore();
}

function openLibraryDrawing(libraryKey: 'drawing' | 'block' = 'drawing'): void {
  const s = editor();
  s.reset();
  s.setFileId('node-1');
  // 与接口返回同形的节点信息：parentId 在 DB 里，libraryKey 不在
  s.setFileInfo({
    id: 'node-1',
    name: 'lib.dwg',
    parentId: 'folder-1',
    projectId: null,
    fileHash: 'hash-1',
  });
  s.setLibraryKey(libraryKey);
  s.setPermissions({
    canSave: false,
    canExport: true,
    canManageExternalRef: false,
  });
  s.setIsActive(true);
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  localStorage.clear();
  getMxwebBlob.mockResolvedValue(new Blob(['x']));
  // 节点仍存在、无新更新时间（顺带让缓存分支短路）
  nodeControllerGetNode.mockResolvedValue({
    data: { updatedAt: null, path: null },
  });
  projectControllerGetPersonalSpace.mockResolvedValue({ data: null });
});

describe('useSave.save — 资源库图纸保存', () => {
  it('库图纸无项目保存权限但有资源库管理权限 → 走 saveLibraryDrawing 成功', async () => {
    loginAs(['LIBRARY_DRAWING_MANAGE']);
    openLibraryDrawing('drawing');

    const res = await useSave().save();

    expect(res).toEqual({ success: true });
    expect(saveLibraryDrawing).toHaveBeenCalledWith('node-1', expect.any(Blob));
    expect(saveToNode).not.toHaveBeenCalled();
  });

  it('图块库图纸 → 走 saveLibraryBlock', async () => {
    loginAs(['LIBRARY_BLOCK_MANAGE']);
    openLibraryDrawing('block');

    const res = await useSave().save();

    expect(res).toEqual({ success: true });
    expect(saveLibraryBlock).toHaveBeenCalledWith('node-1', expect.any(Blob));
    expect(saveLibraryDrawing).not.toHaveBeenCalled();
  });

  it('库图纸无资源库管理权限 → 库专属文案，不得误报项目保存权限', async () => {
    loginAs(['CAD_SAVE']);
    openLibraryDrawing('drawing');

    const res = await useSave().save();

    expect(res).toEqual({
      success: false,
      needSaveAs: true,
      message: '无资源库管理权限，请另存为到其他位置',
    });
    expect(saveLibraryDrawing).not.toHaveBeenCalled();
  });
});

describe('useSave.save — 既有门禁不得回归', () => {
  it('项目图纸无保存权限 → 没有保存权限，请另存为', async () => {
    loginAs(['CAD_SAVE']);
    const s = editor();
    s.reset();
    s.setFileId('node-2');
    s.setFileInfo({ id: 'node-2', parentId: 'proj-1', projectId: 'proj-1' });
    s.setPermissions({
      canSave: false,
      canExport: false,
      canManageExternalRef: false,
    });

    const res = await useSave().save();

    expect(res).toEqual({
      success: false,
      needSaveAs: true,
      message: '没有保存权限，请另存为',
    });
    expect(saveToNode).not.toHaveBeenCalled();
  });

  it('个人空间图纸 → 走 saveToNode，不受库分支影响', async () => {
    loginAs([]);
    projectControllerGetPersonalSpace.mockResolvedValue({
      data: { id: 'ps-1' },
    });
    const s = editor();
    s.reset();
    s.setFileId('node-3');
    s.setFileInfo({ id: 'node-3', parentId: 'ps-1', projectId: null });
    s.setPermissions({
      canSave: true,
      canExport: true,
      canManageExternalRef: false,
    });

    const res = await useSave().save();

    expect(res).toEqual({ success: true });
    expect(saveToNode).toHaveBeenCalledWith(
      'node-3',
      expect.any(Blob),
      undefined,
      null
    );
    expect(saveLibraryDrawing).not.toHaveBeenCalled();
  });

  it('新建未保存的图纸（无 fileId）→ 请另存为到云图', async () => {
    loginAs([]);
    editor().reset();

    const res = await useSave().save();

    expect(res).toEqual({
      success: false,
      needSaveAs: true,
      message: '请另存为到云图',
    });
    expect(saveToNode).not.toHaveBeenCalled();
  });

  it('当前文件已被外部删除 → 需另存为新文件', async () => {
    loginAs([]);
    const s = editor();
    s.reset();
    s.setFileId('node-4');
    s.setIsCurrentFileDeleted(true);

    const res = await useSave().save();

    expect(res).toEqual({
      success: false,
      needSaveAs: true,
      message: '当前图纸已被删除，请另存为新文件',
    });
    expect(getMxwebBlob).not.toHaveBeenCalled();
  });

  it('未登录 → 需先登录，且不发任何存储调用', async () => {
    localStorage.clear();
    useUser().refresh();

    const res = await useSave().save();

    expect(res).toEqual({ success: false, needLogin: true, message: '请先登录' });
    expect(getMxwebBlob).not.toHaveBeenCalled();
  });
});
