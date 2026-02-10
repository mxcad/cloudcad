import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PermissionCacheService } from '../services/permission-cache.service';
import { CacheMonitorService } from '../../cache-architecture/services/cache-monitor.service';
import { L3CacheProvider } from '../../cache-architecture/providers/l3-cache.provider';

@Injectable()
export class CacheCleanupScheduler {
  private readonly logger = new Logger(CacheCleanupScheduler.name);

  constructor(
    private readonly cacheService: PermissionCacheService,
    private readonly cacheMonitorService: CacheMonitorService,
    private readonly l3Cache: L3CacheProvider,
  ) {}

  /**
   * 每 10 分钟清理一次过期缓存
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleCacheCleanup() {
    try {
      // 清理 L3 数据库缓存中的过期数据
      const cleanedCount = await this.l3Cache.cleanExpired();
      if (cleanedCount > 0) {
        this.logger.log(`L3 缓存清理完成: 清理了 ${cleanedCount} 条过期缓存`);
      }

      // 检查缓存警告
      const warnings = await this.cacheMonitorService.checkWarnings();
      if (warnings.length > 0) {
        this.logger.warn(`缓存警告: ${warnings.join('; ')}`);
      }
    } catch (error) {
      this.logger.error(`缓存清理失败: ${error.message}`, error.stack);
    }
  }

  /**
   * 每小时记录缓存统计信息
   */
  @Cron(CronExpression.EVERY_HOUR)
  async logCacheStats() {
    try {
      const stats = await this.cacheService.getStats();
      this.logger.log(
        `权限缓存统计 - 总条目: ${stats.totalEntries}, 容量: ${stats.capacity}, 内存使用: ${stats.memoryUsage}, 命中率: ${stats.hitRate.toFixed(2)}%`
      );
    } catch (error) {
      this.logger.error(`记录缓存统计失败: ${error.message}`, error.stack);
    }
  }

  /**
   * 每天记录健康状态
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async logHealthStatus() {
    try {
      const healthStatus = await this.cacheMonitorService.getHealthStatus();
      this.logger.log(
        `缓存健康状态 - L1: ${healthStatus.L1.status}, L2: ${healthStatus.L2.status}, L3: ${healthStatus.L3.status}, 整体: ${healthStatus.overall}`
      );
    } catch (error) {
      this.logger.error(`记录健康状态失败: ${error.message}`, error.stack);
    }
  }
}