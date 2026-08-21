import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/api-sdk', () => ({
  saveControllerSaveMxwebToNode: vi.fn(),
  nodeControllerGetNode: vi.fn(),
  libraryControllerGetDrawingNode: vi.fn(),
  libraryControllerGetBlockNode: vi.fn(),
  memberControllerGetUserProjectPermissions: vi.fn(),
}));

vi.mock('@/utils/errorHandler', () => ({
  handleError: vi.fn(),
  getErrorMessage: (err: unknown) => (err instanceof Error ? err.message : String(err)),
}));

vi.mock('@/utils/hashUtils', () => ({
  calculateFileHash: vi.fn().mockResolvedValue('mock-hash'),
}));

vi.mock('@/utils/mxcadUploadUtils', () => ({
  uploadMxCadFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/utils/notificationEvents', () => ({
  globalShowToast: vi.fn(),
  globalShowPrompt: vi.fn(),
}));

vi.mock('../mxcadHelpers', () => ({
  getFileInfo: vi.fn(),
  saveCurrentDrawingToBlob: vi.fn(),
  showSaveAsDialog: vi.fn(),
  getPersonalSpaceId: vi.fn().mockResolvedValue('ps-1'),
  triggerSaveAs: vi.fn(),
}));

vi.mock('../mxcadCache', () => ({
  writeFileCacheToIndexedDB: vi.fn().mockResolvedValue(undefined),
  clearFileCacheFromIndexedDB: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../mxcadThumbnail', () => ({
  generateThumbnail: vi.fn(),
  uploadThumbnail: vi.fn().mockResolvedValue(true),
}));

vi.mock('../cmd/insertImageCommand', () => ({
  processPendingImages: vi.fn().mockResolvedValue(undefined),
}));

import { useCADEditorStore } from '@/stores/useCADEditorStore';
import { resetSessionRuntime, setModified } from '../../drawingSession';
import {
  saveMxwebToNode,
  showSaveConfirmDialog,
  saveCurrentFile,
  createDefaultPermissionQuerier,
  createDefaultSaveSdk,
  createDefaultSaveDeps,
  type SaveFileDeps,
  type SavePermissionQuerier,
  type SaveSdkHandles,
} from '../saveFile';
import { saveControllerSaveMxwebToNode } from '@/api-sdk';
import { memberControllerGetUserProjectPermissions } from '@/api-sdk';
import { uploadMxCadFile } from '@/utils/mxcadUploadUtils';
import { calculateFileHash } from '@/utils/hashUtils';
import { handleError } from '@/utils/errorHandler';
import { globalShowToast, globalShowPrompt } from '@/utils/notificationEvents';
import {
  getFileInfo,
  saveCurrentDrawingToBlob,
  showSaveAsDialog,
  triggerSaveAs,
  getPersonalSpaceId,
} from '../mxcadHelpers';
import { writeFileCacheToIndexedDB } from '../mxcadCache';
import { generateThumbnail, uploadThumbnail } from '../mxcadThumbnail';
import { processPendingImages } from '../cmd/insertImageCommand';
import type { CurrentFileInfo } from '../mxcadTypes';

function resetStore(): void {
  useCADEditorStore.setState({
    isCurrentFileDeleted: false,
    currentFileInfo: null,
  });
  resetSessionRuntime();
}

function makeDeps(
  overrides: Partial<{
    sdk: Partial<SaveSdkHandles>;
    permissions: Partial<SavePermissionQuerier>;
  }> = {}
): SaveFileDeps {
  return {
    sdk: {
      getNode: vi.fn().mockResolvedValue({
        data: { path: '202607/n1/src.mxweb', updatedAt: '2026-07-01T00:00:00Z' },
      }),
      getLibraryNode: vi.fn().mockResolvedValue({
        data: { path: '202607/n1/lib.mxweb', updatedAt: '2026-07-01T00:00:00Z' },
      }),
      getUserProjectPermissions: vi.fn().mockResolvedValue({
        data: { permissions: ['CAD_SAVE'] },
      }),
      saveMxwebToNode: vi.fn().mockResolvedValue({ data: {}, error: undefined }),
      ...overrides.sdk,
    },
    permissions: {
      hasProjectPermission: vi.fn().mockResolvedValue(true),
      hasLibraryPermission: vi.fn().mockResolvedValue(true),
      ...overrides.permissions,
    },
  };
}

const mockSavedFile = {
  blob: new Blob(['saved-data'], { type: 'application/octet-stream' }),
  data: new Uint8Array([1, 2, 3]),
  filename: 'drawing.dwg',
};

function makeFileInfo(overrides: Partial<CurrentFileInfo> = {}): CurrentFileInfo {
  return {
    fileId: 'node-abc',
    parentId: 'ps-1',
    projectId: null,
    name: 'drawing.dwg',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
  localStorage.clear();
  (saveControllerSaveMxwebToNode as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
    { data: {}, error: undefined }
  );
  (globalShowPrompt as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
    undefined
  );
  (saveCurrentDrawingToBlob as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
    mockSavedFile
  );
  (getFileInfo as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
    makeFileInfo()
  );
  (generateThumbnail as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
    'data:image/png;base64,x'
  );
});

describe('saveMxwebToNode（blob→hash→upload→SDK save 唯一序列）', () => {
  it('上传并落库到指定节点', async () => {
    await saveMxwebToNode({
      nodeId: 'node-abc',
      blob: mockSavedFile.blob,
      filename: 'drawing.mxweb',
    });

    expect(uploadMxCadFile).toHaveBeenCalledTimes(1);
    const uploadArgs = (uploadMxCadFile as unknown as ReturnType<typeof vi.fn>)
      .mock.calls[0][0];
    expect(uploadArgs.nodeId).toBe('node-abc');
    expect(uploadArgs.skipDb).toBe(true);

    expect(saveControllerSaveMxwebToNode).toHaveBeenCalledTimes(1);
    const [options] = (
      saveControllerSaveMxwebToNode as unknown as ReturnType<typeof vi.fn>
    ).mock.calls[0];
    expect(options.path.nodeId).toBe('node-abc');
    expect(options.body.hash).toBe('mock-hash');
    expect(calculateFileHash).toHaveBeenCalled();
  });

  it('透传 commitMessage / expectedTimestamp', async () => {
    await saveMxwebToNode({
      nodeId: 'node-def',
      blob: mockSavedFile.blob,
      filename: 'drawing.mxweb',
      commitMessage: 'Fixed layer',
      expectedTimestamp: '2024-01-15T10:30:00Z',
    });

    const [options] = (
      saveControllerSaveMxwebToNode as unknown as ReturnType<typeof vi.fn>
    ).mock.calls[0];
    expect(options.body.commitMessage).toBe('Fixed layer');
    expect(options.body.expectedTimestamp).toBe('2024-01-15T10:30:00Z');
  });

  it('未提供可选参数时不发送对应字段', async () => {
    await saveMxwebToNode({
      nodeId: 'node-jkl',
      blob: mockSavedFile.blob,
      filename: 'minimal.mxweb',
    });

    const [options] = (
      saveControllerSaveMxwebToNode as unknown as ReturnType<typeof vi.fn>
    ).mock.calls[0];
    expect(options.body.commitMessage).toBeUndefined();
    expect(options.body.expectedTimestamp).toBeUndefined();
  });

  it('服务端错误抛出 message（无 message 时用兜底文案）', async () => {
    (
      saveControllerSaveMxwebToNode as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      data: undefined,
      error: { message: 'Server error: file too large' },
    });

    await expect(
      saveMxwebToNode({
        nodeId: 'node-err',
        blob: mockSavedFile.blob,
        filename: 'drawing.mxweb',
      })
    ).rejects.toThrow('Server error: file too large');

    (
      saveControllerSaveMxwebToNode as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      data: undefined,
      error: {},
    });

    await expect(
      saveMxwebToNode({
        nodeId: 'node-err2',
        blob: mockSavedFile.blob,
        filename: 'drawing.mxweb',
        errorMessageFallback: '上传失败，请稍后重试',
      })
    ).rejects.toThrow('上传失败，请稍后重试');

    expect(handleError).not.toHaveBeenCalled();
  });
});

describe('showSaveConfirmDialog（从 mxcadSave 收编）', () => {
  it('返回用户输入的修改说明', async () => {
    (globalShowPrompt as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      'Updated section A'
    );
    await expect(showSaveConfirmDialog()).resolves.toBe('Updated section A');
    expect(globalShowPrompt).toHaveBeenCalledWith({
      title: '保存文件',
      label: '修改说明（可选）',
      confirmText: '保存',
      multiline: true,
    });
  });

  it('用户取消返回 null', async () => {
    (globalShowPrompt as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      null
    );
    await expect(showSaveConfirmDialog()).resolves.toBeNull();
  });
});

describe('createDefaultPermissionQuerier', () => {
  it('hasProjectPermission 通过成员权限接口 + 缓存判断 CAD_SAVE', async () => {
    const q = createDefaultPermissionQuerier();
    (
      memberControllerGetUserProjectPermissions as unknown as ReturnType<
        typeof vi.fn
      >
    ).mockResolvedValue({ data: { permissions: ['CAD_SAVE'] } });

    await expect(q.hasProjectPermission('p1', 'CAD_SAVE')).resolves.toBe(true);
    await expect(q.hasProjectPermission('p1', 'CAD_READ')).resolves.toBe(false);
    expect(memberControllerGetUserProjectPermissions).toHaveBeenCalledTimes(1);
  });

  it('hasProjectPermission 接口失败时抛出真实错误（不静默降级为无权限）', async () => {
    const q = createDefaultPermissionQuerier();
    (
      memberControllerGetUserProjectPermissions as unknown as ReturnType<
        typeof vi.fn
      >
    ).mockRejectedValue(new Error('network'));
    // 修复后：接口失败必须抛出让上层显示真实原因，
    // 静默返回 false 会让用户被误导"您没有保存图纸的权限"
    await expect(q.hasProjectPermission('p2', 'CAD_SAVE')).rejects.toThrow(
      'network'
    );
  });

  it('hasLibraryPermission 解析 localStorage user 角色权限（LIBRARY_DRAWING_MANAGE / LIBRARY_BLOCK_MANAGE）', async () => {
    const q = createDefaultPermissionQuerier();
    localStorage.setItem(
      'user',
      JSON.stringify({
        role: {
          permissions: [
            'PROJECT_READ',
            { permission: 'LIBRARY_DRAWING_MANAGE' },
          ],
        },
      })
    );
    await expect(q.hasLibraryPermission()).resolves.toBe(true);

    localStorage.setItem(
      'user',
      JSON.stringify({ role: { permissions: ['PROJECT_READ'] } })
    );
    await expect(q.hasLibraryPermission()).resolves.toBe(false);

    localStorage.setItem('user', JSON.stringify({}));
    await expect(q.hasLibraryPermission()).resolves.toBe(false);

    localStorage.removeItem('user');
    await expect(q.hasLibraryPermission()).resolves.toBe(false);
  });

  it('hasLibraryPermission 解析异常时抛出（调用方 handleError + 另存为）', async () => {
    const q = createDefaultPermissionQuerier();
    localStorage.setItem('user', '{broken json');
    await expect(q.hasLibraryPermission()).rejects.toThrow();
  });
});

describe('saveCurrentFile — 单入口判别（node / library / saveAs）', () => {
  it('我的图纸（parentId === personalSpaceId）→ 节点保存成功', async () => {
    const deps = makeDeps();
    const result = await saveCurrentFile(makeFileInfo(), deps);

    expect(result).toEqual({ status: 'saved' });
    const sdkSave = (deps.sdk.saveMxwebToNode as ReturnType<typeof vi.fn>);
    expect(sdkSave).toHaveBeenCalledTimes(1);
    const [nodeId, body] = sdkSave.mock.calls[0];
    expect(nodeId).toBe('node-abc');
    expect(body.commitMessage).toBeUndefined();

    // 上传文件名带 .mxweb 扩展名规整
    const uploadArgs = (uploadMxCadFile as unknown as ReturnType<typeof vi.fn>)
      .mock.calls[0][0];
    expect(uploadArgs.file.name).toBe('drawing.mxweb');

    // 成功副作用：缓存写回 + pendingImages + 缩略图 + 脏标记复位 + 成功 toast
    expect(writeFileCacheToIndexedDB).toHaveBeenCalledTimes(1);
    const [basePath, newCachePath, data] = (
      writeFileCacheToIndexedDB as unknown as ReturnType<typeof vi.fn>
    ).mock.calls[0];
    expect(basePath).toBe('/api/v1/mxcad/filesData/202607/n1/src.mxweb');
    expect(newCachePath).toContain('?t=');
    // 原始字节透传给缓存写（Uint8Array→ArrayBuffer 归一化在 mxcadCache 内）
    expect(data).toBe(mockSavedFile.data);
    expect(processPendingImages).toHaveBeenCalledTimes(1);
    expect(generateThumbnail).toHaveBeenCalledWith();
    expect(uploadThumbnail).toHaveBeenCalledWith('node-abc', 'data:image/png;base64,x');
    expect(useCADEditorStore.getState().isCurrentFileDeleted).toBe(false);
    expect(globalShowToast).toHaveBeenCalledWith('文件保存成功', 'success');
  });

  it('已删除标记 → triggerSaveAs 并返回 saveAs', async () => {
    useCADEditorStore.getState().setIsCurrentFileDeleted(true);
    const deps = makeDeps();
    const result = await saveCurrentFile(makeFileInfo(), deps);

    expect(result).toEqual({ status: 'saveAs' });
    expect(triggerSaveAs).toHaveBeenCalledTimes(1);
    expect(deps.sdk.getNode).not.toHaveBeenCalled();
    expect(globalShowToast).toHaveBeenCalledWith(
      '当前图纸已被删除，保存将另存为新文件',
      'warning'
    );
  });

  it('节点已删除（fileStatus DELETED）→ 置标记 + 另存为', async () => {
    const deps = makeDeps({
      sdk: {
        getNode: vi.fn().mockResolvedValue({
          data: { fileStatus: 'DELETED', deletedAt: '2026-07-01T00:00:00Z' },
        }),
      },
    });
    const result = await saveCurrentFile(makeFileInfo(), deps);

    expect(result).toEqual({ status: 'saveAs' });
    expect(useCADEditorStore.getState().isCurrentFileDeleted).toBe(true);
    expect(showSaveAsDialog).toHaveBeenCalledWith('ps-1', 'drawing.dwg');
  });

  it('节点查询返回 NOT_FOUND（已删除）→ 按已删除处理（另存为）', async () => {
    const deps = makeDeps({
      sdk: {
        getNode: vi
          .fn()
          .mockRejectedValue({ code: 'NOT_FOUND', message: '节点不存在' }),
      },
    });
    const result = await saveCurrentFile(makeFileInfo(), deps);

    expect(result).toEqual({ status: 'saveAs' });
    expect(useCADEditorStore.getState().isCurrentFileDeleted).toBe(true);
    expect(showSaveAsDialog).toHaveBeenCalled();
  });

  it('节点查询异常（非 404）→ 透传真实错误，不误导为"图纸已删除"', async () => {
    const deps = makeDeps({
      sdk: { getNode: vi.fn().mockRejectedValue(new Error('network')) },
    });
    const result = await saveCurrentFile(makeFileInfo(), deps);

    expect(result.status).toBe('failed');
    expect(useCADEditorStore.getState().isCurrentFileDeleted).toBe(false);
    expect(showSaveAsDialog).not.toHaveBeenCalled();
    expect(globalShowToast).toHaveBeenCalledWith('network', 'error');
  });

  it('项目文件有 CAD_SAVE 权限 → 节点保存', async () => {
    const deps = makeDeps();
    const info = makeFileInfo({ parentId: 'proj-1', projectId: 'proj-1' });
    const result = await saveCurrentFile(info, deps);

    expect(result).toEqual({ status: 'saved' });
    expect(deps.permissions.hasProjectPermission).toHaveBeenCalledWith(
      'proj-1',
      'CAD_SAVE'
    );
  });

  it('项目文件无 CAD_SAVE 权限 → 提示 + 另存为', async () => {
    const deps = makeDeps({
      permissions: { hasProjectPermission: vi.fn().mockResolvedValue(false) },
    });
    const info = makeFileInfo({ parentId: 'proj-1', projectId: 'proj-1' });
    const result = await saveCurrentFile(info, deps);

    expect(result).toEqual({ status: 'saveAs' });
    expect(showSaveAsDialog).toHaveBeenCalledWith('ps-1', 'drawing.dwg');
    expect(globalShowToast).toHaveBeenCalledWith(
      '当前图纸没有保存权限，已为您打开另存为窗口',
      'warning'
    );
  });

  it('项目权限检查抛异常 → 回退另存为', async () => {
    const deps = makeDeps({
      permissions: {
        hasProjectPermission: vi.fn().mockRejectedValue(new Error('boom')),
      },
    });
    const info = makeFileInfo({ parentId: 'proj-1', projectId: 'proj-1' });
    const result = await saveCurrentFile(info, deps);

    expect(result).toEqual({ status: 'saveAs' });
    expect(showSaveAsDialog).toHaveBeenCalled();
  });

  it('节点保存路径：节点自身权限检查失败 → 错误 toast + failed', async () => {
    // 我的图纸且带 projectId → 走 saveToNodeFile 内层权限检查（无 CAD_SAVE）
    const deps = makeDeps({
      permissions: { hasProjectPermission: vi.fn().mockResolvedValue(false) },
    });
    const result = await saveCurrentFile(
      makeFileInfo({ parentId: 'ps-1', projectId: 'proj-1' }),
      deps
    );

    expect(result).toEqual({
      status: 'failed',
      error: '您没有保存图纸的权限',
    });
    expect(globalShowToast).toHaveBeenCalledWith('您没有保存图纸的权限', 'error');
  });

  it('保存确认取消 → cancelled（不触发上传）', async () => {
    (globalShowPrompt as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      null
    );
    const deps = makeDeps();
    const result = await saveCurrentFile(makeFileInfo(), deps);

    expect(result).toEqual({ status: 'cancelled' });
    expect(saveCurrentDrawingToBlob).not.toHaveBeenCalled();
  });

  it('上传失败 → failed + 错误 toast', async () => {
    const deps = makeDeps({
      sdk: {
        saveMxwebToNode: vi.fn().mockResolvedValue({
          data: undefined,
          error: { message: '配额不足' },
        }),
      },
    });
    const result = await saveCurrentFile(makeFileInfo(), deps);

    expect(result).toEqual({ status: 'failed', error: 'Error: 配额不足' });
    expect(globalShowToast).toHaveBeenCalledWith('配额不足', 'error');
  });

  it('资源库文件有库权限 → 库保存成功', async () => {
    const deps = makeDeps({
      permissions: { hasLibraryPermission: vi.fn().mockResolvedValue(true) },
    });
    const info = makeFileInfo({
      parentId: 'lib-drawing',
      projectId: null,
      libraryKey: 'drawing',
      path: '202607/lib/node.mxweb',
    });
    const result = await saveCurrentFile(info, deps);

    expect(result).toEqual({ status: 'saved' });
    const uploadArgs = (uploadMxCadFile as unknown as ReturnType<typeof vi.fn>)
      .mock.calls[0][0];
    expect(uploadArgs.file.name).toBe('drawing.mxweb');
    const [basePath] = (
      writeFileCacheToIndexedDB as unknown as ReturnType<typeof vi.fn>
    ).mock.calls[0];
    expect(basePath).toBe('/api/v1/library/drawing/filesData/202607/lib/node.mxweb');
    // 库缩略图用视图坐标包围盒（isUseViewCADCoord=true）
    expect(generateThumbnail).toHaveBeenCalledWith(true);
  });

  it('资源库文件无库权限 → 提示 + 另存为', async () => {
    const deps = makeDeps({
      permissions: { hasLibraryPermission: vi.fn().mockResolvedValue(false) },
    });
    const info = makeFileInfo({
      parentId: 'lib-drawing',
      projectId: null,
      libraryKey: 'drawing',
      path: '202607/lib/node.mxweb',
    });
    const result = await saveCurrentFile(info, deps);

    expect(result).toEqual({ status: 'saveAs' });
    expect(showSaveAsDialog).toHaveBeenCalled();
    expect(globalShowToast).toHaveBeenCalledWith(
      '当前图纸没有保存权限，已为您打开另存为窗口',
      'warning'
    );
    expect(deps.sdk.saveMxwebToNode).not.toHaveBeenCalled();
  });

  it('资源库权限查询异常 → handleError + 另存为（不 toast 权限提示）', async () => {
    const deps = makeDeps({
      permissions: {
        hasLibraryPermission: vi.fn().mockRejectedValue(new Error('parse')),
      },
    });
    const info = makeFileInfo({
      parentId: 'lib-drawing',
      projectId: null,
      libraryKey: 'drawing',
      path: '202607/lib/node.mxweb',
    });
    const result = await saveCurrentFile(info, deps);

    expect(result).toEqual({ status: 'saveAs' });
    expect(showSaveAsDialog).toHaveBeenCalled();
    expect(handleError).toHaveBeenCalled();
    expect(globalShowToast).not.toHaveBeenCalledWith(
      '当前图纸没有保存权限，已为您打开另存为窗口',
      'warning'
    );
  });

  it('资源库保存失败 → failed + 错误 toast', async () => {
    const deps = makeDeps({
      permissions: { hasLibraryPermission: vi.fn().mockResolvedValue(true) },
      sdk: {
        saveMxwebToNode: vi.fn().mockResolvedValue({
          data: undefined,
          error: { message: '库写入失败' },
        }),
      },
    });
    const info = makeFileInfo({
      parentId: 'lib-drawing',
      projectId: null,
      libraryKey: 'drawing',
      path: '202607/lib/node.mxweb',
    });
    const result = await saveCurrentFile(info, deps);

    expect(result.status).toBe('failed');
    expect(globalShowToast).toHaveBeenCalledWith('库写入失败', 'error');
  });

  it('无个人空间 ID 时普通文件走项目权限分支（未命中则另存为）', async () => {
    (getPersonalSpaceId as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      null
    );
    const deps = makeDeps({
      permissions: { hasProjectPermission: vi.fn().mockResolvedValue(false) },
    });
    const result = await saveCurrentFile(
      makeFileInfo({ parentId: null, projectId: null }),
      deps
    );

    expect(result).toEqual({ status: 'saveAs' });
    expect(showSaveAsDialog).toHaveBeenCalled();
  });

  it('默认依赖可独立创建（SDK 句柄 + 权限查询器）', () => {
    const deps = createDefaultSaveDeps();
    expect(deps.sdk.getNode).toBeInstanceOf(Function);
    expect(deps.sdk.getLibraryNode).toBeInstanceOf(Function);
    expect(deps.permissions.hasLibraryPermission).toBeInstanceOf(Function);
  });

  it('默认 SDK 句柄把参数桥接到 api-sdk（getLibraryNode 按 key 分派）', async () => {
    const sdk = createDefaultSaveSdk();
    const { libraryControllerGetDrawingNode, libraryControllerGetBlockNode } =
      await import('@/api-sdk');
    (
      libraryControllerGetDrawingNode as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ data: { path: 'p' } });
    (
      libraryControllerGetBlockNode as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ data: { path: 'p' } });

    await sdk.getLibraryNode('n1', 'drawing');
    await sdk.getLibraryNode('n1', 'block');
    expect(libraryControllerGetDrawingNode).toHaveBeenCalledWith({
      path: { nodeId: 'n1' },
    });
    expect(libraryControllerGetBlockNode).toHaveBeenCalledWith({
      path: { nodeId: 'n1' },
    });
  });
});
