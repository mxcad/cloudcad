import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { apiService, mxcadApi } from './apiService';
import { PreloadingData, CheckReferenceExistsResult } from '../types/api';

describe('MxCAD API Methods', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getPreloadingData', () => {
    it('应该成功获取预加载数据', async () => {
      const mockData: PreloadingData = {
        tz: false,
        src_file_md5: 'testhash123',
        images: ['image1.png', 'image2.jpg'],
        externalReference: ['ref1.dwg', 'ref2.dwg'],
      };

      const mockResponse = {
        data: mockData,
        status: 200,
      };

      const getSpy = vi
        .spyOn(apiService, 'get')
        .mockResolvedValue(mockResponse);

      const result = await apiService.getPreloadingData('testnode123');

      expect(getSpy).toHaveBeenCalledWith('/mxcad/file/testnode123/preloading');
      expect(result.data).toEqual(mockData);
    });

    it('应该在文件不存在时返回 404', async () => {
      const mockError = {
        response: {
          status: 404,
          data: { code: -1, message: '预加载数据不存在' },
        },
      };

      const getSpy = vi.spyOn(apiService, 'get').mockRejectedValue(mockError);

      await expect(
        apiService.getPreloadingData('nonexistent')
      ).rejects.toThrow();
      expect(getSpy).toHaveBeenCalledWith('/mxcad/file/nonexistent/preloading');
    });
  });

  describe('checkExternalReferenceExists', () => {
    it('应该成功检查文件存在性', async () => {
      const mockResponse = {
        data: { exists: true },
        status: 200,
      };

      const postSpy = vi
        .spyOn(apiService, 'post')
        .mockResolvedValue(mockResponse);

      const result = await apiService.checkExternalReferenceExists(
        'testnode123',
        'ref1.dwg'
      );

      expect(postSpy).toHaveBeenCalledWith(
        '/mxcad/file/testnode123/check-reference',
        { fileName: 'ref1.dwg' }
      );
      expect(result.data.exists).toBe(true);
    });

    it('应该返回文件不存在', async () => {
      const mockResponse = {
        data: { exists: false },
        status: 200,
      };

      const postSpy = vi
        .spyOn(apiService, 'post')
        .mockResolvedValue(mockResponse);

      const result = await apiService.checkExternalReferenceExists(
        'testnode123',
        'nonexistent.dwg'
      );

      expect(result.data.exists).toBe(false);
      expect(postSpy).toHaveBeenCalledWith(
        '/mxcad/file/testnode123/check-reference',
        { fileName: 'nonexistent.dwg' }
      );
    });
  });

  describe('mxcadApi便捷方法', () => {
    it('getPreloadingData 应该调用正确的 API', async () => {
      const mockData: PreloadingData = {
        tz: true,
        src_file_md5: 'abc123',
        images: [],
        externalReference: [],
      };

      const mockResponse = {
        data: mockData,
        status: 200,
      };

      const getSpy = vi
        .spyOn(apiService, 'get')
        .mockResolvedValue(mockResponse);

      const result = await mxcadApi.getPreloadingData('abcnode123');

      expect(getSpy).toHaveBeenCalledWith('/mxcad/file/abcnode123/preloading');
      expect(result.data).toEqual(mockData);
    });

    it('checkExternalReferenceExists 应该调用正确的 API', async () => {
      const mockResponse = {
        data: { exists: true },
        status: 200,
      };

      const postSpy = vi
        .spyOn(apiService, 'post')
        .mockResolvedValue(mockResponse);

      const result = await mxcadApi.checkExternalReferenceExists(
        'abcnode123',
        'test.dwg'
      );

      expect(postSpy).toHaveBeenCalledWith(
        '/mxcad/file/abcnode123/check-reference',
        { fileName: 'test.dwg' }
      );
      expect(result.data.exists).toBe(true);
    });

    it('uploadExtReferenceDwg 应该正确上传文件', async () => {
      const mockResponse = {
        data: { ret: 'ok' },
        status: 200,
      };

      const postSpy = vi
        .spyOn(apiService, 'post')
        .mockResolvedValue(mockResponse);

      const testFile = new File(['test content'], 'test.dwg', {
        type: 'application/dwg',
      });
      await mxcadApi.uploadExtReferenceDwg(testFile, 'srcNode', 'refFile.dwg');

      expect(postSpy).toHaveBeenCalledWith(
        '/mxcad/up_ext_reference_dwg',
        expect.any(FormData),
        expect.objectContaining({
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      );

      // 验证 FormData 内容
      const calledWith = postSpy.mock.calls[0][1] as FormData;
      expect(calledWith.get('file')).toBeDefined();
      expect(calledWith.get('nodeId')).toBe('srcNode');
      expect(calledWith.get('ext_ref_file')).toBe('refFile.dwg');
    });

    it('uploadExtReferenceImage 应该正确上传图片', async () => {
      const mockResponse = {
        data: { ret: 'ok' },
        status: 200,
      };

      const postSpy = vi
        .spyOn(apiService, 'post')
        .mockResolvedValue(mockResponse);

      const testFile = new File(['test content'], 'test.png', {
        type: 'image/png',
      });
      await mxcadApi.uploadExtReferenceImage(
        testFile,
        'srcNode',
        'refImage.png'
      );

      expect(postSpy).toHaveBeenCalledWith(
        '/mxcad/up_ext_reference_image',
        expect.any(FormData),
        expect.objectContaining({
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      );

      // 验证 FormData 内容
      const calledWith = postSpy.mock.calls[0][1] as FormData;
      expect(calledWith.get('file')).toBeDefined();
      expect(calledWith.get('nodeId')).toBe('srcNode');
      expect(calledWith.get('ext_ref_file')).toBe('refImage.png');
    });
  });
});
