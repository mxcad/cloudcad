import { describe, it, expect, beforeEach, vi } from 'vitest';

// SDK mock：uploadFile 静态导入三个上传端点，fetchMaxFileSizeFromBackend 动态导入公开配置端点
const mocks = vi.hoisted(() => ({
  checkFileExist: vi.fn(),
  checkChunkExist: vi.fn(),
  uploadFile: vi.fn(),
  getPublicConfigs: vi.fn(),
}));
vi.mock('@/api-sdk', () => ({
  mxcadUploadControllerCheckFileExist: mocks.checkFileExist,
  mxcadUploadControllerCheckChunkExist: mocks.checkChunkExist,
  mxcadUploadControllerUploadFile: mocks.uploadFile,
  runtimeConfigControllerGetPublicConfigs: mocks.getPublicConfigs,
}));

/** 每个用例取全新模块实例，隔离模块级缓存（cachedMaxFileSize/lastFetchTime） */
async function loadFreshModule() {
  vi.resetModules();
  return import('./mxcadUploadUtils');
}

function makeFile(mb: number, name = 'test.dwg'): File {
  return new File([new ArrayBuffer(Math.round(mb * 1024 * 1024))], name);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.checkFileExist.mockResolvedValue({ data: { exists: false } });
  mocks.uploadFile.mockResolvedValue({ data: { nodeId: 'node-up' } });
  mocks.getPublicConfigs.mockResolvedValue({ data: { maxFileSize: 50 } });
});

describe('mxcadUploadUtils 上传大小限制', () => {
  it('setUploadMaxFileSize 同步值在 TTL 内直接生效，不再请求后端配置', async () => {
    const mod = await loadFreshModule();
    mod.setUploadMaxFileSize(1); // 1MB 限制
    await expect(
      mod.uploadFile({ file: makeFile(2), hash: 'h1', nodeId: 'n1' })
    ).rejects.toThrow('文件过大');
    // 缓存命中：未回源后端
    expect(mocks.getPublicConfigs).not.toHaveBeenCalled();
  });

  it('非法值（NaN/0）不覆盖已同步的有效缓存', async () => {
    const mod = await loadFreshModule();
    mod.setUploadMaxFileSize(100);
    mod.setUploadMaxFileSize(Number.NaN);
    mod.setUploadMaxFileSize(0);
    // 2MB 文件仍按 100MB 限制校验通过（若 NaN 覆盖了缓存，file.size <= NaN 恒 false 会误拒）
    const result = await mod.uploadFile({
      file: makeFile(2),
      hash: 'h1',
      nodeId: 'n1',
    });
    expect(result.isInstantUpload).toBe(false);
    expect(mocks.uploadFile).toHaveBeenCalledTimes(1);
    expect(mocks.getPublicConfigs).not.toHaveBeenCalled();
  });

  it('未同步时回源后端获取限制并缓存（TTL 内二次上传不再请求）', async () => {
    const mod = await loadFreshModule();
    const file = makeFile(2);
    await mod.uploadFile({ file, hash: 'h1', nodeId: 'n1' });
    expect(mocks.getPublicConfigs).toHaveBeenCalledTimes(1);
    await mod.uploadFile({ file, hash: 'h1', nodeId: 'n1' });
    expect(mocks.getPublicConfigs).toHaveBeenCalledTimes(1);
  });
});
