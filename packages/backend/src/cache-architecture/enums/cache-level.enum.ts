/**
 * 缓存级别枚举
 * 定义三级缓存架构的缓存级别
 */
export enum CacheLevel {
  /**
   * L1 缓存 - 内存缓存
   * 特点：
   * - 最快访问速度
   * - 容量最小
   * - TTL 最短（5 分钟）
   * - 单实例独享
   */
  L1 = 'L1',

  /**
   * L2 缓存 - Redis 缓存
   * 特点：
   * - 快速访问
   * - 容量中等
   * - TTL 中等（30 分钟）
   * - 跨实例共享
   */
  L2 = 'L2',

  /**
   * L3 缓存 - 数据库缓存
   * 特点：
   * - 较慢访问
   * - 容量最大
   * - 持久化存储
   * - 最终数据源
   */
  L3 = 'L3',
}

/**
 * 获取缓存级别的默认 TTL（秒）
 */
export function getDefaultTTL(level: CacheLevel): number {
  switch (level) {
    case CacheLevel.L1:
      return 300; // 5 分钟
    case CacheLevel.L2:
      return 1800; // 30 分钟
    case CacheLevel.L3:
      return 86400; // 24 小时
    default:
      return 300;
  }
}

/**
 * 获取缓存级别的描述
 */
export function getCacheLevelDescription(level: CacheLevel): string {
  switch (level) {
    case CacheLevel.L1:
      return 'L1 内存缓存 - 最快访问速度，容量 1000 条，TTL 5 分钟';
    case CacheLevel.L2:
      return 'L2 Redis 缓存 - 快速访问，跨实例共享，TTL 30 分钟';
    case CacheLevel.L3:
      return 'L3 数据库缓存 - 持久化存储，最终数据源';
    default:
      return '未知缓存级别';
  }
}