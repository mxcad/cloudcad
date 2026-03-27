///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Test, TestingModule } from '@nestjs/testing';
import { PermissionCacheService } from '../services/permission-cache.service';
import { CacheCleanupScheduler } from './cache-cleanup.scheduler';

describe('CacheCleanupScheduler', () => {
  let scheduler: CacheCleanupScheduler;
  let cacheService: jest.Mocked<PermissionCacheService>;
  let mockLogger: any;

  beforeEach(async () => {
    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
    };

    const mockCacheService = {
      cleanup: jest.fn(),
      getStats: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheCleanupScheduler,
        {
          provide: PermissionCacheService,
          useValue: mockCacheService,
        },
      ],
    })
      .setLogger({
        log: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        verbose: jest.fn(),
      })
      .compile();

    scheduler = module.get<CacheCleanupScheduler>(CacheCleanupScheduler);
    cacheService = module.get(PermissionCacheService);

    // Replace the logger with our mock
    (scheduler as any).logger = mockLogger;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleCacheCleanup', () => {
    it('should cleanup expired cache entries and log cleaned count', () => {
      const statsBefore = {
        totalEntries: 100,
        expiredEntries: 5,
        memoryUsage: '10MB',
      };
      const statsAfter = {
        totalEntries: 95,
        expiredEntries: 0,
        memoryUsage: '9.5MB',
      };

      cacheService.getStats
        .mockReturnValueOnce(statsBefore)
        .mockReturnValueOnce(statsAfter);
      cacheService.cleanup.mockImplementation(() => {});

      scheduler.handleCacheCleanup();

      expect(cacheService.getStats).toHaveBeenCalledTimes(2);
      expect(cacheService.cleanup).toHaveBeenCalled();
      expect(mockLogger.log).toHaveBeenCalledWith(
        '定时清理完成: 清理了 5 个过期缓存项'
      );
    });

    it('should not log when no expired entries', () => {
      const stats = {
        totalEntries: 100,
        expiredEntries: 0,
        memoryUsage: '10MB',
      };

      cacheService.getStats.mockReturnValue(stats);
      cacheService.cleanup.mockImplementation(() => {});

      scheduler.handleCacheCleanup();

      expect(cacheService.cleanup).toHaveBeenCalled();
      expect(mockLogger.log).not.toHaveBeenCalled();
    });

    it('should handle errors during cleanup', () => {
      const error = new Error('Cleanup failed');
      cacheService.getStats.mockImplementation(() => {
        throw error;
      });

      scheduler.handleCacheCleanup();

      expect(mockLogger.error).toHaveBeenCalledWith(
        '缓存清理失败: Cleanup failed',
        error.stack
      );
    });
  });

  describe('logCacheStats', () => {
    it('should log cache statistics', () => {
      const stats = {
        totalEntries: 100,
        expiredEntries: 5,
        memoryUsage: '10MB',
      };

      cacheService.getStats.mockReturnValue(stats);

      scheduler.logCacheStats();

      expect(cacheService.getStats).toHaveBeenCalled();
      expect(mockLogger.log).toHaveBeenCalledWith(
        '权限缓存统计 - 总条目: 100, 过期条目: 5, 内存使用: 10MB'
      );
    });

    it('should handle errors when logging stats', () => {
      const error = new Error('Stats failed');
      cacheService.getStats.mockImplementation(() => {
        throw error;
      });

      scheduler.logCacheStats();

      expect(mockLogger.error).toHaveBeenCalledWith(
        '记录缓存统计失败: Stats failed',
        error.stack
      );
    });

    it('should format log message correctly with different stats values', () => {
      const testCases = [
        { totalEntries: 0, expiredEntries: 0, memoryUsage: '0MB' },
        { totalEntries: 1000, expiredEntries: 100, memoryUsage: '50MB' },
        { totalEntries: 500, expiredEntries: 250, memoryUsage: '25MB' },
      ];

      testCases.forEach((stats) => {
        jest.clearAllMocks();
        cacheService.getStats.mockReturnValue(stats);

        scheduler.logCacheStats();

        expect(mockLogger.log).toHaveBeenCalledWith(
          `权限缓存统计 - 总条目: ${stats.totalEntries}, 过期条目: ${stats.expiredEntries}, 内存使用: ${stats.memoryUsage}`
        );
      });
    });
  });
});
