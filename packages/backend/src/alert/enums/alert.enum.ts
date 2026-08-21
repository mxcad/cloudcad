/**
 * 告警本地枚举副本
 * 从 schema.prisma 手动同步，保持与 Prisma 枚举值一致
 * Prisma 枚举不可直接 @ApiProperty，DTO 使用本地枚举显式转换
 */

export enum AlertLevel {
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
}

export enum AlertStatus {
  OPEN = 'OPEN',
  RESOLVED = 'RESOLVED',
}
