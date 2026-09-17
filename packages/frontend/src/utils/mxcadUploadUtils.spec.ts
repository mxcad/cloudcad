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

describe('mxcadUploadUtils 分片上传（并发 3 + 显式合并）', () => {
  /** 从 uploadFile 调用里拆出「分片上传」与「合并请求」 */
  function splitCalls() {
    const chunkCalls = mocks.uploadFile.mock.calls.filter(
      (c) => c[0].body.chunk !== undefined
    );
    const mergeCalls = mocks.uploadFile.mock.calls.filter(
      (c) => c[0].body.chunk === undefined && c[0].body.chunks !== undefined
    );
    return { chunkCalls, mergeCalls };
  }

  it('12MB → 3 分片上传 + 1 显式合并请求（合并不再依赖「最后一个分片刚上传」）', async () => {
    const mod = await loadFreshModule();
    const file = makeFile(12); // 3 分片（5MB 每片）
    mocks.checkChunkExist.mockResolvedValue({ data: { exists: false } });
    mocks.uploadFile.mockImplementation(async ({ body }) => {
      if (body.chunk !== undefined) return { data: { ret: 'kOk' } };
      return { data: { ret: 'kOk', nodeId: 'node-merged' } };
    });

    const result = await mod.uploadFile({ file, hash: 'h12', nodeId: 'n1' });

    const { chunkCalls, mergeCalls } = splitCalls();
    // 3 个分片（index 0/1/2 齐全）+ 1 个显式合并
    expect(chunkCalls.map((c) => c[0].body.chunk).sort()).toEqual([0, 1, 2]);
    expect(mergeCalls).toHaveLength(1);
    expect(result.nodeId).toBe('node-merged');
    expect(result.isInstantUpload).toBe(false);
  });

  it('并发度为 3：3 个分片上传曾同时 in-flight', async () => {
    const mod = await loadFreshModule();
    const file = makeFile(12); // 3 分片
    mocks.checkChunkExist.mockResolvedValue({ data: { exists: false } });
    let inFlight = 0;
    let maxInFlight = 0;
    mocks.uploadFile.mockImplementation(async ({ body }) => {
      if (body.chunk !== undefined) {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 10)); // 模拟网络延迟
        inFlight--;
        return { data: { ret: 'kOk' } };
      }
      return { data: { ret: 'kOk', nodeId: 'node-merged' } };
    });

    await mod.uploadFile({ file, hash: 'h12', nodeId: 'n1' });

    // 3 分片并行 → 峰值并发 3（串行实现峰值只会是 1）
    expect(maxInFlight).toBe(3);
  });

  it('全部分片已存在（无新上传）→ 仍发显式合并请求（修复：末片已存在时旧逻辑永不合并）', async () => {
    const mod = await loadFreshModule();
    const file = makeFile(12); // 3 分片
    mocks.checkChunkExist.mockResolvedValue({ data: { exists: true } });
    mocks.uploadFile.mockResolvedValue({
      data: { ret: 'kOk', nodeId: 'node-merged' },
    });

    const result = await mod.uploadFile({ file, hash: 'h12', nodeId: 'n1' });

    const { chunkCalls, mergeCalls } = splitCalls();
    // 无分片上传，但显式合并请求照发（合并的唯一入口）
    expect(chunkCalls).toHaveLength(0);
    expect(mergeCalls).toHaveLength(1);
    expect(result.nodeId).toBe('node-merged');
  });

  it('skip 策略：末片上传返回 fileAlreadyExist → 提前返回 isUseServerExistingFile，不发合并', async () => {
    const mod = await loadFreshModule();
    const file = makeFile(12); // 3 分片
    mocks.checkChunkExist.mockResolvedValue({ data: { exists: false } });
    mocks.uploadFile.mockImplementation(async ({ body }) => {
      // 末片（chunk=2）返回 fileAlreadyExist + nodeId
      if (body.chunk === 2)
        return { data: { ret: 'fileAlreadyExist', nodeId: 'node-exist' } };
      return { data: { ret: 'kOk' } };
    });

    const result = await mod.uploadFile({ file, hash: 'h12', nodeId: 'n1' });

    expect(result.isUseServerExistingFile).toBe(true);
    expect(result.nodeId).toBe('node-exist');
    // 提前返回，不发合并请求
    const { mergeCalls } = splitCalls();
    expect(mergeCalls).toHaveLength(0);
  });
});
