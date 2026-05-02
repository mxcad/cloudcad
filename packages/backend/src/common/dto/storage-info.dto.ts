///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
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

export enum StorageQuotaType {
  PERSONAL = 'PERSONAL',
  PROJECT = 'PROJECT',
  LIBRARY = 'LIBRARY',
}

/**
 * 存储空间信息 DTO
 */
export class StorageInfoDto {
  @ApiProperty({ description: '配额类型', enum: Object.values(StorageQuotaType), enumName: 'StorageQuotaTypeEnum' })
  type: StorageQuotaType;

  @ApiProperty({ description: '已使用空间（字节）' })
  used: number;

  @ApiProperty({ description: '总空间（字节）' })
  total: number;

  @ApiProperty({ description: '剩余空间（字节）' })
  remaining: number;

  @ApiProperty({ description: '使用百分比' })
  usagePercent: number;
}
