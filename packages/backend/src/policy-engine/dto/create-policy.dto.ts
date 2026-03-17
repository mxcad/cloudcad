///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsBoolean,
  IsNumber,
  IsObject,
  IsEnum,
  IsArray,
  IsNotEmpty,
} from 'class-validator';
import { PolicyType } from '../enums/policy-type.enum';
import { Permission as PrismaPermission } from '@prisma/client';

/**
 * 创建策略 DTO
 */
export class CreatePolicyDto {
  @ApiProperty({
    description: '策略类型',
    enum: PolicyType,
    example: PolicyType.TIME,
  })
  @IsEnum(PolicyType)
  type: PolicyType;

  @ApiProperty({
    description: '策略名称',
    example: '工作时间限制',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    description: '策略描述',
    example: '仅允许在工作时间 9:00-18:00 访问',
  })
  @IsString()
  description?: string;

  @ApiProperty({
    description: '策略配置',
    example: {
      startTime: '09:00',
      endTime: '18:00',
      allowedDays: [1, 2, 3, 4, 5],
    },
  })
  @IsObject()
  config: Record<string, unknown>;

  @ApiProperty({
    description: '关联的权限',
    enum: PrismaPermission,
    isArray: true,
    example: [PrismaPermission.SYSTEM_USER_DELETE],
  })
  @IsEnum(PrismaPermission, { each: true })
  @IsArray()
  @IsNotEmpty()
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
