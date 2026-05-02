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

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

/**
 * 更新运行时配置 DTO
 */
export class UpdateRuntimeConfigDto {
  @ApiProperty({
    description: '配置值（string | number | boolean）',
    type: Object,
    example: false,
  })
  @IsNotEmpty({ message: '配置值不能为空' })
  value: string | number | boolean;
}

/**
 * 运行时配置项响应 DTO
 */
export class RuntimeConfigResponseDto {
  @ApiProperty({ description: '配置键名', example: 'mailEnabled' })
  key: string;

  @ApiProperty({
    description: '配置值（string | number | boolean）',
    type: Object,
    example: false,
  })
  value: string | number | boolean;

  @ApiProperty({
    description: '值类型',
    enum: ['string', 'number', 'boolean'],
    example: 'boolean',
  })
  type: string;

  @ApiProperty({ description: '分类', example: 'mail' })
  category: string;

  @ApiPropertyOptional({ description: '配置说明', example: '邮件服务开关' })
  description?: string;

  @ApiProperty({ description: '是否公开给前端', example: true })
  isPublic: boolean;

  @ApiPropertyOptional({ description: '最后修改人 ID' })
  updatedBy?: string;

  @ApiProperty({
    description: '最后更新时间',
    example: '2024-01-01T00:00:00.000Z',
  })
  updatedAt: Date;
}

/**
 * 运行时配置定义 DTO
 */
export class RuntimeConfigDefinitionDto {
  @ApiProperty({ description: '配置键名', example: 'mailEnabled' })
  key: string;

  @ApiProperty({
    description: '值类型',
    enum: ['string', 'number', 'boolean'],
    example: 'boolean',
  })
  type: string;

  @ApiProperty({ description: '分类', example: 'mail' })
  category: string;

  @ApiProperty({ description: '配置说明', example: '邮件服务开关' })
  description: string;

  @ApiProperty({
    description: '默认值（string | number | boolean）',
    type: Object,
    example: false,
  })
  defaultValue: string | number | boolean;

  @ApiProperty({ description: '是否公开给前端', example: true })
  isPublic: boolean;
}
