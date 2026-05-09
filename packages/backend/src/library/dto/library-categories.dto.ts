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

/**
 * 分类项 DTO
 */
export class CategoryItemDto {
  @ApiProperty({ description: '分类 ID' })
  id: string;

  @ApiProperty({ description: '分类名称' })
  name: string;

  @ApiProperty({ description: '父分类 ID（"all" 项无此字段）', required: false })
  parentId?: string;

  @ApiProperty({ description: '是否有子分类' })
  hasChildren: boolean;
}

/**
 * 单级分类 DTO
 */
export class CategoryLevelDto {
  @ApiProperty({ description: '分类层级（0/1/2）' })
  level: number;

  @ApiProperty({ description: '该层级中的分类项列表', type: [CategoryItemDto] })
  items: CategoryItemDto[];
}

/**
 * 资源库分类树响应 DTO
 */
export class LibraryCategoriesResponseDto {
  @ApiProperty({
    description: '三级分类树，每级包含"全部"选项和实际分类文件夹',
    type: [CategoryLevelDto],
  })
  categories: CategoryLevelDto[];
}
