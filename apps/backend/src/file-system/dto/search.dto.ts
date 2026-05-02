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
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { FileStatus } from '@prisma/client';

export enum SearchScope {
  PROJECT = 'project',
  PROJECT_FILES = 'project_files',
  ALL_PROJECTS = 'all_projects',
  LIBRARY = 'library',
}

export enum SearchType {
  ALL = 'all',
  FILE = 'file',
  FOLDER = 'folder',
}

export class SearchDto {
  @ApiProperty({ description: '搜索关键词', required: true })
  @IsString()
  keyword: string;

  @ApiProperty({
    description: '搜索范围',
    enum: Object.values(SearchScope),
    enumName: 'SearchScope',
    required: false,
    default: SearchScope.PROJECT_FILES,
  })
  @IsOptional()
  @IsEnum(SearchScope)
  scope?: SearchScope = SearchScope.PROJECT_FILES;

  @ApiProperty({
    description: '搜索类型',
    enum: Object.values(SearchType),
    enumName: 'SearchType',
    required: false,
    default: SearchType.ALL,
  })
  @IsOptional()
  @IsEnum(SearchType)
  type?: SearchType = SearchType.ALL;

  @ApiProperty({
    description: '项目过滤类型（scope=project 时使用）',
    enum: ['all', 'owned', 'joined'],
    enumName: 'ProjectFilter',
    required: false,
  })
  @IsOptional()
  @IsString()
  filter?: 'all' | 'owned' | 'joined';

  @ApiProperty({
    description: '目标项目 ID',
    required: false,
  })
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiProperty({
    description: '资源库类型（scope=library 时使用）',
    enum: ['drawing', 'block'],
    enumName: 'LibraryType',
    required: false,
  })
  @IsOptional()
  @IsString()
  libraryKey?: string;

  @ApiProperty({
    description: '文件扩展名过滤',
    required: false,
    example: '.dwg',
  })
  @IsOptional()
  @IsString()
  extension?: string;

  @ApiProperty({
    description: '文件状态',
    enum: Object.values(FileStatus),
    enumName: 'FileStatus',
    required: false,
  })
  @IsOptional()
  @IsEnum(FileStatus)
  fileStatus?: FileStatus;

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
    default: 'updatedAt',
  })
  @IsOptional()
  @IsString()
  sortBy?: string = 'updatedAt';

  @ApiProperty({
    description: '排序方向',
    required: false,
    enum: ['asc', 'desc'],
    default: 'desc',
  })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc' = 'desc';
}