///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Test, TestingModule } from '@nestjs/testing';
import { MultiLevelCacheService } from '../../cache-architecture/services/multi-level-cache.service';
import { PermissionCacheService } from './permission-cache.service';

describe('PermissionCacheService', () => {
  let service: PermissionCacheService;
  let messageHandler: ((channel: string, message: string) => void) | null;

  const mockMultiLevelCache = {
    enableVersionControl: jest.fn(),
    set: jest.fn(),
    get: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    deleteByPattern: jest.fn(),
    clear: jest.fn(),
    getStats: jest.fn(),
  };

  const subscriber = {
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
    on: jest.fn(),
  };

  const mockRedis = {
    duplicate: jest.fn(),
    publish: jest.fn(),
    unsubscribe: jest.fn(),
  };

  beforeEach(async () => {
    messageHandler = null;

    // resetMocks: true 会清除 mock 实现，构造函数 fire-and-forget 异步订阅，需重新设置
    mockRedis.duplicate.mockReturnValue(subscriber);
    subscriber.subscribe.mockResolvedValue(undefined);
    subscriber.unsubscribe.mockResolvedValue(undefined);
    subscriber.on.mockImplementation(
      (event: string, handler: (...args: unknown[]) => void) => {
        if (event === 'message') {
          messageHandler = handler as (channel: string, message: string) => void;
        }
        return subscriber;
      }
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionCacheService,
        {
          provide: 'default_IORedisModuleConnectionToken',
          useValue: mockRedis,
        },
        { provide: MultiLevelCacheService, useValue: mockMultiLevelCache },
      ],
    }).compile();

    service = module.get<PermissionCacheService>(PermissionCacheService);

    // 订阅在 onModuleInit 中发起（fire-and-forget），TestingModule.compile() 不会
    // 自动触发生命周期钩子，需显式调用并等待异步订阅完成
    await service.onModuleInit();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // =========================================================================
  // clearPattern
  // =========================================================================

  describe('clearPattern', () => {
    describe('when clearing by pattern', () => {
      it('should publish pattern invalidation event and clear locally', async () => {
        mockRedis.publish.mockResolvedValue(1);

        await service.clearPattern('policy:*');

        expect(mockRedis.publish).toHaveBeenCalledWith(
          'permission:cache:invalidation:pattern',
          expect.stringContaining('"type":"pattern"')
        );
        expect(mockRedis.publish).toHaveBeenCalledWith(
          'permission:cache:invalidation:pattern',
          expect.stringContaining('"pattern":"policy:*"')
        );
        expect(mockMultiLevelCache.deleteByPattern).toHaveBeenCalledWith(
          'policy:*'
        );
      });

      it('should clear config pattern locally', async () => {
        mockRedis.publish.mockResolvedValue(1);

        await service.clearPattern('policy_config:*');

        expect(mockMultiLevelCache.deleteByPattern).toHaveBeenCalledWith(
          'policy_config:*'
        );
      });
    });
  });

  // =========================================================================
  // pattern invalidation event handling
  // =========================================================================

  describe('when receiving a pattern invalidation event', () => {
    it('should clear cache by pattern on the remote instance', () => {
      messageHandler!(
        'permission:cache:invalidation:pattern',
        JSON.stringify({
          type: 'pattern',
          pattern: 'policy:*',
          timestamp: Date.now(),
          source: 'other-instance',
        })
      );

      expect(mockMultiLevelCache.deleteByPattern).toHaveBeenCalledWith(
        'policy:*'
      );
    });

    it('should accept legacy events with id field (rolling deployment compatibility)', () => {
      messageHandler!(
        'permission:cache:invalidation:pattern',
        JSON.stringify({
          type: 'pattern',
          id: 'policy:*',
          timestamp: Date.now(),
          source: 'other-instance',
        })
      );

      expect(mockMultiLevelCache.deleteByPattern).toHaveBeenCalledWith(
        'policy:*'
      );
    });

    it('should ignore expired invalidation events', () => {
      messageHandler!(
        'permission:cache:invalidation:pattern',
        JSON.stringify({
          type: 'pattern',
          pattern: 'policy:*',
          timestamp: Date.now() - 60000,
          source: 'other-instance',
        })
      );

      expect(mockMultiLevelCache.deleteByPattern).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // all invalidation event handling
  // =========================================================================

  describe('when receiving an all invalidation event', () => {
    it('should clear the whole cache on the remote instance', () => {
      messageHandler!(
        'permission:cache:invalidation:all',
        JSON.stringify({
          type: 'all',
          timestamp: Date.now(),
          source: 'other-instance',
        })
      );

      expect(mockMultiLevelCache.clear).toHaveBeenCalled();
    });

    it('should ignore expired all invalidation events', () => {
      mockMultiLevelCache.clear.mockClear();

      messageHandler!(
        'permission:cache:invalidation:all',
        JSON.stringify({
          type: 'all',
          timestamp: Date.now() - 60000,
          source: 'other-instance',
        })
      );

      expect(mockMultiLevelCache.clear).not.toHaveBeenCalled();
    });
  });
});
