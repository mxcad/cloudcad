///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
/////////////////////////////////////////////////////////////////////////////

import { ApiProperty } from '@nestjs/swagger';

export class BackupFileInfoDto {
  @ApiProperty({
    description: '备份文件名',
    example: 'cloudcad-20260826-010000.dump',
  })
  name: string;

  @ApiProperty({ description: '文件大小（字节）', example: 10485760 })
  sizeBytes: number;

  @ApiProperty({ description: '备份时间', format: 'date-time' })
  modifiedAt: Date;
}

export class BackupListResponseDto {
  @ApiProperty({ description: '备份文件列表', type: [BackupFileInfoDto] })
  data: BackupFileInfoDto[];

  @ApiProperty({ description: '总数', example: 3 })
  total: number;
}

export class BackupTriggerResultDto {
  @ApiProperty({ description: '是否成功', example: true })
  success: boolean;

  @ApiProperty({
    description: '备份文件名',
    example: 'cloudcad-20260826-010000.dump',
  })
  filename: string;

  @ApiProperty({ description: '备份文件大小（字节）' })
  sizeBytes: number;

  @ApiProperty({ description: '备份耗时（毫秒）' })
  durationMs: number;

  @ApiProperty({ description: '本次轮转清理的旧备份数量' })
  deletedCount: number;
}

export class BackupDeleteResultDto {
  @ApiProperty({ description: '是否成功', example: true })
  success: boolean;

  @ApiProperty({ description: '已删除的备份文件名' })
  name: string;
}
