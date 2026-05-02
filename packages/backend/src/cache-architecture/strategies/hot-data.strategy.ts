///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Logger } from '@nestjs/common';
import { IWarmupStrategy, WarmupResult } from './warmup.strategy';
import { L3CacheProvider } from '../providers/l3-cache.provider';
import { MultiLevelCacheService } from '../services/multi-level-cache.service';

/**
 * 热点数据预热策略
 * 从 L3 缓存中识别高频访问数据并预加载到 L1/L2
 */
@Injectable()
export class HotDataStrategy implements IWarmupStrategy {
  readonly name = 'hot-data';
  private readonly logger = new Logger(HotDataStrategy.name);

  constructor(
    private readonly l3Cache: L3CacheProvider,
    private readonly multiLevelCache: MultiLevelCacheService
  ) {}

  /**
   * 执行热点数据预热
   */
  async warmup(): Promise<WarmupResult> {
    const startTime = Date.now();

    try {
      // 获取热点数据
      const hotData = await this.l3Cache.getHotData(1000); // 最多 1000 条

      if (hotData.length === 0) {
        this.logger.debug('没有热点数据需要预热');
        return {
          success: true,
          count: 0,
          duration: Date.now() - startTime,
        };
      }

      this.logger.debug(`发现 ${hotData.length} 条热点数据`);

      // 计算访问频率并过滤
      const now = Date.now();
      const hotDataWithFrequency = hotData.map((data) => {
        const minutesSinceLastAccess =
          (now - data.lastAccessedAt.getTime()) / 60000;
        const frequency = data.accessCount / Math.max(minutesSinceLastAccess, 1);
        return { ...data, frequency };
      });

      const filteredHotData = hotDataWithFrequency.filter(
        (data) => data.frequency >= 10 // 每分钟访问 10 次以上
      );

      if (filteredHotData.length === 0) {
        this.logger.debug('没有满足阈值的热点数据');
        return {
          success: true,
          count: 0,
          duration: Date.now() - startTime,
        };
      }

      // 预加载数据到 L2 和 L1
      const keys = filteredHotData.map((data) => data.key);
      const loadedData = await this.l3Cache.preload(keys, async (key) => {
        return this.l3Cache.get(key);
      });

      // 写入 L2 和 L1
      await this.multiLevelCache.setMany(loadedData);

      const duration = Date.now() - startTime;
      this.logger.log(`成功预热 ${loadedData.size} 条热点数据，耗时 ${duration}ms`);

      return {
        success: true,
        count: loadedData.size,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      this.logger.error(`热点数据预热失败: ${errorMessage}`, error);

      return {
        success: false,
        count: 0,
        duration,
        error: errorMessage,
      };
    }
  }
}
