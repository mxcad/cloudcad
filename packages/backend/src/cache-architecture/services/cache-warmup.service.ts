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

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { MultiLevelCacheService } from './multi-level-cache.service';
import { L3CacheProvider } from '../providers/l3-cache.provider';
import { ICacheWarmupConfig } from '../interfaces/cache-stats.interface';

/**
 * 缓存预热服务
 * 自动识别热点数据并预加载到缓存
 */
@Injectable()
export class CacheWarmupService {
  private readonly logger = new Logger(CacheWarmupService.name);
  private readonly warmupHistory: Map<string, Date> = new Map();

  private config: ICacheWarmupConfig = {
    enabled: true,
    schedule: '0 * * * *', // 每小时执行一次
    hotDataThreshold: 10, // 每分钟访问 10 次以上
    maxWarmupSize: 1000, // 最多预热 1000 条数据
    dataTypes: ['permissions', 'roles', 'users', 'projects'],
  };

  constructor(
    private readonly cacheService: MultiLevelCacheService,
    private readonly l3Cache: L3CacheProvider,
    private readonly schedulerRegistry: SchedulerRegistry
  ) {}

  /**
   * 每小时执行缓存预热
   */
  @Cron(CronExpression.EVERY_HOUR)
  async scheduledWarmup() {
    if (!this.config.enabled) {
      this.logger.debug('缓存预热已禁用');
      return;
    }

    this.logger.log('开始执行缓存预热...');
    const startTime = Date.now();

    try {
      await this.warmupHotData();
      const duration = Date.now() - startTime;
      this.logger.log(`缓存预热完成，耗时 ${duration}ms`);
    } catch (error) {
      this.logger.error('缓存预热失败', error);
    }
  }

  /**
   * 预热热点数据
   */
  async warmupHotData(): Promise<void> {
    // 获取热点数据
    const hotData = await this.l3Cache.getHotData(this.config.maxWarmupSize);

    if (hotData.length === 0) {
      this.logger.debug('没有热点数据需要预热');
      return;
    }

    this.logger.debug(`发现 ${hotData.length} 条热点数据`);

    // 计算访问频率（次/分钟）
    const now = Date.now();
    const hotDataWithFrequency = hotData.map((data) => {
      const minutesSinceLastAccess =
        (now - data.lastAccessedAt.getTime()) / 60000;
      const frequency = data.accessCount / Math.max(minutesSinceLastAccess, 1);
      return {
        ...data,
        frequency,
      };
    });

    // 过滤热点数据
    const filteredHotData = hotDataWithFrequency.filter(
      (data) => data.frequency >= this.config.hotDataThreshold
    );

    if (filteredHotData.length === 0) {
      this.logger.debug('没有满足阈值的热点数据');
      return;
    }

    this.logger.debug(`满足阈值的热点数据: ${filteredHotData.length} 条`);

    // 预加载数据到 L2 和 L1
    const keys = filteredHotData.map((data) => data.key);
    const loadedData = await this.l3Cache.preload(keys, async (key) => {
      // 从 L3 重新加载
      return this.l3Cache.get(key);
    });

    // 写入 L2 和 L1
    await this.cacheService.setMany(loadedData);

    this.logger.log(`成功预热 ${loadedData.size} 条热点数据`);
  }

  /**
   * 预热权限数据
   */
  async warmupPermissions(userId: number): Promise<void> {
    const key = `permissions:user:${userId}`;
    const lastWarmup = this.warmupHistory.get(key);

    // 如果最近 30 分钟内已预热，跳过
    if (lastWarmup && Date.now() - lastWarmup.getTime() < 1800000) {
      this.logger.debug(`权限数据最近已预热: ${key}`);
      return;
    }

    try {
      // 触发权限加载
      await this.cacheService.getOrLoad(key, async () => {
        // 这里应该调用实际的权限加载逻辑
        return { permissions: [] as string[] };
      });

      this.warmupHistory.set(key, new Date());
      this.logger.debug(`权限数据预热成功: ${key}`);
    } catch (error) {
      this.logger.error(`权限数据预热失败: ${key}`, error);
    }
  }

  /**
   * 预热角色数据
   */
  async warmupRoles(roleId: number): Promise<void> {
    const key = `roles:${roleId}`;
    const lastWarmup = this.warmupHistory.get(key);

    // 如果最近 30 分钟内已预热，跳过
    if (lastWarmup && Date.now() - lastWarmup.getTime() < 1800000) {
      this.logger.debug(`角色数据最近已预热: ${key}`);
      return;
    }

    try {
      await this.cacheService.getOrLoad(key, async () => {
        // 这里应该调用实际的角色加载逻辑
        return { role: {} };
      });

      this.warmupHistory.set(key, new Date());
      this.logger.debug(`角色数据预热成功: ${key}`);
    } catch (error) {
      this.logger.error(`角色数据预热失败: ${key}`, error);
    }
  }

  /**
   * 预热用户数据
   */
  async warmupUser(userId: number): Promise<void> {
    const key = `users:${userId}`;
    const lastWarmup = this.warmupHistory.get(key);

    // 如果最近 30 分钟内已预热，跳过
    if (lastWarmup && Date.now() - lastWarmup.getTime() < 1800000) {
      this.logger.debug(`用户数据最近已预热: ${key}`);
      return;
    }

    try {
      await this.cacheService.getOrLoad(key, async () => {
        // 这里应该调用实际的用户加载逻辑
        return { user: {} };
      });

      this.warmupHistory.set(key, new Date());
      this.logger.debug(`用户数据预热成功: ${key}`);
    } catch (error) {
      this.logger.error(`用户数据预热失败: ${key}`, error);
    }
  }

  /**
   * 批量预热用户权限
   */
  async warmupUserPermissions(userIds: number[]): Promise<void> {
    this.logger.log(`开始批量预热用户权限: ${userIds.length} 个用户`);

    const promises = userIds.map((userId) => this.warmupPermissions(userId));
    await Promise.allSettled(promises);

    this.logger.log(`批量预热用户权限完成`);
  }

  /**
   * 批量预热角色
   */
  async warmupRolesList(roleIds: number[]): Promise<void> {
    this.logger.log(`开始批量预热角色: ${roleIds.length} 个角色`);

    const promises = roleIds.map((roleId) => this.warmupRoles(roleId));
    await Promise.allSettled(promises);

    this.logger.log(`批量预热角色完成`);
  }

  /**
   * 手动触发预热
   */
  async triggerWarmup(): Promise<{
    success: boolean;
    count: number;
    error?: string;
  }> {
    try {
      await this.warmupHotData();
      const stats = await this.cacheService.getStats();
      return {
        success: true,
        count: stats.levels.L3.size,
      };
    } catch (error) {
      return {
        success: false,
        count: 0,
        error: error instanceof Error ? error.message : '未知错误',
      };
    }
  }

  /**
   * 获取预热配置
   */
  getConfig(): ICacheWarmupConfig {
    return { ...this.config };
  }

  /**
   * 更新预热配置
   */
  updateConfig(config: Partial<ICacheWarmupConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.log('预热配置已更新', this.config);

    // 更新定时任务
    if (config.schedule) {
      this.updateScheduler();
    }
  }

  /**
   * 更新定时任务
   */
  private updateScheduler(): void {
    try {
      // 删除旧的定时任务
      const job = this.schedulerRegistry.getCronJob('scheduledWarmup');
      if (job) {
        job.stop();
        this.schedulerRegistry.deleteCronJob('scheduledWarmup');
      }

      // 创建新的定时任务（注意：这需要重新注册装饰器，这里只是示例）
      this.logger.log(`定时任务已更新: ${this.config.schedule}`);
    } catch (error) {
      this.logger.error('更新定时任务失败', error);
    }
  }

  /**
   * 获取预热历史
   */
  getWarmupHistory(): Array<{ key: string; lastWarmup: Date }> {
    return Array.from(this.warmupHistory.entries()).map(
      ([key, lastWarmup]) => ({
        key,
        lastWarmup,
      })
    );
  }

  /**
   * 清除预热历史
   */
  clearWarmupHistory(): void {
    this.warmupHistory.clear();
    this.logger.log('预热历史已清除');
  }

  /**
   * 获取预热统计
   */
  getWarmupStats() {
    return {
      config: this.config,
      historySize: this.warmupHistory.size,
      lastWarmup: Array.from(this.warmupHistory.values()).sort(
        (a, b) => b.getTime() - a.getTime()
      )[0],
    };
  }
}
