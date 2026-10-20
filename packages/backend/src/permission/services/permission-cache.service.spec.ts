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
  // pattern invalidation event（#485：接收侧已移除）
  // =========================================================================

  describe('pattern invalidation event（#485）', () => {
    it('不订阅 pattern 频道', () => {
      expect(subscriber.subscribe).not.toHaveBeenCalledWith(
        'permission:cache:invalidation:pattern',
        expect.anything()
      );
    });

    it('收到 pattern 事件不得调用 deleteByPattern（无白名单的删除入口）', () => {
      // 旧实现是 clearPattern(pattern) → publishInvalidationEvent('pattern', …)，
      // 接收侧直接 deleteByPattern(pattern)，没有 cache-pattern.guard 的目录白名单：
      // 任意发布者用 `*` 就能扫掉同库的 token:blacklist:* / mxcad:sess:* / ratelimit:*。
      // 67ded98 已删掉唯一的生产方，这条通道不再有兼容价值，收掉入口而不是留着等误用。
      messageHandler!(
        'permission:cache:invalidation:pattern',
        JSON.stringify({
          type: 'pattern',
          pattern: '*',
          timestamp: Date.now(),
          source: 'legacy-instance',
        })
      );

      expect(mockMultiLevelCache.deleteByPattern).not.toHaveBeenCalled();
      expect(mockMultiLevelCache.clear).not.toHaveBeenCalled();
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
