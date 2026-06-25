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
///////////////////////////////////////////////////////////////////////////////

import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class QueryChildrenDto {
  @ApiProperty({ description: '搜索关键词（匹配名称或描述）', required: false })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({
    description: '节点类型',
    enum: ['folder', 'file'],
    required: false,
  })
  @IsOptional()
  @IsString()
  nodeType?: 'folder' | 'file';

  @ApiProperty({
    description: '文件扩展名',
    required: false,
    example: '.dwg',
  })
  @IsOptional()
  @IsString()
  extension?: string;

  @ApiProperty({
    description: '文件状态（支持逗号分隔多选）',
    required: false,
  })
  @IsOptional()
  @IsString()
  fileStatus?: string;

  @ApiProperty({ description: '修改时间起始（ISO 日期）', required: false })
  @IsOptional()
  @IsString()
  modifiedAtFrom?: string;

  @ApiProperty({ description: '修改时间结束（ISO 日期）', required: false })
  @IsOptional()
  @IsString()
  modifiedAtTo?: string;

  @ApiProperty({ description: '创建时间起始（ISO 日期）', required: false })
  @IsOptional()
  @IsString()
  createdAtFrom?: string;

  @ApiProperty({ description: '创建时间结束（ISO 日期）', required: false })
  @IsOptional()
  @IsString()
  createdAtTo?: string;

  @ApiProperty({ description: '文件大小下限（字节）', required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sizeMin?: number;

  @ApiProperty({ description: '文件大小上限（字节）', required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sizeMax?: number;

  @ApiProperty({ description: '页码', required: false, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({
    description: '每页数量',
    required: false,
    minimum: 10,
    maximum: 100,
    default: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(100)
  limit?: number = 50;

  @ApiProperty({
    description: '排序字段',
    required: false,
  })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiProperty({
    description: '排序方向',
    required: false,
    enum: ['asc', 'desc'],
  })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';

  @ApiProperty({
    description: '是否包含已删除的节点（用于回收站）',
    required: false,
    default: false,
  })
  @IsOptional()
  @Type(() => Boolean)
  includeDeleted?: boolean = false;
}
