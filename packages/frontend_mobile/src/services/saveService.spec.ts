import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saveControllerSaveMxwebAs } from '../api-sdk';

const mockCalculateFileHash = vi.fn().mockResolvedValue('mock-hash-123');
const mockUploadFile = vi.fn().mockResolvedValue(undefined);
const mockSanitizeFileName = vi.fn().mockImplementation((n: string) => n);
const mockGetApiBaseUrl = vi.fn().mockReturnValue('http://localhost:3000/api/v1');

vi.mock('../utils/hashUtils', () => ({
  calculateFileHash: mockCalculateFileHash,
}));

vi.mock('../utils/apiConfig', () => ({
  getApiBaseUrl: mockGetApiBaseUrl,
}));

vi.mock('../utils/sanitizeFileName', () => ({
  sanitizeFileName: mockSanitizeFileName,
}));

vi.mock('./mobileUploadService', () => ({
  uploadFile: mockUploadFile,
}));

vi.mock('../api-sdk', () => ({
  saveControllerSaveMxwebAs: vi.fn(),
  libraryControllerSaveDrawingNode: vi.fn(),
  libraryControllerSaveBlockNode: vi.fn(),
}));

const { getMxwebBlob, saveToNode, saveAs } = await import('./saveService');

describe('saveService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getMxwebBlob', () => {
    it('无 CAD 环境时抛出错误', async () => {
      await expect(getMxwebBlob()).rejects.toThrow();
    });
  });

  describe('saveToNode', () => {
    it('应计算 hash 并上传文件', async () => {
      const blob = new Blob(['test data'], { type: 'application/octet-stream' });
      const promise = saveToNode('node-123', blob, 'commit msg');
      // 由于需要 fetch mock，预期因网络错误返回 reject
      await expect(promise).rejects.toThrow();
      expect(mockCalculateFileHash).toHaveBeenCalled();
      expect(mockUploadFile).toHaveBeenCalled();
    });
  });

  describe('saveAs', () => {
    it('应计算 hash、上传文件并以 hash 模式调用 save-as', async () => {
      vi.mocked(saveControllerSaveMxwebAs).mockResolvedValue({
        data: { nodeId: 'new-node-1' },
        error: undefined,
      } as never);
      const blob = new Blob(['test data'], { type: 'application/octet-stream' });

      const result = await saveAs({
        blob,
        targetType: 'personal',
        targetParentId: 'parent-1',
        fileName: 'my-drawing',
        format: 'mxweb',
      });

      expect(result).toEqual({ nodeId: 'new-node-1' });
      expect(mockCalculateFileHash).toHaveBeenCalled();
      expect(mockUploadFile).toHaveBeenCalledWith(
        expect.objectContaining({
          hash: 'mock-hash-123',
          nodeId: '',
          forceUpload: true,
          skipDb: true,
        })
      );
      const body = vi.mocked(saveControllerSaveMxwebAs).mock.calls[0][0]
        .body as Record<string, unknown>;
      expect(body.hash).toBe('mock-hash-123');
      expect(body.targetType).toBe('personal');
      expect(body.targetParentId).toBe('parent-1');
      expect(body.fileName).toBe('my-drawing');
      expect(body.format).toBe('mxweb');
      expect(body.file).toBeUndefined();
    });

    it('save-as 失败时抛出错误', async () => {
      vi.mocked(saveControllerSaveMxwebAs).mockResolvedValue({
        data: undefined,
        error: { message: '保存失败' },
      } as never);
      const blob = new Blob(['test data'], { type: 'application/octet-stream' });

      await expect(
        saveAs({
          blob,
          targetType: 'project',
          targetParentId: 'parent-1',
          projectId: 'project-1',
        })
      ).rejects.toThrow('保存失败');
      const body = vi.mocked(saveControllerSaveMxwebAs).mock.calls[0][0]
        .body as Record<string, unknown>;
      expect(body.projectId).toBe('project-1');
    });
  });
});
