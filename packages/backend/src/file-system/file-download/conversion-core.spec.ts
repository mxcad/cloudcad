///////////////////////////////////////////////////////////////////////////////
// runConversionCore 共享转换核心测试
// 覆盖：成功返回产物路径 / 引擎参数构造（含 priority 与 engineParams）/
//       engine-failed / artifact-missing / convertServerFile 异常原样上抛
//
// 注：jest resetMocks:true，转换服务 mock 须逐用例新建（describe 级共享 mock 的
//     实现会被重置）。
///////////////////////////////////////////////////////////////////////////////

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  ConversionCoreError,
  runConversionCore,
} from './conversion-core';
import type { IMxcadConversionService } from '../../mxcad/interfaces/mxcad-conversion.interface';

describe('runConversionCore（共享转换核心）', () => {
  let tmpRoot: string;
  let srcDir: string;

  const srcPath = () => path.join(srcDir, 'abc123.mxweb').replace(/\\/g, '/');

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'conv-core-'));
    srcDir = path.join(tmpRoot, 'uploads');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'abc123.mxweb'), 'mxweb-content');
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  /** 新建转换服务 mock：成功时把 outname 写到 srcPath 同目录（引擎真实行为） */
  const okService = () => ({
    convertServerFile: jest.fn((opts: { srcPath: string; outname: string }) => {
      fs.writeFileSync(
        path.join(path.dirname(opts.srcPath), opts.outname),
        'converted'
      );
      return Promise.resolve({ code: 0 });
    }),
  }) as unknown as IMxcadConversionService;

  const baseInput = (
    overrides: Partial<Parameters<typeof runConversionCore>[0]> = {}
  ) => ({
    conversionService: okService(),
    srcPath: srcPath(),
    fileHash: 'abc123',
    nodeId: 'node-1',
    outname: 'abc123-dwg.dwg',
    ...overrides,
  });

  it('success：构造引擎参数并返回产物路径（= dirname(srcPath)/outname）', async () => {
    const service = okService();
    const { artifactPath } = await runConversionCore(
      baseInput({
        conversionService: service,
        userId: 'user-1',
        engineParams: { dwgVersion: 29 },
      })
    );

    expect(artifactPath).toBe(path.join(srcDir, 'abc123-dwg.dwg'));
    expect(service.convertServerFile).toHaveBeenCalledWith({
      srcPath: srcPath(),
      fileHash: 'abc123',
      nodeId: 'node-1',
      userId: 'user-1',
      outname: 'abc123-dwg.dwg',
      createPreloadingData: false,
      dwgVersion: 29,
    });
  });

  it('priority：透传 priority 到引擎参数（批量下载 low）', async () => {
    const service = okService();
    await runConversionCore(baseInput({ conversionService: service, priority: 'low' }));
    expect(service.convertServerFile).toHaveBeenCalledWith(
      expect.objectContaining({ priority: 'low' })
    );
  });

  it('engine-failed：引擎返回非 0 code 抛 ConversionCoreError（detail=引擎 message）', async () => {
    const service = {
      convertServerFile: jest.fn().mockResolvedValue({ code: 500, message: 'boom' }),
    } as unknown as IMxcadConversionService;
    await expect(runConversionCore(baseInput({ conversionService: service }))).rejects.toThrow(
      ConversionCoreError
    );
    try {
      await runConversionCore(baseInput({ conversionService: service }));
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ConversionCoreError);
      expect((e as ConversionCoreError).kind).toBe('engine-failed');
      expect((e as ConversionCoreError).detail).toBe('boom');
    }
  });

  it('engine-failed：引擎无 message 时 detail 为空串（兜底由调用方补）', async () => {
    const service = {
      convertServerFile: jest.fn().mockResolvedValue({ code: 7 }),
    } as unknown as IMxcadConversionService;
    try {
      await runConversionCore(baseInput({ conversionService: service }));
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as ConversionCoreError).kind).toBe('engine-failed');
      expect((e as ConversionCoreError).detail).toBe('');
    }
  });

  it('artifact-missing：code=0 但产物不在抛 ConversionCoreError（detail=outname）', async () => {
    const service = {
      convertServerFile: jest.fn().mockResolvedValue({ code: 0 }),
    } as unknown as IMxcadConversionService;
    try {
      await runConversionCore(baseInput({ conversionService: service }));
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ConversionCoreError);
      expect((e as ConversionCoreError).kind).toBe('artifact-missing');
      expect((e as ConversionCoreError).detail).toBe('abc123-dwg.dwg');
    }
  });

  it('convertServerFile 自身异常原样上抛（非 ConversionCoreError）', async () => {
    const service = {
      convertServerFile: jest.fn().mockRejectedValue(new Error('spawn failed')),
    } as unknown as IMxcadConversionService;
    await expect(runConversionCore(baseInput({ conversionService: service }))).rejects.toThrow(
      'spawn failed'
    );
    await expect(runConversionCore(baseInput({ conversionService: service }))).rejects.not.toThrow(
      ConversionCoreError
    );
  });
});
