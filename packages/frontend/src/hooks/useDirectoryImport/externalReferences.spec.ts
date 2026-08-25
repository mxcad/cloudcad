import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  mxcadExternalRefControllerGetPreloadingData,
  mxcadExternalRefControllerUploadExtReferenceDwg,
  mxcadExternalRefControllerUploadExtReferenceImage,
} from '@/api-sdk';
import { processExternalReferences } from './externalReferences';
import type { FileTreeNode } from './types';

vi.mock('@/api-sdk', () => ({
  mxcadExternalRefControllerGetPreloadingData: vi.fn(),
  mxcadExternalRefControllerUploadExtReferenceDwg: vi.fn(),
  mxcadExternalRefControllerUploadExtReferenceImage: vi.fn(),
}));

const getPreloadingData = vi.mocked(mxcadExternalRefControllerGetPreloadingData);
const uploadDwg = vi.mocked(mxcadExternalRefControllerUploadExtReferenceDwg);
const uploadImage = vi.mocked(mxcadExternalRefControllerUploadExtReferenceImage);

function makeFile(name: string): File {
  return new File(['x'], name);
}

function makeTree(files: string[]): FileTreeNode {
  return {
    name: 'root',
    relativePath: '',
    isFolder: true,
    children: files.map((name) => ({
      name,
      relativePath: name,
      isFolder: false,
      file: makeFile(name),
    })),
  };
}

function mockPreloading(data: {
  images?: unknown[];
  externalReference?: unknown[];
} | null) {
  getPreloadingData.mockResolvedValue({ data } as never);
}

describe('processExternalReferences — 响应码检查与汇总上报', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('接口返回 code:0 → 计入 uploaded，onSummary 收到 done 汇总', async () => {
    mockPreloading({ externalReference: [{ name: 'ref.dwg' }] });
    uploadDwg.mockResolvedValue({ data: { code: 0, message: 'ok' } } as never);

    const updates: Awaited<ReturnType<typeof processExternalReferences>>[] = [];
    const result = await processExternalReferences(
      [{ nodeId: 'n1', fileName: 'main.dwg' }],
      makeTree(['ref.dwg']),
      (s) => updates.push(s)
    );

    expect(result.status).toBe('done');
    expect(result.uploaded).toBe(1);
    expect(result.failed).toBe(0);
    expect(updates[0]).toMatchObject({ status: 'processing' });
    expect(updates[updates.length - 1]).toMatchObject({
      status: 'done',
      uploaded: 1,
    });
  });

  it('HTTP 200 + code:-1 → 计入 failed（回归：失败不再被当成功）', async () => {
    mockPreloading({ externalReference: [{ name: 'ref.dwg' }] });
    uploadDwg.mockResolvedValue({
      data: { code: -1, message: '无权限访问该图纸' },
    } as never);

    const result = await processExternalReferences(
      [{ nodeId: 'n1', fileName: 'main.dwg' }],
      makeTree(['ref.dwg'])
    );

    expect(result.uploaded).toBe(0);
    expect(result.failed).toBe(1);
  });

  it('请求抛异常 → 计入 failed，不中断后续参照处理', async () => {
    mockPreloading({
      externalReference: [{ name: 'a.dwg' }, { name: 'b.dwg' }],
    });
    uploadDwg
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ data: { code: 0 } } as never);

    const result = await processExternalReferences(
      [{ nodeId: 'n1', fileName: 'main.dwg' }],
      makeTree(['a.dwg', 'b.dwg'])
    );

    expect(result.failed).toBe(1);
    expect(result.uploaded).toBe(1);
    expect(uploadDwg).toHaveBeenCalledTimes(2);
  });

  it('图片参照走 image 接口；目录中找不到的计入 missing', async () => {
    mockPreloading({
      images: [{ name: 'logo.png' }],
      externalReference: [
        { name: 'found.dwg' },
        { name: 'nested/missing.dwg' },
      ],
    });
    uploadImage.mockResolvedValue({ data: { code: 0 } } as never);
    uploadDwg.mockResolvedValue({ data: { code: 0 } } as never);

    const result = await processExternalReferences(
      [{ nodeId: 'n1', fileName: 'main.dwg' }],
      makeTree(['logo.png', 'found.dwg'])
    );

    expect(result.matched).toBe(2);
    expect(result.missing).toBe(1);
    expect(uploadImage).toHaveBeenCalledTimes(1);
    expect(uploadDwg).toHaveBeenCalledTimes(1);
  });

  it('preloading 持续为 null（转换未完成/哈希非法）→ 跳过该文件且不计数', async () => {
    vi.useFakeTimers();
    try {
      mockPreloading(null);

      const pending = processExternalReferences(
        [{ nodeId: 'n1', fileName: 'main.dwg' }],
        makeTree(['ref.dwg'])
      );
      // 快进超过 3 分钟轮询预算（指数退避 2s→15s）
      const result = await Promise.all([
        pending,
        vi.advanceTimersByTimeAsync(200_000),
      ]).then(([r]) => r);

      expect(result).toMatchObject({
        status: 'done',
        matched: 0,
        uploaded: 0,
        failed: 0,
        missing: 0,
      });
    } finally {
      vi.useRealTimers();
    }
  }, 15_000);

  it('.mxweb 主图不参与参照处理；非参照扩展名的声明被忽略', async () => {
    mockPreloading({
      externalReference: [{ name: 'readme.txt' }, { name: 'ok.dwg' }],
    });
    uploadDwg.mockResolvedValue({ data: { code: 0 } } as never);

    await processExternalReferences(
      [{ nodeId: 'n1', fileName: 'main.mxweb' }],
      makeTree(['readme.txt', 'ok.dwg'])
    );
    // mxweb 主图直接跳过，连 preloading 都不查询
    expect(getPreloadingData).not.toHaveBeenCalled();

    const result = await processExternalReferences(
      [{ nodeId: 'n2', fileName: 'main.dwg' }],
      makeTree(['readme.txt', 'ok.dwg'])
    );
    // readme.txt 非参照支持格式：既不上传也不计数
    expect(result.uploaded).toBe(1);
    expect(result.missing).toBe(0);
    expect(result.failed).toBe(0);
  });
});
