///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Test } from '@nestjs/testing';
import { QueueController } from './queue.controller';
import { IFunctionExecutor } from '../function-executor/function-executor.interface';
import { IPERMISSION_SERVICE } from '../permission/interfaces/permission-service.interface';

describe('QueueController', () => {
  let controller: QueueController;
  let mockExecutor: { queueStats: jest.Mock };

  beforeEach(async () => {
    mockExecutor = { queueStats: jest.fn() };
    const module = await Test.createTestingModule({
      controllers: [QueueController],
      providers: [
        { provide: IFunctionExecutor, useValue: mockExecutor },
        { provide: IPERMISSION_SERVICE, useValue: { hasPermissions: jest.fn() } },
      ],
    }).compile();
    controller = module.get(QueueController);
  });

  describe('when fetching queue stats', () => {
    it('should return the priority queue stats from the executor', async () => {
      const stats = {
        queueLength: 3,
        criticalPriorityQueueLength: 1,
        highPriorityQueueLength: 2,
        lowPriorityQueueLength: 0,
        runningCount: 4,
        maxConcurrent: 4,
        timeout: 600000,
      };
      mockExecutor.queueStats.mockResolvedValue({ kind: 'priority-queue', stats });

      const result = await controller.getQueueStats();

      expect(result).toEqual(stats);
      expect(mockExecutor.queueStats).toHaveBeenCalledTimes(1);
    });

    it('should return all-zero stats when the queue is idle', async () => {
      mockExecutor.queueStats.mockResolvedValue({
        kind: 'priority-queue',
        stats: {
          queueLength: 0,
          criticalPriorityQueueLength: 0,
          highPriorityQueueLength: 0,
          lowPriorityQueueLength: 0,
          runningCount: 0,
          maxConcurrent: 4,
          timeout: 600000,
        },
      });

      const result = await controller.getQueueStats();

      expect(result?.queueLength).toBe(0);
      expect(result?.runningCount).toBe(0);
      expect(result?.maxConcurrent).toBe(4);
    });

    it('should return null when the executor has no priority queue', async () => {
      // 独立服务/云函数形态无优先级队列：真实排队数据在 /conversion-monitor/stats
      mockExecutor.queueStats.mockResolvedValue({
        kind: 'worker-pool',
        tasks: {
          total: 0,
          pending: 0,
          processing: 0,
          completed: 0,
          failed: 0,
        },
        workers: {},
      });

      expect(await controller.getQueueStats()).toBeNull();
    });
  });
});
