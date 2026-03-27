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
import {
  IsString,
  IsBoolean,
  IsNumber,
  IsObject,
  IsEnum,
} from 'class-validator';
import { PolicyType } from '../enums/policy-type.enum';
import { Permission as PrismaPermission } from '@prisma/client';

/**
 * 策略配置 DTO
 */
export class PolicyConfigDto {
  @ApiProperty({
    description: '策略配置数据',
    example: {
      startTime: '09:00',
      endTime: '18:00',
      allowedDays: [1, 2, 3, 4, 5],
    },
  })
  @IsObject()
  config: Record<string, unknown>;
}

/**
 * 策略响应 DTO
 */
export class PolicyResponseDto {
  @ApiProperty({ description: '策略 ID' })
  @IsString()
  id: string;

  @ApiProperty({
    description: '策略类型',
    enum: PolicyType,
  })
  @IsEnum(PolicyType)
  type: PolicyType;

  @ApiProperty({ description: '策略名称' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: '策略描述' })
  @IsString()
  description?: string;

  @ApiProperty({ description: '策略配置' })
  @IsObject()
  config: Record<string, unknown>;

  @ApiProperty({
    description: '关联的权限',
    enum: PrismaPermission,
    isArray: true,
  })
  @IsEnum(PrismaPermission, { each: true })
  permissions: PrismaPermission[];

  @ApiProperty({ description: '是否启用' })
  @IsBoolean()
  enabled: boolean;

  @ApiPropertyOptional({ description: '优先级' })
  @IsNumber()
  priority?: number;

  @ApiProperty({ description: '创建时间' })
  createdAt: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt: Date;
}

/**
 * 策略评估结果 DTO
 */
export class PolicyEvaluationResultDto {
  @ApiProperty({ description: '是否允许访问' })
  allowed: boolean;

  @ApiPropertyOptional({ description: '拒绝原因' })
  reason?: string;

  @ApiProperty({ description: '策略 ID' })
  policyId: string;

  @ApiProperty({ description: '策略类型' })
  policyType: string;

  @ApiProperty({ description: '评估时间' })
  evaluatedAt: Date;
}

/**
 * 策略评估汇总 DTO
 */
export class PolicyEvaluationSummaryDto {
  @ApiProperty({ description: '是否允许访问' })
  allowed: boolean;

  @ApiProperty({
    description: '各策略的评估结果',
    type: [PolicyEvaluationResultDto],
  })
  results: PolicyEvaluationResultDto[];

  @ApiPropertyOptional({ description: '拒绝原因' })
  denialReason?: string;
}

/**
 * 策略配置 Schema 属性 DTO
 */
export class PolicyConfigSchemaPropertyDto {
  @ApiProperty({ description: '属性类型' })
  type: string;

  @ApiProperty({ description: '属性描述' })
  description: string;

  @ApiPropertyOptional({ description: '默认值' })
  default?: unknown;

  @ApiPropertyOptional({ description: '枚举值' })
  enum?: string[];

  @ApiPropertyOptional({ description: '最小值' })
  minimum?: number;

  @ApiPropertyOptional({ description: '最大值' })
  maximum?: number;

  @ApiPropertyOptional({ description: '属性项类型' })
  items?: unknown;
}

/**
 * 策略配置 Schema DTO
 */
export class PolicyConfigSchemaDto {
  @ApiProperty({
    description: '配置属性',
    type: 'object',
    additionalProperties: {
      type: 'object',
    },
  })
  properties: Record<string, PolicyConfigSchemaPropertyDto>;

  @ApiProperty({ description: '必填属性', isArray: true })
  required: string[];
}
