/**
 * 告警本地枚举副本
 * 从 schema.prisma 手动同步，保持与 Prisma 枚举值一致
 * Prisma 枚举不可直接 @ApiProperty，DTO 使用本地枚举显式转换
 */

export enum AlertLevel {
  /** 即时告警：服务不可用 / 数据丢失 / 磁盘临界 */
  P0 = 'P0',
  /** 聚合告警：单任务失败 / 磁盘告警 / 缓存容量与命中率 */
  P1 = 'P1',
  /** 静默记录：低频清理失败 */
  P2 = 'P2',
}

export enum AlertStatus {
  OPEN = 'OPEN',
  RESOLVED = 'RESOLVED',
}
