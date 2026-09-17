///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Test } from '@nestjs/testing';
import { ProcessPoolExecutor } from './process-pool.executor';
import { MXCAD_CONVERSION_SERVICE } from '../mxcad/interfaces/mxcad-service-tokens';
import type {
  ConversionTask,
  ConversionResult,
} from './function-executor.interface';

function makeTask(overrides: Partial<ConversionTask> = {}): ConversionTask {
  // ConversionTask 改为按 type 判别的联合后，{...默认值, ...overrides} 的展开结果
  // 丢失 type/params 的关联（两者各自变成独立联合），无法直接赋值回 ConversionTask；
  // 测试夹具只关心构造形状，故此处断言（运行期字段由被测代码自身保证）。
  return {
    id: 'task_1',
    type: 'convertFile',
    params: { srcPath: '/in/a.dwg', fileHash: 'hash_a' },
    priority: 1,
    createdAt: new Date(),
    ...overrides,
  } as ConversionTask;
}

describe('ProcessPoolExecutor', () => {
  let executor: ProcessPoolExecutor;
  const mockConversionService = {
    convertFile: jest.fn(),
    convertBinToMxweb: jest.fn(),
    generateBinFiles: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        ProcessPoolExecutor,
        { provide: MXCAD_CONVERSION_SERVICE, useValue: mockConversionService },
      ],
    }).compile();
    executor = module.get(ProcessPoolExecutor);
  });

  describe('when invoking a convertFile task', () => {
    it('should return COMPLETED with outputPath on success', async () => {
      mockConversionService.convertFile.mockResolvedValue({
        isOk: true,
        ret: { newpath: '/out/result.mxweb', code: 0 },
        error: undefined,
      });

      const result = await executor.invoke(makeTask());

      expect(result.status).toBe('COMPLETED');
      expect(result.outputPath).toBe('/out/result.mxweb');
      expect(mockConversionService.convertFile).toHaveBeenCalled();
    });

    it('should return FAILED when conversion reports isOk=false', async () => {
      mockConversionService.convertFile.mockResolvedValue({
        isOk: false,
        ret: { code: 12 },
        error: 'conversion failed',
      });

      const result = await executor.invoke(makeTask());

      expect(result.status).toBe('FAILED');
      expect(result.error).toBe('conversion failed');
    });

    it('should return FAILED when the service throws', async () => {
      mockConversionService.convertFile.mockRejectedValue(
        new Error('boom'),
      );

      const result = await executor.invoke(makeTask());

      expect(result.status).toBe('FAILED');
      expect(result.error).toBe('boom');
    });
  });

  describe('when invoking a convertBinToMxweb task', () => {
    it('should return COMPLETED with outputPath on success', async () => {
      mockConversionService.convertBinToMxweb.mockResolvedValue({
        success: true,
        outputPath: '/out/result.mxweb',
        error: undefined,
      });

      const result = await executor.invoke(
        makeTask({
          type: 'convertBinToMxweb',
          // 参数名与 forwardViaExecutor 转发契约一致（srcPath/outpath/outname）
          params: { srcPath: '/in/a.bin', outpath: '/out', outname: 'a' },
        }),
      );

      expect(result.status).toBe('COMPLETED');
      expect(result.outputPath).toBe('/out/result.mxweb');
      expect(mockConversionService.convertBinToMxweb).toHaveBeenCalledWith(
        '/in/a.bin',
        '/out',
        'a',
      );
    });

    it('should return FAILED when conversion fails', async () => {
      mockConversionService.convertBinToMxweb.mockResolvedValue({
        success: false,
        outputPath: undefined,
        error: 'bin conversion failed',
      });

      const result = await executor.invoke(
        makeTask({
          type: 'convertBinToMxweb',
          params: { srcPath: '/in/a.bin', outpath: '/out', outname: 'a' },
        }),
      );

      expect(result.status).toBe('FAILED');
      expect(result.error).toBe('bin conversion failed');
    });
  });

  describe('when invoking a generateBinFiles task', () => {
    it('should return COMPLETED on success', async () => {
      mockConversionService.generateBinFiles.mockResolvedValue(undefined);

      const result = await executor.invoke(
        makeTask({
          type: 'generateBinFiles',
          params: { mxwebPath: '/in/a.mxweb', nodeName: 'node1' },
        }),
      );

      expect(result.status).toBe('COMPLETED');
      expect(mockConversionService.generateBinFiles).toHaveBeenCalledWith(
        '/in/a.mxweb',
        'node1',
      );
    });
  });

  describe('when invoking a task with unknown type', () => {
    it('should return FAILED with unknown type error', async () => {
      const result = await executor.invoke(
        makeTask({ type: 'unknownTask' as never }),
      );

      expect(result.status).toBe('FAILED');
      expect(result.error).toContain('Unknown task type');
    });
  });

  describe('when querying task status', () => {
    it('should return the stored status after completion', async () => {
      mockConversionService.convertFile.mockResolvedValue({
        isOk: true,
        ret: { newpath: '/out/r.mxweb' },
        error: undefined,
      });

      await executor.invoke(makeTask({ id: 'task_status' }));

      const status = await executor.getTaskStatus('task_status');
      expect(status.status).toBe('COMPLETED');
      expect(status.taskId).toBe('task_status');
      expect(status.result?.status).toBe('COMPLETED');
    });

    it('should return FAILED status for a failed task', async () => {
      mockConversionService.convertFile.mockResolvedValue({
        isOk: false,
        ret: {},
        error: 'bad',
      });

      await executor.invoke(makeTask({ id: 'task_failed' }));

      const status = await executor.getTaskStatus('task_failed');
      expect(status.status).toBe('FAILED');
      expect(status.error).toBe('bad');
    });

    it('should throw for an unknown task id', async () => {
      await expect(executor.getTaskStatus('missing')).rejects.toThrow(
        'Task not found',
      );
    });
  });

  describe('when a conversion fails', () => {
    it('should not block subsequent tasks', async () => {
      mockConversionService.convertFile
        .mockRejectedValueOnce(new Error('first fails'))
        .mockResolvedValueOnce({ isOk: true, ret: { newpath: '/out/r.mxweb' } });

      const first = await executor.invoke(makeTask({ id: 't1' }));
      const second = await executor.invoke(makeTask({ id: 't2' }));

      expect(first.status).toBe('FAILED');
      expect(second.status).toBe('COMPLETED');
    });
  });

  describe('queue stats helpers', () => {
    it('should expose queue stats and clear queue', () => {
      expect(executor.getQueueStats()).toHaveProperty('maxConcurrent', 4);
      expect(typeof executor.clearQueue()).toBe('number');
    });

    it('should expose duration stats from the rate limiter', () => {
      expect(executor.getDurationStats()).toEqual({
        sampleCount: 0,
        p50DurationMs: null,
        p95DurationMs: null,
        p50WaitMs: null,
        p95WaitMs: null,
      });
    });
  });

  describe('terminal record retention', () => {
    it('should evict the oldest terminal records beyond the retention cap', async () => {
      mockConversionService.convertFile.mockResolvedValue({
        isOk: true,
        ret: { newpath: '/out/r.mxweb' },
        error: undefined,
      });

      const cap = 500;
      for (let i = 0; i < cap + 5; i += 1) {
        await executor.invoke(makeTask({ id: `t${i}` }));
      }

      // 最旧的 5 条被淘汰，getTaskStatus 报 not found
      await expect(executor.getTaskStatus('t0')).rejects.toThrow(
        'Task not found',
      );
      await expect(executor.getTaskStatus('t4')).rejects.toThrow(
        'Task not found',
      );
      expect((await executor.getTaskStatus('t5')).status).toBe('COMPLETED');
    });
  });
});
