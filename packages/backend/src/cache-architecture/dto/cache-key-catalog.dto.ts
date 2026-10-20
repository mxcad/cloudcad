///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { ApiProperty } from '@nestjs/swagger';

/**
 * 缓存键目录条目（响应）
 *
 * 描述文案为后端直出中文：与本页既有惯例一致（后台任务 description 亦由后端直出，
 * 前端 SystemMonitorPage 原样渲染），故不占前端 i18n 语言文件。
 */
export class CacheKeyCatalogEntryDto {
  @ApiProperty({ description: '稳定标识' })
  id: string;

  @ApiProperty({ description: '可读名称' })
  name: string;

  @ApiProperty({ description: 'Redis glob 匹配模式' })
  pattern: string;

  @ApiProperty({ description: '存的是什么' })
  description: string;

  @ApiProperty({
    description:
      '归属层级：cache = 业务缓存（可删除）；infra = 基础设施（禁用）',
    enum: ['cache', 'infra'],
  })
  scope: 'cache' | 'infra';

  @ApiProperty({ description: '删除后的实际后果' })
  removalEffect: string;

  @ApiProperty({ description: 'TTL 说明' })
  ttl: string;

  @ApiProperty({ description: '真实存在的键示例' })
  example: string;
}

/**
 * 缓存键目录（响应）
 */
export class CacheKeyCatalogDto {
  @ApiProperty({
    description: '缓存键目录条目',
    type: [CacheKeyCatalogEntryDto],
  })
  entries: CacheKeyCatalogEntryDto[];
}
