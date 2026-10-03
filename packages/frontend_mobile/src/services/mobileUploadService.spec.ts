import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

const mockCheckFileExist = vi.fn() as Mock;
const mockUploadFile = vi.fn() as Mock;

vi.mock('@cloudcad/api-sdk/sdk.gen', () => ({
  mxcadUploadControllerCheckFileExist: (...a: unknown[]) => mockCheckFileExist(...a),
  mxcadUploadControllerCheckChunkExist: vi.fn(() => ({ data: { exists: false } })),
  mxcadUploadControllerUploadFile: (...a: unknown[]) => mockUploadFile(...a),
}));

vi.mock('@/utils/apiConfig', () => ({
  handleApiError: vi.fn(),
}));

vi.mock('@/utils/sanitizeFileName', () => ({
  sanitizeFileName: (name: string) => name,
}));

const mockMaxFileSizeMb = { value: 100 };

vi.mock('@/composables/useRuntimeConfig', () => ({
  useRuntimeConfig: () => ({ config: { value: { maxFileSize: mockMaxFileSizeMb.value } } }),
}));

vi.mock('@/languages', () => ({
  t: (key: string, params?: Record<string, string>) =>
    (params ? key.replace(/\{(\w+)\}/g, (_, k: string) => params[k] ?? '') : key),
}));

const { uploadFile } = await import('./mobileUploadService');

const okExist = { data: { exists: true } };

beforeEach(() => {
  vi.clearAllMocks();
  mockMaxFileSizeMb.value = 100;
  mockCheckFileExist.mockResolvedValue(okExist);
  mockUploadFile.mockResolvedValue({ data: {} });
});

/** 秒传场景返回：命中 checkFileExist 的 exists 分支，不会真的上传 */
function smallFile(bytes: number, name = 'a.mxweb'): File {
  return new File([new Uint8Array(bytes)], name, { type: 'application/octet-stream' });
}

describe('上传前大小上限拦截', () => {
  it('超过运行时配置的上限时在发请求前就拒绝，文案带文件名与上限', async () => {
    mockMaxFileSizeMb.value = 1;
    await expect(uploadFile({ file: smallFile(2 * 1024 * 1024, 'big.dwg'), hash: 'h', nodeId: 'n' }))
      .rejects.toThrow('big.dwg');
    expect(mockCheckFileExist).not.toHaveBeenCalled();
    expect(mockUploadFile).not.toHaveBeenCalled();
  });

  it('上限来自运行时配置：调小即按新值拦截（默认 100MB 不拦 2MB）', async () => {
    await expect(
      uploadFile({ file: smallFile(2 * 1024 * 1024), hash: 'h', nodeId: 'n' }),
    ).resolves.toMatchObject({ isUseServerExistingFile: true });
  });

  it('恰好等于上限不算超（与后端 file.size > limit 的判定同向）', async () => {
    mockMaxFileSizeMb.value = 1;
    await expect(uploadFile({ file: smallFile(1024 * 1024), hash: 'h', nodeId: 'n' })).resolves.toMatchObject({
      isUseServerExistingFile: true,
    });
  });

  it('上限配置为 0/负数（异常值）时不拦，避免把所有上传都拒掉', async () => {
    for (const bad of [0, -5]) {
      mockMaxFileSizeMb.value = bad;
      await expect(
        uploadFile({ file: smallFile(2 * 1024 * 1024), hash: 'h', nodeId: 'n' }),
      ).resolves.toMatchObject({ isUseServerExistingFile: true });
    }
  });
});
