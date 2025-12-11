import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PermissionCacheService } from '../services/permission-cache.service';

@Injectable()
export class CacheCleanupScheduler {
  private readonly logger = new Logger(CacheCleanupScheduler.name);

  constructor(private readonly cacheService: PermissionCacheService) {}

  /**
   * 每10分钟清理一次过期缓存
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  handleCacheCleanup() {
    try {
      const statsBefore = this.cacheService.getStats();
      this.cacheService.cleanup();
      const statsAfter = this.cacheService.getStats();

      const cleanedCount = statsBefore.expiredEntries;
      if (cleanedCount > 0) {
        this.logger.log(`定时清理完成: 清理了 ${cleanedCount} 个过期缓存项`);
      }
    } catch (error) {
      this.logger.error(`缓存清理失败: ${error.message}`, error.stack);
    }
  }

  /**
   * 每小时记录缓存统计信息
   */
  @Cron(CronExpression.EVERY_HOUR)
  logCacheStats() {
    try {
      const stats = this.cacheService.getStats();
      this.logger.log(
        `权限缓存统计 - 总条目: ${stats.totalEntries}, 过期条目: ${stats.expiredEntries}, 内存使用: ${stats.memoryUsage}`
      );
    } catch (error) {
      this.logger.error(`记录缓存统计失败: ${error.message}`, error.stack);
    }
  }
}
