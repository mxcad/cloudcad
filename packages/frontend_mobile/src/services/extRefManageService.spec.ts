import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── 依赖 mock ──
const mockCachedApiUrl = vi.fn((path: string) => `http://api${path}`);
const mockTriggerBlobDownload = vi.fn();
const mockSanitizeFileName = vi.fn((n: string) => n);

const mockGetPreloadingData = vi.fn();
const mockCheckExternalReferences = vi.fn();
const mockUploadExtRefImage = vi.fn();
const mockUploadExtRefDwg = vi.fn();
const mockParseExtRefFileNames = vi.fn();

const mockGetPublicPreloadingData = vi.fn();

const mockPublicCheckExtReference = vi.fn();
const mockPublicUploadExtReference = vi.fn();
const mockPublicAccessFile = vi.fn();
const mockNodeCheckExternalReference = vi.fn();
const mockNodeUploadImage = vi.fn();
const mockNodeUploadDwg = vi.fn();
const mockNodeDownloadExternalRef = vi.fn();
const mockNodeViewExternalRef = vi.fn();

vi.mock('../utils/apiConfig', () => ({ cachedApiUrl: mockCachedApiUrl }));
vi.mock('../utils/download', () => ({ triggerBlobDownload: mockTriggerBlobDownload }));
vi.mock('../utils/sanitizeFileName', () => ({ sanitizeFileName: mockSanitizeFileName }));

vi.mock('./extRefService', () => ({
  getPreloadingData: mockGetPreloadingData,
  checkExternalReferences: mockCheckExternalReferences,
  uploadExtRefImage: mockUploadExtRefImage,
  uploadExtRefDwg: mockUploadExtRefDwg,
  parseExtRefFileNames: mockParseExtRefFileNames,
}));

vi.mock('./publicFileService', () => ({
  getPublicPreloadingData: mockGetPublicPreloadingData,
}));

vi.mock('../api-sdk', () => ({
  publicFileControllerCheckExtReference: mockPublicCheckExtReference,
  publicFileControllerUploadExtReference: mockPublicUploadExtReference,
  publicFileControllerAccessFile: mockPublicAccessFile,
  mxcadExternalRefControllerCheckExternalReference: mockNodeCheckExternalReference,
  mxcadExternalRefControllerUploadExtReferenceImage: mockNodeUploadImage,
  mxcadExternalRefControllerUploadExtReferenceDwg: mockNodeUploadDwg,
  mxcadFileAccessControllerGetFileDownloadExternalRef: mockNodeDownloadExternalRef,
  mxcadFileAccessControllerViewExternalRef: mockNodeViewExternalRef,
}));

const {
  fetchExtRefList,
  getExtRefImageUrl,
  getExtRefDrawingUrl,
  downloadExtRef,
  replaceExtRef,
} = await import('./extRefManageService');

const PUBLIC_CTX = { identifier: 'abc123hash', isPublic: true };
const NODE_CTX = { identifier: 'node-1', isPublic: false };

describe('extRefManageService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchExtRefList', () => {
    it('公开场景：逐项标注 exists（存在=success，缺失=notSelected）', async () => {
      mockGetPublicPreloadingData.mockResolvedValue({
        images: ['a.png'],
        externalReference: ['b.dwg'],
      });
      mockParseExtRefFileNames.mockReturnValue([
        { name: 'a.png', type: 'img' },
        { name: 'b.dwg', type: 'ref' },
      ]);
      // a.png 存在，b.dwg 缺失
      mockPublicCheckExtReference
        .mockResolvedValueOnce({ data: { exists: true }, error: undefined })
        .mockResolvedValueOnce({ data: { exists: false }, error: undefined });

      const items = await fetchExtRefList(PUBLIC_CTX);

      expect(items).toEqual([
        { name: 'a.png', type: 'img', exists: true, uploadState: 'success', progress: 100 },
        { name: 'b.dwg', type: 'ref', exists: false, uploadState: 'notSelected', progress: 0 },
      ]);
    });

    it('公开场景：preloading 取不到返回空数组', async () => {
      mockGetPublicPreloadingData.mockResolvedValue(null);
      const items = await fetchExtRefList(PUBLIC_CTX);
      expect(items).toEqual([]);
    });

    it('节点场景：checkExternalReferences 返回缺失清单，反推 exists', async () => {
      mockGetPreloadingData.mockResolvedValue({
        hash: 'h',
        images: ['a.png'],
        externalReference: ['b.dwg'],
      });
      mockParseExtRefFileNames.mockReturnValue([
        { name: 'a.png', type: 'img' },
        { name: 'b.dwg', type: 'ref' },
      ]);
      // b.dwg 在缺失清单中 → 不存在
      mockCheckExternalReferences.mockResolvedValue([{ name: 'b.dwg', type: 'ref' }]);

      const items = await fetchExtRefList(NODE_CTX);

      expect(items).toEqual([
        { name: 'a.png', type: 'img', exists: true, uploadState: 'success', progress: 100 },
        { name: 'b.dwg', type: 'ref', exists: false, uploadState: 'notSelected', progress: 0 },
      ]);
    });

    it('节点场景：preloading 取不到返回空数组', async () => {
      mockGetPreloadingData.mockResolvedValue(null);
      const items = await fetchExtRefList(NODE_CTX);
      expect(items).toEqual([]);
    });
  });

  describe('getExtRefImageUrl', () => {
    it('公开场景：直连 public-file/access（带缓存打散）', async () => {
      const url = await getExtRefImageUrl(PUBLIC_CTX, 'a.png');
      expect(mockCachedApiUrl).toHaveBeenCalledWith(
        '/public-file/access/abc123hash/a.png'
      );
      expect(url).toBe('http://api/public-file/access/abc123hash/a.png');
    });

    it('节点场景：走鉴权 blob URL（external-ref-view）', async () => {
      const blob = new Blob(['img']);
      mockNodeViewExternalRef.mockResolvedValue({ data: blob, error: undefined });
      const createSpy = vi
        .spyOn(URL, 'createObjectURL')
        .mockReturnValue('blob:test');
      try {
        const url = await getExtRefImageUrl(NODE_CTX, 'a.png');
        expect(mockNodeViewExternalRef).toHaveBeenCalledWith({
          path: { nodeId: 'node-1', fileName: 'a.png' },
        });
        expect(url).toBe('blob:test');
        expect(createSpy).toHaveBeenCalledWith(blob);
      } finally {
        createSpy.mockRestore();
      }
    });

    it('节点场景：SDK 报错即抛', async () => {
      mockNodeViewExternalRef.mockResolvedValue({ data: undefined, error: { message: '403' } });
      await expect(getExtRefImageUrl(NODE_CTX, 'a.png')).rejects.toMatchObject({
        message: '403',
      });
    });
  });

  describe('getExtRefDrawingUrl', () => {
    it('公开场景：mxweb 直连', () => {
      const url = getExtRefDrawingUrl(PUBLIC_CTX, 'b.dwg');
      expect(mockCachedApiUrl).toHaveBeenCalledWith(
        '/public-file/access/abc123hash/b.dwg.mxweb'
      );
      expect(url).toBe('http://api/public-file/access/abc123hash/b.dwg.mxweb');
    });

    it('节点场景：external-ref-view 端点', () => {
      const url = getExtRefDrawingUrl(NODE_CTX, 'b.dwg');
      expect(mockCachedApiUrl).toHaveBeenCalledWith(
        '/mxcad/external-ref-view/node-1/b.dwg'
      );
      expect(url).toBe('http://api/mxcad/external-ref-view/node-1/b.dwg');
    });
  });

  describe('downloadExtRef', () => {
    it('公开场景：public-file/access 取 blob 后落盘', async () => {
      const blob = new Blob(['file']);
      mockPublicAccessFile.mockResolvedValue({ data: blob, error: undefined });
      await downloadExtRef(PUBLIC_CTX, { name: 'a.png', type: 'img', exists: true, uploadState: 'success', progress: 100 });
      expect(mockPublicAccessFile).toHaveBeenCalledWith({
        path: { hash: 'abc123hash', filename: 'a.png' },
      });
      expect(mockTriggerBlobDownload).toHaveBeenCalledWith(blob, 'a.png');
    });

    it('节点场景：download-external-ref 取 blob 后落盘', async () => {
      const blob = new Blob(['file']);
      mockNodeDownloadExternalRef.mockResolvedValue({ data: blob, error: undefined });
      await downloadExtRef(NODE_CTX, { name: 'b.dwg', type: 'ref', exists: true, uploadState: 'success', progress: 100 });
      expect(mockNodeDownloadExternalRef).toHaveBeenCalledWith({
        path: { nodeId: 'node-1', fileName: 'b.dwg' },
      });
      expect(mockTriggerBlobDownload).toHaveBeenCalledWith(blob, 'b.dwg');
    });

    it('SDK 报错即抛（不透传为成功）', async () => {
      mockPublicAccessFile.mockResolvedValue({ data: undefined, error: { message: '404' } });
      await expect(
        downloadExtRef(PUBLIC_CTX, { name: 'a.png', type: 'img', exists: true, uploadState: 'success', progress: 100 })
      ).rejects.toMatchObject({ message: '404' });
      expect(mockTriggerBlobDownload).not.toHaveBeenCalled();
    });
  });

  describe('replaceExtRef', () => {
    it('公开场景小文件：单次上传', async () => {
      const file = new File(['x'.repeat(100)], 'a.png', { type: 'image/png' });
      mockPublicUploadExtReference.mockResolvedValue({ data: {}, error: undefined });
      const onProgress = vi.fn();
      await replaceExtRef(
        PUBLIC_CTX,
        { name: 'a.png', type: 'img', exists: false, uploadState: 'notSelected', progress: 0 },
        file,
        onProgress
      );
      expect(mockPublicUploadExtReference).toHaveBeenCalledTimes(1);
      const body = mockPublicUploadExtReference.mock.calls[0][0].body as Record<string, unknown>;
      expect(body.srcFileHash).toBe('abc123hash');
      expect(body.extRefFile).toBe('a.png');
      expect(body.file).toBe(file);
      expect(onProgress).toHaveBeenLastCalledWith(100);
    });

    it('公开场景大文件：分片上传（1MB/片）', async () => {
      // 2.5MB → 3 片
      const big = new File(['x'.repeat(2.5 * 1024 * 1024)], 'big.dwg', { type: 'application/octet-stream' });
      mockPublicUploadExtReference.mockResolvedValue({ data: {}, error: undefined });
      await replaceExtRef(
        PUBLIC_CTX,
        { name: 'big.dwg', type: 'ref', exists: false, uploadState: 'notSelected', progress: 0 },
        big
      );
      expect(mockPublicUploadExtReference).toHaveBeenCalledTimes(3);
      const first = mockPublicUploadExtReference.mock.calls[0][0].body as Record<string, unknown>;
      const last = mockPublicUploadExtReference.mock.calls[2][0].body as Record<string, unknown>;
      expect(first.chunk).toBe(0);
      expect(first.chunks).toBe(3);
      expect(last.chunk).toBe(2);
      expect(last.chunks).toBe(3);
    });

    it('节点场景图片：uploadExtRefImage 带 preloading 的 srcDwgfileHash', async () => {
      const file = new File(['img'], 'a.png', { type: 'image/png' });
      mockGetPreloadingData.mockResolvedValue({ hash: 'src-hash', images: [], externalReference: [] });
      mockUploadExtRefImage.mockResolvedValue(undefined);
      await replaceExtRef(
        NODE_CTX,
        { name: 'a.png', type: 'img', exists: false, uploadState: 'notSelected', progress: 0 },
        file
      );
      expect(mockUploadExtRefImage).toHaveBeenCalledWith({
        nodeId: 'node-1',
        file,
        srcDwgfileHash: 'src-hash',
        extRefFile: 'a.png',
      });
    });

    it('节点场景图纸：uploadExtRefDwg', async () => {
      const file = new File(['dwg'], 'b.dwg', { type: 'application/octet-stream' });
      mockUploadExtRefDwg.mockResolvedValue(undefined);
      await replaceExtRef(
        NODE_CTX,
        { name: 'b.dwg', type: 'ref', exists: false, uploadState: 'notSelected', progress: 0 },
        file
      );
      expect(mockUploadExtRefDwg).toHaveBeenCalledWith({ nodeId: 'node-1', file });
    });

    it('上传失败即抛（不透传为成功）', async () => {
      const file = new File(['x'], 'a.png', { type: 'image/png' });
      mockPublicUploadExtReference.mockResolvedValue({ data: undefined, error: { message: 'quota exceeded' } });
      await expect(
        replaceExtRef(
          PUBLIC_CTX,
          { name: 'a.png', type: 'img', exists: false, uploadState: 'notSelected', progress: 0 },
          file
        )
      ).rejects.toMatchObject({ message: 'quota exceeded' });
    });
  });
});
