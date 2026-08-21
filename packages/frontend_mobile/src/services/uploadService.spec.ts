import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCalculateFileHash = vi.fn().mockResolvedValue('mock-hash-123');
const mockSanitizeFileName = vi.fn().mockImplementation((n: string) => n);
const mockGetApiBaseUrl = vi.fn().mockReturnValue('http://localhost:3000/api/v1');
const mockUploadFile = vi.fn().mockResolvedValue(undefined);

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
  mxcadUploadControllerCheckFileExist: vi.fn(),
  mxcadUploadControllerUploadFile: vi.fn(),
}));

const { uploadFileForConversion } = await import('./uploadService');

describe('uploadService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('uploadFileForConversion', () => {
    it('上传成功应返回 hash', async () => {
      const blob = new Blob(['test dwg content'], { type: 'application/octet-stream' });
      const result = await uploadFileForConversion(blob, 'test.dwg');
      expect(result).toBe('mock-hash-123');
      expect(mockCalculateFileHash).toHaveBeenCalled();
      expect(mockUploadFile).toHaveBeenCalled();
    });

    it('上传失败应返回 null', async () => {
      mockUploadFile.mockRejectedValue(new Error('Upload failed'));
      const blob = new Blob(['test'], { type: 'application/octet-stream' });
      const result = await uploadFileForConversion(blob, 'fail.dwg');
      expect(result).toBeNull();
    });
  });
});
