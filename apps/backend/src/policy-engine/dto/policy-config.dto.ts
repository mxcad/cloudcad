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
  IsEnum,
  IsArray,
} from 'class-validator';
import { PolicyType } from '../enums/policy-type.enum';
import { Permission as PrismaPermission } from '@prisma/client';

/**
 * 策略配置 DTO
 *
 * 用于策略配置的传输和验证
 */
export class PolicyConfigDto {
  @ApiProperty({
    description: '策略类型',
    enum: Object.values(PolicyType), enumName: 'PolicyType',
    example: PolicyType.TIME,
  })
  @IsEnum(PolicyType)
  type: PolicyType;

  @ApiProperty({
    description: '策略名称',
    example: '工作时间限制',
  })
  @IsString()
  name: string;

  @ApiPropertyOptional({
    description: '策略描述',
    example: '仅允许在工作时间 9:00-18:00 访问',
  })
  @IsString()
  description?: string;

  @ApiProperty({
    description: '策略配置数据',
    example: {
      startTime: '09:00',
      endTime: '18:00',
      allowedDays: [1, 2, 3, 4, 5],
    },
  })
  config: Record<string, unknown>;

  @ApiProperty({
    description: '关联的权限',
    enum: Object.values(PrismaPermission), enumName: 'PrismaPermission',
    isArray: true,
    example: [PrismaPermission.SYSTEM_USER_DELETE],
  })
  @IsEnum(PrismaPermission, { each: true })
  @IsArray()
  permissions: PrismaPermission[];

  @ApiPropertyOptional({
    description: '是否启用',
    default: true,
  })
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    description: '优先级（数值越大优先级越高）',
    default: 0,
  })
  @IsNumber()
  priority?: number;
}

/**
 * 策略配置列表 DTO
 */
export class PolicyConfigListDto {
  @ApiProperty({
    description: '策略配置列表',
    type: () => [PolicyConfigDto],
  })
  policies: PolicyConfigDto[];

  @ApiProperty({ description: '总数' })
  total: number;
}

/**
 * 策略配置统计 DTO
 */
export class PolicyConfigStatsDto {
  @ApiProperty({ description: '总策略数' })
  total: number;

  @ApiProperty({ description: '启用的策略数' })
  enabled: number;

  @ApiProperty({ description: '禁用的策略数' })
  disabled: number;

  @ApiProperty({
    description: '按类型分组的策略数',
    type: 'object',
    additionalProperties: {
      type: 'number',
    },
    example: {
      TIME: 3,
      IP: 2,
      DEVICE: 1,
    },
  })
  byType: Record<string, number>;
}
