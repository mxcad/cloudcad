///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { ApiProperty } from '@nestjs/swagger';

/**
 * 权限缓存统计（PermissionCacheService.getStats 原样返回）
 */
export class CacheStatsDto {
  @ApiProperty({ description: '缓存条目总数' })
  totalEntries: number;

  @ApiProperty({ description: '缓存容量上限' })
  capacity: number;

  @ApiProperty({ description: '内存占用（人类可读）' })
  memoryUsage: string;

  @ApiProperty({ description: '命中率' })
  hitRate: number;
}

/**
 * 权限缓存清理结果
 */
export class CacheCleanupResultDto {
  @ApiProperty({ description: '清理的缓存条目数' })
  cleanedEntries: number;
}

/**
 * 用户权限缓存清理结果
 */
export class UserCacheClearResultDto {
  @ApiProperty({ description: '已清除缓存的用户 ID' })
  userId: string;
}

/**
 * 存储清理结果（StorageCleanupService.CleanupResult 原样返回）
 */
export class StorageCleanupResultDto {
  @ApiProperty({ description: '是否成功' })
  success: boolean;

  @ApiProperty({ description: '删除的节点数' })
  deletedNodes: number;

  @ApiProperty({ description: '删除的目录数' })
  deletedDirectories: number;

  @ApiProperty({ description: '释放字节数（基于 size 元数据估算）' })
  freedSpace: number;

  @ApiProperty({ description: '错误信息列表' })
  errors: string[];
}

/**
 * 待清理存储统计
 */
export class PendingCleanupStatsDto {
  @ApiProperty({ description: '待清理文件数' })
  total: number;

  @ApiProperty({ description: '过期时间点（ISO 字符串）' })
  expiryDate: string;

  @ApiProperty({ description: '清理延迟天数' })
  delayDays: number;
}

/**
 * 本地孤立文件信息
 */
export class LocalOrphanItemDto {
  @ApiProperty({ description: '节点 ID' })
  nodeId: string;

  @ApiProperty({ description: '所在目录' })
  directory: string;

  @ApiProperty({ description: '文件大小（字节）' })
  sizeBytes: number;
}

/**
 * DB 孤立记录信息
 */
export class DbOrphanItemDto {
  @ApiProperty({ description: '节点 ID' })
  nodeId: string;

  @ApiProperty({ description: '文件名' })
  name: string;

  @ApiProperty({ description: '所属项目 ID' })
  projectId: string;
}

/**
 * 孤儿文件统计
 */
export class OrphanStatsDto {
  @ApiProperty({ description: '本地孤立文件数' })
  localOrphanCount: number;

  @ApiProperty({ description: '本地孤立文件总大小（字节）' })
  localOrphanTotalSize: number;

  @ApiProperty({ description: 'DB 孤立记录数' })
  dbOrphanCount: number;

  @ApiProperty({ description: '本地孤立文件列表', type: [LocalOrphanItemDto] })
  localOrphans: LocalOrphanItemDto[];

  @ApiProperty({ description: 'DB 孤立记录列表', type: [DbOrphanItemDto] })
  dbOrphans: DbOrphanItemDto[];
}

/**
 * 标记删除文件统计
 */
export class DeletedFileStatsDto {
  @ApiProperty({ description: '回收站文件数' })
  trashCount: number;

  @ApiProperty({ description: '已标记物理存储待清理文件数' })
  storageMarkedCount: number;

  @ApiProperty({ description: '已删除项目数' })
  deletedProjectCount: number;

  @ApiProperty({ description: '本地孤立文件数' })
  localOrphanCount: number;

  @ApiProperty({ description: '本地孤立文件总大小（字节）' })
  localOrphanTotalSize: number;

  @ApiProperty({ description: 'DB 孤立记录数' })
  dbOrphanCount: number;
}
