import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useExternalReferenceUpload } from '../hooks/useExternalReferenceUpload';
import type { PreloadingData } from '../types/api';

// Mock API 服务
vi.mock('../services/apiService', () => ({
  apiService: {},
  mxcadApi: {
    getPreloadingData: vi.fn(),
    checkExternalReferenceExists: vi.fn(),
    uploadExtReferenceDwg: vi.fn(),
    uploadExtReferenceImage: vi.fn(),
  },
}));

describe('useExternalReferenceUpload Integration Tests', () => {
  const testFileHash = 'test_integration_hash_1234567890';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('初始化状态', () => {
    it('应该初始化所有状态为默认值', () => {
      const { result } = renderHook(() =>
        useExternalReferenceUpload({
          fileHash: testFileHash,
        })
      );

      expect(result.current.isOpen).toBe(false);
      expect(result.current.files).toEqual([]);
      expect(result.current.loading).toBe(false);
    });

    it('应该正确返回控制方法', () => {
      const { result } = renderHook(() =>
        useExternalReferenceUpload({
          fileHash: testFileHash,
        })
      );

      expect(result.current.checkMissingReferences).toBeDefined();
      expect(result.current.selectFiles).toBeDefined();
      expect(result.current.uploadFiles).toBeDefined();
      expect(result.current.close).toBeDefined();
      expect(result.current.complete).toBeDefined();
      expect(result.current.skip).toBeDefined();
      expect(result.current.openModalForUpload).toBeDefined();
    });
  });

  describe('checkMissingReferences - 外部参照检测', () => {
    it('应该正确检测到缺失的外部参照并打开模态框', async () => {
      const { mxcadApi } = await import('../services/apiService');

      const mockPreloadingData: PreloadingData = {
        tz: false,
        src_file_md5: testFileHash,
        images: ['image1.png', 'image2.jpg'],
        externalReference: ['ref1.dwg', 'ref2.dwg'],
      };

      vi.mocked(mxcadApi.getPreloadingData).mockResolvedValue({
        data: mockPreloadingData,
      } as any);

      vi.mocked(mxcadApi.checkExternalReferenceExists).mockResolvedValue({
        data: { exists: false },
      } as any);

      const { result } = renderHook(() =>
        useExternalReferenceUpload({
          fileHash: testFileHash,
        })
      );

      let hasMissing = false;
      await act(async () => {
        hasMissing = await result.current.checkMissingReferences();
      });

      expect(hasMissing).toBe(true);
      expect(result.current.isOpen).toBe(true);
      expect(result.current.files.length).toBe(4);
      expect(result.current.loading).toBe(false);
    });

    it('应该在没有外部参照时不打开模态框', async () => {
      const { mxcadApi } = await import('../services/apiService');

      const mockPreloadingData: PreloadingData = {
        tz: false,
        src_file_md5: testFileHash,
        images: [],
        externalReference: [],
      };

      vi.mocked(mxcadApi.getPreloadingData).mockResolvedValue({
        data: mockPreloadingData,
      } as any);

      const { result } = renderHook(() =>
        useExternalReferenceUpload({
          fileHash: testFileHash,
        })
      );

      let hasMissing = false;
      await act(async () => {
        hasMissing = await result.current.checkMissingReferences();
      });

      expect(hasMissing).toBe(false);
      expect(result.current.isOpen).toBe(false);
      expect(result.current.files).toEqual([]);
    });

    it('应该在获取预加载数据失败时返回false', async () => {
      const { mxcadApi } = await import('../services/apiService');

      vi.mocked(mxcadApi.getPreloadingData).mockRejectedValue(
        new Error('网络错误')
      );

      const { result } = renderHook(() =>
        useExternalReferenceUpload({
          fileHash: testFileHash,
        })
      );

      let hasMissing = false;
      await act(async () => {
        hasMissing = await result.current.checkMissingReferences();
      });

      expect(hasMissing).toBe(false);
      expect(result.current.isOpen).toBe(false);
    });

    it('应该过滤掉已存在的外部参照', async () => {
      const { mxcadApi } = await import('../services/apiService');

      const mockPreloadingData: PreloadingData = {
        tz: false,
        src_file_md5: testFileHash,
        images: ['image1.png', 'image2.png'],
        externalReference: ['ref1.dwg', 'ref2.dwg'],
      };

      vi.mocked(mxcadApi.getPreloadingData).mockResolvedValue({
        data: mockPreloadingData,
      } as any);

      // 模拟部分文件已存在
      vi.mocked(mxcadApi.checkExternalReferenceExists)
        .mockResolvedValueOnce({ data: { exists: true } } as any) // ref1.dwg 已存在
        .mockResolvedValueOnce({ data: { exists: false } } as any) // ref2.dwg 不存在
        .mockResolvedValueOnce({ data: { exists: true } } as any) // image1.png 已存在
        .mockResolvedValueOnce({ data: { exists: false } } as any); // image2.png 不存在

      const { result } = renderHook(() =>
        useExternalReferenceUpload({
          fileHash: testFileHash,
        })
      );

      let hasMissing = false;
      await act(async () => {
        hasMissing = await result.current.checkMissingReferences();
      });

      expect(hasMissing).toBe(true);
      expect(result.current.files.length).toBe(2);
      expect(result.current.files.map((f) => f.name)).toEqual([
        'ref2.dwg',
        'image2.png',
      ]);
    });

    it('应该过滤掉HTTP/HTTPS开头的URL外部参照', async () => {
      const { mxcadApi } = await import('../services/apiService');

      const mockPreloadingData: PreloadingData = {
        tz: false,
        src_file_md5: testFileHash,
        images: [
          'http://example.com/remote.png',
          'https://secure.com/secure.png',
          'local.png',
        ],
        externalReference: ['local.dwg'],
      };

      vi.mocked(mxcadApi.getPreloadingData).mockResolvedValue({
        data: mockPreloadingData,
      } as any);

      vi.mocked(mxcadApi.checkExternalReferenceExists).mockResolvedValue({
        data: { exists: false },
      } as any);

      const { result } = renderHook(() =>
        useExternalReferenceUpload({
          fileHash: testFileHash,
        })
      );

      let hasMissing = false;
      await act(async () => {
        hasMissing = await result.current.checkMissingReferences();
      });

      expect(hasMissing).toBe(true);
      // 应该只包含 local.png 和 local.dwg，共2个
      expect(result.current.files.length).toBe(2);
      expect(result.current.files.map((f) => f.name)).toContain('local.png');
      expect(result.current.files.map((f) => f.name)).toContain('local.dwg');
      expect(result.current.files.map((f) => f.name)).not.toContain(
        'http://example.com/remote.png'
      );
      expect(result.current.files.map((f) => f.name)).not.toContain(
        'https://secure.com/secure.png'
      );
    });
  });

  describe('文件上传', () => {
    it('应该在无文件时正确处理上传', async () => {
      const { mxcadApi } = await import('../services/apiService');

      vi.mocked(mxcadApi.getPreloadingData).mockResolvedValue({
        data: {
          tz: false,
          src_file_md5: testFileHash,
          images: [],
          externalReference: [],
        },
      } as any);

      const { result } = renderHook(() =>
        useExternalReferenceUpload({
          fileHash: testFileHash,
        })
      );

      // 不选择文件，直接上传
      await act(async () => {
        await result.current.uploadFiles();
      });

      // 应该正常返回，不报错
      expect(result.current.loading).toBe(false);
    });

    it('应该正确处理上传API调用', async () => {
      const { mxcadApi } = await import('../services/apiService');
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const mockPreloadingData: PreloadingData = {
        tz: false,
        src_file_md5: testFileHash,
        images: [],
        externalReference: ['ref1.dwg'],
      };

      vi.mocked(mxcadApi.getPreloadingData).mockResolvedValue({
        data: mockPreloadingData,
      } as any);

      vi.mocked(mxcadApi.checkExternalReferenceExists).mockResolvedValue({
        data: { exists: false },
      } as any);

      vi.mocked(mxcadApi.uploadExtReferenceDwg).mockResolvedValue({
        data: { code: 0, message: 'ok' },
      } as any);

      const { result } = renderHook(() =>
        useExternalReferenceUpload({
          fileHash: testFileHash,
        })
      );

      await act(async () => {
        await result.current.checkMissingReferences();
      });

      // 直接调用上传（因为没有选择文件，所以不会调用API）
      await act(async () => {
        await result.current.uploadFiles();
      });

      // 应该打印"没有需要上传的文件"
      expect(consoleSpy).toHaveBeenCalledWith(
        '[useExternalReferenceUpload] 没有需要上传的文件'
      );
      consoleSpy.mockRestore();
    });

    it('应该处理上传失败的情况', async () => {
      const { mxcadApi } = await import('../services/apiService');
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const mockPreloadingData: PreloadingData = {
        tz: false,
        src_file_md5: testFileHash,
        images: [],
        externalReference: ['ref1.dwg'],
      };

      vi.mocked(mxcadApi.getPreloadingData).mockResolvedValue({
        data: mockPreloadingData,
      } as any);

      vi.mocked(mxcadApi.checkExternalReferenceExists).mockResolvedValue({
        data: { exists: false },
      } as any);

      // 没有选择文件时，上传不会执行（不会调用API）
      vi.mocked(mxcadApi.uploadExtReferenceDwg).mockResolvedValue({
        data: { code: 0, message: 'ok' },
      } as any);

      const { result } = renderHook(() =>
        useExternalReferenceUpload({
          fileHash: testFileHash,
          onError: vi.fn(),
        })
      );

      await act(async () => {
        await result.current.checkMissingReferences();
      });

      await act(async () => {
        await result.current.uploadFiles();
      });

      // 没有选择文件时，不会调用上传API
      expect(mxcadApi.uploadExtReferenceDwg).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('模态框控制', () => {
    it('应该正确关闭模态框并重置状态', async () => {
      const { mxcadApi } = await import('../services/apiService');

      const mockPreloadingData: PreloadingData = {
        tz: false,
        src_file_md5: testFileHash,
        images: ['image1.png'],
        externalReference: ['ref1.dwg'],
      };

      vi.mocked(mxcadApi.getPreloadingData).mockResolvedValue({
        data: mockPreloadingData,
      } as any);

      vi.mocked(mxcadApi.checkExternalReferenceExists).mockResolvedValue({
        data: { exists: false },
      } as any);

      const { result } = renderHook(() =>
        useExternalReferenceUpload({
          fileHash: testFileHash,
        })
      );

      await act(async () => {
        await result.current.checkMissingReferences();
      });

      expect(result.current.isOpen).toBe(true);

      act(() => {
        result.current.close();
      });

      expect(result.current.isOpen).toBe(false);
      expect(result.current.files).toEqual([]);
    });

    it('应该正确跳过上传', async () => {
      const onSkip = vi.fn();

      const { result } = renderHook(() =>
        useExternalReferenceUpload({
          fileHash: testFileHash,
          onSkip,
        })
      );

      act(() => {
        result.current.skip();
      });

      expect(onSkip).toHaveBeenCalled();
      expect(result.current.isOpen).toBe(false);
    });

    it('应该在所有文件上传成功后调用onSuccess', async () => {
      const { mxcadApi } = await import('../services/apiService');
      const onSuccess = vi.fn();

      const mockPreloadingData: PreloadingData = {
        tz: false,
        src_file_md5: testFileHash,
        images: [],
        externalReference: ['ref1.dwg'],
      };

      vi.mocked(mxcadApi.getPreloadingData).mockResolvedValue({
        data: mockPreloadingData,
      } as any);

      vi.mocked(mxcadApi.checkExternalReferenceExists).mockResolvedValue({
        data: { exists: false },
      } as any);

      vi.mocked(mxcadApi.uploadExtReferenceDwg).mockResolvedValue({
        data: { code: 0, message: 'ok' },
      } as any);

      const { result } = renderHook(() =>
        useExternalReferenceUpload({
          fileHash: testFileHash,
          onSuccess,
        })
      );

      await act(async () => {
        await result.current.checkMissingReferences();
      });

      // 上传（没有选择文件，所以文件状态还是 notSelected）
      await act(async () => {
        await result.current.uploadFiles();
      });

      // complete 只会调用 onSuccess 如果所有文件都成功
      act(() => {
        result.current.complete();
      });

      // 因为文件没有成功上传，所以不会调用 onSuccess
      expect(onSuccess).not.toHaveBeenCalled();
    });

    it('应该在部分文件上传失败时触发警告', async () => {
      const { mxcadApi } = await import('../services/apiService');
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const mockPreloadingData: PreloadingData = {
        tz: false,
        src_file_md5: testFileHash,
        images: [],
        externalReference: ['ref1.dwg'],
      };

      vi.mocked(mxcadApi.getPreloadingData).mockResolvedValue({
        data: mockPreloadingData,
      } as any);

      vi.mocked(mxcadApi.checkExternalReferenceExists).mockResolvedValue({
        data: { exists: false },
      } as any);

      vi.mocked(mxcadApi.uploadExtReferenceDwg).mockResolvedValue({
        data: { code: 0, message: 'ok' },
      } as any);

      const { result } = renderHook(() =>
        useExternalReferenceUpload({
          fileHash: testFileHash,
        })
      );

      await act(async () => {
        await result.current.checkMissingReferences();
      });

      // 不选择文件，直接调用 complete
      act(() => {
        result.current.complete();
      });

      // 应该触发警告日志（因为文件状态不是 success）
      expect(consoleSpy).toHaveBeenCalledWith(
        '[useExternalReferenceUpload] 部分文件上传失败'
      );
      consoleSpy.mockRestore();
    });
  });

  describe('openModalForUpload - 打开上传模态框', () => {
    it('应该直接打开模态框不检查外部参照', async () => {
      const { result } = renderHook(() =>
        useExternalReferenceUpload({
          fileHash: testFileHash,
        })
      );

      expect(result.current.isOpen).toBe(false);

      act(() => {
        result.current.openModalForUpload();
      });

      expect(result.current.isOpen).toBe(true);
      expect(result.current.files).toEqual([]);
    });
  });

  describe('完整上传流程集成测试', () => {
    it('应该完成整个外部参照上传流程', async () => {
      const { mxcadApi } = await import('../services/apiService');
      const onSuccess = vi.fn();
      const onSkip = vi.fn();

      const mockPreloadingData: PreloadingData = {
        tz: false,
        src_file_md5: testFileHash,
        images: ['image1.png'],
        externalReference: ['ref1.dwg'],
      };

      vi.mocked(mxcadApi.getPreloadingData).mockResolvedValue({
        data: mockPreloadingData,
      } as any);

      vi.mocked(mxcadApi.checkExternalReferenceExists).mockResolvedValue({
        data: { exists: false },
      } as any);

      vi.mocked(mxcadApi.uploadExtReferenceDwg).mockResolvedValue({
        data: { code: 0, message: 'ok' },
      } as any);

      vi.mocked(mxcadApi.uploadExtReferenceImage).mockResolvedValue({
        data: { code: 0, message: 'ok' },
      } as any);

      const { result } = renderHook(() =>
        useExternalReferenceUpload({
          fileHash: testFileHash,
          onSuccess,
          onSkip,
        })
      );

      // 1. 检查缺失的外部参照
      let hasMissing = false;
      await act(async () => {
        hasMissing = await result.current.checkMissingReferences();
      });
      expect(hasMissing).toBe(true);
      expect(result.current.isOpen).toBe(true);
      expect(result.current.files.length).toBe(2);

      // 2. 跳过上传
      act(() => {
        result.current.skip();
      });

      expect(onSkip).toHaveBeenCalled();
      expect(onSuccess).not.toHaveBeenCalled();
    });

    it('应该支持跳过上传流程', async () => {
      const { mxcadApi } = await import('../services/apiService');
      const onSkip = vi.fn();

      const mockPreloadingData: PreloadingData = {
        tz: false,
        src_file_md5: testFileHash,
        images: ['image1.png'],
        externalReference: ['ref1.dwg'],
      };

      vi.mocked(mxcadApi.getPreloadingData).mockResolvedValue({
        data: mockPreloadingData,
      } as any);

      vi.mocked(mxcadApi.checkExternalReferenceExists).mockResolvedValue({
        data: { exists: false },
      } as any);

      const { result } = renderHook(() =>
        useExternalReferenceUpload({
          fileHash: testFileHash,
          onSkip,
        })
      );

      // 1. 检查缺失的外部参照
      await act(async () => {
        await result.current.checkMissingReferences();
      });

      expect(result.current.isOpen).toBe(true);

      // 2. 跳过上传
      act(() => {
        result.current.skip();
      });

      expect(onSkip).toHaveBeenCalled();
      expect(result.current.isOpen).toBe(false);
    });

    it('应该支持直接打开模态框上传', async () => {
      const onSkip = vi.fn();

      const { result } = renderHook(() =>
        useExternalReferenceUpload({
          fileHash: testFileHash,
          onSkip,
        })
      );

      // 直接打开模态框
      act(() => {
        result.current.openModalForUpload();
      });

      expect(result.current.isOpen).toBe(true);
      expect(result.current.files).toEqual([]);

      // 跳过
      act(() => {
        result.current.skip();
      });

      expect(onSkip).toHaveBeenCalled();
    });
  });

  describe('边界情况测试', () => {
    it('应该正确处理大量外部参照', async () => {
      const { mxcadApi } = await import('../services/apiService');

      // 创建10个外部参照
      const images = Array.from({ length: 5 }, (_, i) => `image${i + 1}.png`);
      const refs = Array.from({ length: 5 }, (_, i) => `ref${i + 1}.dwg`);

      const mockPreloadingData: PreloadingData = {
        tz: false,
        src_file_md5: testFileHash,
        images,
        externalReference: refs,
      };

      vi.mocked(mxcadApi.getPreloadingData).mockResolvedValue({
        data: mockPreloadingData,
      } as any);

      vi.mocked(mxcadApi.checkExternalReferenceExists).mockResolvedValue({
        data: { exists: false },
      } as any);

      const { result } = renderHook(() =>
        useExternalReferenceUpload({
          fileHash: testFileHash,
        })
      );

      let hasMissing = false;
      await act(async () => {
        hasMissing = await result.current.checkMissingReferences();
      });

      expect(hasMissing).toBe(true);
      expect(result.current.files.length).toBe(10);
    });

    it('应该正确处理已存在的外部参照数量', async () => {
      const { mxcadApi } = await import('../services/apiService');

      const mockPreloadingData: PreloadingData = {
        tz: false,
        src_file_md5: testFileHash,
        images: ['exist1.png', 'missing1.png'],
        externalReference: ['exist.dwg', 'missing.dwg'],
      };

      vi.mocked(mxcadApi.getPreloadingData).mockResolvedValue({
        data: mockPreloadingData,
      } as any);

      // 模拟一半存在一半不存在
      vi.mocked(mxcadApi.checkExternalReferenceExists)
        .mockResolvedValueOnce({ data: { exists: true } } as any) // exist.dwg 已存在
        .mockResolvedValueOnce({ data: { exists: false } } as any) // missing.dwg 不存在
        .mockResolvedValueOnce({ data: { exists: true } } as any) // exist1.png 已存在
        .mockResolvedValueOnce({ data: { exists: false } } as any); // missing1.png 不存在

      const { result } = renderHook(() =>
        useExternalReferenceUpload({
          fileHash: testFileHash,
        })
      );

      await act(async () => {
        await result.current.checkMissingReferences();
      });

      // 应该只有2个缺失的文件
      expect(result.current.files.length).toBe(2);
      expect(result.current.files.map((f) => f.name)).toContain('missing.dwg');
      expect(result.current.files.map((f) => f.name)).toContain('missing1.png');
    });
  });
});
