///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Test } from '@nestjs/testing';
import { QueueController } from './queue.controller';
import { ProcessPoolExecutor } from '../function-executor/process-pool.executor';
import { IPERMISSION_SERVICE } from '../permission/interfaces/permission-service.interface';

describe('QueueController', () => {
  let controller: QueueController;
  let mockProcessPoolExecutor: { getQueueStats: jest.Mock };

  beforeEach(async () => {
    mockProcessPoolExecutor = { getQueueStats: jest.fn() };
    const module = await Test.createTestingModule({
      controllers: [QueueController],
      providers: [
        { provide: ProcessPoolExecutor, useValue: mockProcessPoolExecutor },
        { provide: IPERMISSION_SERVICE, useValue: { hasPermissions: jest.fn() } },
      ],
    }).compile();
    controller = module.get(QueueController);
  });

  describe('when fetching queue stats', () => {
    it('should return the stats from the process pool executor', () => {
      const stats = {
        queueLength: 3,
        criticalPriorityQueueLength: 1,
        highPriorityQueueLength: 2,
        lowPriorityQueueLength: 0,
        runningCount: 4,
        maxConcurrent: 4,
        timeout: 600000,
      };
      mockProcessPoolExecutor.getQueueStats.mockReturnValue(stats);

      const result = controller.getQueueStats();

      expect(result).toEqual(stats);
      expect(mockProcessPoolExecutor.getQueueStats).toHaveBeenCalledTimes(1);
    });

    it('should return all-zero stats when the queue is idle', () => {
      const stats = {
        queueLength: 0,
        criticalPriorityQueueLength: 0,
        highPriorityQueueLength: 0,
        lowPriorityQueueLength: 0,
        runningCount: 0,
        maxConcurrent: 4,
        timeout: 600000,
      };
      mockProcessPoolExecutor.getQueueStats.mockReturnValue(stats);

      const result = controller.getQueueStats();

      expect(result.queueLength).toBe(0);
      expect(result.runningCount).toBe(0);
      expect(result.maxConcurrent).toBe(4);
    });
  });
});
