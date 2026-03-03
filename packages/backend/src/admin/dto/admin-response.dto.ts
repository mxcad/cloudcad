import { ApiProperty } from '@nestjs/swagger';

/**
 * 管理员统计响应 DTO
 */
export class AdminStatsResponseDto {
  @ApiProperty({ description: '提示消息' })
  message: string;

  @ApiProperty({ description: '时间戳' })
  timestamp: string;
}

/**
 * 缓存统计 DTO
 */
export class CacheStatsDto {
  @ApiProperty({ description: '缓存条目数' })
  size: number;

  @ApiProperty({ description: '命中次数' })
  hits: number;

  @ApiProperty({ description: '未命中次数' })
  misses: number;

  @ApiProperty({ description: '命中率' })
  hitRate: number;
}

/**
 * 缓存统计响应 DTO
 */
export class CacheStatsResponseDto {
  @ApiProperty({ description: '提示消息' })
  message: string;

  @ApiProperty({ description: '缓存统计数据', type: CacheStatsDto })
  data: CacheStatsDto;
}

/**
 * 缓存清理响应 DTO
 */
export class CacheCleanupResponseDto {
  @ApiProperty({ description: '提示消息' })
  message: string;
}

/**
 * 用户权限信息 DTO
 */
export class UserPermissionInfoDto {
  @ApiProperty({ description: '用户角色' })
  userRole: string;

  @ApiProperty({ description: '权限列表', type: [String] })
  permissions: string[];
}

/**
 * 用户权限响应 DTO
 */
export class UserPermissionsResponseDto {
  @ApiProperty({ description: '提示消息' })
  message: string;

  @ApiProperty({ description: '用户权限信息', type: UserPermissionInfoDto })
  data: UserPermissionInfoDto;
}

/**
 * 用户缓存清理响应 DTO
 */
export class UserCacheClearResponseDto {
  @ApiProperty({ description: '提示消息' })
  message: string;
}
