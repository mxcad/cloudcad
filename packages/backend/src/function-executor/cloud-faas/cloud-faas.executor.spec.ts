///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CloudFaaSExecutor } from './cloud-faas.executor';
import { HuaweiExecutor } from './providers/huawei.executor';
import { AliyunExecutor } from './providers/aliyun.executor';
import { LambdaExecutor } from './providers/aws.executor';
import type {
  ConversionTask,
  IFunctionExecutor,
} from '../function-executor.interface';

jest.mock('./providers/huawei.executor', () => ({
  HuaweiExecutor: jest.fn(),
}));
jest.mock('./providers/aliyun.executor', () => ({
  AliyunExecutor: jest.fn(),
}));
jest.mock('./providers/aws.executor', () => ({
  LambdaExecutor: jest.fn(),
}));

function makeTask(overrides: Partial<ConversionTask> = {}): ConversionTask {
  // ConversionTask 改为按 type 判别的联合后，{...默认值, ...overrides} 的展开结果
  // 丢失 type/params 的关联，无法直接赋值回 ConversionTask；测试夹具此处断言。
  return {
    id: 'task_1',
    type: 'convertFile',
    params: { srcPath: '/in/a.dwg', fileHash: 'hash_a' },
    priority: 1,
    createdAt: new Date(),
    ...overrides,
  } as ConversionTask;
}

function makeConfigService(overrides: Record<string, string> = {}) {
  return {
    get: jest.fn((key: string) => overrides[key] ?? undefined),
  };
}

describe('CloudFaaSExecutor', () => {
  let providerInstance: { invoke: jest.Mock; getTaskStatus: jest.Mock };
  const HuaweiMock = HuaweiExecutor as unknown as jest.Mock;
  const AliyunMock = AliyunExecutor as unknown as jest.Mock;
  const LambdaMock = LambdaExecutor as unknown as jest.Mock;

  beforeEach(() => {
    providerInstance = {
      invoke: jest.fn().mockResolvedValue({
        status: 'COMPLETED',
        outputPath: '/out/r.mxweb',
        metadata: { code: 0 },
      }),
      getTaskStatus: jest.fn().mockResolvedValue({
        status: 'PROCESSING',
        progress: 25,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    };
    HuaweiMock.mockImplementation(() => providerInstance);
    AliyunMock.mockImplementation(() => providerInstance);
    LambdaMock.mockImplementation(() => providerInstance);
  });

  const createExecutor = async (config: Record<string, string> = {}) => {
    const module = await Test.createTestingModule({
      providers: [
        CloudFaaSExecutor,
        { provide: ConfigService, useValue: makeConfigService(config) },
      ],
    }).compile();
    return module.get(CloudFaaSExecutor);
  };

  describe('when invoking a task', () => {
    it('should return COMPLETED with outputPath on success', async () => {
      const executor = await createExecutor();
      const task = makeTask();

      const result = await executor.invoke(task);

      expect(result).toMatchObject({
        taskId: 'task_1',
        status: 'COMPLETED',
        outputPath: '/out/r.mxweb',
      });
      expect(providerInstance.invoke).toHaveBeenCalledWith(task);
    });

    it('should return FAILED when provider reports failure', async () => {
      providerInstance.invoke.mockResolvedValue({
        status: 'FAILED',
        error: 'faas error',
      });
      const executor = await createExecutor();

      const result = await executor.invoke(makeTask());

      expect(result.status).toBe('FAILED');
      expect(result.error).toBe('faas error');
    });

    it('should return FAILED when provider throws', async () => {
      providerInstance.invoke.mockRejectedValue(new Error('provider down'));
      const executor = await createExecutor();

      const result = await executor.invoke(makeTask());

      expect(result.status).toBe('FAILED');
      expect(result.error).toBe('provider down');
    });
  });

  describe('when querying task status', () => {
    it('should map provider status fields', async () => {
      const executor = await createExecutor();

      const status = await executor.getTaskStatus('task_1');

      expect(status).toMatchObject({
        taskId: 'task_1',
        status: 'PROCESSING',
        progress: 25,
      });
    });
  });

  describe('when selecting provider', () => {
    it('should use huawei by default', async () => {
      await createExecutor();

      expect(HuaweiMock).toHaveBeenCalled();
      expect(AliyunMock).not.toHaveBeenCalled();
      expect(LambdaMock).not.toHaveBeenCalled();
    });

    it('should use CLOUD_FAAS_PROVIDER to pick aliyun', async () => {
      await createExecutor({ CLOUD_FAAS_PROVIDER: 'aliyun' });

      expect(AliyunMock).toHaveBeenCalled();
      expect(HuaweiMock).not.toHaveBeenCalled();
    });

    it('should use CLOUD_FAAS_PROVIDER to pick aws', async () => {
      await createExecutor({ CLOUD_FAAS_PROVIDER: 'aws' });

      expect(LambdaMock).toHaveBeenCalled();
      expect(HuaweiMock).not.toHaveBeenCalled();
    });

    it('should fall back to huawei for unknown provider', async () => {
      await createExecutor({ CLOUD_FAAS_PROVIDER: 'tencent' });

      expect(HuaweiMock).toHaveBeenCalled();
    });
  describe('observability via the seam', () => {
    it('should report no queue and no duration samples (cloud provider schedules)', async () => {
      const executor = (await createExecutor()) as IFunctionExecutor;

      await expect(executor.queueStats()).resolves.toBeNull();
      await expect(executor.durationStats()).resolves.toBeNull();
      expect(executor.listTasks).toBeUndefined();
      expect(executor.clearQueue).toBeUndefined();
    });
  });
  });
});
