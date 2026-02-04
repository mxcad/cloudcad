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
        this.logger.log(`Scheduled cleanup completed: Cleaned ${cleanedCount} expired cache entries`);
      }
    } catch (error) {
      this.logger.error(`Cache cleanup failed: ${error.message}`, error.stack);
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
        `Permission cache stats - Total entries: ${stats.totalEntries}, Expired entries: ${stats.expiredEntries}, Memory usage: ${stats.memoryUsage}`
      );
    } catch (error) {
      this.logger.error(`Failed to log cache stats: ${error.message}`, error.stack);
    }
  }
}
