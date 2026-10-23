import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

/**
 * useSave.save —— 保存分流门禁的契约测试
 *
 * 库图纸/库图块走「库管理权限」而非项目保存权限：
 * 持 LIBRARY_DRAWING_MANAGE / LIBRARY_BLOCK_MANAGE → 库内原位保存
 * （对齐 PC saveFile 的 library 分支）；不持权限 → 只读并引导另存为，
 * 不动库原件。
 *
 * 库判定必须先于项目保存权限门禁：useFileLoader 对库源固定写 canSave:false，
 * 放在门禁之后会被误报成「没有保存权限」，用户按提示另存为却永远回不到库，
 * 只看到一句与原因无关的提示。该排除条件不得回退成库图纸一律只读——
 * 那样会让 saveLibraryDrawing / saveLibraryBlock 重新变成无消费者死码。
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
  saveLibraryDrawing.mockResolvedValue({});
  saveLibraryBlock.mockResolvedValue({});
  // 节点仍存在、无新更新时间（顺带让缓存分支短路）
  nodeControllerGetNode.mockResolvedValue({
    data: { updatedAt: null, path: null },
  });
  projectControllerGetPersonalSpace.mockResolvedValue({ data: null });
});

describe('useSave.save — 资源库图纸/图块保存', () => {
  it('持 LIBRARY_DRAWING_MANAGE → 库内原位保存，走 saveLibraryDrawing', async () => {
    loginAs(['LIBRARY_DRAWING_MANAGE']);
    openLibraryDrawing('drawing');

    const res = await useSave().save();

    expect(res).toEqual({ success: true });
    expect(saveLibraryDrawing).toHaveBeenCalledWith('node-1', expect.any(Blob));
    expect(saveLibraryBlock).not.toHaveBeenCalled();
    expect(saveToNode).not.toHaveBeenCalled();
  });

  it('持 LIBRARY_BLOCK_MANAGE → 走 saveLibraryBlock', async () => {
    loginAs(['LIBRARY_BLOCK_MANAGE']);
    openLibraryDrawing('block');

    const res = await useSave().save();

    expect(res).toEqual({ success: true });
    expect(saveLibraryBlock).toHaveBeenCalledWith('node-1', expect.any(Blob));
    expect(saveLibraryDrawing).not.toHaveBeenCalled();
    expect(saveToNode).not.toHaveBeenCalled();
  });

  it('无库管理权限 → 库原件只读并引导另存为，不发任何写请求', async () => {
    loginAs(['CAD_SAVE']);
    openLibraryDrawing('drawing');

    const res = await useSave().save();

    expect(res).toEqual({
      success: false,
      needSaveAs: true,
      message: '资源库图纸只读，请另存为到其他位置',
    });
    expect(saveLibraryDrawing).not.toHaveBeenCalled();
    expect(saveToNode).not.toHaveBeenCalled();
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
